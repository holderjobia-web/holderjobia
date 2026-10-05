"""Bateria de regressão dos layouts de DRE.

Cada layout aprovado vira um par em scripts/layouts_dre/:
  <nome>.txt   texto como o pdfplumber extrai do PDF
  <nome>.json  {descricao, unidade, total_meses, confiabilidade_todos, esperado: {mes_iso: {campo: "valor"|null}}}

Layout novo: adicionar o par e rodar. Ajuste no parser só é aceito se TODOS passarem.

Uso (a partir de backend/):
    python scripts/testar_layouts_dre.py
"""

from __future__ import annotations

import json
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.dre_parser import _extrair_mes_extenso, parsear  # noqa: E402

PASTA = Path(__file__).resolve().parent / "layouts_dre"


def _checar_layout(txt: Path) -> list[str]:
    spec = json.loads(txt.with_suffix(".json").read_text(encoding="utf-8"))
    r = parsear(txt.read_text(encoding="utf-8"))
    if not r.ok:
        return [f"ok=False -> {r.motivo}"]

    falhas: list[str] = []
    if len(r.meses) != spec["total_meses"]:
        falhas.append(f"esperava {spec['total_meses']} mês(es), veio {len(r.meses)}")
    if "unidade" in spec and r.unidade_texto != spec["unidade"]:
        falhas.append(f"unidade esperada {spec['unidade']!r}, veio {r.unidade_texto!r}")

    por_mes = {m.mes_referencia.isoformat(): m for m in r.meses}
    for mes_iso, campos in spec["esperado"].items():
        mes = por_mes.get(mes_iso)
        if mes is None:
            falhas.append(f"mês {mes_iso} não detectado (veio {sorted(por_mes)})")
            continue
        for campo, valor in campos.items():
            esperado = None if valor is None else Decimal(valor)
            obtido = mes.valores.get(campo)
            if obtido != esperado:
                falhas.append(f"{mes_iso} {campo}: esperado {esperado}, obtido {obtido}")

    nivel = spec.get("confiabilidade_todos")
    if nivel:
        for m in r.meses:
            if m.confiabilidade != nivel:
                falhas.append(f"{m.mes_referencia} confiabilidade {m.confiabilidade} (esperava {nivel}): {m.divergencias}")
    return falhas


def _checks_extras() -> list[str]:
    falhas: list[str] = []

    formatos = {
        "DRE CLINICA JULHO/2026": date(2026, 7, 1),
        "DRE - GERENCIAL DEZEMBRO/25": date(2025, 12, 1),
        "DRE MARÇO DE 2026": date(2026, 3, 1),
        "DEMONSTRATIVO DE RESULTADO - AGOSTO-2026": date(2026, 8, 1),
        "DRE GERENCIAL JAN/2026": date(2026, 1, 1),
        "DRE REFERENTE A 07/2026": date(2026, 7, 1),
        "DRE SEM MES": None,
    }
    for texto, esperado in formatos.items():
        obtido = _extrair_mes_extenso([texto])
        if obtido != esperado:
            falhas.append(f"mês de {texto!r}: esperado {esperado}, obtido {obtido}")

    # Abreviado/numérico fora do cabeçalho não pode virar mês (ambíguo no corpo)
    if _extrair_mes_extenso(["PARCELA 07/2026 PAGA"]) is not None:
        falhas.append("mês numérico fora do cabeçalho não deveria ser aceito")

    # Diagnóstico acionável: rótulo desconhecido aparece como candidato a sinônimo
    texto = (
        "DRE CLINICA JULHO/2026\n"
        "FATURAMENTO TOTAL R$ 100.000,00 100%\n"
        "RECEITA LIQUIDA R$ 95.000,00 95%\n"
        "RESULTADO OPERACIONAL R$ 20.000,00 20%\n"
        "LUCRO / PREJUIZO LIQUIDO R$ 15.000,00 15%\n"
    )
    r = parsear(texto)
    if r.ok:
        falhas.append("layout sem receita bruta reconhecida não deveria ser aceito")
    elif "Receita bruta" not in (r.motivo or "") or "FATURAMENTO TOTAL" not in (r.motivo or ""):
        falhas.append(f"diagnóstico não aponta o campo faltante e o candidato: {r.motivo}")
    return falhas


def main() -> int:
    total_falhas = 0
    for txt in sorted(PASTA.glob("*.txt")):
        falhas = _checar_layout(txt)
        total_falhas += len(falhas)
        print(f"[{'OK' if not falhas else 'FALHOU'}] {txt.stem}")
        for f in falhas:
            print(f"    - {f}")

    falhas = _checks_extras()
    total_falhas += len(falhas)
    print(f"[{'OK' if not falhas else 'FALHOU'}] formatos de mês e diagnóstico")
    for f in falhas:
        print(f"    - {f}")

    print("\nRESULTADO:", "TODOS OS LAYOUTS PASSARAM [OK]" if total_falhas == 0 else f"{total_falhas} FALHA(S)")
    return 0 if total_falhas == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
