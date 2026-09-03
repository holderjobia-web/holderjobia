"""
Cliente Supabase para conexão com o banco.
Todas as operações de banco passam por este módulo.
O banco (dev ou prod) é determinado pelas env vars do ambiente ativo.
"""

from supabase import create_client, Client
from config import config


def get_supabase_client() -> Client:
    """Retorna instância do cliente Supabase."""
    if not config.SUPABASE_URL or not config.SUPABASE_KEY:
        raise ValueError(
            "SUPABASE_URL e SUPABASE_SERVICE_KEY devem estar definidos no ambiente"
        )
    return create_client(config.SUPABASE_URL, config.SUPABASE_KEY)


# Instância global (None se as credenciais não estiverem configuradas)
supabase: Client = (
    get_supabase_client() if config.SUPABASE_URL and config.SUPABASE_KEY else None
)
