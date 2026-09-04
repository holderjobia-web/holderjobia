"""
Dependências de autenticação (FastAPI) — validam a sessão a cada request.

Dois contextos isolados, cada um com seu próprio secret:
  - Portal  (usuarios) → JWT_SECRET       → header Authorization: Bearer
  - Admin   (admins)   → JWT_ADMIN_SECRET → header Authorization: Bearer

O token carrega só o id (sub). O usuário/admin é buscado fresh no banco a
cada request, revalidando `ativo` (revogação imediata ao desativar a conta).
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from postgrest.exceptions import APIError

import logging

from config import config
from core.security import decodificar_token
from supabase_client import supabase

logger = logging.getLogger(__name__)


oauth2_portal = OAuth2PasswordBearer(tokenUrl="/auth/login")
oauth2_admin = OAuth2PasswordBearer(tokenUrl="/admin/auth/login")

_CRED_INVALIDA = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Sessão inválida ou expirada",
    headers={"WWW-Authenticate": "Bearer"},
)

_BANCO_INDISPONIVEL = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="Serviço temporariamente indisponível. Tente novamente em instantes.",
)


async def usuario_atual(token: str = Depends(oauth2_portal)) -> dict:
    """Valida o JWT do portal e retorna o usuário ativo."""
    payload = decodificar_token(token, config.JWT_SECRET)
    if not payload:
        raise _CRED_INVALIDA

    usuario_id = payload.get("sub")
    if not usuario_id:
        raise _CRED_INVALIDA

    try:
        res = (
            supabase.table("usuarios")
            .select("id, cliente_id, nome, email, perfil, ativo")
            .eq("id", usuario_id)
            .limit(1)
            .execute()
        )
    except APIError as exc:
        logger.error("Falha ao consultar 'usuarios' (usuario_atual): %s", exc, exc_info=True)
        raise _BANCO_INDISPONIVEL
    if not res.data or not res.data[0].get("ativo"):
        raise _CRED_INVALIDA
    return res.data[0]


async def admin_atual(token: str = Depends(oauth2_admin)) -> dict:
    """Valida o JWT do admin e retorna o admin ativo."""
    payload = decodificar_token(token, config.JWT_ADMIN_SECRET)
    if not payload or payload.get("tipo") != "admin":
        raise _CRED_INVALIDA

    admin_id = payload.get("sub")
    if not admin_id:
        raise _CRED_INVALIDA

    try:
        res = (
            supabase.table("admins")
            .select("id, nome, email, ativo")
            .eq("id", admin_id)
            .limit(1)
            .execute()
        )
    except APIError as exc:
        logger.error("Falha ao consultar 'admins' (admin_atual): %s", exc, exc_info=True)
        raise _BANCO_INDISPONIVEL
    if not res.data or not res.data[0].get("ativo"):
        raise _CRED_INVALIDA
    return res.data[0]


async def admin_do_cliente(usuario: dict = Depends(usuario_atual)) -> dict:
    """Restringe a rota a usuários com perfil 'admin_cliente'."""
    if usuario.get("perfil") != "admin_cliente":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito ao administrador do cliente",
        )
    return usuario
