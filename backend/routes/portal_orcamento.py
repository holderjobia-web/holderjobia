"""
Orçamento (metas previstas) por EMPRESA e MÊS — portal do cliente.

Leitura = usuario_atual (qualquer usuário do portal do cliente).
Escrita  = admin_do_cliente (perfil admin_cliente).

Rotas:
  GET    /orcamento?empresa_id=            → lista as metas da empresa
  POST   /orcamento                        → cria a meta de um mês (empresa+mês único)
  PATCH  /orcamento/{id}                   → atualiza uma meta
  DELETE /orcamento/{id}                   → remove uma meta
  GET    /orcamento/comparativo?empresa_id=&de=&ate=
         → previsto × realizado (dre_consolidado) × variação (derivada)

GOVERNANÇA: previsto é o que o dono digita (NULL = não consta, não assumir 0);
realizado vem do DRE; a variação é DERIVADA na resposta, nunca gravada.
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from core.auth import admin_do_cliente, usuario_atual
from supabase_client import supabase

router = APIRouter(prefix="/orcamento", tags=["orcamento"])

# Linhas previstas (começo enxuto). Novas linhas entram aqui no futuro.
_CAMPOS_META = ("receita_liquida", "lucro_liquido", "retirada")
_CAMPOS = (
    "id, cliente_id, empresa_id, mes_referencia, "
    "receita_liquida, lucro_liquido, retirada, observacao, criado_em, atualizado_em"
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


def _f(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


class OrcamentoIn(BaseModel):
    empresa_id: str
    mes_referencia: str
    receita_liquida: float | None = None
    lucro_liquido: float | None = None
    retirada: float | None = None
    observacao: str | None = None


class OrcamentoUpdate(BaseModel):
    receita_liquida: float | None = None
    lucro_liquido: float | None = None
    retirada: float | None = None
    observacao: str | None = None


@router.get("")
async def listar_orcamento(
    empresa_id: str = Query(...),
    usuario: dict = Depends(usuario_atual),
):
    if not _empresa_do_cliente(empresa_id, usuario["cliente_id"]):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    res = (
        supabase.table("orcamento")
        .select(_CAMPOS)
        .eq("empresa_id", empresa_id)
        .order("mes_referencia")
        .execute()
    )
    return res.data or []


@router.post("", status_code=201)
async def criar_orcamento(dados: OrcamentoIn, usuario: dict = Depends(admin_do_cliente)):
    cliente_id = usuario["cliente_id"]
    if not _empresa_do_cliente(dados.empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    payload = {
        "cliente_id": cliente_id,
        "empresa_id": dados.empresa_id,
        "mes_referencia": _normalizar_mes(dados.mes_referencia),
        "receita_liquida": dados.receita_liquida,
        "lucro_liquido": dados.lucro_liquido,
        "retirada": dados.retirada,
        "observacao": dados.observacao,
    }
    try:
        res = supabase.table("orcamento").insert(payload).execute()
    except APIError as e:
        if e.code == "23505":  # unique_violation (empresa_id, mes_referencia)
            raise HTTPException(
                status_code=409,
                detail="Já existe um orçamento para esta empresa neste mês.",
            )
        raise HTTPException(status_code=400, detail="Falha ao criar o orçamento.")
    if not res.data:
        raise HTTPException(status_code=500, detail="Falha ao criar o orçamento.")
    return res.data[0]


@router.patch("/{orcamento_id}")
async def atualizar_orcamento(
    orcamento_id: str,
    dados: OrcamentoUpdate,
    usuario: dict = Depends(admin_do_cliente),
):
    updates = dados.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar.")
    updates["atualizado_em"] = datetime.now(timezone.utc).isoformat()

    res = (
        supabase.table("orcamento")
        .update(updates)
        .eq("id", orcamento_id)
        .eq("cliente_id", usuario["cliente_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado.")
    return res.data[0]


@router.delete("/{orcamento_id}")
async def remover_orcamento(
    orcamento_id: str, usuario: dict = Depends(admin_do_cliente)
):
    res = (
        supabase.table("orcamento")
        .delete()
        .eq("id", orcamento_id)
        .eq("cliente_id", usuario["cliente_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado.")
    return {"removido": True}


def _variacao(previsto: float | None, realizado: float | None) -> dict:
    """Variação derivada (nunca gravada). NULL preservado, base 0 → pct None."""
    if previsto is None or realizado is None:
        return {"valor": None, "percentual": None}
    valor = round(realizado - previsto, 2)
    pct = round((valor / previsto) * 100, 1) if previsto not in (0, 0.0) else None
    return {"valor": valor, "percentual": pct}


@router.get("/comparativo")
async def comparativo(
    empresa_id: str = Query(...),
    de: str | None = Query(None, description="mês inicial AAAA-MM"),
    ate: str | None = Query(None, description="mês final AAAA-MM"),
    usuario: dict = Depends(usuario_atual),
):
    cliente_id = usuario["cliente_id"]
    if not _empresa_do_cliente(empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    de_iso = _normalizar_mes(de)
    ate_iso = _normalizar_mes(ate)

    def _periodo(q):
        if de_iso:
            q = q.gte("mes_referencia", de_iso)
        if ate_iso:
            q = q.lte("mes_referencia", ate_iso)
        return q

    prev_res = _periodo(
        supabase.table("orcamento")
        .select("mes_referencia, receita_liquida, lucro_liquido, retirada")
        .eq("empresa_id", empresa_id)
    ).execute()
    real_res = _periodo(
        supabase.table("dre_consolidado")
        .select("mes_referencia, receita_liquida, lucro_liquido, retirada")
        .eq("empresa_id", empresa_id)
    ).execute()

    previstos = {r["mes_referencia"]: r for r in (prev_res.data or [])}
    realizados = {r["mes_referencia"]: r for r in (real_res.data or [])}

    meses_ord = sorted(set(previstos) | set(realizados))
    linhas = []
    for mes in meses_ord:
        p = previstos.get(mes, {})
        r = realizados.get(mes, {})
        campos = {}
        for c in _CAMPOS_META:
            previsto = _f(p.get(c))
            realizado = _f(r.get(c))
            campos[c] = {
                "previsto": previsto,
                "realizado": realizado,
                "variacao": _variacao(previsto, realizado),
            }
        linhas.append({
            "mes_referencia": mes,
            "tem_previsto": bool(previstos.get(mes)),
            "tem_realizado": bool(realizados.get(mes)),
            **campos,
        })

    return {"empresa_id": empresa_id, "campos": list(_CAMPOS_META), "meses": linhas}
