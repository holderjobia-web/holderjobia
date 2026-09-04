"""Verificação local do parser de DRE contra a amostra real (rede +Sorriso).

Roda a função pura `parsear_consolidado` sobre o texto da matriz consolidada
(unidade SAO MATEUS, jan-jul/2026) e confere que os valores extraídos batem
EXATAMENTE com os do PDF, e que as identidades contábeis fecham.

Uso:
    python -m scripts.testar_parser_dre       (a partir de backend/)
    python scripts/testar_parser_dre.py
"""

from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

# Permite rodar tanto como módulo quanto direto
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.dre_parser import parsear_consolidado  # noqa: E402

# Trecho real da matriz consolidada (páginas 1-3 do PDF do sócio).
TEXTO_AMOSTRA = """\
SAO MATEUS
DEMONSTRATIVO DE RESULTADO DO EXERCICIO JANEIRO/2026 A JULHO/2026
CONTA F/V JAN/26 FEV/26 MAR/26 ABR/26 MAI/26 JUN/26 JUL/26 TOTAL
RECEITAS DE VENDAS R$ 276.589,00 R$ 246.700,00 R$ 261.579,00 R$ 272.305,00 R$ 270.149,90 R$ 247.090,01 R$ 240.729,97 R$ 1.815.142,88
31110001 VENDAS DE CLINICO GERAL V R$ 124.249,00 R$ 104.680,00 R$ 110.000,00 R$ 115.000,00 R$ 112.000,00 R$ 100.000,00 R$ 98.000,00 R$ 763.929,00
IMPOSTOS E CONTRIBUICOES S/ VENDA R$ 3.645,38 R$ 1.636,21 R$ 3.283,11 R$ 3.675,33 R$ 4.947,40 R$ 3.483,87 R$ 12.209,20 R$ 32.880,50
VENDAS CANCELADAS / DEVOLUCOES R$ 1.675,50 R$ 626,67 R$ 5.700,00 R$ 8.400,00 R$ 1.250,00 R$ 5.477,50 R$ 7.227,50 R$ 30.357,17
RECEITA LIQUIDA R$ 271.268,12 R$ 244.437,12 R$ 252.595,89 R$ 260.229,67 R$ 263.952,50 R$ 238.128,64 R$ 221.293,27 R$ 1.751.905,21
CUSTO DO SERVICO PRESTADO (CSV) R$ 58.332,23 R$ 80.149,92 R$ 84.914,43 R$ 101.657,06 R$ 105.201,64 R$ 94.607,00 R$ 68.720,76 R$ 593.583,04
DESPESAS OPERACIONAIS R$ 34.475,94 R$ 33.423,41 R$ 32.036,49 R$ 33.339,26 R$ 31.411,64 R$ 31.371,30 R$ 34.030,25 R$ 230.088,29
RESULTADO OPERACIONAL R$ 178.459,95 R$ 130.863,79 R$ 135.644,97 R$ 125.233,35 R$ 127.339,22 R$ 112.150,34 R$ 118.542,26 R$ 928.233,88
DESPESAS FINANCEIRAS R$ 14.341,56 R$ 10.370,51 R$ 14.160,43 R$ 11.752,54 R$ 10.131,23 R$ 10.419,28 R$ 13.677,94 R$ 84.853,49
IR / CSLL R$ 5.964,15 R$ 3.065,65 R$ 5.370,94 R$ 5.871,10 R$ 7.610,20 R$ 5.711,68 R$ 23.215,14 R$ 56.808,86
LUCRO / PREJUIZO LIQUIDO R$ 158.154,24 R$ 117.427,63 R$ 116.113,60 R$ 107.609,71 R$ 109.597,79 R$ 96.019,38 R$ 81.649,18 R$ 786.571,53
LUCROS DISTRIBUIDOS R$ 120.000,00 R$ 90.000,00 R$ 90.000,00 R$ 100.000,00 R$ 130.000,00 R$ 90.000,00 R$ 90.000,00 R$ 710.000,00
"""

# Valores esperados de JANEIRO/2026 (conferência ponto a ponto).
ESPERADO_JAN = {
    "receita_bruta": Decimal("276589.00"),
    "impostos": Decimal("3645.38"),
    "devolucoes": Decimal("1675.50"),
    "receita_liquida": Decimal("271268.12"),
    "custo_servico_vendido": Decimal("58332.23"),
    "despesas_operacionais": Decimal("34475.94"),
    "resultado_operacional": Decimal("178459.95"),
    "despesas_financeiras": Decimal("14341.56"),
    "ir_csll": Decimal("5964.15"),
    "lucro_liquido": Decimal("158154.24"),
    "retirada": Decimal("120000.00"),
}


def main() -> int:
    r = parsear_consolidado(TEXTO_AMOSTRA)
    falhas: list[str] = []

    if not r.ok:
        print(f"FALHA: parser retornou ok=False -> {r.motivo}")
        return 1

    print(f"Unidade (informativo): {r.unidade_texto}")
    print(f"Âncoras encontradas ({len(r.ancoras_encontradas)}): "
          f"{', '.join(sorted(r.ancoras_encontradas))}")
    print(f"Meses detectados: {[m.mes_referencia.isoformat() for m in r.meses]}\n")

    if len(r.meses) != 7:
        falhas.append(f"esperava 7 meses, veio {len(r.meses)}")

    # Confere JAN valor a valor
    jan = r.meses[0]
    if jan.mes_referencia.isoformat() != "2026-01-01":
        falhas.append(f"primeiro mês deveria ser 2026-01-01, veio {jan.mes_referencia}")
    for coluna, esperado in ESPERADO_JAN.items():
        obtido = jan.valores.get(coluna)
        status = "OK" if obtido == esperado else "DIVERGE"
        if obtido != esperado:
            falhas.append(f"JAN {coluna}: esperado {esperado}, obtido {obtido}")
        print(f"  [{status}] {coluna:<24} = {obtido}")

    print(f"\nConfiabilidade por mês:")
    for m in r.meses:
        marca = "" if not m.divergencias else f"  <-- {m.divergencias}"
        print(f"  {m.mes_referencia.isoformat()}: {m.confiabilidade}{marca}")
        if m.confiabilidade != "alta":
            falhas.append(f"{m.mes_referencia}: confiabilidade {m.confiabilidade} (esperava alta)")

    print()
    if falhas:
        print("RESULTADO: FALHOU")
        for f in falhas:
            print(f"  - {f}")
        return 1
    print("RESULTADO: TODOS OS CHECKS PASSARAM ✓")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
