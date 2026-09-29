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
    categoria: Optional[str] = None,
) -> Optional[str]:
    """Gera o embedding e grava 1 chunk na base_conhecimento.

    Retorna None em sucesso, ou uma mensagem de erro (curta, sem stack trace) em
    falha — quem chama decide se derruba o fluxo ou só loga/reporta (best-effort).
    """
    try:
        embedding = gerar_embedding(conteudo)
    except Exception as e:
        logger.exception("Falha ao gerar embedding (tipo=%s fonte=%s)", tipo, fonte)
        return f"embedding: {e}"
    try:
        supabase.table("base_conhecimento").insert({
            "cliente_id": cliente_id,
            "empresa_id": empresa_id,
            "tipo": tipo,
            "mes_referencia": mes_referencia,
            "conteudo": conteudo,
            "embedding": embedding,
            "fonte": fonte,
            "categoria": categoria,
        }).execute()
        return None
    except Exception as e:
        logger.exception("Falha ao gravar chunk na base de conhecimento (tipo=%s fonte=%s)", tipo, fonte)
        return f"insert: {e}"


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


def remover_resumo_mes(cliente_id: str, empresa_id: str, mes_referencia: str) -> None:
    """Remove o resumo (tipo='dre_resumo') antigo de 1 mês/empresa antes de reindexar
    (evita duplicar o mesmo mês na base a cada reprocessamento/backfill)."""
    try:
        (
            supabase.table("base_conhecimento")
            .delete()
            .eq("cliente_id", cliente_id)
            .eq("empresa_id", empresa_id)
            .eq("mes_referencia", mes_referencia)
            .eq("tipo", "dre_resumo")
            .execute()
        )
    except Exception:
        logger.exception(
            "Falha ao limpar resumo antigo (empresa_id=%s mes=%s)", empresa_id, mes_referencia
        )


def indexar_resumo_mes(
    cliente_id: str,
    empresa_id: str,
    mes_referencia: str,
    resumo: str,
    fonte: str,
) -> Optional[str]:
    """Indexa o resumo textual (derivado) de 1 mês de DRE (tipo='dre_resumo').

    Retorna None em sucesso, ou a mensagem de erro em falha.
    """
    return _indexar_chunk(cliente_id, resumo, "dre_resumo", empresa_id=empresa_id, mes_referencia=mes_referencia, fonte=fonte)


def remover_resumo_vendas(cliente_id: str, empresa_id: str, categoria: str, mes_referencia: str) -> None:
    """Remove o resumo (tipo='vendas_resumo') antigo de 1 mês/empresa/categoria antes
    de reindexar (evita duplicar). `categoria` distingue os até 3 chunks possíveis
    (ortodontia/clinico_geral/implante) de uma mesma empresa+mês."""
    try:
        (
            supabase.table("base_conhecimento")
            .delete()
            .eq("cliente_id", cliente_id)
            .eq("empresa_id", empresa_id)
            .eq("categoria", categoria)
            .eq("mes_referencia", mes_referencia)
            .eq("tipo", "vendas_resumo")
            .execute()
        )
    except Exception:
        logger.exception(
            "Falha ao limpar resumo de vendas antigo (empresa_id=%s categoria=%s mes=%s)",
            empresa_id, categoria, mes_referencia,
        )


def indexar_resumo_vendas(
    cliente_id: str,
    empresa_id: str,
    mes_referencia: str,
    resumo: str,
    fonte: str,
    categoria: str,
) -> Optional[str]:
    """Indexa o resumo textual (derivado) de 1 mês de vendas (tipo='vendas_resumo').

    Retorna None em sucesso, ou a mensagem de erro em falha.
    """
    return _indexar_chunk(
        cliente_id, resumo, "vendas_resumo",
        empresa_id=empresa_id, mes_referencia=mes_referencia, fonte=fonte, categoria=categoria,
    )


def indexar_texto_acervo(
    cliente_id: str, empresa_id: str, fonte: str, texto: str, categoria: str
) -> None:
    """Indexa o texto extraído de um arquivo do módulo Acervos, em chunks
    (tipo='acervo_bruto'). `categoria` guarda contrato/planilha_obra/fotos/
    plantas/documentos_gerais, útil pra filtrar/depurar depois."""
    reindexar_fonte(cliente_id, fonte, "acervo_bruto")
    for chunk in _quebrar_em_chunks(texto):
        erro = _indexar_chunk(
            cliente_id, chunk, "acervo_bruto",
            empresa_id=empresa_id, fonte=fonte, categoria=categoria,
        )
        if erro:
            raise RuntimeError("Não foi possível disponibilizar todo o texto para consulta.")


def remover_por_nome_arquivo(cliente_id: str, nome_arquivo: str) -> None:
    """Remove TODOS os chunks originados de um arquivo (resumo + texto bruto).

    Usado ao excluir um envio: sem isso o agente continuaria respondendo com
    números de um arquivo que não existe mais no sistema.
    """
    try:
        (
            supabase.table("base_conhecimento")
            .delete()
            .eq("cliente_id", cliente_id)
            .ilike("fonte", f"%{nome_arquivo}%")
            .execute()
        )
    except Exception:
        logger.exception("Falha ao limpar chunks do arquivo (nome=%s)", nome_arquivo)


_TIPOS_RESUMO = ("dre_resumo", "vendas_resumo")
_MAX_CHUNKS_BRUTOS = 2


def buscar_contexto(
    cliente_id: str,
    pergunta: str,
    empresa_id: Optional[str] = None,
    limite: int = 10,
    limiar: float = 0.2,
) -> list[dict]:
    """Busca os chunks mais relevantes p/ a pergunta (RAG), isolado por cliente_id.

    Limiar baixo (0.2) de propósito: o resumo indexado é texto estruturado
    (rótulo + número), bem diferente em forma de uma pergunta em linguagem
    natural, e a similaridade de cosseno entre os dois costuma ficar bem abaixo
    de um limiar "intuitivo" tipo 0.5-0.55 mesmo quando o conteúdo é relevante.

    Busca um pouco mais que o necessário e prioriza os RESUMOS (texto derivado e
    limpo) sobre o texto bruto do PDF: chunk bruto é ruído e, em volume, deixa a
    resposta do agente confusa.
    """
    embedding = gerar_embedding(pergunta)
    resp = supabase.rpc("match_base_conhecimento", {
        "query_embedding": embedding,
        "match_cliente_id": cliente_id,
        "match_empresa_id": empresa_id,
        "match_threshold": limiar,
        "match_count": limite * 2,
    }).execute()
    encontrados = resp.data or []

    resumos = [t for t in encontrados if t.get("tipo") in _TIPOS_RESUMO]
    brutos = [t for t in encontrados if t.get("tipo") not in _TIPOS_RESUMO]
    return (resumos + brutos[:_MAX_CHUNKS_BRUTOS])[:limite]


def melhor_similaridade(
    cliente_id: str, pergunta: str, empresa_id: Optional[str] = None
) -> Optional[float]:
    """Diagnóstico: qual a MELHOR similaridade encontrada p/ a pergunta, sem
    aplicar limiar nenhum (match_threshold=0). Útil pra calibrar o limiar real
    sem precisar adivinhar — se vier baixo mesmo pra pergunta óbvia, o limiar
    de busca padrão está cortando resultado válido."""
    embedding = gerar_embedding(pergunta)
    resp = supabase.rpc("match_base_conhecimento", {
        "query_embedding": embedding,
        "match_cliente_id": cliente_id,
        "match_empresa_id": empresa_id,
        "match_threshold": 0,
        "match_count": 1,
    }).execute()
    linhas = resp.data or []
    return linhas[0]["similarity"] if linhas else None


def contar_por_tipo(cliente_id: str) -> dict[str, int]:
    """Diagnóstico: quantos chunks existem na base_conhecimento do cliente, por tipo."""
    res = (
        supabase.table("base_conhecimento")
        .select("tipo")
        .eq("cliente_id", cliente_id)
        .execute()
    )
    contagem: dict[str, int] = {}
    for row in res.data or []:
        tipo = row["tipo"]
        contagem[tipo] = contagem.get(tipo, 0) + 1
    return contagem
