"""
Segurança central do holderjob — reutilizado pelo portal e pelo admin.

Contém apenas primitivas puras (sem acesso a banco):
  - hash e verificação de senha (bcrypt, tempo constante)
  - validação de força de senha
  - geração de senha temporária (aleatória, criptograficamente segura)
  - criação e decodificação de JWT (HS256)

As dependências de rota (que consultam o banco) ficam em core/auth.py.
"""

import re
import secrets
from datetime import datetime, timedelta, timezone

from passlib.context import CryptContext
from jose import jwt, JWTError

from config import config


# bcrypt com salt automático; deprecated="auto" permite rehash futuro
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Conjunto de caracteres especiais aceitos na política de senha
_ESPECIAIS = r"[!@#$%^&*()_+\-=\[\]{}|;':\",./<>?\\]"


def gerar_hash_senha(senha: str) -> str:
    """Gera hash bcrypt da senha."""
    return pwd_context.hash(senha)


def verificar_senha(senha_texto: str, senha_hash: str) -> bool:
    """Verifica a senha em tempo constante (resistente a timing attacks)."""
    if not senha_hash:
        return False
    return pwd_context.verify(senha_texto, senha_hash)


def validar_forca_senha(senha: str) -> list[str]:
    """Retorna a lista de requisitos não atendidos (vazia = senha forte)."""
    erros: list[str] = []
    if len(senha) < 8:
        erros.append("mínimo 8 caracteres")
    if not re.search(r"[A-Z]", senha):
        erros.append("ao menos uma letra maiúscula")
    if not re.search(r"[a-z]", senha):
        erros.append("ao menos uma letra minúscula")
    if not re.search(r"\d", senha):
        erros.append("ao menos um número")
    if not re.search(_ESPECIAIS, senha):
        erros.append("ao menos um caractere especial")
    return erros


def gerar_senha_temporaria(prefixo: str = "Holder") -> str:
    """Senha temporária aleatória e segura, no formato Prefixo@XXXXXX."""
    return f"{prefixo}@{secrets.token_hex(3).upper()}"


def criar_token(dados: dict, secret: str, extra: dict | None = None) -> str:
    """Cria um JWT HS256 com expiração de config.JWT_EXPIRATION_HOURS horas."""
    to_encode = dados.copy()
    to_encode["exp"] = datetime.now(timezone.utc) + timedelta(
        hours=config.JWT_EXPIRATION_HOURS
    )
    if extra:
        to_encode.update(extra)
    return jwt.encode(to_encode, secret, algorithm="HS256")


def decodificar_token(token: str, secret: str) -> dict | None:
    """Decodifica e valida um JWT. Retorna o payload ou None se inválido/expirado."""
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except JWTError:
        return None
