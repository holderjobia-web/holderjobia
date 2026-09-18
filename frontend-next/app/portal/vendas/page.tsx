"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { portalApi } from "@/lib/portal-api";

type MesGrupo = {
  mes_referencia: string;
  quantidade_vendas: number;
  valor_recebido: number | null;
  ticket_medio: number | null;
  unidades: number;
};

type EmpresaGrupo = {
  empresa_id: string;
  codigo: string | null;
  nome: string | null;
  meses: number;
  quantidade_vendas: number;
  valor_recebido: number | null;
  ticket_medio: number | null;
};

type RedeOpcao = {
  id: string | null;
  nome: string;
  unidades: number;
};

type RespostaGrupo = {
  rede_selecionada: string | null;
  categoria_selecionada: string | null;
  redes: RedeOpcao[];
  total_unidades: number;
  unidades_com_dados: number;
  meses: MesGrupo[];
  empresas: EmpresaGrupo[];
};

const CATEGORIAS = [
  { valor: "", label: "Todas as categorias" },
  { valor: "ortodontia", label: "Ortodontia" },
  { valor: "clinico_geral", label: "Clínico geral" },
  { valor: "implante", label: "Implante" },
  { valor: "endodontia", label: "Endodontia" },
  { valor: "radiologia", label: "Radiologia" },
  { valor: "nao_identificado", label: "Não identificado" },
];

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

function rotuloMes(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${MESES_ABREV[Number(mes) - 1]}/${ano.slice(2)}`;
}

function soma(itens: MesGrupo[], campo: "quantidade_vendas" | "valor_recebido"): number {
  return itens.reduce((acc, m) => acc + (m[campo] ?? 0), 0);
}

export default function VendasGrupoPage() {
  const [dados, setDados] = useState<RespostaGrupo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [redeId, setRedeId] = useState("");
  const [categoria, setCategoria] = useState("");

  useEffect(() => {
    setCarregando(true);
    setErro("");
    portalApi
      .get<RespostaGrupo>("/vendas/grupo", {
        params: {
          ...(redeId ? { rede_id: redeId } : {}),
          ...(categoria ? { categoria } : {}),
        },
      })
      .then(({ data }) => setDados(data))
      .catch(() => setErro("Não foi possível carregar a visão do grupo."))
      .finally(() => setCarregando(false));
  }, [redeId, categoria]);

  const redes = dados?.redes ?? [];
  const meses = dados?.meses ?? [];
  const empresas = dados?.empresas ?? [];

  const dadosGrafico = useMemo(
    () =>
      meses.map((m) => ({
        mes: rotuloMes(m.mes_referencia),
        valor_recebido: m.valor_recebido ?? 0,
      })),
    [meses]
  );

  const dadosEmpresas = useMemo(
    () =>
      empresas.map((e) => ({
        nome: e.codigo || e.nome || "—",
        valor_recebido: e.valor_recebido ?? 0,
      })),
    [empresas]
  );

  const quantidadeTotal = soma(meses, "quantidade_vendas");
  const recebidoTotal = soma(meses, "valor_recebido") || null;
  const ticketMedio =
    recebidoTotal && quantidadeTotal ? recebidoTotal / quantidadeTotal : null;

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {redes.length > 0 && (
          <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-navy-700">Categoria:</label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {carregando ? (
        <p className="mt-6 text-navy-500">Carregando...</p>
      ) : erro ? (
        <p className="mt-6 text-red-600">{erro}</p>
      ) : meses.length === 0 ? (
        <p className="mt-6 text-navy-500">
          Ainda não há vendas processadas em nenhuma unidade do grupo.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-navy-500">
            Consolidado de {dados?.unidades_com_dados ?? 0} de{" "}
            {dados?.total_unidades ?? 0} unidade(s) com dados no período.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <KpiCard titulo="Vendas do grupo (acum.)" valor={String(quantidadeTotal)} />
            <KpiCard titulo="Valor recebido do grupo (acum.)" valor={moeda(recebidoTotal)} />
            <KpiCard titulo="Ticket médio do grupo" valor={moeda(ticketMedio)} />
          </div>

          <section className="mt-6 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
            <h2 className="font-semibold text-navy-800 mb-4">
              Evolução mensal do grupo — Valor recebido
            </h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosGrafico}>
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
                    dataKey="valor_recebido"
                    name="Valor recebido"
                    fill="#4d7c5f"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-6 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
            <h2 className="font-semibold text-navy-800 mb-4">
              Comparativo entre unidades — Valor recebido (acum.)
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
                    dataKey="valor_recebido"
                    name="Valor recebido"
                    fill="#4d7c5f"
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
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-navy-50 text-navy-700">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Unidade</th>
                  <th className="text-right font-semibold px-4 py-3">Meses</th>
                  <th className="text-right font-semibold px-4 py-3">Vendas</th>
                  <th className="text-right font-semibold px-4 py-3">Valor recebido</th>
                  <th className="text-right font-semibold px-4 py-3">Ticket médio</th>
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
                    <td className="px-4 py-3 text-right text-navy-700">{e.quantidade_vendas}</td>
                    <td className="px-4 py-3 text-right text-navy-800 font-medium">
                      {moeda(e.valor_recebido)}
                    </td>
                    <td className="px-4 py-3 text-right text-navy-700">
                      {moeda(e.ticket_medio)}
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
