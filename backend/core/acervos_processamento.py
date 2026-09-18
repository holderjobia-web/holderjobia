"""Indexação do módulo Acervos na base de conhecimento (RAG), best-effort.

Diferente do DRE/Vendas, Acervos não tem "processar" nem tabela consolidada —
é repositório de arquivo. A única ação derivada é: se o texto puder ser
extraído (PDF/XLSX/CSV/TXT), ele é indexado para o agente de IA conseguir
responder sobre o conteúdo do arquivo.
"""

import logging

from core.acervos_extracao import extrair_texto
from core.base_conhecimento import indexar_texto_acervo

logger = logging.getLogger(__name__)


def processar_indexacao(upload: dict, conteudo: bytes) -> dict:
    """Extrai texto (se possível) e indexa no RAG.

    Retorna {status, erro_detalhe}: status é 'indexado' (texto extraído e
    gravado), 'sem_texto' (extensão sem parser — não é erro) ou 'erro'
    (parser rodou mas a indexação falhou, ex.: OpenAI/Supabase fora do ar).
    """
    texto = extrair_texto(upload["nome_arquivo"], conteudo)
    if texto is None:
        return {"status": "sem_texto", "erro_detalhe": None}

    try:
        indexar_texto_acervo(
            upload["cliente_id"], upload["empresa_id"], upload["nome_arquivo"],
            texto, upload["categoria"],
        )
        return {"status": "indexado", "erro_detalhe": None}
    except Exception as e:
        logger.exception("Falha ao indexar arquivo de Acervos (nome=%s)", upload.get("nome_arquivo"))
        return {"status": "erro", "erro_detalhe": f"Falha ao indexar no agente de IA: {e}"}
