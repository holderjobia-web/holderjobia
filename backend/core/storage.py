"""Links temporários para os arquivos privados no Supabase Storage.

Os buckets são privados: o front nunca recebe o caminho real nem uma URL
permanente. Para visualizar um envio, o backend gera uma URL assinada de vida
curta, válida só por alguns minutos.
"""

import logging

from config import config
from supabase_client import supabase

logger = logging.getLogger(__name__)

EXPIRACAO_SEGUNDOS = 300  # 5 min — tempo de abrir e conferir o arquivo


def gerar_link_temporario(bucket: str, storage_path: str) -> str | None:
    """URL assinada (curta duração) do arquivo, ou None se não der para gerar."""
    try:
        assinado = supabase.storage.from_(bucket).create_signed_url(
            storage_path, EXPIRACAO_SEGUNDOS
        )
    except Exception:
        logger.exception("Falha ao assinar URL (bucket=%s path=%s)", bucket, storage_path)
        return None

    if not isinstance(assinado, dict):
        return None
    url = (
        assinado.get("signedURL")
        or assinado.get("signedUrl")
        or assinado.get("signed_url")
    )
    if not url:
        return None

    # Versões diferentes do supabase-py devolvem caminho relativo ou URL completa.
    if url.startswith("http"):
        return url
    return f"{config.SUPABASE_URL.rstrip('/')}/storage/v1/{url.lstrip('/')}"
