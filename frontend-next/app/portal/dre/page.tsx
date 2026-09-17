"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { portalApi } from "@/lib/portal-api";

type MesGrupo = {
  mes_referencia: string;
  receita_liquida: number | null;
  resultado_operacional: number | null;
  lucro_liquido: number | null;
  retirada: number | null;
  margem_liquida: number | null;
  unidades: number;
};

type EmpresaGrupo = {
  empresa_id: string;
  codigo: string | null;
  nome: string | null;
  meses: number;
  receita_liquida: number | null;
  lucro_liquido: number | null;
  retirada: number | null;
  margem_liquida: number | null;
};

type RedeOpcao = {
  id: string | null;
  nome: string;
  unidades: number;
};

type RespostaGrupo = {
  rede_selecionada: string | null;
  redes: RedeOpcao[];
  total_unidades: number;
  unidades_com_dados: number;
  meses: MesGrupo[];
  empresas: EmpresaGrupo[];
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

function soma(itens: MesGrupo[], campo: keyof MesGrupo): number | null {
  const valores = itens
    .map((m) => m[campo])
    .filter((v): v is number => typeof v === "number");
  return valores.length ? valores.reduce((a, b) => a + b, 0) : null;
}

export default function VisaoGrupoPage() {
  const [dados, setDados] = useState<RespostaGrupo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [redeId, setRedeId] = useState("");

  useEffect(() => {
    setCarregando(true);
    setErro("");
    portalApi
      .get<RespostaGrupo>("/dre/grupo", {
        params: redeId ? { rede_id: redeId } : undefined,
      })
      .then(({ data }) => setDados(data))
      .catch(() => setErro("Não foi possível carregar a visão do grupo."))
      .finally(() => setCarregando(false));
  }, [redeId]);

  const redes = dados?.redes ?? [];
  const meses = dados?.meses ?? [];
  const empresas = dados?.empresas ?? [];

  const dadosGrafico = useMemo(
    () =>
      meses.map((m) => ({
        mes: rotuloMes(m.mes_referencia),
        receita_liquida: m.receita_liquida ?? 0,
        lucro_liquido: m.lucro_liquido ?? 0,
      })),
    [meses]
  );

  const dadosEmpresas = useMemo(
    () =>
      empresas.map((e) => ({
        nome: e.codigo || e.nome || "—",
        receita_liquida: e.receita_liquida ?? 0,
        lucro_liquido: e.lucro_liquido ?? 0,
      })),
    [empresas]
  );

  const receitaTotal = soma(meses, "receita_liquida");
  const lucroTotal = soma(meses, "lucro_liquido");
  const retiradaTotal = soma(meses, "retirada");
  const margemAcumulada =
    receitaTotal && lucroTotal != null && receitaTotal !== 0
      ? (lucroTotal / receitaTotal) * 100
      : null;

  return (
    <>
      {redes.length > 0 && (
        <div className="mt-2 flex items-center gap-3">
          <label className="text-sm font-medium text-navy-700">Rede:</label>
          <select
            value={redeId}
            onChange={(e) => setRedeId(e.target.value)}
            className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
          >
            <option value="">Todos os negócios</option>
            {redes
              .filter((r) => r.id != null)
              .map((r) => (
                <option key={r.id} value={r.id as string}>
                  {r.nome} ({r.unidades})
                </option>
              ))}
          </select>
        </div>
      )}
      {carregando ? (
        <p className="mt-6 text-navy-500">Carregando...</p>
      ) : erro ? (
        <p className="mt-6 text-red-600">{erro}</p>
      ) : meses.length === 0 ? (
        <p className="mt-6 text-navy-500">
          Ainda não há DRE processado em nenhuma unidade do grupo.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-navy-500">
            Consolidado de {dados?.unidades_com_dados ?? 0} de{" "}
            {dados?.total_unidades ?? 0} unidade(s) com dados no período.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard titulo="Receita líquida do grupo (acum.)" valor={moeda(receitaTotal)} />
            <KpiCard titulo="Lucro líquido do grupo (acum.)" valor={moeda(lucroTotal)} />
            <KpiCard titulo="Margem líquida (acum.)" valor={percentual(margemAcumulada)} />
            <KpiCard titulo="Retirada do grupo (acum.)" valor={moeda(retiradaTotal)} />
          </div>

          <section className="mt-6 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
            <h2 className="font-semibold text-navy-800 mb-4">
              Evolução mensal do grupo — Receita líquida × Lucro líquido
            </h2>
            <div className="h-80">
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

          <section className="mt-6 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
            <h2 className="font-semibold text-navy-800 mb-4">
              Comparativo entre unidades — Receita líquida (acum.)
            </h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosEmpresas}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
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
                  <Bar
                    dataKey="lucro_liquido"
                    name="Lucro líquido"
                    fill="#1e3a5f"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-6 rounded-xl bg-white border border-navy-100 shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b border-navy-100">
              <h2 className="font-semibold text-navy-800">Ranking de unidades</h2>
            </div>
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-navy-50 text-navy-700">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Unidade</th>
                  <th className="text-right font-semibold px-4 py-3">Meses</th>
                  <th className="text-right font-semibold px-4 py-3">Receita líq.</th>
                  <th className="text-right font-semibold px-4 py-3">Lucro líq.</th>
                  <th className="text-right font-semibold px-4 py-3">Retirada</th>
                  <th className="text-right font-semibold px-4 py-3">Margem líq.</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => (
                  <tr key={e.empresa_id} className="border-t border-navy-100">
                    <td className="px-4 py-3 text-navy-800 font-medium">
                      {e.codigo ? `${e.codigo} — ` : ""}
                      {e.nome ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-navy-700">{e.meses}</td>
                    <td className="px-4 py-3 text-right text-navy-700">
                      {moeda(e.receita_liquida)}
                    </td>
                    <td className="px-4 py-3 text-right text-navy-800 font-medium">
                      {moeda(e.lucro_liquido)}
                    </td>
                    <td className="px-4 py-3 text-right text-navy-700">
                      {moeda(e.retirada)}
                    </td>
                    <td className="px-4 py-3 text-right text-navy-700">
                      {percentual(e.margem_liquida)}
                    </td>
                  </tr>
                ))}
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
