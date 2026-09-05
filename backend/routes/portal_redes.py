"""
Gestão de REDES pelo próprio cliente (portal) — leitura para todos os
usuários do portal; criação/edição/exclusão restritas ao perfil
'admin_cliente' (dono do grupo), sempre escopadas ao cliente_id do usuário
logado (nunca alcança redes de outro cliente).

Uma rede agrupa empresas/unidades de um mesmo negócio (ex.: rede odontológica,
rede de pizzarias). Um cliente pode ter várias redes.

Rotas (exigem JWT do portal — JWT_SECRET; escrita restrita a admin_cliente):
  GET    /redes       → lista as redes do próprio cliente
  POST   /redes       → cria uma rede
  PATCH  /redes/{id}  → atualiza uma rede
  DELETE /redes/{id}  → exclui a rede (empresas ficam sem rede — FK SET NULL)
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from core.auth import admin_do_cliente, usuario_atual
from supabase_client import supabase

router = APIRouter(prefix="/redes", tags=["portal-redes"])

_CAMPOS = "id, cliente_id, nome, segmento, observacao, ativo, criado_em, atualizado_em"


class RedeCriar(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)
    segmento: str | None = None
    observacao: str | None = None


class RedeAtualizar(BaseModel):
    nome: str | None = Field(None, min_length=1, max_length=200)
    segmento: str | None = None
    observacao: str | None = None
    ativo: bool | None = None


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
async def listar_minhas_redes(usuario: dict = Depends(usuario_atual)):
    res = (
        supabase.table("redes")
        .select(_CAMPOS)
        .eq("cliente_id", usuario["cliente_id"])
        .order("nome")
        .execute()
    )
    return res.data or []


@router.post("", status_code=201)
async def criar_minha_rede(dados: RedeCriar, usuario: dict = Depends(admin_do_cliente)):
    payload = dados.model_dump(exclude_none=True)
    payload["nome"] = payload["nome"].strip()
    payload["cliente_id"] = usuario["cliente_id"]

    try:
        res = supabase.table("redes").insert(payload).execute()
    except APIError as e:
        if e.code == "23505":  # unique_violation (cliente_id, nome)
            raise HTTPException(
                status_code=409,
                detail=f"Já existe uma rede com o nome '{payload['nome']}'.",
            )
        raise HTTPException(status_code=400, detail="Falha ao criar a rede.")

    if not res.data:
        raise HTTPException(status_code=500, detail="Falha ao criar a rede.")
    return res.data[0]


@router.patch("/{rede_id}")
async def atualizar_minha_rede(
    rede_id: str, dados: RedeAtualizar, usuario: dict = Depends(admin_do_cliente)
):
    cliente_id = usuario["cliente_id"]
    if not _rede_do_cliente(rede_id, cliente_id):
        raise HTTPException(status_code=404, detail="Rede não encontrada.")

    updates = dados.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar.")
    if "nome" in updates and updates["nome"]:
        updates["nome"] = updates["nome"].strip()
    updates["atualizado_em"] = datetime.now(timezone.utc).isoformat()

    try:
        res = (
            supabase.table("redes")
            .update(updates)
            .eq("id", rede_id)
            .eq("cliente_id", cliente_id)
            .execute()
        )
    except APIError as e:
        if e.code == "23505":
            raise HTTPException(status_code=409, detail="Já existe uma rede com esse nome.")
        raise HTTPException(status_code=400, detail="Falha ao atualizar a rede.")

    if not res.data:
        raise HTTPException(status_code=404, detail="Rede não encontrada.")
    return res.data[0]


@router.delete("/{rede_id}")
async def remover_minha_rede(rede_id: str, usuario: dict = Depends(admin_do_cliente)):
    cliente_id = usuario["cliente_id"]
    res = (
        supabase.table("redes")
        .delete()
        .eq("id", rede_id)
        .eq("cliente_id", cliente_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Rede não encontrada.")
    return {"removida": True}
