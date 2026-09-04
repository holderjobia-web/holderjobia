"""
Envio de DRE (portal) — etapa 5a: upload do PDF + registro dos metadados.

Rotas (exigem JWT do portal — JWT_SECRET):
  POST /dre/uploads   → recebe o PDF (multipart), salva no Storage e registra
  GET  /dre/uploads   → lista os envios do cliente (filtro opcional por empresa)

O binário vai para o bucket privado do Supabase Storage; o banco guarda só
os metadados e o status. O parsing (extração dos números) é a etapa 5b.
"""

import uuid
from datetime import date, datetime, timezone

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
from supabase_client import supabase

router = APIRouter(prefix="/dre", tags=["dre"])

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
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Falha ao armazenar o arquivo. Tente novamente.",
        )

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
