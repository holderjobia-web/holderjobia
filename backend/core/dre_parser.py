"""Parser de DRE (Demonstrativo de Resultado do Exercício).

Estratégia (governança do projeto — NUNCA fabricar número):
- Extração por RÓTULO (label-driven), não por posição fixa de linha/coluna.
  Ancora nas linhas de subtotal semânticas do demonstrativo. Assim sobrevive a
  pequenas variações de layout entre clientes.
- VALIDAÇÃO por identidade contábil: confere se os números fecham entre si.
  Se não fecharem, sinaliza divergência e reduz a confiabilidade — não corrige
  nem sobrescreve silenciosamente.
- FAIL-SAFE: se as âncoras essenciais não forem encontradas (layout
  desconhecido), o parser retorna `ok=False` e NÃO inventa valores. Campo
  ausente = None (NULL no banco = "não consta"), nunca 0.

O núcleo `parsear_consolidado(texto)` é uma função pura sobre o texto extraído,
o que permite testá-la contra amostras reais sem depender do binário do PDF.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Optional

# ---------------------------------------------------------------------------
# Constantes de mapeamento
# ---------------------------------------------------------------------------

MESES_ABREV: dict[str, int] = {
    "JAN": 1, "FEV": 2, "MAR": 3, "ABR": 4, "MAI": 5, "JUN": 6,
    "JUL": 7, "AGO": 8, "SET": 9, "OUT": 10, "NOV": 11, "DEZ": 12,
}

# Rótulo de âncora (normalizado) -> coluna de dre_consolidado.
# São linhas de SUBTOTAL do demonstrativo (sem código de conta no início).
ANCORAS: dict[str, str] = {
    "RECEITAS DE VENDAS": "receita_bruta",
    "IMPOSTOS E CONTRIBUICOES S/ VENDA": "impostos",
    "VENDAS CANCELADAS / DEVOLUCOES": "devolucoes",
    "RECEITA LIQUIDA": "receita_liquida",
    "CUSTO DO SERVICO PRESTADO (CSV)": "custo_servico_vendido",
    "DESPESAS OPERACIONAIS": "despesas_operacionais",
    "RESULTADO OPERACIONAL": "resultado_operacional",
    "DESPESAS FINANCEIRAS": "despesas_financeiras",
    "IR / CSLL": "ir_csll",
    "LUCRO / PREJUIZO LIQUIDO": "lucro_liquido",
    "LUCROS DISTRIBUIDOS": "retirada",
}

# Colunas mínimas para considerar a extração confiável o bastante para gravar.
ANCORAS_ESSENCIAIS = {
    "receita_bruta",
    "receita_liquida",
    "resultado_operacional",
    "lucro_liquido",
}

# Tolerância (em reais) para as identidades contábeis fecharem.
_TOLERANCIA = Decimal("0.05")

# R$ 1.815.142,88  ->  captura "1.815.142,88" (com sinal opcional)
_TOKEN_VALOR = re.compile(r"R\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})")
# JAN/26, FEV/26 ...
_TOKEN_MES = re.compile(r"\b([A-Z]{3})/(\d{2})\b")
# Linha que começa com código de conta (linha analítica, não é subtotal)
_INICIA_COM_CODIGO = re.compile(r"^\s*\d")


# ---------------------------------------------------------------------------
# Estruturas de retorno
# ---------------------------------------------------------------------------

@dataclass
class LinhaMensal:
    mes_referencia: date
    valores: dict[str, Optional[Decimal]]
    divergencias: list[str] = field(default_factory=list)
    confiabilidade: str = "media"  # alta | media | baixa | pendente


@dataclass
class ResultadoParse:
    ok: bool
    meses: list[LinhaMensal] = field(default_factory=list)
    ancoras_encontradas: set[str] = field(default_factory=set)
    unidade_texto: Optional[str] = None
    motivo: Optional[str] = None  # preenchido quando ok=False


# ---------------------------------------------------------------------------
# Helpers de normalização/parsing
# ---------------------------------------------------------------------------

def _normalizar(texto: str) -> str:
    """Uppercase, remove acentos e colapsa espaços."""
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFKD", texto)
        if not unicodedata.combining(c)
    )
    return re.sub(r"\s+", " ", sem_acento).strip().upper()


def _parse_valor(bruto: str) -> Optional[Decimal]:
    """'1.815.142,88' -> Decimal('1815142.88'). Formato BR."""
    limpo = bruto.replace(".", "").replace(",", ".")
    try:
        return Decimal(limpo)
    except InvalidOperation:
        return None


def _extrair_meses(linhas: list[str]) -> list[date]:
    """Localiza a linha de cabeçalho de colunas e devolve as datas dos meses.

    Ex.: 'CONTA F/V JAN/26 FEV/26 ... JUL/26 TOTAL' -> [date(2026,1,1), ...].
    A coluna TOTAL é ignorada (não é um mês).
    """
    for linha in linhas:
        achados = _TOKEN_MES.findall(linha.upper())
        if len(achados) >= 2:
            meses: list[date] = []
            for abrev, ano2 in achados:
                mes = MESES_ABREV.get(abrev)
                if mes is None:
                    continue
                ano = 2000 + int(ano2)
                meses.append(date(ano, mes, 1))
            if meses:
                return meses
    return []


def _extrair_unidade(linhas: list[str]) -> Optional[str]:
    """Primeiro texto não vazio antes do cabeçalho 'DEMONSTRATIVO...'.

    Apenas informativo (rastreabilidade). NUNCA usado para escolher empresa_id
    — a empresa vem do formulário de upload.
    """
    for linha in linhas:
        s = linha.strip()
        if not s:
            continue
        norm = _normalizar(s)
        if norm.startswith("DEMONSTRATIVO"):
            break
        if not _INICIA_COM_CODIGO.match(s):
            return s
    return None


def _valores_da_linha(linha: str) -> list[Decimal]:
    valores: list[Decimal] = []
    for bruto in _TOKEN_VALOR.findall(linha):
        v = _parse_valor(bruto)
        if v is not None:
            valores.append(v)
    return valores


# ---------------------------------------------------------------------------
# Validação por identidade contábil
# ---------------------------------------------------------------------------

def _validar_identidades(valores: dict[str, Optional[Decimal]]) -> tuple[list[str], str]:
    """Confere as identidades contábeis. Retorna (divergencias, confiabilidade).

    Nunca ALTERA os valores — apenas verifica e pontua a confiança.
    """
    divergencias: list[str] = []
    checks_possiveis = 0
    checks_ok = 0

    def checar(nome: str, esperado_parts: list[Optional[Decimal]], sinais: list[int], alvo: Optional[Decimal]):
        nonlocal checks_possiveis, checks_ok
        if alvo is None or any(p is None for p in esperado_parts):
            return  # não dá pra checar sem todos os componentes -> não inventa
        checks_possiveis += 1
        esperado = Decimal("0")
        for parte, sinal in zip(esperado_parts, sinais):
            esperado += sinal * parte  # type: ignore[operator]
        if abs(esperado - alvo) <= _TOLERANCIA:
            checks_ok += 1
        else:
            divergencias.append(
                f"{nome}: esperado {esperado} pela fórmula, extraído {alvo} "
                f"(diferença {alvo - esperado})"
            )

    checar(
        "receita_liquida",
        [valores.get("receita_bruta"), valores.get("impostos"), valores.get("devolucoes")],
        [1, -1, -1],
        valores.get("receita_liquida"),
    )
    checar(
        "resultado_operacional",
        [valores.get("receita_liquida"), valores.get("custo_servico_vendido"), valores.get("despesas_operacionais")],
        [1, -1, -1],
        valores.get("resultado_operacional"),
    )
    checar(
        "lucro_liquido",
        [valores.get("resultado_operacional"), valores.get("despesas_financeiras"), valores.get("ir_csll")],
        [1, -1, -1],
        valores.get("lucro_liquido"),
    )

    if divergencias:
        confiabilidade = "baixa"
    elif checks_possiveis == 0:
        confiabilidade = "pendente"
    elif checks_ok == checks_possiveis and checks_possiveis >= 2:
        confiabilidade = "alta"
    else:
        confiabilidade = "media"
    return divergencias, confiabilidade


# ---------------------------------------------------------------------------
# Núcleo do parser (função pura, testável)
# ---------------------------------------------------------------------------

def parsear_consolidado(texto: str) -> ResultadoParse:
    """Parseia a matriz consolidada multi-mês do DRE a partir do texto extraído.

    1 PDF = N meses de 1 unidade. Devolve uma LinhaMensal por mês.
    """
    linhas = texto.splitlines()
    meses = _extrair_meses(linhas)
    if not meses:
        return ResultadoParse(
            ok=False,
            motivo="Cabeçalho de meses não encontrado (layout não reconhecido).",
        )

    n = len(meses)
    # coluna -> lista de valores por mês (None onde não consta)
    colunas: dict[str, list[Optional[Decimal]]] = {}
    ancoras_encontradas: set[str] = set()

    for linha in linhas:
        if _INICIA_COM_CODIGO.match(linha):
            continue  # linha analítica (tem código de conta), não é âncora
        idx = linha.find("R$")
        if idx == -1:
            continue
        rotulo = _normalizar(linha[:idx])
        coluna = ANCORAS.get(rotulo)
        if coluna is None or coluna in ancoras_encontradas:
            continue
        valores = _valores_da_linha(linha[idx:])
        # Esperado: n meses + 1 coluna TOTAL. Aceita n ou n+1.
        if len(valores) == n + 1:
            valores = valores[:n]  # descarta TOTAL
        elif len(valores) != n:
            # Quantidade inesperada: não confia nesta âncora (não chuta alinhamento)
            continue
        colunas[coluna] = valores
        ancoras_encontradas.add(coluna)

    if not (ANCORAS_ESSENCIAIS & ancoras_encontradas) == ANCORAS_ESSENCIAIS:
        faltando = ANCORAS_ESSENCIAIS - ancoras_encontradas
        return ResultadoParse(
            ok=False,
            ancoras_encontradas=ancoras_encontradas,
            unidade_texto=_extrair_unidade(linhas),
            motivo=(
                "Âncoras essenciais não encontradas: "
                + ", ".join(sorted(faltando))
                + ". Layout provavelmente diferente — revisar manualmente."
            ),
        )

    todas_colunas = set(ANCORAS.values())
    resultado_meses: list[LinhaMensal] = []
    for i, mes in enumerate(meses):
        valores: dict[str, Optional[Decimal]] = {
            col: (colunas[col][i] if col in colunas else None)
            for col in todas_colunas
        }
        divergencias, confiabilidade = _validar_identidades(valores)
        resultado_meses.append(
            LinhaMensal(
                mes_referencia=mes,
                valores=valores,
                divergencias=divergencias,
                confiabilidade=confiabilidade,
            )
        )

    return ResultadoParse(
        ok=True,
        meses=resultado_meses,
        ancoras_encontradas=ancoras_encontradas,
        unidade_texto=_extrair_unidade(linhas),
    )


# ---------------------------------------------------------------------------
# Extração de texto do PDF (isola a dependência do pdfplumber)
# ---------------------------------------------------------------------------

def extrair_texto_pdf(conteudo: bytes) -> str:
    """Extrai o texto de todas as páginas do PDF (bytes) usando pdfplumber."""
    import io

    import pdfplumber

    partes: list[str] = []
    with pdfplumber.open(io.BytesIO(conteudo)) as pdf:
        for pagina in pdf.pages:
            texto = pagina.extract_text() or ""
            partes.append(texto)
    return "\n".join(partes)


def parsear_pdf(conteudo: bytes) -> ResultadoParse:
    """Conveniência: extrai o texto do PDF e parseia a matriz consolidada."""
    return parsear_consolidado(extrair_texto_pdf(conteudo))
