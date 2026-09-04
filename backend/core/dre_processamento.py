"""Processamento de DRE (etapa 5b) — baixa o PDF do Storage, parseia e grava.

Fluxo por upload:
  1. Valida empresa_id (dre_consolidado.empresa_id é NOT NULL).
  2. Marca dre_uploads.status = 'processando'.
  3. Baixa o PDF do Storage e parseia (core.dre_parser).
  4. Para cada mês extraído, grava UMA linha em dre_consolidado.

GOVERNANÇA (regras do JOB):
  - NUNCA fabricar número: campo ausente = NULL (não consta), nunca 0.
  - Mês com inconsistência contábil (confiabilidade 'baixa') NÃO é gravado —
    é sinalizado para revisão manual (fail-safe contra desalinhamento).
  - Divergência com dado já gravado é SINALIZADA (nota em observacao), nunca
    sobrescreve silenciosamente os valores existentes.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from config import config
from core.dre_parser import parsear_pdf
from supabase_client import supabase

logger = logging.getLogger(__name__)

_COLUNAS_MONETARIAS = (
    "receita_bruta", "impostos", "devolucoes", "receita_liquida",
    "custo_servico_vendido", "despesas_operacionais", "resultado_operacional",
    "despesas_financeiras", "ir_csll", "lucro_liquido", "retirada",
)

_TOL_COMPARACAO = Decimal("0.01")


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
        resultado = parsear_pdf(conteudo)
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

    gravados = 0
    ignorados_baixa: list[str] = []
    divergencias: list[str] = []

    for mes in resultado.meses:
        mes_iso = mes.mes_referencia.isoformat()

        # Fail-safe: inconsistência contábil -> não grava, sinaliza p/ revisão.
        if mes.confiabilidade == "baixa":
            ignorados_baixa.append(mes_iso)
            continue

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
            continue  # linha já existe: idempotente (ou divergência já sinalizada)

        registro = {
            "cliente_id": cliente_id,
            "empresa_id": empresa_id,
            "mes_referencia": mes_iso,
            **{c: _num(mes.valores.get(c)) for c in _COLUNAS_MONETARIAS},
            "fonte": fonte,
            "confiabilidade": mes.confiabilidade,
            "observacao": ("; ".join(mes.divergencias) if mes.divergencias else None),
        }
        supabase.table("dre_consolidado").insert(registro).execute()
        gravados += 1

    partes: list[str] = []
    if ignorados_baixa:
        partes.append(
            "Meses não gravados por inconsistência contábil (revisar manualmente): "
            + ", ".join(ignorados_baixa)
        )
    if divergencias:
        partes.append(
            "Divergências vs dados já gravados (mantidos, não sobrescritos): "
            + " | ".join(divergencias)
        )

    if partes:
        detalhe = " ".join(partes)
        _marcar_status(upload_id, "erro", detalhe)
        status = "erro"
    else:
        _marcar_status(upload_id, "processado", None)
        status = "processado"

    return {
        "status": status,
        "gravados": gravados,
        "ignorados_baixa": ignorados_baixa,
        "divergencias": divergencias,
        "meses_detectados": [m.mes_referencia.isoformat() for m in resultado.meses],
    }
