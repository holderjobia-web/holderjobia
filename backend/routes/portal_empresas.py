"""
Leitura de EMPRESAS pelo portal (usuário do cliente).

Rota (exige JWT do portal — JWT_SECRET):
  GET /empresas  → lista as empresas do próprio cliente (tenant do usuário)

Somente leitura: o cadastro/edição de empresas é feito pelo admin.
"""

from fastapi import APIRouter, Depends

from core.auth import usuario_atual
from supabase_client import supabase

router = APIRouter(prefix="/empresas", tags=["portal-empresas"])

_CAMPOS = (
    "id, codigo, nome_razao_social, cnpj, segmento, percentual_participacao, "
    "ativa, status_maturidade, rede_id"
)


@router.get("")
async def listar_minhas_empresas(usuario: dict = Depends(usuario_atual)):
    res = (
        supabase.table("empresas")
        .select(_CAMPOS)
        .eq("cliente_id", usuario["cliente_id"])
        .order("codigo")
        .execute()
    )
    return res.data or []
