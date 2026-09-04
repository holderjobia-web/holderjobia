"""
Estrutura societária (portal) — sócios do cliente e participação (%) por empresa.

Base para a distribuição de lucros (retirada da DRE × % do sócio), calculada
depois na consulta — nunca gravada.

Rotas (JWT do portal — JWT_SECRET):
  Leitura  (qualquer usuário do cliente):
    GET  /socios
    GET  /empresas/{empresa_id}/participacoes
  Escrita  (somente admin_cliente):
    POST   /socios
    PATCH  /socios/{socio_id}
    POST   /participacoes
    PATCH  /participacoes/{participacao_id}
    DELETE /participacoes/{participacao_id}
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from postgrest.exceptions import APIError

from core.auth import admin_do_cliente, usuario_atual
from supabase_client import supabase

router = APIRouter(tags=["societario"])

_CAMPOS_SOCIO = (
    "id, cliente_id, nome, cpf, email, papel, observacao, ativo, criado_em"
)
_CAMPOS_PART = (
    "id, cliente_id, empresa_id, socio_id, percentual, papel, "
    "data_inicio, data_fim, observacao"
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


def _socio_do_cliente(socio_id: str, cliente_id: str) -> bool:
    res = (
        supabase.table("socios")
        .select("id")
        .eq("id", socio_id)
        .eq("cliente_id", cliente_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------

class SocioIn(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    cpf: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    papel: str | None = Field(default=None, max_length=100)
    observacao: str | None = None


class SocioUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    cpf: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    papel: str | None = Field(default=None, max_length=100)
    observacao: str | None = None
    ativo: bool | None = None


class ParticipacaoIn(BaseModel):
    empresa_id: str
    socio_id: str
    percentual: float = Field(ge=0, le=100)
    papel: str | None = Field(default=None, max_length=100)
    data_inicio: date | None = None
    data_fim: date | None = None
    observacao: str | None = None


class ParticipacaoUpdate(BaseModel):
    percentual: float | None = Field(default=None, ge=0, le=100)
    papel: str | None = Field(default=None, max_length=100)
    data_inicio: date | None = None
    data_fim: date | None = None
    observacao: str | None = None


# ---------------------------------------------------------------------------
# Sócios
# ---------------------------------------------------------------------------

@router.get("/socios")
async def listar_socios(usuario: dict = Depends(usuario_atual)):
    res = (
        supabase.table("socios")
        .select(_CAMPOS_SOCIO)
        .eq("cliente_id", usuario["cliente_id"])
        .order("nome")
        .execute()
    )
    return res.data or []


@router.post("/socios", status_code=201)
async def criar_socio(dados: SocioIn, usuario: dict = Depends(admin_do_cliente)):
    payload = {
        "cliente_id": usuario["cliente_id"],
        "nome": dados.nome.strip(),
        "cpf": dados.cpf,
        "email": dados.email,
        "papel": dados.papel,
        "observacao": dados.observacao,
    }
    res = supabase.table("socios").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Falha ao cadastrar o sócio.")
    return res.data[0]


@router.patch("/socios/{socio_id}")
async def atualizar_socio(
    socio_id: str,
    dados: SocioUpdate,
    usuario: dict = Depends(admin_do_cliente),
):
    if not _socio_do_cliente(socio_id, usuario["cliente_id"]):
        raise HTTPException(status_code=404, detail="Sócio não encontrado.")

    campos = dados.model_dump(exclude_unset=True)
    if not campos:
        raise HTTPException(status_code=422, detail="Nada para atualizar.")

    res = (
        supabase.table("socios")
        .update(campos)
        .eq("id", socio_id)
        .eq("cliente_id", usuario["cliente_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="Falha ao atualizar o sócio.")
    return res.data[0]


# ---------------------------------------------------------------------------
# Participação societária
# ---------------------------------------------------------------------------

@router.get("/empresas/{empresa_id}/participacoes")
async def listar_participacoes(
    empresa_id: str,
    usuario: dict = Depends(usuario_atual),
):
    if not _empresa_do_cliente(empresa_id, usuario["cliente_id"]):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    res = (
        supabase.table("participacao_societaria")
        .select(_CAMPOS_PART + ", socios(nome)")
        .eq("empresa_id", empresa_id)
        .eq("cliente_id", usuario["cliente_id"])
        .execute()
    )
    linhas = res.data or []

    total = sum(
        float(l["percentual"]) for l in linhas if l.get("percentual") is not None
    )
    return {
        "empresa_id": empresa_id,
        "total_percentual": round(total, 2),
        # Divergência é SINALIZADA, nunca corrigida (soma pode não fechar 100)
        "soma_fecha_100": abs(total - 100) <= 0.01,
        "participacoes": [
            {
                "id": l["id"],
                "socio_id": l["socio_id"],
                "socio_nome": (l.get("socios") or {}).get("nome"),
                "percentual": float(l["percentual"]) if l.get("percentual") is not None else None,
                "papel": l.get("papel"),
                "data_inicio": l.get("data_inicio"),
                "data_fim": l.get("data_fim"),
                "observacao": l.get("observacao"),
            }
            for l in linhas
        ],
    }


@router.post("/participacoes", status_code=201)
async def criar_participacao(
    dados: ParticipacaoIn,
    usuario: dict = Depends(admin_do_cliente),
):
    cliente_id = usuario["cliente_id"]
    if not _empresa_do_cliente(dados.empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    if not _socio_do_cliente(dados.socio_id, cliente_id):
        raise HTTPException(status_code=404, detail="Sócio não encontrado.")

    payload = {
        "cliente_id": cliente_id,
        "empresa_id": dados.empresa_id,
        "socio_id": dados.socio_id,
        "percentual": dados.percentual,
        "papel": dados.papel,
        "data_inicio": dados.data_inicio.isoformat() if dados.data_inicio else None,
        "data_fim": dados.data_fim.isoformat() if dados.data_fim else None,
        "observacao": dados.observacao,
    }
    try:
        res = supabase.table("participacao_societaria").insert(payload).execute()
    except APIError as exc:
        if getattr(exc, "code", None) == "23505":
            raise HTTPException(
                status_code=409,
                detail="Este sócio já tem participação nesta empresa. Edite a existente.",
            )
        raise
    if not res.data:
        raise HTTPException(status_code=500, detail="Falha ao cadastrar a participação.")
    return res.data[0]


@router.patch("/participacoes/{participacao_id}")
async def atualizar_participacao(
    participacao_id: str,
    dados: ParticipacaoUpdate,
    usuario: dict = Depends(admin_do_cliente),
):
    campos = dados.model_dump(exclude_unset=True)
    if not campos:
        raise HTTPException(status_code=422, detail="Nada para atualizar.")
    for campo in ("data_inicio", "data_fim"):
        if isinstance(campos.get(campo), date):
            campos[campo] = campos[campo].isoformat()

    res = (
        supabase.table("participacao_societaria")
        .update(campos)
        .eq("id", participacao_id)
        .eq("cliente_id", usuario["cliente_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Participação não encontrada.")
    return res.data[0]


@router.delete("/participacoes/{participacao_id}", status_code=204)
async def remover_participacao(
    participacao_id: str,
    usuario: dict = Depends(admin_do_cliente),
):
    supabase.table("participacao_societaria").delete().eq(
        "id", participacao_id
    ).eq("cliente_id", usuario["cliente_id"]).execute()
    return None
