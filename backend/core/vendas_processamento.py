"""Processamento de Vendas — baixa a planilha do Storage, parseia e grava.

Fluxo por upload:
  1. Marca vendas_uploads.status = 'processando'.
  2. Baixa o .xlsx do Storage e parseia (core.vendas_parser).
  3. Para cada par (mês, categoria) — ambos DERIVADOS linha a linha (coluna
     "Pagamento" e coluna "Dentista") — grava UMA linha em vendas_consolidado
     (chave: empresa_id + categoria + mes_referencia).

GOVERNANÇA (mesma política do DRE — core/dre_processamento.py):
  - NUNCA fabricar número: campo ausente = NULL (não consta), nunca 0.
  - Divergência com dado já gravado é SINALIZADA (nota em observacao), nunca
    sobrescreve silenciosamente os valores existentes.
  - Idêntico ao já gravado = idempotente (skip), mas sempre reindexa o RAG
    (self-heal, mesmo padrão do DRE).
  - Procedimento não reconhecido vira categoria 'nao_identificado' e é
    reportado no status — nunca some do total.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from config import config
from core.base_conhecimento import indexar_resumo_vendas, remover_resumo_vendas
from core.vendas_parser import LABEL_CATEGORIA as _LABEL_CATEGORIA
from core.vendas_parser import parsear_planilha
from supabase_client import supabase

logger = logging.getLogger(__name__)

_COLUNAS_MONETARIAS = ("valor_original", "valor_desconto", "valor_recebido")
_TOL_COMPARACAO = Decimal("0.01")


def _brl(v) -> str:
    """Formata um valor monetário (Decimal, float ou None) como 'R$ 1.234,56'."""
    if v is None:
        return "não consta"
    d = v if isinstance(v, Decimal) else Decimal(str(v))
    s = f"{d:,.2f}"
    return "R$ " + s.replace(",", "X").replace(".", ",").replace("X", ".")


def _resumo_mes(
    nome_empresa: str,
    categoria: str,
    mes_iso: str,
    valores: dict,
    quantidade: int,
    por_forma: dict,
) -> str:
    """Texto narrativo (derivado, nunca fabricado) de 1 mês de vendas — indexado no RAG."""
    linhas = [
        f"Vendas ({_LABEL_CATEGORIA.get(categoria, categoria)}) de {nome_empresa} referente a {mes_iso}:",
        f"- Quantidade de vendas: {quantidade}",
        f"- Valor original: {_brl(valores.get('valor_original'))}",
        f"- Valor com desconto: {_brl(valores.get('valor_desconto'))}",
        f"- Valor recebido: {_brl(valores.get('valor_recebido'))}",
    ]
    if por_forma:
        linhas.append("- Por forma de pagamento (valor recebido):")
        for forma, valor in por_forma.items():
            linhas.append(f"  - {forma}: {_brl(valor)}")
    return "\n".join(linhas)


def _num(v: Optional[Decimal]) -> Optional[float]:
    return None if v is None else float(v)


def _agora() -> str:
    return datetime.now(timezone.utc).isoformat()


def _difere(db_val, parsed: Optional[Decimal]) -> bool:
    """Compara valor do banco (str/float/None) com o extraído (Decimal/None)."""
    if db_val is None and parsed is None:
        return False
    if db_val is None or parsed is None:
        return True
    try:
        return abs(Decimal(str(db_val)) - parsed) > _TOL_COMPARACAO
    except Exception:
        return True


def _marcar_status(upload_id: str, status: str, erro_detalhe: Optional[str] = None) -> None:
    supabase.table("vendas_uploads").update({
        "status": status,
        "erro_detalhe": erro_detalhe,
        "atualizado_em": _agora(),
    }).eq("id", upload_id).execute()


def processar_upload(upload: dict) -> dict:
    """Processa um registro de vendas_uploads. Atualiza o status e devolve um resumo."""
    upload_id = upload["id"]
    cliente_id = upload["cliente_id"]
    empresa_id = upload["empresa_id"]
    storage_path = upload["storage_path"]

    _marcar_status(upload_id, "processando")

    try:
        conteudo = supabase.storage.from_(config.VENDAS_BUCKET).download(storage_path)
    except Exception as e:
        corpo = getattr(getattr(e, "response", None), "text", "") or repr(e)
        logger.exception(
            "Falha ao baixar planilha de vendas do Storage (path=%s) erro=%s", storage_path, corpo
        )
        _marcar_status(upload_id, "erro", "Falha ao ler o arquivo do armazenamento.")
        return {"status": "erro", "motivo": "download"}

    try:
        resultado = parsear_planilha(conteudo)
    except Exception:
        logger.exception("Falha ao parsear planilha de vendas (upload=%s)", upload_id)
        _marcar_status(upload_id, "erro", "Falha ao interpretar a planilha.")
        return {"status": "erro", "motivo": "parser_excecao"}

    if not resultado.ok:
        _marcar_status(upload_id, "erro", resultado.motivo)
        return {"status": "erro", "motivo": resultado.motivo}

    fonte = f"Vendas: {upload.get('nome_arquivo') or storage_path}"

    empresa_nome = empresa_id
    try:
        emp = (
            supabase.table("empresas")
            .select("codigo,nome_razao_social")
            .eq("id", empresa_id)
            .limit(1)
            .execute()
        )
        if emp.data:
            empresa_nome = f"{emp.data[0]['codigo']} — {emp.data[0]['nome_razao_social']}"
    except Exception:
        logger.exception("Falha ao buscar nome da empresa p/ indexação RAG (empresa_id=%s)", empresa_id)

    gravados = 0
    divergencias: list[str] = []
    categorias_detectadas: dict[str, int] = {}

    for mes in resultado.meses:
        mes_iso = mes.mes_referencia.isoformat()
        categoria = mes.categoria
        categorias_detectadas[categoria] = (
            categorias_detectadas.get(categoria, 0) + mes.quantidade_vendas
        )
        valores_mes = {
            "valor_original": mes.valor_original,
            "valor_desconto": mes.valor_desconto,
            "valor_recebido": mes.valor_recebido,
        }

        existente = (
            supabase.table("vendas_consolidado")
            .select("*")
            .eq("empresa_id", empresa_id)
            .eq("categoria", categoria)
            .eq("mes_referencia", mes_iso)
            .limit(1)
            .execute()
        )

        if existente.data:
            atual = existente.data[0]
            difs = [c for c in _COLUNAS_MONETARIAS if _difere(atual.get(c), valores_mes.get(c))]
            diverge_qtd = atual.get("quantidade_vendas") != mes.quantidade_vendas
            if difs or diverge_qtd:
                # Divergência: NÃO sobrescreve; anexa nota de rastreabilidade.
                rotulo_difs = ", ".join(difs + (["quantidade"] if diverge_qtd else []))
                divergencias.append(f"{mes_iso} ({rotulo_difs})")
                nota = (
                    f"[{datetime.now(timezone.utc).date().isoformat()}] "
                    f"Divergência vs {fonte} em: {rotulo_difs}. "
                    f"Valores anteriores mantidos (não sobrescritos)."
                )
                obs_atual = (atual.get("observacao") or "").strip()
                supabase.table("vendas_consolidado").update({
                    "observacao": (obs_atual + "\n" + nota).strip(),
                    "atualizado_em": _agora(),
                }).eq("id", atual["id"]).execute()
            else:
                # Idempotente (dados iguais): garante a indexação RAG (self-heal).
                remover_resumo_vendas(cliente_id, empresa_id, categoria, mes_iso)
                indexar_resumo_vendas(
                    cliente_id, empresa_id, mes_iso,
                    _resumo_mes(empresa_nome, categoria, mes_iso, valores_mes, mes.quantidade_vendas, mes.por_forma_pagamento),
                    fonte, categoria,
                )
            continue  # linha já existe: idempotente (ou divergência já sinalizada)

        registro = {
            "cliente_id": cliente_id,
            "empresa_id": empresa_id,
            "categoria": categoria,
            "mes_referencia": mes_iso,
            "quantidade_vendas": mes.quantidade_vendas,
            **{c: _num(valores_mes[c]) for c in _COLUNAS_MONETARIAS},
            "breakdown_pagamento": {k: float(v) for k, v in mes.por_forma_pagamento.items()},
            "fonte": fonte,
        }
        supabase.table("vendas_consolidado").insert(registro).execute()
        gravados += 1

        # RAG: indexa o resumo textual do mês recém-gravado (derivado, nunca fabricado)
        indexar_resumo_vendas(
            cliente_id, empresa_id, mes_iso,
            _resumo_mes(empresa_nome, categoria, mes_iso, valores_mes, mes.quantidade_vendas, mes.por_forma_pagamento),
            fonte, categoria,
        )

    if divergencias:
        detalhe = (
            "Divergências vs dados já gravados (mantidos, não sobrescritos): "
            + " | ".join(divergencias)
        )
        _marcar_status(upload_id, "erro", detalhe)
        status = "erro"
    else:
        partes = []
        if resultado.linhas_invalidas:
            partes.append(
                f"{resultado.linhas_invalidas} linha(s) da planilha ignorada(s) "
                "por dado inválido/incompleto (inclui o rodapé de totais do export)."
            )
        if resultado.nao_identificados:
            partes.append(
                "Procedimento não reconhecido em: "
                + ", ".join(resultado.nao_identificados)
                + " — gravado como 'Não identificado'."
            )
        _marcar_status(upload_id, "processado", " ".join(partes) or None)
        status = "processado"

    return {
        "status": status,
        "gravados": gravados,
        "divergencias": divergencias,
        "linhas_validas": resultado.linhas_validas,
        "linhas_invalidas": resultado.linhas_invalidas,
        "nao_identificados": resultado.nao_identificados,
        "categorias_detectadas": {
            _LABEL_CATEGORIA.get(c, c): qtd for c, qtd in sorted(categorias_detectadas.items())
        },
        "meses_detectados": sorted({m.mes_referencia.isoformat() for m in resultado.meses}),
    }


def reindexar_vendas_cliente(cliente_id: str) -> dict:
    """Backfill do RAG: reindexa o resumo de TODO o vendas_consolidado já gravado
    do cliente, sem baixar planilha nem alterar dado nenhum (mesmo padrão do
    reindexar_dre_cliente). Idempotente."""
    linhas = (
        supabase.table("vendas_consolidado")
        .select(
            "empresa_id, categoria, mes_referencia, fonte, quantidade_vendas, "
            "breakdown_pagamento, " + ", ".join(_COLUNAS_MONETARIAS)
        )
        .eq("cliente_id", cliente_id)
        .execute()
    )

    empresas_cache: dict[str, str] = {}
    indexados = 0
    falhas: list[str] = []
    total = len(linhas.data or [])

    for row in linhas.data or []:
        empresa_id = row["empresa_id"]
        if empresa_id not in empresas_cache:
            emp = (
                supabase.table("empresas")
                .select("codigo,nome_razao_social")
                .eq("id", empresa_id)
                .limit(1)
                .execute()
            )
            empresas_cache[empresa_id] = (
                f"{emp.data[0]['codigo']} — {emp.data[0]['nome_razao_social']}"
                if emp.data else empresa_id
            )

        mes_iso = row["mes_referencia"]
        categoria = row["categoria"]
        valores = {c: row.get(c) for c in _COLUNAS_MONETARIAS}
        resumo = _resumo_mes(
            empresas_cache[empresa_id], categoria, mes_iso, valores,
            row.get("quantidade_vendas") or 0, row.get("breakdown_pagamento") or {},
        )
        remover_resumo_vendas(cliente_id, empresa_id, categoria, mes_iso)
        erro = indexar_resumo_vendas(cliente_id, empresa_id, mes_iso, resumo, row.get("fonte"), categoria)
        if erro:
            if len(falhas) < 5:
                falhas.append(f"{mes_iso}/{categoria}: {erro}")
        else:
            indexados += 1

    return {
        "meses_indexados": indexados,
        "meses_total": total,
        "falhas": falhas,
        "total_falhas": len(falhas),
    }
