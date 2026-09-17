"""Parser de planilhas de Vendas (.xlsx) — ortodontia/implante/clínico geral.

Mesma governança do parser de DRE (core/dre_parser.py):
- Extração por RÓTULO: localiza a linha de cabeçalho real (1ª coluna ==
  "Paciente"), não assume posição fixa — sobrevive à linha de endereço da
  clínica que vem antes dos dados no export.
- Cada linha da planilha é 1 venda/parcela recebida. O MÊS de referência é
  DERIVADO da coluna "Pagamento" (data por linha) — nunca do campo informado
  manualmente no upload, que é só um rótulo/metadado do envio.
- FAIL-SAFE: linha sem paciente/data/valor recebido válidos é ignorada e
  contada em `linhas_invalidas`; nunca fabrica valor nem derruba o arquivo
  inteiro por causa de 1 linha ruim.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Optional

from openpyxl import load_workbook

_COLUNA_HEADER_ESPERADA = "Paciente"


@dataclass
class MesAgregado:
    mes_referencia: date
    quantidade_vendas: int
    valor_original: Optional[Decimal]
    valor_desconto: Optional[Decimal]
    valor_recebido: Decimal
    por_forma_pagamento: dict = field(default_factory=dict)


@dataclass
class ResultadoParseVendas:
    ok: bool
    meses: list[MesAgregado] = field(default_factory=list)
    linhas_validas: int = 0
    linhas_invalidas: int = 0
    motivo: Optional[str] = None


def _parse_valor_brl(bruto) -> Optional[Decimal]:
    """'R$ 1.234,56' -> Decimal('1234.56'). None/vazio -> None."""
    if bruto is None:
        return None
    s = str(bruto).strip()
    if not s:
        return None
    s = s.replace("R$", "").strip().replace(".", "").replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _parse_data_br(bruto) -> Optional[date]:
    """'31/08/2026' -> date(2026,8,31). Aceita datetime já convertido pelo openpyxl."""
    if bruto is None:
        return None
    if isinstance(bruto, datetime):
        return bruto.date()
    if isinstance(bruto, date):
        return bruto
    s = str(bruto).strip()
    try:
        dia, mes, ano = s.split("/")
        return date(int(ano), int(mes), int(dia))
    except (ValueError, AttributeError):
        return None


def _localizar_header(linhas: list[tuple]) -> Optional[int]:
    for i, linha in enumerate(linhas):
        if not linha:
            continue
        primeira = linha[0]
        if isinstance(primeira, str) and primeira.strip() == _COLUNA_HEADER_ESPERADA:
            return i
    return None


def parsear_planilha(conteudo: bytes) -> ResultadoParseVendas:
    """Parseia o .xlsx de vendas e agrega por mês (derivado da coluna Pagamento)."""
    try:
        wb = load_workbook(BytesIO(conteudo), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        linhas = list(ws.iter_rows(values_only=True))
        wb.close()
    except Exception:
        return ResultadoParseVendas(
            ok=False, motivo="Não foi possível ler o arquivo (.xlsx inválido ou corrompido)."
        )

    idx_header = _localizar_header(linhas)
    if idx_header is None:
        return ResultadoParseVendas(
            ok=False,
            motivo=f"Cabeçalho não encontrado (esperava uma linha com '{_COLUNA_HEADER_ESPERADA}' na 1ª coluna).",
        )

    por_mes: dict[date, list[dict]] = {}
    validas = 0
    invalidas = 0

    for linha in linhas[idx_header + 1:]:
        if not linha or all(v is None for v in linha):
            continue

        paciente = linha[0] if len(linha) > 0 else None
        data_pagamento = _parse_data_br(linha[3]) if len(linha) > 3 else None
        valor_recebido = _parse_valor_brl(linha[5]) if len(linha) > 5 else None

        if not paciente or data_pagamento is None or valor_recebido is None:
            invalidas += 1
            continue

        valor_original = _parse_valor_brl(linha[2]) if len(linha) > 2 else None
        valor_desconto = _parse_valor_brl(linha[4]) if len(linha) > 4 else None
        tipo_pagamento_bruto = linha[6] if len(linha) > 6 else None
        tipo_pagamento = (
            tipo_pagamento_bruto.strip() if isinstance(tipo_pagamento_bruto, str) and tipo_pagamento_bruto.strip()
            else "Não informado"
        )

        mes_ref = data_pagamento.replace(day=1)
        por_mes.setdefault(mes_ref, []).append({
            "valor_original": valor_original,
            "valor_desconto": valor_desconto,
            "valor_recebido": valor_recebido,
            "tipo_pagamento": tipo_pagamento,
        })
        validas += 1

    if validas == 0:
        return ResultadoParseVendas(
            ok=False,
            motivo="Nenhuma linha válida encontrada (verifique paciente/data/valor recebido).",
            linhas_invalidas=invalidas,
        )

    meses: list[MesAgregado] = []
    for mes_ref in sorted(por_mes):
        vendas_mes = por_mes[mes_ref]
        soma_original = Decimal("0")
        soma_desconto = Decimal("0")
        soma_recebido = Decimal("0")
        tem_original = False
        tem_desconto = False
        por_forma: dict[str, Decimal] = {}

        for v in vendas_mes:
            if v["valor_original"] is not None:
                soma_original += v["valor_original"]
                tem_original = True
            if v["valor_desconto"] is not None:
                soma_desconto += v["valor_desconto"]
                tem_desconto = True
            soma_recebido += v["valor_recebido"]
            forma = v["tipo_pagamento"]
            por_forma[forma] = por_forma.get(forma, Decimal("0")) + v["valor_recebido"]

        meses.append(MesAgregado(
            mes_referencia=mes_ref,
            quantidade_vendas=len(vendas_mes),
            valor_original=soma_original if tem_original else None,
            valor_desconto=soma_desconto if tem_desconto else None,
            valor_recebido=soma_recebido,
            por_forma_pagamento=por_forma,
        ))

    return ResultadoParseVendas(ok=True, meses=meses, linhas_validas=validas, linhas_invalidas=invalidas)
