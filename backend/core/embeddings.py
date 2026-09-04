"""Geração de embeddings (OpenAI) para a base de conhecimento do agente de IA."""

from openai import OpenAI

from config import config

EMBEDDING_MODEL = "text-embedding-3-small"

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not config.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY não configurada")
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def gerar_embedding(texto: str) -> list[float]:
    """Gera o vetor de embedding de um texto (usado tanto para indexar quanto para buscar)."""
    resp = _get_client().embeddings.create(model=EMBEDDING_MODEL, input=texto)
    return resp.data[0].embedding
