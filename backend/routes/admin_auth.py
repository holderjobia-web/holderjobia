"""
Autenticação do ADMIN (super admin do SaaS holderjob).

Rotas:
  POST /admin/auth/login   → autentica e devolve JWT admin (JWT_ADMIN_SECRET)
  POST /admin/auth/logout  → stateless
  GET  /admin/auth/me      → dados do admin logado

O JWT admin carrega tipo="admin" para não ser aceito no contexto do portal.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from config import config
from core.auth import admin_atual
from core.rate_limit import RateLimiter
from core.security import criar_token, verificar_senha
from supabase_client import supabase

router = APIRouter(prefix="/admin/auth", tags=["auth-admin"])

_rate = RateLimiter(max_tentativas=5, janela_min=10, bloqueio_min=15)


class AdminLoginRequest(BaseModel):
    email: str
    senha: str


@router.post("/login")
async def admin_login(request: Request, dados: AdminLoginRequest):
    ip = request.client.host if request.client else "unknown"
    _rate.verificar(ip)

    email = dados.email.lower().strip()
    res = (
        supabase.table("admins")
        .select("*")
        .eq("email", email)
        .eq("ativo", True)
        .limit(1)
        .execute()
    )

    if not res.data:
        restantes = _rate.registrar_falha(ip)
        aviso = (
            f" Mais {restantes} tentativa(s) bloquearão este acesso temporariamente."
            if 0 < restantes <= 2 else ""
        )
        raise HTTPException(status_code=401, detail=f"Email ou senha incorretos.{aviso}")

    admin = res.data[0]

    if not verificar_senha(dados.senha, admin.get("senha_hash", "")):
        restantes = _rate.registrar_falha(ip)
        aviso = (
            f" Mais {restantes} tentativa(s) bloquearão este acesso temporariamente."
            if 0 < restantes <= 2 else ""
        )
        raise HTTPException(status_code=401, detail=f"Email ou senha incorretos.{aviso}")

    token = criar_token(
        {"sub": admin["id"], "email": admin["email"]},
        config.JWT_ADMIN_SECRET,
        extra={"tipo": "admin"},
    )

    _rate.limpar(ip)
    try:
        supabase.table("admins").update(
            {"ultimo_acesso": datetime.now(timezone.utc).isoformat()}
        ).eq("id", admin["id"]).execute()
    except Exception:
        pass

    return {
        "access_token": token,
        "token_type": "bearer",
        "usuario": {
            "id": admin["id"],
            "nome": admin["nome"],
            "email": admin["email"],
        },
        "password_must_change": admin.get("senha_temporaria", False),
    }


@router.post("/logout")
async def admin_logout(admin: dict = Depends(admin_atual)):
    return {"mensagem": "Logout realizado com sucesso"}


@router.get("/me")
async def admin_me(admin: dict = Depends(admin_atual)):
    return admin
