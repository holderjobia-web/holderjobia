"""
Envio de Vendas (portal) — upload da planilha (.xlsx), registro dos metadados e
processamento. Módulo "Vendas" (Melhoria 2), mesmo padrão do módulo de DRE.

Rotas (exigem JWT do portal — JWT_SECRET):
  POST   /vendas/uploads                → recebe o .xlsx (multipart), salva e registra
  GET    /vendas/uploads                → lista os envios do cliente (filtro empresa/categoria)
  POST   /vendas/uploads/{id}/processar → parseia a planilha e grava em vendas_consolidado
  DELETE /vendas/uploads/{id}           → remove o envio + lançamentos que ele originou
  GET    /vendas/consolidado            → indicadores por unidade (dashboard)
  GET    /vendas/grupo                  → indicadores consolidados do grupo (todas unidades)
  DELETE /vendas/consolidado/{id}       → remove 1 lançamento mensal

O binário vai para o bucket privado do Supabase Storage; o banco guarda só
os metadados e o status. A extração dos números fica em core.vendas_processamento.
"""

import logging
import uuid
from datetime import date

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
from core.vendas_processamento import processar_upload
from supabase_client import supabase

router = APIRouter(prefix="/vendas", tags=["vendas"])

logger = logging.getLogger(__name__)

_MAX_BYTES = 20 * 1024 * 1024  # 20 MB
# A categoria de cada venda é DERIVADA da planilha (core.vendas_parser); esta
# lista existe só p/ validar filtros vindos do front.
_CATEGORIAS_VALIDAS = (
    "ortodontia", "clinico_geral", "implante",
    "endodontia", "radiologia", "nao_identificado",
)
_CAMPOS_UPLOAD = (
    "id, cliente_id, empresa_id, categoria, nome_arquivo, tamanho_bytes, "
    "mes_referencia, status, erro_detalhe, criado_em"
)
_COLUNAS_MONET = ("valor_original", "valor_desconto", "valor_recebido")
_CAMPOS_CONSOLIDADO = (
    "mes_referencia", "categoria", "quantidade_vendas",
    "valor_original", "valor_desconto", "valor_recebido",
    "breakdown_pagamento", "fonte", "observacao",
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


def _validar_categoria(categoria: str) -> None:
    if categoria not in _CATEGORIAS_VALIDAS:
        raise HTTPException(
            status_code=422,
            detail=f"categoria inválida. Use uma de: {', '.join(_CATEGORIAS_VALIDAS)}.",
        )


@router.get("/uploads")
async def listar_uploads(
    empresa_id: str | None = Query(None),
    categoria: str | None = Query(None),
    usuario: dict = Depends(usuario_atual),
):
    query = (
        supabase.table("vendas_uploads")
        .select(_CAMPOS_UPLOAD)
        .eq("cliente_id", usuario["cliente_id"])
    )
    if empresa_id:
        query = query.eq("empresa_id", empresa_id)
    if categoria:
        query = query.eq("categoria", categoria)
    res = query.order("criado_em", desc=True).execute()
    return res.data or []


@router.post("/uploads", status_code=201)
async def enviar_vendas(
    arquivo: UploadFile = File(...),
    empresa_id: str = Form(...),
    mes_referencia: str | None = Form(None),
    usuario: dict = Depends(usuario_atual),
):
    cliente_id = usuario["cliente_id"]

    nome = (arquivo.filename or "").strip()
    tipo = (arquivo.content_type or "").lower()
    _EXTENSOES_XLSX = (".xlsx",)
    _TIPOS_XLSX = ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",)
    if not nome.lower().endswith(_EXTENSOES_XLSX) and tipo not in _TIPOS_XLSX:
        raise HTTPException(status_code=415, detail="Envie um arquivo .xlsx.")

    if not _empresa_do_cliente(empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    mes_iso = _normalizar_mes(mes_referencia)

    conteudo = await arquivo.read()
    if not conteudo:
        raise HTTPException(status_code=422, detail="Arquivo vazio.")
    if len(conteudo) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo excede o limite de 20 MB.")

    storage_path = f"{cliente_id}/{uuid.uuid4()}.xlsx"
    try:
        supabase.storage.from_(config.VENDAS_BUCKET).upload(
            storage_path,
            conteudo,
            {"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
        )
    except Exception as e:
        corpo = getattr(getattr(e, "response", None), "text", "") or repr(e)
        logger.exception(
            "Falha ao enviar planilha de vendas para o Storage (bucket=%s) erro=%s",
            config.VENDAS_BUCKET, corpo,
        )
        detalhe = "Falha ao armazenar o arquivo. Tente novamente."
        if config.AMBIENTE != "producao":
            detalhe = f"Falha ao armazenar o arquivo: {corpo}".strip()
        raise HTTPException(status_code=502, detail=detalhe)

    payload = {
        "cliente_id": cliente_id,
        "empresa_id": empresa_id,
        "categoria": None,  # detectada por linha no processamento
        "enviado_por": usuario["id"],
        "nome_arquivo": nome,
        "storage_path": storage_path,
        "tamanho_bytes": len(conteudo),
        "mes_referencia": mes_iso,
        "status": "recebido",
    }
    res = supabase.table("vendas_uploads").insert(payload).execute()
    if not res.data:
        try:
            supabase.storage.from_(config.VENDAS_BUCKET).remove([storage_path])
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Falha ao registrar o envio.")

    registro = res.data[0]
    registro.pop("storage_path", None)
    return registro


@router.post("/uploads/{upload_id}/processar")
async def processar_vendas(
    upload_id: str,
    usuario: dict = Depends(usuario_atual),
):
    res = (
        supabase.table("vendas_uploads")
        .select("id, cliente_id, empresa_id, categoria, storage_path, nome_arquivo, status")
        .eq("id", upload_id)
        .eq("cliente_id", usuario["cliente_id"])
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    return processar_upload(res.data[0])


@router.delete("/uploads/{upload_id}")
async def remover_upload(upload_id: str, usuario: dict = Depends(admin_do_cliente)):
    """Remove um envio (.xlsx) e os lançamentos consolidados que ele originou.

    O vínculo entre envio e lançamento é pelo `fonte` (guarda o nome do
    arquivo), já que não há FK direta. Remove também o arquivo do Storage.
    """
    cliente_id = usuario["cliente_id"]
    res = (
        supabase.table("vendas_uploads")
        .select("id, empresa_id, categoria, storage_path, nome_arquivo")
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
            supabase.table("vendas_consolidado")
            .delete()
            .eq("cliente_id", cliente_id)
            .eq("empresa_id", up["empresa_id"])
            .ilike("fonte", f"%{up['nome_arquivo']}%")
        )
        # Envios antigos eram 1 arquivo por categoria; os novos trazem todas
        # (categoria NULL no upload) e removem os lançamentos de todas elas.
        if up.get("categoria"):
            q = q.eq("categoria", up["categoria"])
        lancamentos_removidos = len(q.execute().data or [])

    if up.get("storage_path"):
        try:
            supabase.storage.from_(config.VENDAS_BUCKET).remove([up["storage_path"]])
        except Exception:  # noqa: BLE001 — arquivo órfão não deve travar a exclusão
            logger.warning("Falha ao remover arquivo do Storage: %s", up["storage_path"])

    supabase.table("vendas_uploads").delete().eq("id", upload_id).eq(
        "cliente_id", cliente_id
    ).execute()

    return {"envio_removido": True, "lancamentos_removidos": lancamentos_removidos}


def _f(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _com_indicadores(linha: dict) -> dict:
    valor_recebido = _f(linha.get("valor_recebido"))
    quantidade = linha.get("quantidade_vendas") or 0
    return {
        "id": linha.get("id"),
        "mes_referencia": linha.get("mes_referencia"),
        "categoria": linha.get("categoria"),
        "quantidade_vendas": quantidade,
        "valor_original": _f(linha.get("valor_original")),
        "valor_desconto": _f(linha.get("valor_desconto")),
        "valor_recebido": valor_recebido,
        "ticket_medio": round(valor_recebido / quantidade, 2) if valor_recebido and quantidade else None,
        "breakdown_pagamento": linha.get("breakdown_pagamento"),
        "fonte": linha.get("fonte"),
        "observacao": linha.get("observacao"),
    }


@router.get("/consolidado")
async def consolidado(
    empresa_id: str = Query(...),
    categoria: str | None = Query(None),
    de: str | None = Query(None, description="mês inicial AAAA-MM"),
    ate: str | None = Query(None, description="mês final AAAA-MM"),
    usuario: dict = Depends(usuario_atual),
):
    cliente_id = usuario["cliente_id"]
    if not _empresa_do_cliente(empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    if categoria:
        _validar_categoria(categoria)

    query = (
        supabase.table("vendas_consolidado")
        .select("id, " + ", ".join(_CAMPOS_CONSOLIDADO))
        .eq("empresa_id", empresa_id)
    )
    if categoria:
        query = query.eq("categoria", categoria)
    de_iso = _normalizar_mes(de)
    ate_iso = _normalizar_mes(ate)
    if de_iso:
        query = query.gte("mes_referencia", de_iso)
    if ate_iso:
        query = query.lte("mes_referencia", ate_iso)

    res = query.order("mes_referencia").execute()
    linhas = [_com_indicadores(linha) for linha in (res.data or [])]

    if categoria:
        return {"empresa_id": empresa_id, "categoria": categoria, "meses": linhas}

    # Sem categoria: agrega as 3 categorias por mês (visão combinada da unidade)
    por_mes: dict[str, list[dict]] = {}
    for linha in linhas:
        por_mes.setdefault(linha["mes_referencia"], []).append(linha)

    meses_agregados = []
    for mes_iso in sorted(por_mes):
        itens = por_mes[mes_iso]
        quantidade = sum(i["quantidade_vendas"] for i in itens)
        recebido = sum(i["valor_recebido"] or 0 for i in itens) or None
        meses_agregados.append({
            "mes_referencia": mes_iso,
            "quantidade_vendas": quantidade,
            "valor_recebido": recebido,
            "ticket_medio": round(recebido / quantidade, 2) if recebido and quantidade else None,
            "por_categoria": [
                {"categoria": i["categoria"], "valor_recebido": i["valor_recebido"], "quantidade_vendas": i["quantidade_vendas"]}
                for i in itens
            ],
        })

    return {"empresa_id": empresa_id, "categoria": None, "meses": meses_agregados}


@router.get("/grupo")
async def consolidado_grupo(
    de: str | None = Query(None, description="mês inicial AAAA-MM"),
    ate: str | None = Query(None, description="mês final AAAA-MM"),
    rede_id: str | None = Query(None, description="filtra por rede; ausente = todas"),
    categoria: str | None = Query(None, description="filtra por categoria; ausente = todas"),
    usuario: dict = Depends(usuario_atual),
):
    """Visão do grupo: soma as unidades do cliente por mês + comparativo."""
    cliente_id = usuario["cliente_id"]
    if categoria:
        _validar_categoria(categoria)

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

    contagem: dict[str | None, int] = {}
    for e in todas_empresas:
        contagem[e.get("rede_id")] = contagem.get(e.get("rede_id"), 0) + 1
    redes = [
        {"id": rid, "nome": nome, "unidades": contagem.get(rid, 0)}
        for rid, nome in redes_nome.items()
    ]
    if contagem.get(None):
        redes.append({"id": None, "nome": "Sem rede", "unidades": contagem[None]})

    if rede_id:
        empresas_map = {e["id"]: e for e in todas_empresas if e.get("rede_id") == rede_id}
    else:
        empresas_map = {e["id"]: e for e in todas_empresas}

    query = (
        supabase.table("vendas_consolidado")
        .select("empresa_id, " + ", ".join(_CAMPOS_CONSOLIDADO))
        .eq("cliente_id", cliente_id)
        .in_("empresa_id", list(empresas_map.keys()) or ["00000000-0000-0000-0000-000000000000"])
    )
    if categoria:
        query = query.eq("categoria", categoria)
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
        por_mes.setdefault(linha["mes_referencia"], []).append(linha)
        por_empresa.setdefault(linha["empresa_id"], []).append(linha)

    def _somar(itens: list[dict], coluna: str) -> float | None:
        presentes = [v for l in itens if (v := _f(l.get(coluna))) is not None]
        return round(sum(presentes), 2) if presentes else None

    meses = []
    for mes_iso in sorted(por_mes):
        itens = por_mes[mes_iso]
        quantidade = sum(i.get("quantidade_vendas") or 0 for i in itens)
        recebido = _somar(itens, "valor_recebido")
        meses.append({
            "mes_referencia": mes_iso,
            "quantidade_vendas": quantidade,
            "valor_recebido": recebido,
            "ticket_medio": round(recebido / quantidade, 2) if recebido and quantidade else None,
            "unidades": len({i["empresa_id"] for i in itens}),
        })

    empresas = []
    for emp_id, itens in por_empresa.items():
        info = empresas_map.get(emp_id, {})
        recebido = _somar(itens, "valor_recebido")
        quantidade = sum(i.get("quantidade_vendas") or 0 for i in itens)
        empresas.append({
            "empresa_id": emp_id,
            "codigo": info.get("codigo"),
            "nome": info.get("nome_razao_social"),
            "meses": len({i["mes_referencia"] for i in itens}),
            "quantidade_vendas": quantidade,
            "valor_recebido": recebido,
            "ticket_medio": round(recebido / quantidade, 2) if recebido and quantidade else None,
        })
    empresas.sort(key=lambda e: (e["valor_recebido"] or 0), reverse=True)

    return {
        "cliente_id": cliente_id,
        "rede_selecionada": rede_id,
        "categoria_selecionada": categoria,
        "redes": redes,
        "total_unidades": len(empresas_map),
        "unidades_com_dados": len(por_empresa),
        "meses": meses,
        "empresas": empresas,
    }


@router.delete("/consolidado/{registro_id}")
async def remover_lancamento(registro_id: str, usuario: dict = Depends(admin_do_cliente)):
    """Remove um lançamento mensal (linha do vendas_consolidado) do próprio cliente."""
    cliente_id = usuario["cliente_id"]
    res = (
        supabase.table("vendas_consolidado")
        .delete()
        .eq("id", registro_id)
        .eq("cliente_id", cliente_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return {"removido": True}
