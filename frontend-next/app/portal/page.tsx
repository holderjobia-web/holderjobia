"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "@/components/portal-shell";
import { Icone } from "@/components/icons";
import { portalApi } from "@/lib/portal-api";
import { ArrowUpRight, Upload } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type MesResumo = { mes_referencia: string; receita_liquida: number | null; lucro_liquido: number | null; margem_liquida: number | null; unidades: number };
type Resumo = { total_unidades: number; meses: MesResumo[] };
const moeda = (valor: number | null | undefined) => valor == null ? "Não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor);
const rotuloMes = (mes: string) => new Date(`${mes.slice(0, 7)}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

type Grupo = {
  titulo: string;
  cards: {
    href: string;
    titulo: string;
    descricao: string;
    icone: string;
  }[];
};

const GRUPOS: Grupo[] = [
  {
    titulo: "Financeiro",
    cards: [
      {
        href: "/portal/dre",
        titulo: "DRE & Dashboards",
        descricao: "Envie DREs, acompanhe indicadores por unidade e a visão consolidada do grupo.",
        icone: "dre",
      },
      {
        href: "/portal/vendas",
        titulo: "Vendas",
        descricao: "Envie planilhas de vendas por unidade e acompanhe o dashboard separado da DRE.",
        icone: "vendas",
      },
      {
        href: "/portal/orcamento",
        titulo: "Orçamento",
        descricao: "Defina metas por mês e compare o previsto com o realizado.",
        icone: "orcamento",
      },
    ],
  },
  {
    titulo: "Gestão",
    cards: [
      {
        href: "/portal/empresas",
        titulo: "Minhas empresas",
        descricao: "Cadastre e gerencie as unidades e redes do seu grupo.",
        icone: "empresas",
      },
      {
        href: "/portal/socios",
        titulo: "Sócios & Distribuição",
        descricao: "Participações societárias e distribuição de lucros.",
        icone: "socios",
      },
      {
        href: "/portal/acervos",
        titulo: "Acervos",
        descricao: "Contratos, plantas, fotos e documentos organizados por unidade.",
        icone: "acervos",
      },
    ],
  },
  {
    titulo: "Inteligência",
    cards: [
      {
        href: "/portal/agente",
        titulo: "Agente IA",
        descricao: "Converse com o agente sobre a saúde financeira das suas empresas.",
        icone: "agente",
      },
    ],
  },
];

export default function PortalDashboard() {
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erroResumo, setErroResumo] = useState("");
  const [mes, setMes] = useState("");

  useEffect(() => {
    portalApi
      .get("/auth/me")
      .then(({ data }) => setNome(data.nome ?? data.email ?? "Cliente"))
      .catch(() => {});
    portalApi.get<Resumo>("/dre/grupo")
      .then(({ data }) => {
        const ordenados = [...data.meses].sort((anterior, proximo) => anterior.mes_referencia.localeCompare(proximo.mes_referencia));
        setResumo({ ...data, meses: ordenados });
        setMes(ordenados[ordenados.length - 1]?.mes_referencia ?? "");
      })
      .catch(() => setErroResumo("Não foi possível carregar os indicadores."))
      .finally(() => setCarregando(false));
  }, []);

  const primeiroNome = nome.split(" ")[0];
  const atual = resumo?.meses.find((item) => item.mes_referencia === mes);
  const indicadores = [
    { titulo: "Receita líquida", valor: moeda(atual?.receita_liquida) },
    { titulo: "Lucro líquido", valor: moeda(atual?.lucro_liquido) },
    { titulo: "Margem líquida", valor: atual?.margem_liquida == null ? "Não informado" : `${atual.margem_liquida.toFixed(1).replace(".", ",")}%` },
    { titulo: "Unidades no período", valor: atual ? `${atual.unidades} de ${resumo?.total_unidades}` : "Não informado" },
  ];

  return (
    <PortalShell titulo="Visão geral">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-navy-500">{primeiroNome ? `${primeiroNome}, seu resumo financeiro.` : "Resumo financeiro do grupo"}</p>
        <Link href="/portal/dre/envio" className="button-secondary"><Upload size={16} />Enviar DRE</Link>
      </div>
      <section className="border-y border-navy-100 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-5 py-4">
          <h2 className="text-sm font-semibold">Resultado do grupo</h2>
          <label className="flex items-center gap-3 text-xs text-navy-500">Competência
            <select value={mes} onChange={(event) => setMes(event.target.value)} disabled={carregando || !resumo?.meses.length} className="rounded border border-navy-200 bg-white px-2 py-1.5 text-navy-800">
              {!resumo?.meses.length && <option value="">Sem dados</option>}
              {resumo?.meses.map((item) => <option key={item.mes_referencia} value={item.mes_referencia}>{rotuloMes(item.mes_referencia)}</option>)}
            </select>
          </label>
        </div>
        {erroResumo ? <p role="alert" className="p-5 text-sm text-red-600">{erroResumo}</p> : <dl className="grid grid-cols-1 divide-y divide-navy-100 sm:grid-cols-2 xl:grid-cols-4 xl:divide-y-0">
          {indicadores.map((indicador) => <div key={indicador.titulo} className="min-w-0 px-5 py-6 xl:border-r xl:border-navy-100 last:xl:border-r-0"><dt className="text-xs text-navy-500">{indicador.titulo}</dt><dd className="mt-3 break-words text-xl font-semibold text-navy-900">{carregando ? "Carregando..." : indicador.valor}</dd></div>)}
        </dl>}
      </section>
      <section className="mt-6 border-y border-navy-100 bg-white px-4 py-5 sm:px-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Evolução financeira</h2><p className="mt-1 text-xs text-navy-500">Últimas seis competências disponíveis</p></div><div className="flex gap-4 text-xs text-navy-500"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 bg-moss-600" />Receita líquida</span><span className="inline-flex items-center gap-2"><span className="h-0.5 w-3 bg-[#ad783a]" />Lucro líquido</span></div></div>
        <div className="h-56 sm:h-64">
          {resumo?.meses.length ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={resumo.meses.slice(-6)} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e4e7e9" /><XAxis dataKey="mes_referencia" tickFormatter={rotuloMes} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#5d6970" }} /><YAxis width={60} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#5d6970" }} tickFormatter={(valor) => new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(valor)} /><Tooltip labelFormatter={(valor) => rotuloMes(String(valor))} formatter={(valor) => moeda(typeof valor === "number" ? valor : null)} contentStyle={{ border: "1px solid #e4e7e9", borderRadius: 4, fontSize: 12 }} /><Bar dataKey="receita_liquida" name="Receita líquida" fill="#398367" maxBarSize={36} radius={[2, 2, 0, 0]} /><Line dataKey="lucro_liquido" name="Lucro líquido" stroke="#ad783a" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} /></ComposedChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-navy-500">{carregando ? "Carregando evolução..." : erroResumo || "Nenhum DRE consolidado disponível."}</div>}
        </div>
        <Link href="/portal/dre" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-moss-700">Ver análise completa<ArrowUpRight size={14} /></Link>
      </section>
      <div className="mt-8 grid gap-8 md:grid-cols-3">
        {GRUPOS.map((grupo) => (
        <div key={grupo.titulo} className="min-w-0">
          <h2 className="mb-3 text-xs font-semibold uppercase text-navy-500">{grupo.titulo}</h2>
          <div className="divide-y divide-navy-100 border-y border-navy-100">
            {grupo.cards.map((card) => (
              <Link
                key={card.titulo}
                href={card.href}
                className="group flex min-h-14 items-center gap-3 py-3 text-sm hover:text-moss-700"
              >
                <Icone nome={card.icone} className="h-4 w-4 shrink-0 text-navy-400" />
                <h3 className="flex-1 font-medium">{card.titulo}</h3>
                <ArrowUpRight size={15} className="shrink-0 text-navy-400" />
              </Link>
            ))}
          </div>
        </div>
        ))}
      </div>
    </PortalShell>
  );
}
