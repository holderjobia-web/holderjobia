"""
Agente de IA (portal) — chat que responde perguntas sobre as empresas do
cliente com base em RAG (base_conhecimento) sobre dados já validados no
sistema (resumo do DRE consolidado + texto bruto do PDF).

Postura (Fase 3 da arquitetura): conselheiro estratégico — faz análise
crítica (riscos, gargalos, contrapontos), não só confirma o que o usuário
quer ouvir. GOVERNANÇA: nunca fabrica número; responde só com base no
contexto recuperado, e diz claramente quando não tem dado suficiente.

Rota (exige JWT do portal — JWT_SECRET):
  POST /agente/perguntar   → busca contexto (RAG) + chama o GPT
  POST /agente/reindexar   → backfill: reindexa o RAG a partir do dre_consolidado
                             já gravado (admin_do_cliente) — útil p/ DREs lançados
                             antes da Etapa 7 existir.
  GET  /agente/diagnostico → quantas linhas existem em dre_consolidado x quantos
                             chunks existem na base_conhecimento (admin_do_cliente).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field

from config import config
from core.auth import admin_do_cliente, usuario_atual
from core.base_conhecimento import buscar_contexto, contar_por_tipo, melhor_similaridade
from core.dre_processamento import reindexar_dre_cliente
from core.vendas_processamento import reindexar_vendas_cliente
from supabase_client import supabase

router = APIRouter(prefix="/agente", tags=["agente"])
logger = logging.getLogger(__name__)

# gpt-5.x (ex.: gpt-5.6-luna) são reasoning: não aceitam temperature/max_tokens,
# usam max_completion_tokens (o raciocínio interno também consome desse teto).
_PREFIXOS_REASONING = ("gpt-5",)

_SYSTEM_PROMPT = """Você é o agente de inteligência financeira do holderjob, um SaaS de \
CFO/BI para donos de grupos de empresas (redes de unidades/holdings).

POSTURA: você é um conselheiro estratégico, não um bajulador nem um relatório. \
Analise com espírito crítico: aponte riscos, gargalos, quedas de margem, \
concentração de receita, meses fracos e contrapontos — mesmo que o usuário não \
pergunte diretamente. Não valide automaticamente decisões; questione quando os \
dados sugerirem cautela.

COMO RESPONDER (obrigatório):
- Responda como um consultor falando com o dono: conclusão primeiro, depois o \
que sustenta a conclusão, depois a recomendação.
- Seja ENXUTO. Cite apenas os números que sustentam o seu ponto.
- NUNCA cite nomes de arquivos, planilhas, PDFs, caminhos, IDs ou "fontes". O \
usuário não quer saber de onde veio o dado, quer saber o que o dado significa. \
Refira-se sempre à unidade e ao mês (ex.: "Mogi das Cruzes em jan/26").
- NUNCA despeje listas longas, tabelas extensas nem transcreva o material \
recebido. Se houver muito dado, sintetize e destaque o que importa.
- Se a pergunta for sobre uma unidade específica, responda sobre ela — não \
liste todas as outras sem necessidade.

GOVERNANÇA (regras inegociáveis):
- NUNCA fabrique ou estime um número que não esteja no CONTEXTO fornecido. \
Se o contexto não tiver o dado, diga de forma simples e direta que a \
informação ainda não está cadastrada (nunca invente um valor aproximado).
- Toda vez que citar um valor financeiro, deixe claro o mês/unidade a que \
ele se refere.
- Se o contexto trouxer confiabilidade 'baixa' ou divergências sinalizadas, \
avise o usuário disso antes de tirar conclusões fortes.
- Não recomende ações fora do escopo financeiro/de gestão (nada de conselho \
jurídico/tributário definitivo — sugira "confirmar com o contador/advogado" \
quando for o caso).
- Responda em português do Brasil, direto e objetivo (sem enrolação).
"""


class PerguntaEntrada(BaseModel):
    pergunta: str = Field(min_length=1, max_length=2000)
    empresa_id: str | None = None


class RespostaAgente(BaseModel):
    resposta: str
    # Diagnóstico interno (não exibido no chat): só vem quando o RAG não achou contexto.
    similaridade_maxima: float | None = None


def _empresa_do_cliente(empresa_id: str, cliente_id: str) -> bool:
    res = (
        supabase.table("empresas")
        .select("id")
        .eq("id", empresa_id)
        .eq("cliente_id", cliente_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


@router.post("/perguntar", response_model=RespostaAgente)
async def perguntar(dados: PerguntaEntrada, usuario: dict = Depends(usuario_atual)):
    cliente_id = usuario["cliente_id"]

    if dados.empresa_id and not _empresa_do_cliente(dados.empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    if not config.OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Agente de IA não configurado (OPENAI_API_KEY ausente).",
        )

    try:
        trechos = buscar_contexto(cliente_id, dados.pergunta, empresa_id=dados.empresa_id)
    except Exception:
        logger.exception("Falha ao buscar contexto RAG (cliente_id=%s)", cliente_id)
        raise HTTPException(status_code=503, detail="Falha ao consultar a base de conhecimento.")

    if trechos:
        # Sem nome de arquivo no contexto: o próprio conteúdo já diz unidade e mês,
        # e citar a fonte induzia o modelo a devolver lista de arquivos ao usuário.
        contexto_texto = "\n\n".join(
            f"--- Registro {i} ---\n{t['conteudo']}" for i, t in enumerate(trechos, 1)
        )
        similaridade_maxima = None
    else:
        contexto_texto = "(nenhum dado relevante encontrado na base para esta pergunta)"
        try:
            similaridade_maxima = melhor_similaridade(cliente_id, dados.pergunta, empresa_id=dados.empresa_id)
        except Exception:
            logger.exception("Falha ao calcular melhor similaridade (cliente_id=%s)", cliente_id)
            similaridade_maxima = None

    mensagens = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "DADOS DISPON\u00cdVEIS NA BASE (use como \u00fanica fonte de n\u00fameros; "
                "se faltar dado, diga que ainda n\u00e3o est\u00e1 cadastrado). "
                "N\u00e3o transcreva estes registros na resposta \u2014 interprete-os:\n\n"
                f"{contexto_texto}\n\n"
                f"PERGUNTA DO USU\u00c1RIO:\n{dados.pergunta}"
            ),
        },
    ]

    try:
        client = OpenAI(api_key=config.OPENAI_API_KEY)
        modelo = config.OPENAI_CHAT_MODEL
        if modelo.startswith(_PREFIXOS_REASONING):
            resp = client.chat.completions.create(
                model=modelo,
                messages=mensagens,
                max_completion_tokens=1500,
            )
        else:
            resp = client.chat.completions.create(
                model=modelo,
                messages=mensagens,
                temperature=0.4,
                max_tokens=900,
            )
        resposta = resp.choices[0].message.content or ""
    except Exception:
        logger.exception("Falha ao chamar OpenAI (cliente_id=%s)", cliente_id)
        raise HTTPException(status_code=503, detail="Falha ao gerar a resposta do agente.")

    fontes = sorted({t.get("fonte") for t in trechos if t.get("fonte")})
    logger.info(
        "Agente respondeu (cliente_id=%s trechos=%d fontes=%d)",
        cliente_id, len(trechos), len(fontes),
    )
    return RespostaAgente(resposta=resposta, similaridade_maxima=similaridade_maxima)


@router.post("/reindexar")
async def reindexar(usuario: dict = Depends(admin_do_cliente)):
    """Backfill: reindexa a base de conhecimento a partir do dre_consolidado e do
    vendas_consolidado já gravados (sem baixar arquivo, sem alterar dado nenhum).
    Útil quando o agente não encontra dados lançados antes de cada feature existir."""
    cliente_id = usuario["cliente_id"]
    try:
        dre = reindexar_dre_cliente(cliente_id)
    except Exception:
        logger.exception("Falha ao reindexar RAG de DRE (cliente_id=%s)", cliente_id)
        raise HTTPException(status_code=503, detail="Falha ao reindexar a base de conhecimento (DRE).")
    try:
        vendas = reindexar_vendas_cliente(cliente_id)
    except Exception:
        logger.exception("Falha ao reindexar RAG de vendas (cliente_id=%s)", cliente_id)
        raise HTTPException(status_code=503, detail="Falha ao reindexar a base de conhecimento (Vendas).")
    return {"dre": dre, "vendas": vendas}


@router.get("/diagnostico")
async def diagnostico(usuario: dict = Depends(admin_do_cliente)):
    """Mostra de onde o agente pegaria dados: quantas linhas existem em
    dre_consolidado vs quantos chunks existem na base_conhecimento (por tipo).
    Ajuda a diagnosticar por que o agente responde 'sem dados'."""
    cliente_id = usuario["cliente_id"]
    try:
        dre = (
            supabase.table("dre_consolidado")
            .select("id", count="exact")
            .eq("cliente_id", cliente_id)
            .execute()
        )
        dre_consolidado_linhas = dre.count or 0
    except Exception:
        logger.exception("Falha ao contar dre_consolidado (cliente_id=%s)", cliente_id)
        dre_consolidado_linhas = None

    try:
        vendas = (
            supabase.table("vendas_consolidado")
            .select("id", count="exact")
            .eq("cliente_id", cliente_id)
            .execute()
        )
        vendas_consolidado_linhas = vendas.count or 0
    except Exception:
        logger.exception("Falha ao contar vendas_consolidado (cliente_id=%s)", cliente_id)
        vendas_consolidado_linhas = None

    try:
        base_conhecimento = contar_por_tipo(cliente_id)
    except Exception:
        logger.exception("Falha ao contar base_conhecimento (cliente_id=%s)", cliente_id)
        base_conhecimento = None

    return {
        "dre_consolidado_linhas": dre_consolidado_linhas,
        "vendas_consolidado_linhas": vendas_consolidado_linhas,
        "base_conhecimento": base_conhecimento,
        "openai_api_key_configurada": bool(config.OPENAI_API_KEY),
        "modelo_chat": config.OPENAI_CHAT_MODEL,
    }
