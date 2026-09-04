"""
Envio de DRE (portal) — upload do PDF, registro dos metadados e processamento.

Rotas (exigem JWT do portal — JWT_SECRET):
  POST /dre/uploads                → recebe o PDF (multipart), salva e registra
  GET  /dre/uploads                → lista os envios do cliente (filtro empresa)
  POST /dre/uploads/{id}/processar → parseia o PDF e grava em dre_consolidado

O binário vai para o bucket privado do Supabase Storage; o banco guarda só
os metadados e o status. A extração dos números fica em core.dre_processamento.
"""

import uuid
from datetime import date, datetime, timezone
import logging

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)

from config import config
from core.auth import usuario_atual
from core.dre_processamento import processar_upload
from supabase_client import supabase

router = APIRouter(prefix="/dre", tags=["dre"])

logger = logging.getLogger(__name__)

_MAX_BYTES = 20 * 1024 * 1024  # 20 MB
_CAMPOS = (
    "id, cliente_id, empresa_id, nome_arquivo, tamanho_bytes, mes_referencia, "
    "status, erro_detalhe, criado_em"
)


def _empresa_do_cliente(empresa_id: str, cliente_id: str) -> bool:
    res = (
        supabase.table("empresas")
        .select("id")
        .eq("id", empresa_id)
        .eq("cliente_id", cliente_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


def _normalizar_mes(mes: str | None) -> str | None:
    """Aceita 'YYYY-MM' ou 'YYYY-MM-DD' e devolve o 1º dia do mês (ISO)."""
    if not mes:
        return None
    mes = mes.strip()
    try:
        if len(mes) == 7:  # YYYY-MM
            ano, m = mes.split("-")
            return date(int(ano), int(m), 1).isoformat()
        return date.fromisoformat(mes).replace(day=1).isoformat()
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="mes_referencia inválido. Use o formato AAAA-MM.",
        )


@router.get("/uploads")
async def listar_uploads(
    empresa_id: str | None = Query(None),
    usuario: dict = Depends(usuario_atual),
):
    query = (
        supabase.table("dre_uploads")
        .select(_CAMPOS)
        .eq("cliente_id", usuario["cliente_id"])
    )
    if empresa_id:
        query = query.eq("empresa_id", empresa_id)
    res = query.order("criado_em", desc=True).execute()
    return res.data or []


@router.post("/uploads", status_code=201)
async def enviar_dre(
    arquivo: UploadFile = File(...),
    empresa_id: str | None = Form(None),
    mes_referencia: str | None = Form(None),
    usuario: dict = Depends(usuario_atual),
):
    cliente_id = usuario["cliente_id"]

    # Validações de entrada
    nome = (arquivo.filename or "").strip()
    tipo = (arquivo.content_type or "").lower()
    if not nome.lower().endswith(".pdf") and tipo != "application/pdf":
        raise HTTPException(status_code=415, detail="Envie um arquivo PDF.")

    if empresa_id and not _empresa_do_cliente(empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    mes_iso = _normalizar_mes(mes_referencia)

    conteudo = await arquivo.read()
    if not conteudo:
        raise HTTPException(status_code=422, detail="Arquivo vazio.")
    if len(conteudo) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo excede o limite de 20 MB.")

    # Upload no Storage (bucket privado) — caminho isolado por cliente
    storage_path = f"{cliente_id}/{uuid.uuid4()}.pdf"
    try:
        supabase.storage.from_(config.DRE_BUCKET).upload(
            storage_path,
            conteudo,
            {"content-type": "application/pdf"},
        )
    except Exception as e:
        corpo = getattr(getattr(e, "response", None), "text", "") or repr(e)
        logger.exception(
            "Falha ao enviar DRE para o Storage (bucket=%s) erro=%s",
            config.DRE_BUCKET, corpo,
        )
        detalhe = "Falha ao armazenar o arquivo. Tente novamente."
        if config.AMBIENTE != "producao":
            detalhe = f"Falha ao armazenar o arquivo: {corpo}".strip()
        raise HTTPException(status_code=502, detail=detalhe)

    payload = {
        "cliente_id": cliente_id,
        "empresa_id": empresa_id,
        "enviado_por": usuario["id"],
        "nome_arquivo": nome,
        "storage_path": storage_path,
        "tamanho_bytes": len(conteudo),
        "mes_referencia": mes_iso,
        "status": "recebido",
    }
    res = supabase.table("dre_uploads").insert(payload).execute()
    if not res.data:
        # Registro falhou — remove o arquivo órfão do Storage
        try:
            supabase.storage.from_(config.DRE_BUCKET).remove([storage_path])
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Falha ao registrar o envio.")

    registro = res.data[0]
    registro.pop("storage_path", None)
    return registro


@router.post("/uploads/{upload_id}/processar")
async def processar_dre(
    upload_id: str,
    usuario: dict = Depends(usuario_atual),
):
    res = (
        supabase.table("dre_uploads")
        .select("id, cliente_id, empresa_id, storage_path, nome_arquivo, status")
        .eq("id", upload_id)
        .eq("cliente_id", usuario["cliente_id"])
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    return processar_upload(res.data[0])


_COLUNAS_DRE = (
    "mes_referencia", "receita_bruta", "impostos", "devolucoes",
    "receita_liquida", "custo_servico_vendido", "despesas_operacionais",
    "resultado_operacional", "despesas_financeiras", "ir_csll",
    "lucro_liquido", "retirada", "confiabilidade", "fonte", "observacao",
)


def _f(v) -> float | None:
    """Converte valor do banco (str/número/None) em float, preservando NULL."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _pct(numerador: float | None, base: float | None) -> float | None:
    """Margem % = numerador/base*100. NULL se faltar componente ou base 0."""
    if numerador is None or base is None or base == 0:
        return None
    return round(numerador / base * 100, 2)


def _com_indicadores(linha: dict) -> dict:
    """Normaliza valores monetários em float e adiciona margens derivadas.

    As margens são calculadas na resposta, nunca gravadas (governança).
    """
    valores = {
        c: _f(linha.get(c))
        for c in _COLUNAS_DRE
        if c not in ("mes_referencia", "confiabilidade", "fonte", "observacao")
    }
    receita_liquida = valores["receita_liquida"]
    custo = valores["custo_servico_vendido"]
    margem_contribuicao_base = (
        receita_liquida - custo
        if receita_liquida is not None and custo is not None
        else None
    )
    return {
        "mes_referencia": linha.get("mes_referencia"),
        **valores,
        "margem_liquida": _pct(valores["lucro_liquido"], receita_liquida),
        "margem_operacional": _pct(valores["resultado_operacional"], receita_liquida),
        "margem_contribuicao": _pct(margem_contribuicao_base, receita_liquida),
        "confiabilidade": linha.get("confiabilidade"),
        "fonte": linha.get("fonte"),
        "observacao": linha.get("observacao"),
    }


@router.get("/consolidado")
async def consolidado(
    empresa_id: str = Query(...),
    de: str | None = Query(None, description="mês inicial AAAA-MM"),
    ate: str | None = Query(None, description="mês final AAAA-MM"),
    usuario: dict = Depends(usuario_atual),
):
    cliente_id = usuario["cliente_id"]
    if not _empresa_do_cliente(empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    query = (
        supabase.table("dre_consolidado")
        .select(", ".join(_COLUNAS_DRE))
        .eq("empresa_id", empresa_id)
    )
    de_iso = _normalizar_mes(de)
    ate_iso = _normalizar_mes(ate)
    if de_iso:
        query = query.gte("mes_referencia", de_iso)
    if ate_iso:
        query = query.lte("mes_referencia", ate_iso)

    res = query.order("mes_referencia").execute()
    meses = [_com_indicadores(linha) for linha in (res.data or [])]
    return {"empresa_id": empresa_id, "meses": meses}
