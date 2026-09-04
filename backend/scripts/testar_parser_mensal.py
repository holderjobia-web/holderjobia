"""Verificação local do parser MENSAL contra a amostra real (VALINHOS jul/2026).

Formato normal: uma DRE por mês, colunas VALOR (R$) + %. Só os subtotais
(âncoras) trazem 'R$'. Testa a extração e mostra a validação por identidade.

Uso:
    python scripts/testar_parser_mensal.py     (a partir de backend/)
"""

from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.dre_parser import parsear, parsear_mensal  # noqa: E402

# Trecho real do DRE mensal (unidade VALINHOS, julho/2026) — só as linhas
# relevantes (âncoras + algumas analíticas para checar que são ignoradas).
TEXTO_AMOSTRA = """\
VALINHOS
DRE CLINICA JULHO/2026
CONTA F/V VALOR (R$) %
31110001 VENDAS DE CLINICO GERAL 155.820,00 75,14%
31110004 VENDAS DE IMPLANTODONTIA 42.100,00 20,30%
RECEITAS DE VENDAS R$ 208.585,00 100,59%
31210004 V PIS / COFINS 19,52 0,01%
IMPOSTOS E CONTRIBUIÇÕES S/ VENDA R$ 19,52 0,01%
31220001 V DEVOLUCOES 1.200,00 0,58%
VENDAS CANCELADAS / DEVOLUÇÕES R$ 1.200,00 0,58%
RECEITA LIQUIDA R$ 207.365,48 100,00%
41140003 V MATERIAL DE IMPLANTE (COMPONENTES) 5.854,58 2,82%
CUSTO DO SERVIÇO PRESTADO (CSV) R$ 80.374,59 38,76%
LUCRO BRUTO / MARGEM BRUTA R$ 126.990,89 61,24%
DESPESAS OPERACIONAIS R$ 43.376,42 20,92%
RESULTADO OPERACIONAL R$ 83.614,47 40,32%
DESPESAS FINANCEIRAS R$ 9.781,25 4,72%
LUCRO ANTES DO IR / CSLL R$ 75.833,22 36,57%
LUCRO / PREJUIZO LIQUIDO R$ 75.833,22 36,57%
412090001 RETIRADA DE LUCROS 60.000,00 79,12%
LUCROS DISTRIBUIDOS R$ 60.000,00 79,12%
"""

ESPERADO = {
    "receita_bruta": Decimal("208585.00"),
    "impostos": Decimal("19.52"),
    "devolucoes": Decimal("1200.00"),
    "receita_liquida": Decimal("207365.48"),
    "custo_servico_vendido": Decimal("80374.59"),
    "despesas_operacionais": Decimal("43376.42"),
    "resultado_operacional": Decimal("83614.47"),
    "despesas_financeiras": Decimal("9781.25"),
    "lucro_liquido": Decimal("75833.22"),
    "retirada": Decimal("60000.00"),
    "ir_csll": Decimal("0.00"),  # derivado: lucro_antes_ir - lucro_liquido
}


def main() -> int:
    # também confirma que o dispatcher escolhe o parser mensal
    r = parsear(TEXTO_AMOSTRA)
    if not r.ok:
        print(f"FALHA: parser retornou ok=False -> {r.motivo}")
        return 1

    falhas: list[str] = []
    print(f"Unidade (informativo): {r.unidade_texto}")
    print(f"Meses detectados: {[m.mes_referencia.isoformat() for m in r.meses]}")
    print(f"Âncoras: {len(r.ancoras_encontradas)}\n")

    if len(r.meses) != 1:
        falhas.append(f"esperava 1 mês, veio {len(r.meses)}")
    mes = r.meses[0]
    if mes.mes_referencia.isoformat() != "2026-07-01":
        falhas.append(f"mês deveria ser 2026-07-01, veio {mes.mes_referencia}")

    for coluna, esperado in ESPERADO.items():
        obtido = mes.valores.get(coluna)
        status = "OK" if obtido == esperado else "DIVERGE"
        if obtido != esperado:
            falhas.append(f"{coluna}: esperado {esperado}, obtido {obtido}")
        print(f"  [{status}] {coluna:<24} = {obtido}")

    print(f"\nConfiabilidade: {mes.confiabilidade}")
    if mes.divergencias:
        print("Divergências detectadas pela validação por identidade:")
        for d in mes.divergencias:
            print(f"  - {d}")

    print()
    if falhas:
        print("RESULTADO EXTRAÇÃO: FALHOU")
        for f in falhas:
            print(f"  - {f}")
        return 1
    print("RESULTADO EXTRAÇÃO: TODOS OS VALORES BATEM [OK]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
