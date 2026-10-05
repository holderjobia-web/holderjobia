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

MESES_EXTENSO: dict[str, int] = {
    "JANEIRO": 1, "FEVEREIRO": 2, "MARCO": 3, "ABRIL": 4, "MAIO": 5, "JUNHO": 6,
    "JULHO": 7, "AGOSTO": 8, "SETEMBRO": 9, "OUTUBRO": 10, "NOVEMBRO": 11, "DEZEMBRO": 12,
}

# DICIONÁRIO DE SINÔNIMOS — único lugar a editar quando surgir um layout novo.
# Campo de dre_consolidado -> rótulos de SUBTOTAL aceitos (linhas sem código de
# conta). Comparação ignora acento, caixa e espaços em volta de "/". Um sinônimo
# errado não grava número errado em silêncio: as identidades contábeis acusam.
SINONIMOS: dict[str, tuple[str, ...]] = {
    "receita_bruta": (
        "RECEITAS DE VENDAS", "TOTAL RECEITAS DE VENDAS", "RECEITA BRUTA",
        "RECEITA OPERACIONAL BRUTA", "FATURAMENTO BRUTO",
    ),
    "impostos": (
        "IMPOSTOS E CONTRIBUICOES S/ VENDA", "IMPOSTOS E CONTRIBUICOES S/ VENDAS",
        "IMPOSTOS SOBRE VENDAS", "TRIBUTOS SOBRE VENDAS",
    ),
    "devolucoes": (
        "VENDAS CANCELADAS / DEVOLUCOES", "DEVOLUCOES E CANCELAMENTOS", "DEVOLUCOES DE VENDAS",
    ),
    "receita_liquida": (
        "RECEITA LIQUIDA", "RECEITA OPERACIONAL LIQUIDA", "RECEITA LIQUIDA DE VENDAS",
    ),
    "custo_servico_vendido": (
        "CUSTO DO SERVICO PRESTADO (CSV)", "CUSTO DA MERCADORIA/SERVICO VENDIDO",
        "CUSTO DOS SERVICOS PRESTADOS", "CUSTO DOS PRODUTOS VENDIDOS",
        "CUSTO DAS MERCADORIAS VENDIDAS",
    ),
    "despesas_operacionais": ("DESPESAS OPERACIONAIS", "TOTAL DESPESAS OPERACIONAIS"),
    "resultado_operacional": (
        "RESULTADO OPERACIONAL", "RESULTADO OPERACIONAL (EBITDA)", "LUCRO OPERACIONAL",
    ),
    "despesas_financeiras": (
        "DESPESAS FINANCEIRAS", "DESPESAS FINANCEIRAS LIQUIDAS",
        # Resultado não operacional líquido (tarifas/juros − outras receitas): ocupa o
        # lugar das despesas financeiras na fórmula do lucro (conferido pela identidade).
        "RECEITAS / DESPESAS NAO OPERACIONAIS",
    ),
    "ir_csll": ("IR / CSLL", "IRPJ / CSLL", "PROVISAO PARA IR E CSLL"),
    "lucro_liquido": (
        "LUCRO / PREJUIZO LIQUIDO", "LUCRO LIQUIDO", "PREJUIZO LIQUIDO",
        "LUCRO LIQUIDO DO EXERCICIO", "RESULTADO LIQUIDO",
    ),
    "retirada": ("LUCROS DISTRIBUIDOS", "DISTRIBUICAO DE LUCROS"),
}

# Subtotal auxiliar (não vira coluna): IR/CSLL = lucro antes do IR − lucro líquido
SINONIMOS_LUCRO_ANTES_IR: tuple[str, ...] = (
    "LUCRO ANTES DO IR / CSLL", "LUCRO ANTES IR / CSLL", "LUCRO ANTES DOS IMPOSTOS",
    "RESULTADO ANTES DO IR / CSLL",
)

ROTULO_CAMPO: dict[str, str] = {
    "receita_bruta": "Receita bruta",
    "impostos": "Impostos",
    "devolucoes": "Devoluções",
    "receita_liquida": "Receita líquida",
    "custo_servico_vendido": "Custo do serviço",
    "despesas_operacionais": "Despesas operacionais",
    "resultado_operacional": "Resultado operacional",
    "despesas_financeiras": "Despesas financeiras",
    "ir_csll": "IR/CSLL",
    "lucro_liquido": "Lucro líquido",
    "retirada": "Retirada",
}

ANCORAS: dict[str, str] = {
    sinonimo: campo for campo, sinonimos in SINONIMOS.items() for sinonimo in sinonimos
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
# JAN/26, FEV/2026 ... (matriz consolidada multi-mês)
_TOKEN_MES = re.compile(r"\b([A-Z]{3})/(\d{4}|\d{2})\b")
_MES_EXT = r"(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)"
# Mês do DRE mensal, em qualquer linha: JULHO/2026, DEZEMBRO/25, JULHO-2026, JULHO DE 2026, JULHO 2026
_PADROES_MES_EXTENSO = (
    re.compile(rf"\b{_MES_EXT}\s*(?:/|-|\bDE\b)\s*(\d{{4}}|\d{{2}})\b"),
    re.compile(rf"\b{_MES_EXT}\s+(\d{{4}})\b"),
)
# Só em linha de cabeçalho (DRE/DEMONSTRATIVO), por serem ambíguas no corpo: JAN/2026, 07/2026
_PADRAO_MES_ABREV = re.compile(r"\b(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s*[/-]\s*(\d{4}|\d{2})\b")
_PADRAO_MES_NUMERICO = re.compile(r"\b(0[1-9]|1[0-2])\s*/\s*(\d{4})\b")
_CABECALHO_DRE = re.compile(r"\b(DRE|DEMONSTRATIVO)\b")
# Linha analítica: começa com código de conta, ou "C|D <conta> 100% ..." no layout gerencial
_INICIA_COM_CODIGO = re.compile(r"^\s*(?:\d|[CD]\s+\S+\s+\d{1,3}%\s)")
# Valor BR sem "R$" (layout gerencial); o lookahead descarta a coluna de %
_TOKEN_VALOR_SEM_RS = re.compile(r"(?<![\d,.])(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})(?![\d%])")



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


def _chave(rotulo: str) -> str:
    """Chave de comparação de rótulos: normalizado e sem espaços em volta de '/'."""
    return re.sub(r"\s*/\s*", "/", _normalizar(rotulo))


_ANCORAS_CHAVE: dict[str, str] = {_chave(k): v for k, v in ANCORAS.items()}
_CHAVES_LUCRO_ANTES_IR: set[str] = {_chave(s) for s in SINONIMOS_LUCRO_ANTES_IR}


def _coluna_da_ancora(rotulo: str) -> Optional[str]:
    return _ANCORAS_CHAVE.get(_chave(rotulo))


def _ano(bruto: str) -> int:
    ano = int(bruto)
    return ano + 2000 if ano < 100 else ano


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
            for abrev, ano in achados:
                mes = MESES_ABREV.get(abrev)
                if mes is None:
                    continue
                meses.append(date(_ano(ano), mes, 1))
            if meses:
                return meses
    return []


def _extrair_mes_extenso(linhas: list[str]) -> Optional[date]:
    """Localiza o mês do DRE mensal (ex.: 'DRE CLINICA JULHO/2026').

    Prioriza as linhas de cabeçalho (DRE/DEMONSTRATIVO); formatos ambíguos
    (abreviado, numérico) só valem no cabeçalho.
    """
    normalizadas = [_normalizar(linha) for linha in linhas]
    cabecalhos = [linha for linha in normalizadas if _CABECALHO_DRE.search(linha)]
    for grupo in (cabecalhos, normalizadas):
        for linha in grupo:
            for padrao in _PADROES_MES_EXTENSO:
                m = padrao.search(linha)
                if m:
                    return date(_ano(m.group(2)), MESES_EXTENSO[m.group(1)], 1)
    for linha in cabecalhos:
        m = _PADRAO_MES_ABREV.search(linha)
        if m:
            return date(_ano(m.group(2)), MESES_ABREV[m.group(1)], 1)
        m = _PADRAO_MES_NUMERICO.search(linha)
        if m:
            return date(_ano(m.group(2)), int(m.group(1)), 1)
    return None


def _extrair_unidade(linhas: list[str]) -> Optional[str]:
    """Primeiro texto não vazio antes do cabeçalho ('DEMONSTRATIVO...' ou 'DRE ...').

    Apenas informativo (rastreabilidade). NUNCA usado para escolher empresa_id
    — a empresa vem do formulário de upload.
    """
    for linha in linhas:
        s = linha.strip()
        if not s:
            continue
        norm = _normalizar(s)
        if norm.startswith("DEMONSTRATIVO") or norm.startswith("DRE "):
            break
        # ignora lixo de planilha exportada ("F", "I 90", "#REF! FALSO")
        if "#" in s or not re.search(r"[A-Z]{4,}", norm):
            continue
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


def _rotulo_e_valor(linha: str) -> Optional[tuple[str, Decimal]]:
    """(rótulo, 1º valor monetário) de uma linha, com ou sem 'R$'. A coluna % é ignorada."""
    idx = linha.find("R$")
    if idx != -1:
        vals = _valores_da_linha(linha[idx:])
        return (linha[:idx], vals[0]) if vals else None
    m = _TOKEN_VALOR_SEM_RS.search(linha)
    if not m:
        return None
    v = _parse_valor(m.group(1))
    return (linha[:m.start()], v) if v is not None else None


def _totais_nao_reconhecidos(linhas: list[str], limite: int = 6) -> list[str]:
    """Linhas de subtotal (sem código de conta) cujo rótulo não está no dicionário —
    candidatas a novo sinônimo. Alimenta a mensagem de erro."""
    candidatos: list[str] = []
    for linha in linhas:
        if _INICIA_COM_CODIGO.match(linha):
            continue
        rv = _rotulo_e_valor(linha)
        if not rv:
            continue
        rotulo = rv[0].strip()
        if not re.search(r"[A-Z]{3,}", _normalizar(rotulo)):
            continue
        if _coluna_da_ancora(rotulo) or _chave(rotulo) in _CHAVES_LUCRO_ANTES_IR:
            continue
        candidatos.append(f"'{rotulo}' = {_fmt_brl(rv[1])}")
        if len(candidatos) >= limite:
            break
    return candidatos


def _motivo_ancoras_faltando(linhas: list[str], encontradas: set[str]) -> str:
    faltando = [ROTULO_CAMPO[c] for c in SINONIMOS if c in ANCORAS_ESSENCIAIS and c not in encontradas]
    motivo = "Não encontrei no arquivo: " + ", ".join(faltando) + "."
    candidatos = _totais_nao_reconhecidos(linhas)
    if candidatos:
        motivo += (
            " Totais do arquivo que ainda não reconheço: " + "; ".join(candidatos)
            + ". Se algum deles corresponde a um desses campos, basta cadastrá-lo como sinônimo."
        )
    else:
        motivo += " Layout diferente — revisar manualmente."
    return motivo


# ---------------------------------------------------------------------------
# Validação por identidade contábil
# ---------------------------------------------------------------------------

def _fmt_brl(v: Decimal) -> str:
    """Formata um Decimal como 'R$ 1.234,56' (padrão brasileiro)."""
    s = f"{v:,.2f}"  # 1,234.56 (padrão US)
    return "R$ " + s.replace(",", "X").replace(".", ",").replace("X", ".")


def _validar_identidades(valores: dict[str, Optional[Decimal]]) -> tuple[list[str], str]:
    """Confere as identidades contábeis. Retorna (divergencias, confiabilidade).

    Nunca ALTERA os valores — apenas verifica e pontua a confiança.
    """
    divergencias: list[str] = []
    checks_possiveis = 0
    checks_ok = 0

    def checar(
        rotulo: str,
        formula: str,
        esperado_parts: list[Optional[Decimal]],
        sinais: list[int],
        alvo: Optional[Decimal],
    ):
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
            dif = alvo - esperado  # type: ignore[operator]
            divergencias.append(
                f"{rotulo}: pela fórmula ({formula}) daria {_fmt_brl(esperado)}, "
                f"mas o PDF traz {_fmt_brl(alvo)} — diferença {_fmt_brl(dif)}."
            )

    checar(
        "Receita líquida",
        "Receita bruta − Impostos − Devoluções",
        [valores.get("receita_bruta"), valores.get("impostos"), valores.get("devolucoes")],
        [1, -1, -1],
        valores.get("receita_liquida"),
    )
    checar(
        "Resultado operacional",
        "Receita líquida − CSV − Despesas operacionais",
        [valores.get("receita_liquida"), valores.get("custo_servico_vendido"), valores.get("despesas_operacionais")],
        [1, -1, -1],
        valores.get("resultado_operacional"),
    )
    checar(
        "Lucro líquido",
        "Resultado operacional − Despesas financeiras − IR/CSLL",
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
        coluna = _coluna_da_ancora(rotulo)
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
        return ResultadoParse(
            ok=False,
            ancoras_encontradas=ancoras_encontradas,
            unidade_texto=_extrair_unidade(linhas),
            motivo=_motivo_ancoras_faltando(linhas, ancoras_encontradas),
        )

    todas_colunas = set(SINONIMOS)
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
# Adaptador: DRE mensal (formato normal — uma DRE por mês, colunas VALOR R$ + %)
# ---------------------------------------------------------------------------

def parsear_mensal(texto: str) -> ResultadoParse:
    """Parseia um DRE de um único mês (ex.: 'DRE CLINICA JULHO/2026' ou
    'DRE - GERENCIAL DEZEMBRO/25').

    Layout clássico: só os subtotais (âncoras) trazem 'R$'. Layout gerencial
    (planilha exportada): nada tem 'R$', linhas analíticas começam com 'C'/'D' +
    conta. Em ambos, cada âncora tem 1 valor + 1 percentual (ignorado).
    """
    linhas = texto.splitlines()
    mes = _extrair_mes_extenso(linhas)
    if mes is None:
        return ResultadoParse(
            ok=False,
            motivo="Mês do DRE não encontrado (layout mensal não reconhecido).",
        )

    todas_colunas = set(SINONIMOS)
    valores: dict[str, Optional[Decimal]] = {col: None for col in todas_colunas}
    lucro_antes_ir: Optional[Decimal] = None
    ancoras_encontradas: set[str] = set()

    for linha in linhas:
        if _INICIA_COM_CODIGO.match(linha):
            continue  # linha analítica (código de conta)
        rv = _rotulo_e_valor(linha)
        if not rv:
            continue
        rotulo, valor = rv
        if _chave(rotulo) in _CHAVES_LUCRO_ANTES_IR:
            lucro_antes_ir = valor
            continue
        coluna = _coluna_da_ancora(rotulo)
        if coluna is None or coluna in ancoras_encontradas:
            continue
        valores[coluna] = valor
        ancoras_encontradas.add(coluna)

    # IR/CSLL raramente tem subtotal próprio no mensal; deriva da diferença de
    # dois subtotais REPORTADOS (não fabrica: é lucro antes do IR − lucro líquido).
    if (
        valores.get("ir_csll") is None
        and lucro_antes_ir is not None
        and valores.get("lucro_liquido") is not None
    ):
        valores["ir_csll"] = lucro_antes_ir - valores["lucro_liquido"]  # type: ignore[operator]

    if not (ANCORAS_ESSENCIAIS & ancoras_encontradas) == ANCORAS_ESSENCIAIS:
        return ResultadoParse(
            ok=False,
            ancoras_encontradas=ancoras_encontradas,
            unidade_texto=_extrair_unidade(linhas),
            motivo=_motivo_ancoras_faltando(linhas, ancoras_encontradas),
        )

    divergencias, confiabilidade = _validar_identidades(valores)
    return ResultadoParse(
        ok=True,
        meses=[LinhaMensal(
            mes_referencia=mes,
            valores=valores,
            divergencias=divergencias,
            confiabilidade=confiabilidade,
        )],
        ancoras_encontradas=ancoras_encontradas,
        unidade_texto=_extrair_unidade(linhas),
    )


# ---------------------------------------------------------------------------
# Detector de formato + despacho
# ---------------------------------------------------------------------------

def parsear(texto: str) -> ResultadoParse:
    """Detecta o formato do DRE e despacha para o parser adequado.

    Prioridade: matriz consolidada multi-mês (melhor fonte) > DRE mensal.
    """
    linhas = texto.splitlines()
    if _extrair_meses(linhas):
        return parsear_consolidado(texto)
    if _extrair_mes_extenso(linhas):
        return parsear_mensal(texto)
    if not texto.strip():
        return ResultadoParse(
            ok=False,
            motivo=(
                "O PDF não tem texto selecionável (provavelmente digitalizado ou imagem). "
                "Exporte o DRE direto do sistema contábil em PDF."
            ),
        )
    inicio = " | ".join(l.strip() for l in linhas if l.strip())[:160]
    return ResultadoParse(
        ok=False,
        motivo=(
            "Mês de referência não encontrado no cabeçalho do DRE (formatos aceitos: "
            "'JULHO/2026', 'DEZEMBRO/25', 'JULHO DE 2026', 'JAN/2026', '07/2026'). "
            f"Início do arquivo: \"{inicio}\""
        ),
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
    """Conveniência: extrai o texto do PDF e detecta o formato automaticamente."""
    return parsear(extrair_texto_pdf(conteudo))
