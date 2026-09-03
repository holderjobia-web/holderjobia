"""
Autenticação do PORTAL (usuários dos clientes).

Rotas:
  POST /auth/login          → autentica e devolve JWT (JWT_SECRET)
  POST /auth/logout         → stateless (limpeza no frontend)
  GET  /auth/me             → dados da sessão atual
  POST /auth/alterar-senha  → troca de senha do próprio usuário

Proteções: rate limit por IP + account lockout persistido + força de senha.
O token é devolvido no body (o frontend decide como armazenar).
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from config import config
from core.auth import usuario_atual
from core.rate_limit import RateLimiter
from core.security import (
    criar_token,
    gerar_hash_senha,
    validar_forca_senha,
    verificar_senha,
)
from supabase_client import supabase

router = APIRouter(prefix="/auth", tags=["auth-portal"])

_rate = RateLimiter(max_tentativas=5, janela_min=10, bloqueio_min=15)

# Account lockout persistido (sobrevive a restart do servidor)
_CONTA_MAX_TENTATIVAS = 10
_CONTA_BLOQUEIO_MIN = 30


class LoginRequest(BaseModel):
    email: str
    senha: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: dict
    password_must_change: bool = False


class AlterarSenhaRequest(BaseModel):
    senha_atual: str
    nova_senha: str


def _verificar_bloqueio_conta(usuario: dict) -> None:
    bloqueado_ate = usuario.get("login_bloqueado_ate")
    if not bloqueado_ate:
        return
    if isinstance(bloqueado_ate, str):
        bloqueado_ate = datetime.fromisoformat(bloqueado_ate.replace("Z", "+00:00"))
    agora = datetime.now(bloqueado_ate.tzinfo or timezone.utc)
    if agora < bloqueado_ate:
        restante = int((bloqueado_ate - agora).total_seconds() / 60) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Conta bloqueada temporariamente por excesso de tentativas. "
                f"Aguarde {restante} minuto(s) e tente novamente."
            ),
        )


def _registrar_falha_conta(usuario_id: str, tentativas_atuais: int) -> None:
    novas = (tentativas_atuais or 0) + 1
    updates: dict = {"login_tentativas": novas}
    if novas >= _CONTA_MAX_TENTATIVAS:
        bloqueio = datetime.now(timezone.utc) + timedelta(minutes=_CONTA_BLOQUEIO_MIN)
        updates["login_bloqueado_ate"] = bloqueio.isoformat()
    try:
        supabase.table("usuarios").update(updates).eq("id", usuario_id).execute()
    except Exception:
        pass


def _limpar_falhas_conta(usuario_id: str) -> None:
    try:
        supabase.table("usuarios").update(
            {"login_tentativas": 0, "login_bloqueado_ate": None}
        ).eq("id", usuario_id).execute()
    except Exception:
        pass


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, dados: LoginRequest):
    ip = request.client.host if request.client else "unknown"
    _rate.verificar(ip)

    email = dados.email.lower().strip()
    res = (
        supabase.table("usuarios")
        .select("*")
        .eq("email", email)
        .eq("ativo", True)
        .limit(1)
        .execute()
    )

    if not res.data:
        restantes = _rate.registrar_falha(ip)
        aviso = (
            f" Você tem mais {restantes} tentativa(s) antes do bloqueio temporário."
            if 0 < restantes <= 2 else ""
        )
        raise HTTPException(status_code=401, detail=f"Email ou senha incorretos.{aviso}")

    usuario = res.data[0]
    _verificar_bloqueio_conta(usuario)

    if not verificar_senha(dados.senha, usuario.get("senha_hash", "")):
        restantes = _rate.registrar_falha(ip)
        _registrar_falha_conta(usuario["id"], usuario.get("login_tentativas") or 0)
        aviso = (
            f" Você tem mais {restantes} tentativa(s) antes do bloqueio temporário."
            if 0 < restantes <= 2 else ""
        )
        raise HTTPException(status_code=401, detail=f"Email ou senha incorretos.{aviso}")

    token = criar_token(
        {
            "sub": usuario["id"],
            "email": usuario["email"],
            "perfil": usuario["perfil"],
            "cliente_id": usuario["cliente_id"],
        },
        config.JWT_SECRET,
    )

    _rate.limpar(ip)
    _limpar_falhas_conta(usuario["id"])
    try:
        supabase.table("usuarios").update(
            {"ultimo_acesso": datetime.now(timezone.utc).isoformat()}
        ).eq("id", usuario["id"]).execute()
    except Exception:
        pass

    return TokenResponse(
        access_token=token,
        usuario={
            "id": usuario["id"],
            "nome": usuario["nome"],
            "email": usuario["email"],
            "perfil": usuario["perfil"],
            "cliente_id": usuario["cliente_id"],
        },
        password_must_change=usuario.get("senha_temporaria", False),
    )


@router.post("/logout")
async def logout(usuario: dict = Depends(usuario_atual)):
    return {"mensagem": "Logout realizado com sucesso"}


@router.get("/me")
async def me(usuario: dict = Depends(usuario_atual)):
    return usuario


@router.post("/alterar-senha")
async def alterar_senha(dados: AlterarSenhaRequest, usuario: dict = Depends(usuario_atual)):
    erros = validar_forca_senha(dados.nova_senha)
    if erros:
        raise HTTPException(status_code=400, detail=f"Senha inválida: {'; '.join(erros)}.")

    usuario_id = usuario["id"]
    res = (
        supabase.table("usuarios")
        .select("senha_hash")
        .eq("id", usuario_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if not verificar_senha(dados.senha_atual, res.data["senha_hash"]):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")

    if verificar_senha(dados.nova_senha, res.data["senha_hash"]):
        raise HTTPException(status_code=400, detail="A nova senha não pode ser igual à atual")

    supabase.table("usuarios").update(
        {"senha_hash": gerar_hash_senha(dados.nova_senha), "senha_temporaria": False}
    ).eq("id", usuario_id).execute()

    return {"ok": True, "mensagem": "Senha alterada com sucesso"}
