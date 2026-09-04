"""
Gestão de USUÁRIOS DO PORTAL pelo super admin do SaaS.

Rotas (todas exigem JWT admin — JWT_ADMIN_SECRET):
  GET  /admin/usuarios?cliente_id=...       → lista usuários (sem hash de senha)
  POST /admin/usuarios                      → cria usuário com senha temporária
  PATCH /admin/usuarios/{id}                → atualiza nome/perfil/ativo
  POST /admin/usuarios/{id}/resetar-senha   → gera nova senha temporária

A senha temporária em texto claro só aparece UMA VEZ, na resposta de criação
ou de reset — o admin repassa ao usuário, que troca no primeiro login.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError
from pydantic import BaseModel, EmailStr, Field

from core.auth import admin_atual
from core.security import gerar_hash_senha, gerar_senha_temporaria
from supabase_client import supabase

router = APIRouter(prefix="/admin/usuarios", tags=["admin-usuarios"])

_CAMPOS = (
    "id, cliente_id, nome, email, perfil, ativo, senha_temporaria, "
    "criado_em, ultimo_acesso"
)


class UsuarioCriar(BaseModel):
    cliente_id: str
    nome: str = Field(..., min_length=2, max_length=200)
    email: EmailStr
    perfil: str = Field("admin_cliente", pattern="^(admin_cliente|operador)$")


class UsuarioAtualizar(BaseModel):
    nome: str | None = Field(None, min_length=2, max_length=200)
    perfil: str | None = Field(None, pattern="^(admin_cliente|operador)$")
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
async def listar_usuarios(
    cliente_id: str | None = Query(None),
    _: dict = Depends(admin_atual),
):
    query = supabase.table("usuarios").select(_CAMPOS)
    if cliente_id:
        query = query.eq("cliente_id", cliente_id)
    res = query.order("criado_em", desc=True).execute()
    return res.data or []


@router.post("", status_code=201)
async def criar_usuario(dados: UsuarioCriar, _: dict = Depends(admin_atual)):
    if not _cliente_existe(dados.cliente_id):
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    senha_temp = gerar_senha_temporaria()
    payload = {
        "cliente_id": dados.cliente_id,
        "nome": dados.nome.strip(),
        "email": str(dados.email).lower().strip(),
        "senha_hash": gerar_hash_senha(senha_temp),
        "perfil": dados.perfil,
        "senha_temporaria": True,
    }

    try:
        res = supabase.table("usuarios").insert(payload).execute()
    except APIError as e:
        if e.code == "23505":  # unique_violation (email)
            raise HTTPException(
                status_code=409,
                detail="Já existe um usuário com este e-mail.",
            )
        raise HTTPException(status_code=400, detail="Falha ao criar o usuário.")

    if not res.data:
        raise HTTPException(status_code=500, detail="Falha ao criar o usuário.")

    usuario = res.data[0]
    usuario.pop("senha_hash", None)
    return {"usuario": usuario, "senha_temporaria": senha_temp}


@router.patch("/{usuario_id}")
async def atualizar_usuario(
    usuario_id: str, dados: UsuarioAtualizar, _: dict = Depends(admin_atual)
):
    updates: dict = {}
    if dados.nome is not None:
        updates["nome"] = dados.nome.strip()
    if dados.perfil is not None:
        updates["perfil"] = dados.perfil
    if dados.ativo is not None:
        updates["ativo"] = dados.ativo

    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar.")

    res = (
        supabase.table("usuarios")
        .update(updates)
        .eq("id", usuario_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    usuario = res.data[0]
    usuario.pop("senha_hash", None)
    return usuario


@router.post("/{usuario_id}/resetar-senha")
async def resetar_senha(usuario_id: str, _: dict = Depends(admin_atual)):
    senha_temp = gerar_senha_temporaria()
    res = (
        supabase.table("usuarios")
        .update(
            {
                "senha_hash": gerar_hash_senha(senha_temp),
                "senha_temporaria": True,
                "login_tentativas": 0,
                "login_bloqueado_ate": None,
            }
        )
        .eq("id", usuario_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    return {"senha_temporaria": senha_temp}
