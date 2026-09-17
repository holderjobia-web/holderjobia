"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  BarChart,
  Legend,
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

type MesVendas = {
  id?: string;
  mes_referencia: string;
  categoria?: string | null;
  quantidade_vendas: number;
  valor_original?: number | null;
  valor_desconto?: number | null;
  valor_recebido: number | null;
  ticket_medio: number | null;
  breakdown_pagamento?: Record<string, number> | null;
  fonte?: string | null;
  observacao?: string | null;
  por_categoria?: { categoria: string; valor_recebido: number | null; quantidade_vendas: number }[];
};

const CATEGORIAS = [
  { valor: "", label: "Todas as categorias" },
  { valor: "ortodontia", label: "Ortodontia" },
  { valor: "clinico_geral", label: "Clínico geral" },
  { valor: "implante", label: "Implante" },
];

const LABEL_CATEGORIA: Record<string, string> = {
  ortodontia: "Ortodontia",
  clinico_geral: "Clínico geral",
  implante: "Implante",
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

function moeda(v: number | null | undefined): string {
  return v == null ? "—" : brl.format(v);
}

function rotuloMes(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${MESES_ABREV[Number(mes) - 1]}/${ano.slice(2)}`;
}

function soma(meses: MesVendas[], campo: "quantidade_vendas" | "valor_recebido"): number {
  return meses.reduce((acc, m) => acc + (m[campo] ?? 0), 0);
}

export default function VendasDashboardPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [redes, setRedes] = useState<Rede[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [meses, setMeses] = useState<MesVendas[]>([]);
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
      .get<{ meses: MesVendas[] }>("/vendas/consolidado", {
        params: { empresa_id: empresaId, ...(categoria ? { categoria } : {}) },
      })
      .then(({ data }) => setMeses(data.meses))
      .catch(() => setErro("Não foi possível carregar os indicadores."))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregarConsolidado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, categoria]);

  async function excluirLancamento(m: MesVendas) {
    if (!m.id) return;
    const aviso =
      `Excluir o lançamento de ${rotuloMes(m.mes_referencia)}?\n\n` +
      "A linha some dos dashboards e da visão de grupo. Esta ação não tem volta.";
    if (!window.confirm(aviso)) return;
    setErro("");
    setExcluindoId(m.id);
    try {
      await portalApi.delete(`/vendas/consolidado/${m.id}`);
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
        valor_recebido: m.valor_recebido ?? 0,
      })),
    [meses]
  );

  const empresaSelecionada = empresas.find((e) => e.id === empresaId) ?? null;

  const quantidadeTotal = soma(meses, "quantidade_vendas");
  const recebidoTotal = soma(meses, "valor_recebido") || null;
  const ticketMedio =
    recebidoTotal && quantidadeTotal ? recebidoTotal / quantidadeTotal : null;

  return (
    <>
      <SeletorEmpresa
        empresas={empresas}
        redes={redes}
        value={empresaId}
        onChange={setEmpresaId}
        descricao="Escolha a unidade para ver os indicadores de vendas."
      />

      {empresaId && (
        <div className="mt-3 flex items-center gap-2">
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
      )}

      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

      {!empresaId ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/40 px-6 py-14 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-navy-300 shadow-sm">
            <Icone nome="vendas" className="h-6 w-6" />
          </div>
          <p className="font-medium text-navy-700">Selecione uma empresa acima</p>
          <p className="text-sm text-navy-400">
            Os indicadores de vendas aparecem aqui assim que você escolher.
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
            <Icone nome="vendas" className="h-6 w-6" />
          </div>
          <p className="font-medium text-navy-700">
            Ainda não há vendas processadas para {empresaSelecionada?.codigo ?? "esta empresa"}
          </p>
          <p className="text-sm text-navy-400">
            Envie e processe uma planilha de vendas para começar a ver os indicadores.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <KpiCard titulo="Vendas (acum.)" valor={String(quantidadeTotal)} />
            <KpiCard titulo="Valor recebido (acum.)" valor={moeda(recebidoTotal)} />
            <KpiCard titulo="Ticket médio" valor={moeda(ticketMedio)} />
          </div>

          <section className="mt-6 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
            <h2 className="font-semibold text-navy-800 mb-4">
              Evolução mensal — Valor recebido
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

          <section className="mt-6 rounded-xl bg-white border border-navy-100 shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b border-navy-100">
              <h2 className="font-semibold text-navy-800">Detalhamento mensal</h2>
            </div>
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-navy-50 text-navy-700">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Mês</th>
                  {!categoria && <th className="text-left font-semibold px-4 py-3">Categorias</th>}
                  <th className="text-right font-semibold px-4 py-3">Vendas</th>
                  <th className="text-right font-semibold px-4 py-3">Valor recebido</th>
                  <th className="text-right font-semibold px-4 py-3">Ticket médio</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => (
                  <tr key={m.id ?? m.mes_referencia} className="border-t border-navy-100">
                    <td className="px-4 py-3 text-navy-800 font-medium">
                      {rotuloMes(m.mes_referencia)}
                    </td>
                    {!categoria && (
                      <td className="px-4 py-3 text-navy-600 text-xs">
                        {m.por_categoria
                          ?.map((c) => `${LABEL_CATEGORIA[c.categoria] ?? c.categoria}: ${moeda(c.valor_recebido)}`)
                          .join(" · ") ?? "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right text-navy-700">{m.quantidade_vendas}</td>
                    <td className="px-4 py-3 text-right text-navy-800 font-medium">
                      {moeda(m.valor_recebido)}
                    </td>
                    <td className="px-4 py-3 text-right text-navy-700">
                      {moeda(m.ticket_medio)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.id && (
                        <button
                          type="button"
                          onClick={() => excluirLancamento(m)}
                          disabled={excluindoId === m.id}
                          className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {excluindoId === m.id ? "Excluindo..." : "Excluir"}
                        </button>
                      )}
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
