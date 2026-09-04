"""
Configuração central do holderjob — backend.

Suporte a múltiplos ambientes via variável AMBIENTE:
  producao → carrega .env        (Railway prod / branch main / Supabase prod)
  dev      → carrega .env.dev    (Railway dev  / branch dev  / Supabase dev)
  local    → carrega .env.local  (máquina do desenvolvedor)

Se AMBIENTE não estiver definido, assume 'local'.
"""

import os
import json
import logging
from pathlib import Path
from dotenv import load_dotenv

_AMBIENTE = os.getenv("AMBIENTE", "local")

_ENV_FILES = {
    "producao": ".env",
    "dev":      ".env.dev",
    "local":    ".env.local",
}

_env_filename = _ENV_FILES.get(_AMBIENTE, ".env.local")
_env_path = Path(__file__).parent.parent / _env_filename

# Fallback para .env se o arquivo do ambiente não existir
if not _env_path.exists():
    _env_path = Path(__file__).parent.parent / ".env"

load_dotenv(dotenv_path=_env_path)


def parse_cors_origins() -> list:
    """
    Parse seguro de CORS_ORIGINS. Aceita JSON ou lista separada por vírgula.
    Sem valor: localhost em 'local'; lista vazia (fail-closed) em dev/prod.
    """
    raw = os.getenv("CORS_ORIGINS", "").strip()

    if not raw:
        if _AMBIENTE == "local":
            return ["http://localhost:3000", "http://localhost:3001"]
        logging.getLogger(__name__).warning(
            "CORS_ORIGINS nao configurado no ambiente '%s'. "
            "Nenhuma origem externa sera permitida.", _AMBIENTE
        )
        return []

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [o.strip() for o in parsed if o.strip()]
    except Exception:
        pass

    return [o.strip() for o in raw.split(",") if o.strip()]


class Config:
    """Todas as configurações do projeto."""

    # Ambiente
    AMBIENTE: str = _AMBIENTE  # producao | dev | local

    # Supabase — service role key para operações administrativas no backend
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")

    # Storage — bucket privado dos PDFs de DRE
    DRE_BUCKET: str = os.getenv("DRE_BUCKET", "dre-uploads")

    # Autenticação JWT — separadas: portal (usuário) e admin (super admin)
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    JWT_ADMIN_SECRET: str = os.getenv("JWT_ADMIN_SECRET", "")
    JWT_EXPIRATION_HOURS: int = int(os.getenv("JWT_EXPIRATION_HOURS", "8"))

    # OpenAI — agente de IA (fase futura)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_CHAT_MODEL: str = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")

    # Servidor
    CORS_ORIGINS: list = parse_cors_origins()
    PORT: int = int(os.getenv("PORT", "8000"))
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")


config = Config()
