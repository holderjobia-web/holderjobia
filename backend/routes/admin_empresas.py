"""
Gestão de EMPRESAS (unidades de um cliente) pelo super admin do SaaS.

Rotas (todas exigem JWT admin — JWT_ADMIN_SECRET):
  GET  /admin/empresas?cliente_id=...  → lista as empresas (filtro opcional por cliente)
  POST /admin/empresas                 → cria uma empresa
  GET  /admin/empresas/{id}            → detalha uma empresa
  PATCH /admin/empresas/{id}           → atualiza campos da empresa

GOVERNANÇA: a unidade é identificada pelo CÓDIGO (único por cliente), nunca pelo nome.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from core.auth import admin_atual
from supabase_client import supabase

router = APIRouter(prefix="/admin/empresas", tags=["admin-empresas"])

_CAMPOS = (
    "id, cliente_id, rede_id, codigo, nome_razao_social, cnpj, segmento, papel_socio, "
    "percentual_participacao, ativa, prioridade_acompanhamento, status_maturidade, "
    "data_inauguracao, observacao, criado_em, atualizado_em"
)


class EmpresaCriar(BaseModel):
    cliente_id: str
    rede_id: str | None = None
    codigo: str = Field(..., min_length=1, max_length=50)
    nome_razao_social: str = Field(..., min_length=2, max_length=200)
    cnpj: str | None = Field(None, max_length=20)
    segmento: str | None = None
    papel_socio: str | None = None
    percentual_participacao: float | None = Field(None, ge=0, le=100)
    prioridade_acompanhamento: str | None = None
    status_maturidade: str | None = None
    data_inauguracao: str | None = None
    observacao: str | None = None


class EmpresaAtualizar(BaseModel):
    rede_id: str | None = None
    codigo: str | None = Field(None, min_length=1, max_length=50)
    nome_razao_social: str | None = Field(None, min_length=2, max_length=200)
    cnpj: str | None = Field(None, max_length=20)
    segmento: str | None = None
    papel_socio: str | None = None
    percentual_participacao: float | None = Field(None, ge=0, le=100)
    ativa: bool | None = None
    prioridade_acompanhamento: str | None = None
    status_maturidade: str | None = None
    data_inauguracao: str | None = None
    observacao: str | None = None


def _cliente_existe(cliente_id: str) -> bool:
    res = (
        supabase.table("clientes")
        .select("id")
        .eq("id", cliente_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


def _rede_do_cliente(rede_id: str, cliente_id: str) -> bool:
    res = (
        supabase.table("redes")
        .select("id")
        .eq("id", rede_id)
        .eq("cliente_id", cliente_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


@router.get("")
async def listar_empresas(
    cliente_id: str | None = Query(None),
    _: dict = Depends(admin_atual),
):
    query = supabase.table("empresas").select(_CAMPOS)
    if cliente_id:
        query = query.eq("cliente_id", cliente_id)
    res = query.order("codigo").execute()
    return res.data or []


@router.post("", status_code=201)
async def criar_empresa(dados: EmpresaCriar, _: dict = Depends(admin_atual)):
    if not _cliente_existe(dados.cliente_id):
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    if dados.rede_id and not _rede_do_cliente(dados.rede_id, dados.cliente_id):
        raise HTTPException(status_code=404, detail="Rede não encontrada para este cliente.")

    payload = dados.model_dump(exclude_none=True)
    payload["codigo"] = payload["codigo"].strip()
    payload["nome_razao_social"] = payload["nome_razao_social"].strip()

    try:
        res = supabase.table("empresas").insert(payload).execute()
    except APIError as e:
        if e.code == "23505":  # unique_violation (cliente_id, codigo)
            raise HTTPException(
                status_code=409,
                detail=f"Já existe uma empresa com o código '{payload['codigo']}' para este cliente.",
            )
        raise HTTPException(status_code=400, detail="Falha ao criar a empresa.")

    if not res.data:
        raise HTTPException(status_code=500, detail="Falha ao criar a empresa.")
    return res.data[0]


@router.get("/{empresa_id}")
async def detalhar_empresa(empresa_id: str, _: dict = Depends(admin_atual)):
    res = (
        supabase.table("empresas")
        .select(_CAMPOS)
        .eq("id", empresa_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    return res.data[0]


@router.patch("/{empresa_id}")
async def atualizar_empresa(
    empresa_id: str, dados: EmpresaAtualizar, _: dict = Depends(admin_atual)
):
    updates = dados.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar.")

    if updates.get("rede_id"):
        atual = (
            supabase.table("empresas")
            .select("cliente_id")
            .eq("id", empresa_id)
            .limit(1)
            .execute()
        )
        if not atual.data:
            raise HTTPException(status_code=404, detail="Empresa não encontrada.")
        if not _rede_do_cliente(updates["rede_id"], atual.data[0]["cliente_id"]):
            raise HTTPException(status_code=404, detail="Rede não encontrada para este cliente.")

    if "codigo" in updates and updates["codigo"]:
        updates["codigo"] = updates["codigo"].strip()
    if "nome_razao_social" in updates and updates["nome_razao_social"]:
        updates["nome_razao_social"] = updates["nome_razao_social"].strip()

    updates["atualizado_em"] = datetime.now(timezone.utc).isoformat()

    try:
        res = (
            supabase.table("empresas")
            .update(updates)
            .eq("id", empresa_id)
            .execute()
        )
    except APIError as e:
        if e.code == "23505":
            raise HTTPException(
                status_code=409,
                detail="Já existe uma empresa com esse código para este cliente.",
            )
        raise HTTPException(status_code=400, detail="Falha ao atualizar a empresa.")

    if not res.data:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    return res.data[0]


@router.delete("/{empresa_id}")
async def remover_empresa(empresa_id: str, _: dict = Depends(admin_atual)):
    """Exclui a empresa e, em cascata, seu DRE consolidado e participações.

    Operação irreversível — a confirmação forte é feita na interface.
    """
    res = supabase.table("empresas").delete().eq("id", empresa_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    return {"removida": True}
