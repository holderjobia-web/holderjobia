"""Processamento de DRE (etapa 5b) — baixa o PDF do Storage, parseia e grava.

Fluxo por upload:
  1. Valida empresa_id (dre_consolidado.empresa_id é NOT NULL).
  2. Marca dre_uploads.status = 'processando'.
  3. Baixa o PDF do Storage e parseia (core.dre_parser).
  4. Para cada mês extraído, grava UMA linha em dre_consolidado.

GOVERNANÇA (regras do JOB):
  - NUNCA fabricar número: campo ausente = NULL (não consta), nunca 0.
  - Mês com inconsistência contábil (confiabilidade 'baixa') É gravado, porém
    SINALIZADO (confiabilidade='baixa' + observacao) — os valores vêm fiéis do
    PDF; só a conferência interna não fechou. Nunca descarta dado legítimo.
  - Divergência com dado já gravado é SINALIZADA (nota em observacao), nunca
    sobrescreve silenciosamente os valores existentes.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from config import config
from core.base_conhecimento import indexar_resumo_mes, indexar_texto_bruto, remover_resumo_mes
from core.dre_parser import extrair_texto_pdf, parsear
from supabase_client import supabase

logger = logging.getLogger(__name__)

_COLUNAS_MONETARIAS = (
    "receita_bruta", "impostos", "devolucoes", "receita_liquida",
    "custo_servico_vendido", "despesas_operacionais", "resultado_operacional",
    "despesas_financeiras", "ir_csll", "lucro_liquido", "retirada",
)

_LABEL_MONETARIO = {
    "receita_bruta": "Receita bruta",
    "impostos": "Impostos e contribuições",
    "devolucoes": "Devoluções",
    "receita_liquida": "Receita líquida",
    "custo_servico_vendido": "Custo do serviço prestado",
    "despesas_operacionais": "Despesas operacionais",
    "resultado_operacional": "Resultado operacional",
    "despesas_financeiras": "Despesas financeiras",
    "ir_csll": "IR/CSLL",
    "lucro_liquido": "Lucro líquido",
    "retirada": "Retirada dos sócios",
}

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
    mes_iso: str,
    valores: dict,
    confiabilidade: Optional[str],
    divergencias: Optional[list] = None,
) -> str:
    """Texto narrativo (derivado, nunca fabricado) de 1 mês de DRE — indexado no RAG.

    `valores` é um dict simples {coluna: numero|None} — aceita tanto o resultado do
    parser (LinhaMensal.valores) quanto uma linha já gravada em dre_consolidado,
    o que permite reaproveitar esta função no backfill (reindexar_dre_cliente).
    """
    linhas = [f"DRE de {nome_empresa} referente a {mes_iso}:"]
    for coluna, rotulo in _LABEL_MONETARIO.items():
        linhas.append(f"- {rotulo}: {_brl(valores.get(coluna))}")
    linhas.append(f"Confiabilidade da extração: {confiabilidade or 'pendente'}.")
    if divergencias:
        linhas.append("Observações de conferência: " + "; ".join(divergencias))
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
    supabase.table("dre_uploads").update({
        "status": status,
        "erro_detalhe": erro_detalhe,
        "atualizado_em": _agora(),
    }).eq("id", upload_id).execute()


def processar_upload(upload: dict) -> dict:
    """Processa um registro de dre_uploads. Atualiza o status e devolve um resumo."""
    upload_id = upload["id"]
    cliente_id = upload["cliente_id"]
    empresa_id = upload.get("empresa_id")
    storage_path = upload["storage_path"]

    if not empresa_id:
        motivo = "Selecione a empresa antes de processar (empresa_id ausente)."
        _marcar_status(upload_id, "erro", motivo)
        return {"status": "erro", "motivo": motivo}

    _marcar_status(upload_id, "processando")

    try:
        conteudo = supabase.storage.from_(config.DRE_BUCKET).download(storage_path)
    except Exception as e:
        corpo = getattr(getattr(e, "response", None), "text", "") or repr(e)
        logger.exception("Falha ao baixar DRE do Storage (path=%s) erro=%s", storage_path, corpo)
        _marcar_status(upload_id, "erro", "Falha ao ler o arquivo do armazenamento.")
        return {"status": "erro", "motivo": "download"}

    try:
        texto_pdf = extrair_texto_pdf(conteudo)
        resultado = parsear(texto_pdf)
    except Exception:
        logger.exception("Falha ao parsear DRE (upload=%s)", upload_id)
        _marcar_status(upload_id, "erro", "Falha ao interpretar o PDF.")
        return {"status": "erro", "motivo": "parser_excecao"}

    if not resultado.ok:
        _marcar_status(upload_id, "erro", resultado.motivo)
        return {"status": "erro", "motivo": resultado.motivo}

    fonte = f"DRE PDF: {upload.get('nome_arquivo') or storage_path}"
    if resultado.unidade_texto:
        fonte += f" (unidade no arquivo: {resultado.unidade_texto})"

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

    # RAG: indexa o texto bruto do PDF já validado (best-effort, não derruba o processamento)
    indexar_texto_bruto(cliente_id, empresa_id, fonte, texto_pdf)

    gravados = 0
    sinalizados_baixa: list[str] = []
    divergencias: list[str] = []

    for mes in resultado.meses:
        mes_iso = mes.mes_referencia.isoformat()

        existente = (
            supabase.table("dre_consolidado")
            .select("*")
            .eq("empresa_id", empresa_id)
            .eq("mes_referencia", mes_iso)
            .limit(1)
            .execute()
        )

        if existente.data:
            atual = existente.data[0]
            difs = [
                c for c in _COLUNAS_MONETARIAS
                if _difere(atual.get(c), mes.valores.get(c))
            ]
            if difs:
                # Divergência: NÃO sobrescreve; anexa nota de rastreabilidade.
                divergencias.append(f"{mes_iso} ({', '.join(difs)})")
                nota = (
                    f"[{datetime.now(timezone.utc).date().isoformat()}] "
                    f"Divergência vs {fonte} em: {', '.join(difs)}. "
                    f"Valores anteriores mantidos (não sobrescritos)."
                )
                obs_atual = (atual.get("observacao") or "").strip()
                supabase.table("dre_consolidado").update({
                    "observacao": (obs_atual + "\n" + nota).strip(),
                    "atualizado_em": _agora(),
                }).eq("id", atual["id"]).execute()
            else:
                # Idempotente (dados iguais): ainda assim GARANTE a indexação RAG.
                # Self-heal p/ DREs processados antes da Etapa 7 (agente de IA)
                # existir — clicar "Reprocessar" passa a bastar p/ popular a base.
                remover_resumo_mes(cliente_id, empresa_id, mes_iso)
                indexar_resumo_mes(
                    cliente_id, empresa_id, mes_iso,
                    _resumo_mes(empresa_nome, mes_iso, mes.valores, mes.confiabilidade, mes.divergencias),
                    fonte,
                )
            continue  # linha já existe: idempotente (ou divergência já sinalizada)

        # Grava-e-sinaliza: confiabilidade 'baixa' é gravada com flag + observacao.
        if mes.confiabilidade == "baixa":
            sinalizados_baixa.append(mes_iso)
        observacao = "; ".join(mes.divergencias) if mes.divergencias else None

        registro = {
            "cliente_id": cliente_id,
            "empresa_id": empresa_id,
            "mes_referencia": mes_iso,
            **{c: _num(mes.valores.get(c)) for c in _COLUNAS_MONETARIAS},
            "fonte": fonte,
            "confiabilidade": mes.confiabilidade,
            "observacao": observacao,
        }
        supabase.table("dre_consolidado").insert(registro).execute()
        gravados += 1

        # RAG: indexa o resumo textual do mês recém-gravado (derivado, nunca fabricado)
        indexar_resumo_mes(
            cliente_id, empresa_id, mes_iso,
            _resumo_mes(empresa_nome, mes_iso, mes.valores, mes.confiabilidade, mes.divergencias),
            fonte,
        )

    if divergencias:
        detalhe = (
            "Divergências vs dados já gravados (mantidos, não sobrescritos): "
            + " | ".join(divergencias)
        )
        _marcar_status(upload_id, "erro", detalhe)
        status = "erro"
    else:
        nota = None
        if sinalizados_baixa:
            nota = (
                "Gravado com sinalização (revisar) — confiabilidade baixa: "
                + ", ".join(sinalizados_baixa)
            )
        _marcar_status(upload_id, "processado", nota)
        status = "processado"

    return {
        "status": status,
        "gravados": gravados,
        "sinalizados_baixa": sinalizados_baixa,
        "divergencias": divergencias,
        "meses_detectados": [m.mes_referencia.isoformat() for m in resultado.meses],
    }


def reindexar_dre_cliente(cliente_id: str) -> dict:
    """Backfill do RAG: reindexa o resumo de TODO o dre_consolidado já gravado do
    cliente, sem baixar PDF nem alterar dado nenhum.

    Útil para DREs processados ANTES da Etapa 7 (agente de IA) existir — nesses
    casos base_conhecimento nunca foi populada e o agente responde "sem dados",
    mesmo com o DRE lançado. Idempotente: pode ser rodado quantas vezes precisar
    (remove o resumo antigo do mês antes de reindexar).
    """
    linhas = (
        supabase.table("dre_consolidado")
        .select("empresa_id, mes_referencia, fonte, confiabilidade, observacao, " + ", ".join(_COLUNAS_MONETARIAS))
        .eq("cliente_id", cliente_id)
        .execute()
    )

    empresas_cache: dict[str, str] = {}
    indexados = 0
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
        valores = {c: row.get(c) for c in _COLUNAS_MONETARIAS}
        observacao = row.get("observacao")
        divergencias = observacao.split("; ") if observacao else []
        resumo = _resumo_mes(
            empresas_cache[empresa_id], mes_iso, valores,
            row.get("confiabilidade"), divergencias,
        )
        fonte = row.get("fonte") or f"DRE consolidado ({mes_iso})"

        remover_resumo_mes(cliente_id, empresa_id, mes_iso)
        indexar_resumo_mes(cliente_id, empresa_id, mes_iso, resumo, fonte)
        indexados += 1

    return {"meses_indexados": indexados}
