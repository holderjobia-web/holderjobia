"""Teste local do parser de vendas contra as amostras reais (docs/exemplo_vendas).

Rodar a partir de backend/:  python scripts/testar_parser_vendas.py
Não toca no banco — só lê os arquivos e imprime a agregação por mês/categoria.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.vendas_parser import LABEL_CATEGORIA, parsear_planilha  # noqa: E402

AMOSTRAS = Path(__file__).resolve().parent.parent.parent / "docs" / "exemplo_vendas"


def brl(v) -> str:
    if v is None:
        return "nao consta"
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def main() -> int:
    arquivos = sorted(AMOSTRAS.glob("*.xlsx"))
    if not arquivos:
        print(f"[ERRO] nenhuma amostra em {AMOSTRAS}")
        return 1

    for caminho in arquivos:
        print("=" * 100)
        print(caminho.name)
        resultado = parsear_planilha(caminho.read_bytes())
        if not resultado.ok:
            print(f"  [FALHOU] {resultado.motivo}")
            continue

        print(
            f"  linhas validas={resultado.linhas_validas} "
            f"ignoradas={resultado.linhas_invalidas} "
            f"grupos(mes x categoria)={len(resultado.meses)}"
        )
        if resultado.nao_identificados:
            print(f"  [ATENCAO] dentistas sem procedimento reconhecido: {resultado.nao_identificados}")

        total_qtd = 0
        for m in resultado.meses:
            total_qtd += m.quantidade_vendas
            print(
                f"    {m.mes_referencia.isoformat()}  {LABEL_CATEGORIA[m.categoria]:<18} "
                f"qtd={m.quantidade_vendas:<5} recebido={brl(m.valor_recebido)}"
            )
        print(f"  TOTAL de vendas agregadas: {total_qtd}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
