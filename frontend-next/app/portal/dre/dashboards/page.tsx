"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Icone } from "@/components/icons";
import {
  SeletorEmpresa,
  type EmpresaOpcao as Empresa,
  type RedeOpcao as Rede,
} from "@/components/seletor-empresa";
import { portalApi } from "@/lib/portal-api";

type MesDre = {
  id: string;
  mes_referencia: string;
  receita_bruta: number | null;
  impostos: number | null;
  devolucoes: number | null;
  receita_liquida: number | null;
  custo_servico_vendido: number | null;
  despesas_operacionais: number | null;
  resultado_operacional: number | null;
  despesas_financeiras: number | null;
  ir_csll: number | null;
  lucro_liquido: number | null;
  retirada: number | null;
  margem_liquida: number | null;
  margem_operacional: number | null;
  margem_contribuicao: number | null;
  confiabilidade: string | null;
  fonte: string | null;
  observacao: string | null;
};

const MESES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function moeda(v: number | null): string {
  return v == null ? "—" : brl.format(v);
}

function percentual(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`;
}

function rotuloMes(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${MESES_ABREV[Number(mes) - 1]}/${ano.slice(2)}`;
}

function soma(meses: MesDre[], campo: keyof MesDre): number | null {
  const valores = meses
    .map((m) => m[campo])
    .filter((v): v is number => typeof v === "number");
  return valores.length ? valores.reduce((a, b) => a + b, 0) : null;
}

const CONF_COR: Record<string, string> = {
  alta: "bg-moss-100 text-moss-800",
  media: "bg-amber-100 text-amber-700",
  baixa: "bg-red-100 text-red-700",
  pendente: "bg-navy-100 text-navy-600",
};

export default function DashboardsPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [redes, setRedes] = useState<Rede[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [meses, setMeses] = useState<MesDre[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      portalApi.get<Empresa[]>("/empresas"),
      portalApi.get<Rede[]>("/redes"),
    ])
      .then(([empRes, redesRes]) => {
        setEmpresas(empRes.data);
        setRedes(redesRes.data);
        if (empRes.data.length === 1) setEmpresaId(empRes.data[0].id);
      })
      .catch(() => {});
  }, []);

  function carregarConsolidado() {
    if (!empresaId) {
      setMeses([]);
      return;
    }
    setCarregando(true);
    setErro("");
    portalApi
      .get<{ meses: MesDre[] }>("/dre/consolidado", { params: { empresa_id: empresaId } })
      .then(({ data }) => setMeses(data.meses))
      .catch(() => setErro("Não foi possível carregar os indicadores."))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregarConsolidado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function excluirLancamento(m: MesDre) {
    const aviso =
      `Excluir o lançamento de ${rotuloMes(m.mes_referencia)}?\n\n` +
      "A linha some dos dashboards e da visão de grupo. Esta ação não tem volta.";
    if (!window.confirm(aviso)) return;
    setErro("");
    setExcluindoId(m.id);
    try {
      await portalApi.delete(`/dre/consolidado/${m.id}`);
      carregarConsolidado();
    } catch {
      setErro("Falha ao excluir o lançamento.");
    } finally {
      setExcluindoId(null);
    }
  }

  const dadosGrafico = useMemo(
    () =>
      meses.map((m) => ({
        mes: rotuloMes(m.mes_referencia),
        receita_liquida: m.receita_liquida ?? 0,
        lucro_liquido: m.lucro_liquido ?? 0,
        margem_liquida: m.margem_liquida ?? 0,
      })),
    [meses]
  );

  const empresaSelecionada = empresas.find((e) => e.id === empresaId) ?? null;

  const receitaTotal = soma(meses, "receita_liquida");
  const lucroTotal = soma(meses, "lucro_liquido");
  const retiradaTotal = soma(meses, "retirada");
  const margemAcumulada =
    receitaTotal && lucroTotal != null && receitaTotal !== 0
      ? (lucroTotal / receitaTotal) * 100
      : null;

  return (
    <>
      <SeletorEmpresa
        empresas={empresas}
        redes={redes}
        value={empresaId}
        onChange={setEmpresaId}
        descricao="Escolha a unidade para ver os indicadores."
      />
      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

      {!empresaId ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/40 px-6 py-14 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-navy-300 shadow-sm">
            <Icone nome="dashboards" className="h-6 w-6" />
          </div>
          <p className="font-medium text-navy-700">Selecione uma empresa acima</p>
          <p className="text-sm text-navy-400">
            Os indicadores consolidados aparecem aqui assim que você escolher.
          </p>
        </div>
      ) : carregando ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-navy-100 bg-white px-6 py-14 text-center shadow-sm">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-navy-200 border-t-moss-600" />
          <p className="text-sm text-navy-500">Carregando indicadores...</p>
        </div>
      ) : meses.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/40 px-6 py-14 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-navy-300 shadow-sm">
            <Icone nome="dre" className="h-6 w-6" />
          </div>
          <p className="font-medium text-navy-700">
            Ainda não há DRE processado para {empresaSelecionada?.codigo ?? "esta empresa"}
          </p>
          <p className="text-sm text-navy-400">
            Envie e processe um DRE para começar a ver os indicadores.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard titulo="Receita líquida (acum.)" valor={moeda(receitaTotal)} />
            <KpiCard titulo="Lucro líquido (acum.)" valor={moeda(lucroTotal)} />
            <KpiCard titulo="Margem líquida (acum.)" valor={percentual(margemAcumulada)} />
            <KpiCard titulo="Retirada (acum.)" valor={moeda(retiradaTotal)} />
          </div>

          <section className="mt-6 rounded-xl bg-white border border-navy-100 p-4 shadow-sm sm:p-5">
            <h2 className="font-semibold text-navy-800 mb-4">
              Evolução mensal — Receita líquida × Lucro líquido
            </h2>
            <div className="h-64 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dadosGrafico}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(v) => brl.format(v).replace("R$", "").trim()}
                    tick={{ fontSize: 12 }}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value) =>
                      moeda(typeof value === "number" ? value : Number(value))
                    }
                  />
                  <Legend />
                  <Bar
                    dataKey="receita_liquida"
                    name="Receita líquida"
                    fill="#4d7c5f"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    dataKey="lucro_liquido"
                    name="Lucro líquido"
                    stroke="#1e3a5f"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-6 rounded-xl bg-white border border-navy-100 shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b border-navy-100">
              <h2 className="font-semibold text-navy-800">Detalhamento mensal</h2>
            </div>
            <table className="w-full text-sm min-w-[1040px]">
              <thead className="bg-navy-50 text-navy-700">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Mês</th>
                  <th className="text-right font-semibold px-4 py-3">Receita líq.</th>
                  <th className="text-right font-semibold px-4 py-3">Result. oper.</th>
                  <th className="text-right font-semibold px-4 py-3">Lucro líq.</th>
                  <th className="text-right font-semibold px-4 py-3">Retirada</th>
                  <th className="text-right font-semibold px-4 py-3">Margem líq.</th>
                  <th className="text-left font-semibold px-4 py-3">Confiab.</th>
                  <th className="text-left font-semibold px-4 py-3">Divergência / observação</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => {
                  const conf = m.confiabilidade ?? "pendente";
                  return (
                    <tr key={m.id} className="border-t border-navy-100">
                      <td className="px-4 py-3 text-navy-800 font-medium">
                        {rotuloMes(m.mes_referencia)}
                      </td>
                      <td className="px-4 py-3 text-right text-navy-700">
                        {moeda(m.receita_liquida)}
                      </td>
                      <td className="px-4 py-3 text-right text-navy-700">
                        {moeda(m.resultado_operacional)}
                      </td>
                      <td className="px-4 py-3 text-right text-navy-800 font-medium">
                        {moeda(m.lucro_liquido)}
                      </td>
                      <td className="px-4 py-3 text-right text-navy-700">
                        {moeda(m.retirada)}
                      </td>
                      <td className="px-4 py-3 text-right text-navy-700">
                        {percentual(m.margem_liquida)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            CONF_COR[conf] ?? CONF_COR.pendente
                          }`}
                          title={m.observacao ?? undefined}
                        >
                          {conf}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-navy-600 text-xs max-w-sm">
                        {m.observacao
                          ? m.observacao.split("; ").map((linha, i) => (
                              <p key={i} className="mb-0.5 last:mb-0">
                                {linha}
                              </p>
                            ))
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => excluirLancamento(m)}
                          disabled={excluindoId === m.id}
                          className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {excluindoId === m.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}

function KpiCard({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
      <p className="text-sm text-navy-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-navy-800">{valor}</p>
    </div>
  );
}
