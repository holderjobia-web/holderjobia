"""
Gestão de REDES (negócios de um cliente) pelo super admin do SaaS.

Uma rede agrupa empresas/unidades de um mesmo negócio (ex.: rede odontológica,
rede de pizzarias). Um cliente pode ter várias redes.

Rotas (todas exigem JWT admin — JWT_ADMIN_SECRET):
  GET   /admin/redes?cliente_id=...  → lista redes (filtro opcional por cliente)
  POST  /admin/redes                 → cria uma rede
  PATCH /admin/redes/{id}            → atualiza uma rede
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from core.auth import admin_atual
from supabase_client import supabase

router = APIRouter(prefix="/admin/redes", tags=["admin-redes"])

_CAMPOS = "id, cliente_id, nome, segmento, observacao, ativo, criado_em, atualizado_em"


class RedeCriar(BaseModel):
    cliente_id: str
    nome: str = Field(..., min_length=1, max_length=200)
    segmento: str | None = None
    observacao: str | None = None


class RedeAtualizar(BaseModel):
    nome: str | None = Field(None, min_length=1, max_length=200)
    segmento: str | None = None
    observacao: str | None = None
    ativo: bool | None = None


def _cliente_existe(cliente_id: str) -> bool:
    res = (
        supabase.table("clientes")
        .select("id")
        .eq("id", cliente_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


@router.get("")
async def listar_redes(
    cliente_id: str | None = Query(None),
    _: dict = Depends(admin_atual),
):
    query = supabase.table("redes").select(_CAMPOS)
    if cliente_id:
        query = query.eq("cliente_id", cliente_id)
    res = query.order("nome").execute()
    return res.data or []


@router.post("", status_code=201)
async def criar_rede(dados: RedeCriar, _: dict = Depends(admin_atual)):
    if not _cliente_existe(dados.cliente_id):
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    payload = dados.model_dump(exclude_none=True)
    payload["nome"] = payload["nome"].strip()

    try:
        res = supabase.table("redes").insert(payload).execute()
    except APIError as e:
        if e.code == "23505":  # unique_violation (cliente_id, nome)
            raise HTTPException(
                status_code=409,
                detail=f"Já existe uma rede com o nome '{payload['nome']}' para este cliente.",
            )
        raise HTTPException(status_code=400, detail="Falha ao criar a rede.")

    if not res.data:
        raise HTTPException(status_code=500, detail="Falha ao criar a rede.")
    return res.data[0]


@router.patch("/{rede_id}")
async def atualizar_rede(
    rede_id: str, dados: RedeAtualizar, _: dict = Depends(admin_atual)
):
    updates = dados.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar.")
    if "nome" in updates and updates["nome"]:
        updates["nome"] = updates["nome"].strip()
    updates["atualizado_em"] = datetime.now(timezone.utc).isoformat()

    try:
        res = supabase.table("redes").update(updates).eq("id", rede_id).execute()
    except APIError as e:
        if e.code == "23505":
            raise HTTPException(
                status_code=409,
                detail="Já existe uma rede com esse nome para este cliente.",
            )
        raise HTTPException(status_code=400, detail="Falha ao atualizar a rede.")

    if not res.data:
        raise HTTPException(status_code=404, detail="Rede não encontrada.")
    return res.data[0]
