"""
Envio de DRE (portal) — upload do PDF, registro dos metadados e processamento.

Rotas (exigem JWT do portal — JWT_SECRET):
  POST /dre/uploads                → recebe o PDF (multipart), salva e registra
  GET  /dre/uploads                → lista os envios do cliente (filtro empresa)
  POST /dre/uploads/{id}/processar → parseia o PDF e grava em dre_consolidado

O binário vai para o bucket privado do Supabase Storage; o banco guarda só
os metadados e o status. A extração dos números fica em core.dre_processamento.
"""

import uuid
from datetime import date, datetime, timezone
import logging

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)

from config import config
from core.auth import admin_do_cliente, usuario_atual
from core.base_conhecimento import remover_por_nome_arquivo, remover_resumo_mes
from core.dre_processamento import processar_upload
from core.storage import EXPIRACAO_SEGUNDOS, gerar_link_temporario
from supabase_client import supabase

router = APIRouter(prefix="/dre", tags=["dre"])

logger = logging.getLogger(__name__)

_MAX_BYTES = 20 * 1024 * 1024  # 20 MB
_CAMPOS = (
    "id, cliente_id, empresa_id, nome_arquivo, tamanho_bytes, mes_referencia, "
    "status, erro_detalhe, criado_em"
)


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


def _normalizar_mes(mes: str | None) -> str | None:
    """Aceita 'YYYY-MM' ou 'YYYY-MM-DD' e devolve o 1º dia do mês (ISO)."""
    if not mes:
        return None
    mes = mes.strip()
    try:
        if len(mes) == 7:  # YYYY-MM
            ano, m = mes.split("-")
            return date(int(ano), int(m), 1).isoformat()
        return date.fromisoformat(mes).replace(day=1).isoformat()
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="mes_referencia inválido. Use o formato AAAA-MM.",
        )


@router.get("/uploads")
async def listar_uploads(
    empresa_id: str | None = Query(None),
    usuario: dict = Depends(usuario_atual),
):
    query = (
        supabase.table("dre_uploads")
        .select(_CAMPOS)
        .eq("cliente_id", usuario["cliente_id"])
    )
    if empresa_id:
        query = query.eq("empresa_id", empresa_id)
    res = query.order("criado_em", desc=True).execute()
    return res.data or []


@router.post("/uploads", status_code=201)
async def enviar_dre(
    arquivo: UploadFile = File(...),
    empresa_id: str | None = Form(None),
    mes_referencia: str | None = Form(None),
    usuario: dict = Depends(usuario_atual),
):
    cliente_id = usuario["cliente_id"]

    # Validações de entrada
    nome = (arquivo.filename or "").strip()
    tipo = (arquivo.content_type or "").lower()
    if not nome.lower().endswith(".pdf") and tipo != "application/pdf":
        raise HTTPException(status_code=415, detail="Envie um arquivo PDF.")

    if empresa_id and not _empresa_do_cliente(empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    mes_iso = _normalizar_mes(mes_referencia)

    conteudo = await arquivo.read()
    if not conteudo:
        raise HTTPException(status_code=422, detail="Arquivo vazio.")
    if len(conteudo) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo excede o limite de 20 MB.")

    # Upload no Storage (bucket privado) — caminho isolado por cliente
    storage_path = f"{cliente_id}/{uuid.uuid4()}.pdf"
    try:
        supabase.storage.from_(config.DRE_BUCKET).upload(
            storage_path,
            conteudo,
            {"content-type": "application/pdf"},
        )
    except Exception as e:
        corpo = getattr(getattr(e, "response", None), "text", "") or repr(e)
        logger.exception(
            "Falha ao enviar DRE para o Storage (bucket=%s) erro=%s",
            config.DRE_BUCKET, corpo,
        )
        detalhe = "Falha ao armazenar o arquivo. Tente novamente."
        if config.AMBIENTE != "producao":
            detalhe = f"Falha ao armazenar o arquivo: {corpo}".strip()
        raise HTTPException(status_code=502, detail=detalhe)

    payload = {
        "cliente_id": cliente_id,
        "empresa_id": empresa_id,
        "enviado_por": usuario["id"],
        "nome_arquivo": nome,
        "storage_path": storage_path,
        "tamanho_bytes": len(conteudo),
        "mes_referencia": mes_iso,
        "status": "recebido",
    }
    res = supabase.table("dre_uploads").insert(payload).execute()
    if not res.data:
        # Registro falhou — remove o arquivo órfão do Storage
        try:
            supabase.storage.from_(config.DRE_BUCKET).remove([storage_path])
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Falha ao registrar o envio.")

    registro = res.data[0]
    registro.pop("storage_path", None)
    return registro


@router.get("/uploads/{upload_id}/arquivo")
async def visualizar_arquivo(upload_id: str, usuario: dict = Depends(usuario_atual)):
    """Link temporário p/ abrir o PDF enviado (bucket é privado)."""
    res = (
        supabase.table("dre_uploads")
        .select("id, nome_arquivo, storage_path")
        .eq("id", upload_id)
        .eq("cliente_id", usuario["cliente_id"])
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")

    up = res.data[0]
    url = gerar_link_temporario(config.DRE_BUCKET, up["storage_path"])
    if not url:
        raise HTTPException(status_code=502, detail="Não foi possível abrir o arquivo.")
    return {
        "url": url,
        "nome_arquivo": up["nome_arquivo"],
        "tipo": "pdf",
        "expira_em_segundos": EXPIRACAO_SEGUNDOS,
    }


@router.post("/uploads/{upload_id}/processar")
async def processar_dre(
    upload_id: str,
    usuario: dict = Depends(usuario_atual),
):
    res = (
        supabase.table("dre_uploads")
        .select("id, cliente_id, empresa_id, storage_path, nome_arquivo, mes_referencia, status")
        .eq("id", upload_id)
        .eq("cliente_id", usuario["cliente_id"])
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    return processar_upload(res.data[0])


_COLUNAS_DRE = (
    "mes_referencia", "receita_bruta", "impostos", "devolucoes",
    "receita_liquida", "custo_servico_vendido", "despesas_operacionais",
    "resultado_operacional", "despesas_financeiras", "ir_csll",
    "lucro_liquido", "retirada", "confiabilidade", "fonte", "observacao",
)


def _f(v) -> float | None:
    """Converte valor do banco (str/número/None) em float, preservando NULL."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _pct(numerador: float | None, base: float | None) -> float | None:
    """Margem % = numerador/base*100. NULL se faltar componente ou base 0."""
    if numerador is None or base is None or base == 0:
        return None
    return round(numerador / base * 100, 2)


def _brl(v: float) -> str:
    """Formata um valor em reais no padrão brasileiro (R$ 1.234,56)."""
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _com_indicadores(linha: dict) -> dict:
    """Normaliza valores monetários em float e adiciona margens derivadas.

    As margens são calculadas na resposta, nunca gravadas (governança).
    """
    valores = {
        c: _f(linha.get(c))
        for c in _COLUNAS_DRE
        if c not in ("mes_referencia", "confiabilidade", "fonte", "observacao")
    }
    receita_liquida = valores["receita_liquida"]
    custo = valores["custo_servico_vendido"]
    margem_contribuicao_base = (
        receita_liquida - custo
        if receita_liquida is not None and custo is not None
        else None
    )
    return {
        "id": linha.get("id"),
        "mes_referencia": linha.get("mes_referencia"),
        **valores,
        "margem_liquida": _pct(valores["lucro_liquido"], receita_liquida),
        "margem_operacional": _pct(valores["resultado_operacional"], receita_liquida),
        "margem_contribuicao": _pct(margem_contribuicao_base, receita_liquida),
        "confiabilidade": linha.get("confiabilidade"),
        "fonte": linha.get("fonte"),
        "observacao": linha.get("observacao"),
    }


@router.get("/consolidado")
async def consolidado(
    empresa_id: str = Query(...),
    de: str | None = Query(None, description="mês inicial AAAA-MM"),
    ate: str | None = Query(None, description="mês final AAAA-MM"),
    usuario: dict = Depends(usuario_atual),
):
    cliente_id = usuario["cliente_id"]
    if not _empresa_do_cliente(empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    query = (
        supabase.table("dre_consolidado")
        .select("id, " + ", ".join(_COLUNAS_DRE))
        .eq("empresa_id", empresa_id)
    )
    de_iso = _normalizar_mes(de)
    ate_iso = _normalizar_mes(ate)
    if de_iso:
        query = query.gte("mes_referencia", de_iso)
    if ate_iso:
        query = query.lte("mes_referencia", ate_iso)

    res = query.order("mes_referencia").execute()
    meses = [_com_indicadores(linha) for linha in (res.data or [])]
    return {"empresa_id": empresa_id, "meses": meses}


_COLUNAS_MONET = (
    "receita_bruta", "impostos", "devolucoes", "receita_liquida",
    "custo_servico_vendido", "despesas_operacionais", "resultado_operacional",
    "despesas_financeiras", "ir_csll", "lucro_liquido", "retirada",
)


def _somar(linhas: list[dict], coluna: str) -> float | None:
    """Soma uma coluna entre unidades. NULL se nenhuma unidade tem o valor."""
    presentes = [v for l in linhas if (v := _f(l.get(coluna))) is not None]
    return round(sum(presentes), 2) if presentes else None


def _agregar_mes(mes_iso: str | None, linhas: list[dict]) -> dict:
    """Soma as unidades de um mês e deriva as margens sobre o agregado."""
    valores = {c: _somar(linhas, c) for c in _COLUNAS_MONET}
    receita_liquida = valores["receita_liquida"]
    custo = valores["custo_servico_vendido"]
    mc_base = (
        receita_liquida - custo
        if receita_liquida is not None and custo is not None
        else None
    )
    return {
        "mes_referencia": mes_iso,
        **valores,
        "margem_liquida": _pct(valores["lucro_liquido"], receita_liquida),
        "margem_operacional": _pct(valores["resultado_operacional"], receita_liquida),
        "margem_contribuicao": _pct(mc_base, receita_liquida),
        "unidades": len(linhas),  # base do agregado (nº de DREs somadas no mês)
    }


@router.get("/grupo")
async def consolidado_grupo(
    de: str | None = Query(None, description="mês inicial AAAA-MM"),
    ate: str | None = Query(None, description="mês final AAAA-MM"),
    rede_id: str | None = Query(None, description="filtra por rede; ausente = todas"),
    usuario: dict = Depends(usuario_atual),
):
    """Visão holding: soma as unidades do cliente por mês + comparativo.

    Sem rede_id consolida TODAS as redes do dono ("Todos"); com rede_id
    restringe às empresas daquela rede. A lista de redes vai na resposta para
    montar o seletor.
    """
    cliente_id = usuario["cliente_id"]

    emp_res = (
        supabase.table("empresas")
        .select("id, codigo, nome_razao_social, rede_id")
        .eq("cliente_id", cliente_id)
        .execute()
    )
    todas_empresas = emp_res.data or []

    redes_res = (
        supabase.table("redes")
        .select("id, nome")
        .eq("cliente_id", cliente_id)
        .order("nome")
        .execute()
    )
    redes_nome = {r["id"]: r["nome"] for r in (redes_res.data or [])}

    # Contagem de unidades por rede (+ pseudo-rede "sem rede") para o seletor
    contagem: dict[str | None, int] = {}
    for e in todas_empresas:
        contagem[e.get("rede_id")] = contagem.get(e.get("rede_id"), 0) + 1
    redes = [
        {"id": rid, "nome": nome, "unidades": contagem.get(rid, 0)}
        for rid, nome in redes_nome.items()
    ]
    if contagem.get(None):
        redes.append({"id": None, "nome": "Sem rede", "unidades": contagem[None]})

    # Aplica o filtro por rede (None = todas)
    if rede_id:
        empresas_map = {
            e["id"]: e for e in todas_empresas if e.get("rede_id") == rede_id
        }
    else:
        empresas_map = {e["id"]: e for e in todas_empresas}

    query = (
        supabase.table("dre_consolidado")
        .select("empresa_id, " + ", ".join(_COLUNAS_DRE))
        .eq("cliente_id", cliente_id)
        .in_("empresa_id", list(empresas_map.keys()) or ["00000000-0000-0000-0000-000000000000"])
    )
    de_iso = _normalizar_mes(de)
    ate_iso = _normalizar_mes(ate)
    if de_iso:
        query = query.gte("mes_referencia", de_iso)
    if ate_iso:
        query = query.lte("mes_referencia", ate_iso)
    res = query.order("mes_referencia").execute()
    linhas = res.data or []

    por_mes: dict[str, list[dict]] = {}
    por_empresa: dict[str, list[dict]] = {}
    for linha in linhas:
        por_mes.setdefault(linha.get("mes_referencia"), []).append(linha)
        por_empresa.setdefault(linha.get("empresa_id"), []).append(linha)

    meses = [_agregar_mes(mes, por_mes[mes]) for mes in sorted(por_mes)]

    empresas = []
    for emp_id, ls in por_empresa.items():
        info = empresas_map.get(emp_id, {})
        receita_liq = _somar(ls, "receita_liquida")
        lucro = _somar(ls, "lucro_liquido")
        empresas.append({
            "empresa_id": emp_id,
            "codigo": info.get("codigo"),
            "nome": info.get("nome_razao_social"),
            "meses": len(ls),
            "receita_liquida": receita_liq,
            "lucro_liquido": lucro,
            "retirada": _somar(ls, "retirada"),
            "margem_liquida": _pct(lucro, receita_liq),
        })
    empresas.sort(key=lambda e: (e["receita_liquida"] or 0), reverse=True)

    return {
        "cliente_id": cliente_id,
        "rede_selecionada": rede_id,
        "redes": redes,
        "total_unidades": len(empresas_map),
        "unidades_com_dados": len(por_empresa),
        "meses": meses,
        "empresas": empresas,
    }


@router.get("/distribuicao")
async def distribuicao_lucros(
    de: str | None = Query(None, description="mês inicial AAAA-MM"),
    ate: str | None = Query(None, description="mês final AAAA-MM"),
    rede_id: str | None = Query(None, description="filtra por rede; ausente = todas"),
    empresa_id: str | None = Query(None, description="filtra por unidade; ausente = todas"),
    usuario: dict = Depends(usuario_atual),
):
    """Distribuição de lucros DERIVADA: retirada da DRE × % de cada sócio.

    Nada é gravado — o valor por sócio é sempre recalculado. Quando a soma das
    participações de uma empresa não fecha 100%, ou a retirada não consta, ou
    não há participação cadastrada, isso é SINALIZADO em `alertas`, nunca
    "ajustado".
    """
    cliente_id = usuario["cliente_id"]

    if empresa_id and not _empresa_do_cliente(empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    emp_res = (
        supabase.table("empresas")
        .select("id, codigo, nome_razao_social, rede_id")
        .eq("cliente_id", cliente_id)
        .execute()
    )
    todas_empresas = emp_res.data or []

    redes_res = (
        supabase.table("redes")
        .select("id, nome")
        .eq("cliente_id", cliente_id)
        .order("nome")
        .execute()
    )
    contagem: dict[str | None, int] = {}
    for e in todas_empresas:
        contagem[e.get("rede_id")] = contagem.get(e.get("rede_id"), 0) + 1
    redes = [
        {"id": r["id"], "nome": r["nome"], "unidades": contagem.get(r["id"], 0)}
        for r in (redes_res.data or [])
    ]

    empresas = [
        e for e in todas_empresas
        if (not rede_id or e.get("rede_id") == rede_id)
        and (not empresa_id or e["id"] == empresa_id)
    ]
    empresas_map = {e["id"]: e for e in empresas}
    ids = list(empresas_map.keys()) or ["00000000-0000-0000-0000-000000000000"]

    # Retirada somada por empresa no período (NULL = não consta)
    dre_q = (
        supabase.table("dre_consolidado")
        .select("empresa_id, retirada")
        .eq("cliente_id", cliente_id)
        .in_("empresa_id", ids)
    )
    de_iso = _normalizar_mes(de)
    ate_iso = _normalizar_mes(ate)
    if de_iso:
        dre_q = dre_q.gte("mes_referencia", de_iso)
    if ate_iso:
        dre_q = dre_q.lte("mes_referencia", ate_iso)
    dre_rows = dre_q.execute().data or []

    linhas_por_empresa: dict[str, list[dict]] = {}
    for row in dre_rows:
        linhas_por_empresa.setdefault(row["empresa_id"], []).append(row)
    retirada_por_empresa: dict[str, float | None] = {
        eid: _somar(rows, "retirada") for eid, rows in linhas_por_empresa.items()
    }

    # Participações do cliente (com nome do sócio)
    part_res = (
        supabase.table("participacao_societaria")
        .select("empresa_id, socio_id, percentual, socios(nome)")
        .eq("cliente_id", cliente_id)
        .in_("empresa_id", ids)
        .execute()
    )
    part_por_empresa: dict[str, list[dict]] = {}
    for p in part_res.data or []:
        part_por_empresa.setdefault(p["empresa_id"], []).append(p)

    alertas: list[str] = []
    empresas_out: list[dict] = []
    # Acumulador por sócio (consolidado do grupo/rede)
    socios_acc: dict[str, dict] = {}

    for eid, info in empresas_map.items():
        rotulo = info.get("codigo") or info.get("nome_razao_social") or "unidade"
        retirada = retirada_por_empresa.get(eid)
        parts = part_por_empresa.get(eid, [])
        soma_pct = round(
            sum(_f(p.get("percentual")) or 0 for p in parts), 2
        )
        fecha_100 = bool(parts) and abs(soma_pct - 100) <= 0.01

        distribuicao = []
        for p in parts:
            pct = _f(p.get("percentual"))
            nome = (p.get("socios") or {}).get("nome")
            valor = (
                round(retirada * pct / 100, 2)
                if retirada is not None and pct is not None
                else None
            )
            distribuicao.append({
                "socio_id": p["socio_id"],
                "socio_nome": nome,
                "percentual": pct,
                "valor": valor,
            })
            acc = socios_acc.setdefault(
                p["socio_id"],
                {"socio_id": p["socio_id"], "socio_nome": nome, "valor_distribuido": None, "empresas": []},
            )
            if valor is not None:
                acc["valor_distribuido"] = round((acc["valor_distribuido"] or 0) + valor, 2)
            acc["empresas"].append({
                "empresa_id": eid,
                "codigo": info.get("codigo"),
                "nome": info.get("nome_razao_social"),
                "percentual": pct,
                "retirada_empresa": retirada,
                "valor": valor,
            })

        # Sinalizações de governança (nunca corrige, só avisa)
        if not parts and retirada:
            alertas.append(
                f"{rotulo}: retirada de {_brl(retirada)} sem participação societária cadastrada."
            )
        elif parts and not fecha_100:
            alertas.append(
                f"{rotulo}: a soma das participações é {soma_pct:.2f}% (não fecha 100%)."
            )
        if parts and retirada is None:
            alertas.append(f"{rotulo}: retirada não consta no período.")

        empresas_out.append({
            "empresa_id": eid,
            "codigo": info.get("codigo"),
            "nome": info.get("nome_razao_social"),
            "rede_id": info.get("rede_id"),
            "retirada_total": retirada,
            "soma_percentual": soma_pct,
            "soma_fecha_100": fecha_100,
            "tem_participacao": bool(parts),
            "distribuicao": distribuicao,
        })

    empresas_out.sort(key=lambda e: (e["retirada_total"] or 0), reverse=True)
    socios = sorted(
        socios_acc.values(),
        key=lambda s: (s["valor_distribuido"] or 0),
        reverse=True,
    )

    return {
        "cliente_id": cliente_id,
        "rede_selecionada": rede_id,
        "empresa_selecionada": empresa_id,
        "redes": redes,
        "socios": socios,
        "empresas": empresas_out,
        "alertas": alertas,
    }


@router.delete("/uploads/{upload_id}")
async def remover_upload(upload_id: str, usuario: dict = Depends(admin_do_cliente)):
    """Remove um envio (PDF) e os lançamentos consolidados que ele originou.

    O vínculo entre envio e lançamento é pelo `fonte` (guarda o nome do
    arquivo), já que não há FK direta. Remove também o arquivo do Storage.
    """
    cliente_id = usuario["cliente_id"]
    res = (
        supabase.table("dre_uploads")
        .select("id, empresa_id, storage_path, nome_arquivo")
        .eq("id", upload_id)
        .eq("cliente_id", cliente_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    up = res.data[0]

    lancamentos_removidos = 0
    if up.get("nome_arquivo"):
        q = (
            supabase.table("dre_consolidado")
            .delete()
            .eq("cliente_id", cliente_id)
            .ilike("fonte", f"%{up['nome_arquivo']}%")
        )
        if up.get("empresa_id"):
            q = q.eq("empresa_id", up["empresa_id"])
        removidos = q.execute().data or []
        lancamentos_removidos = len(removidos)
        # O agente não pode continuar citando dado que saiu do sistema.
        remover_por_nome_arquivo(cliente_id, up["nome_arquivo"])

    if up.get("storage_path"):
        try:
            supabase.storage.from_(config.DRE_BUCKET).remove([up["storage_path"]])
        except Exception:  # noqa: BLE001 — arquivo órfão não deve travar a exclusão
            logger.warning("Falha ao remover arquivo do Storage: %s", up["storage_path"])

    supabase.table("dre_uploads").delete().eq("id", upload_id).eq(
        "cliente_id", cliente_id
    ).execute()

    return {"envio_removido": True, "lancamentos_removidos": lancamentos_removidos}


@router.delete("/consolidado/{registro_id}")
async def remover_lancamento(registro_id: str, usuario: dict = Depends(admin_do_cliente)):
    """Remove um lançamento mensal (linha do dre_consolidado) do próprio cliente."""
    cliente_id = usuario["cliente_id"]
    res = (
        supabase.table("dre_consolidado")
        .delete()
        .eq("id", registro_id)
        .eq("cliente_id", cliente_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")

    linha = res.data[0]
    if linha.get("empresa_id") and linha.get("mes_referencia"):
        remover_resumo_mes(cliente_id, linha["empresa_id"], linha["mes_referencia"])
    return {"removido": True}
