"""Base de conhecimento vetorial (RAG) do agente de IA — indexação e busca.

GOVERNANÇA: só indexa conteúdo DERIVADO de dado já validado no sistema
(resumo do dre_consolidado, texto bruto do PDF já parseado com sucesso).
O agente nunca fabrica número — ele recupera trechos já gravados e o LLM
responde com base neles (RAG), nunca inventa a partir do nada.
Isolamento por cliente_id em toda indexação/busca (nunca vaza entre clientes).
"""

import logging
from typing import Optional

from core.embeddings import gerar_embedding
from supabase_client import supabase

logger = logging.getLogger(__name__)

_TAMANHO_CHUNK = 1200


def _quebrar_em_chunks(texto: str, tamanho: int = _TAMANHO_CHUNK) -> list[str]:
    texto = texto.strip()
    if not texto:
        return []
    return [texto[i:i + tamanho] for i in range(0, len(texto), tamanho)]


def _indexar_chunk(
    cliente_id: str,
    conteudo: str,
    tipo: str,
    empresa_id: Optional[str] = None,
    mes_referencia: Optional[str] = None,
    fonte: Optional[str] = None,
) -> None:
    """Gera o embedding e grava 1 chunk na base_conhecimento. Best-effort (não derruba o processamento do DRE)."""
    try:
        embedding = gerar_embedding(conteudo)
        supabase.table("base_conhecimento").insert({
            "cliente_id": cliente_id,
            "empresa_id": empresa_id,
            "tipo": tipo,
            "mes_referencia": mes_referencia,
            "conteudo": conteudo,
            "embedding": embedding,
            "fonte": fonte,
        }).execute()
    except Exception:
        logger.exception("Falha ao indexar chunk na base de conhecimento (tipo=%s fonte=%s)", tipo, fonte)


def reindexar_fonte(cliente_id: str, fonte: str, tipo: str) -> None:
    """Remove chunks antigos da mesma fonte antes de reindexar (evita duplicar em reprocessamento)."""
    try:
        (
            supabase.table("base_conhecimento")
            .delete()
            .eq("cliente_id", cliente_id)
            .eq("fonte", fonte)
            .eq("tipo", tipo)
            .execute()
        )
    except Exception:
        logger.exception("Falha ao limpar chunks antigos (fonte=%s tipo=%s)", fonte, tipo)


def indexar_texto_bruto(cliente_id: str, empresa_id: Optional[str], fonte: str, texto: str) -> None:
    """Indexa o texto bruto extraído do PDF, em chunks (tipo='dre_pdf_bruto')."""
    reindexar_fonte(cliente_id, fonte, "dre_pdf_bruto")
    for chunk in _quebrar_em_chunks(texto):
        _indexar_chunk(cliente_id, chunk, "dre_pdf_bruto", empresa_id=empresa_id, fonte=fonte)


def indexar_resumo_mes(
    cliente_id: str,
    empresa_id: str,
    mes_referencia: str,
    resumo: str,
    fonte: str,
) -> None:
    """Indexa o resumo textual (derivado) de 1 mês de DRE (tipo='dre_resumo')."""
    _indexar_chunk(cliente_id, resumo, "dre_resumo", empresa_id=empresa_id, mes_referencia=mes_referencia, fonte=fonte)


def buscar_contexto(
    cliente_id: str,
    pergunta: str,
    empresa_id: Optional[str] = None,
    limite: int = 6,
    limiar: float = 0.55,
) -> list[dict]:
    """Busca os chunks mais relevantes p/ a pergunta (RAG), isolado por cliente_id."""
    embedding = gerar_embedding(pergunta)
    resp = supabase.rpc("match_base_conhecimento", {
        "query_embedding": embedding,
        "match_cliente_id": cliente_id,
        "match_empresa_id": empresa_id,
        "match_threshold": limiar,
        "match_count": limite,
    }).execute()
    return resp.data or []
