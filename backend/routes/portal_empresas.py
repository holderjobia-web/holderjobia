"""
Gestão de EMPRESAS pelo próprio cliente (portal) — leitura para todos os
usuários do portal; criação/edição/inativação/exclusão restritas ao perfil
'admin_cliente' (dono do grupo), sempre escopadas ao cliente_id do usuário
logado (nunca alcança empresas de outro cliente).

Rotas (exigem JWT do portal — JWT_SECRET; escrita restrita a admin_cliente):
  GET    /empresas       → lista as empresas do próprio cliente
  POST   /empresas       → cria uma empresa (código único por cliente)
  PATCH  /empresas/{id}  → atualiza uma empresa
  DELETE /empresas/{id}  → exclui a empresa (cascade: DRE + participações)

GOVERNANÇA: a unidade é identificada pelo CÓDIGO (único por cliente), nunca pelo nome.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from core.auth import admin_do_cliente, usuario_atual
from supabase_client import supabase

router = APIRouter(prefix="/empresas", tags=["portal-empresas"])

_CAMPOS = (
    "id, cliente_id, rede_id, codigo, nome_razao_social, cnpj, segmento, papel_socio, "
    "percentual_participacao, ativa, prioridade_acompanhamento, status_maturidade, "
    "data_inauguracao, observacao, criado_em, atualizado_em"
)


class EmpresaCriar(BaseModel):
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


@router.get("")
async def listar_minhas_empresas(usuario: dict = Depends(usuario_atual)):
    res = (
        supabase.table("empresas")
        .select(_CAMPOS)
        .eq("cliente_id", usuario["cliente_id"])
        .order("codigo")
        .execute()
    )
    return res.data or []


@router.post("", status_code=201)
async def criar_minha_empresa(dados: EmpresaCriar, usuario: dict = Depends(admin_do_cliente)):
    cliente_id = usuario["cliente_id"]

    if dados.rede_id and not _rede_do_cliente(dados.rede_id, cliente_id):
        raise HTTPException(status_code=404, detail="Rede não encontrada.")

    payload = dados.model_dump(exclude_none=True)
    payload["codigo"] = payload["codigo"].strip()
    payload["nome_razao_social"] = payload["nome_razao_social"].strip()
    payload["cliente_id"] = cliente_id

    try:
        res = supabase.table("empresas").insert(payload).execute()
    except APIError as e:
        if e.code == "23505":  # unique_violation (cliente_id, codigo)
            raise HTTPException(
                status_code=409,
                detail=f"Já existe uma empresa com o código '{payload['codigo']}'.",
            )
        raise HTTPException(status_code=400, detail="Falha ao criar a empresa.")

    if not res.data:
        raise HTTPException(status_code=500, detail="Falha ao criar a empresa.")
    return res.data[0]


@router.patch("/{empresa_id}")
async def atualizar_minha_empresa(
    empresa_id: str, dados: EmpresaAtualizar, usuario: dict = Depends(admin_do_cliente)
):
    cliente_id = usuario["cliente_id"]
    if not _empresa_do_cliente(empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    updates = dados.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar.")

    if updates.get("rede_id") and not _rede_do_cliente(updates["rede_id"], cliente_id):
        raise HTTPException(status_code=404, detail="Rede não encontrada.")

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
            .eq("cliente_id", cliente_id)
            .execute()
        )
    except APIError as e:
        if e.code == "23505":
            raise HTTPException(
                status_code=409,
                detail="Já existe uma empresa com esse código.",
            )
        raise HTTPException(status_code=400, detail="Falha ao atualizar a empresa.")

    if not res.data:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    return res.data[0]


@router.delete("/{empresa_id}")
async def remover_minha_empresa(empresa_id: str, usuario: dict = Depends(admin_do_cliente)):
    """Exclui a empresa e, em cascata, seu DRE consolidado e participações.

    Operação irreversível — a confirmação forte é feita na interface.
    """
    cliente_id = usuario["cliente_id"]
    res = (
        supabase.table("empresas")
        .delete()
        .eq("id", empresa_id)
        .eq("cliente_id", cliente_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    return {"removida": True}
