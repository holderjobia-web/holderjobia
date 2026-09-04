"""
Gestão de CLIENTES (tenants) pelo super admin do SaaS.

Rotas (todas exigem JWT admin — JWT_ADMIN_SECRET):
  GET  /admin/clientes        → lista os clientes
  POST /admin/clientes        → cria um cliente
  GET  /admin/clientes/{id}   → detalha um cliente
  PATCH /admin/clientes/{id}  → atualiza nome/cnpj/ativo
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.auth import admin_atual
from supabase_client import supabase

router = APIRouter(prefix="/admin/clientes", tags=["admin-clientes"])

_CAMPOS = "id, nome, cnpj, ativo, criado_em, atualizado_em, ultimo_acesso"


class ClienteCriar(BaseModel):
    nome: str = Field(..., min_length=2, max_length=200)
    cnpj: str | None = Field(None, max_length=20)


class ClienteAtualizar(BaseModel):
    nome: str | None = Field(None, min_length=2, max_length=200)
    cnpj: str | None = Field(None, max_length=20)
    ativo: bool | None = None


@router.get("")
async def listar_clientes(_: dict = Depends(admin_atual)):
    res = (
        supabase.table("clientes")
        .select(_CAMPOS)
        .order("criado_em", desc=True)
        .execute()
    )
    return res.data or []


@router.post("", status_code=201)
async def criar_cliente(dados: ClienteCriar, _: dict = Depends(admin_atual)):
    payload = {"nome": dados.nome.strip()}
    if dados.cnpj:
        payload["cnpj"] = dados.cnpj.strip()

    res = supabase.table("clientes").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Falha ao criar o cliente.")
    return res.data[0]


@router.get("/{cliente_id}")
async def detalhar_cliente(cliente_id: str, _: dict = Depends(admin_atual)):
    res = (
        supabase.table("clientes")
        .select(_CAMPOS)
        .eq("id", cliente_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    return res.data[0]


@router.patch("/{cliente_id}")
async def atualizar_cliente(
    cliente_id: str, dados: ClienteAtualizar, _: dict = Depends(admin_atual)
):
    updates: dict = {}
    if dados.nome is not None:
        updates["nome"] = dados.nome.strip()
    if dados.cnpj is not None:
        updates["cnpj"] = dados.cnpj.strip() or None
    if dados.ativo is not None:
        updates["ativo"] = dados.ativo

    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar.")

    updates["atualizado_em"] = datetime.now(timezone.utc).isoformat()

    res = (
        supabase.table("clientes")
        .update(updates)
        .eq("id", cliente_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    return res.data[0]
