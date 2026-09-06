"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "@/components/portal-shell";
import { portalApi } from "@/lib/portal-api";

type IconePath = string;

const ICONES: Record<string, IconePath> = {
  dre: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  empresas: "M3 21h18M5 21V7l7-4 7 4v14M9 9h1m-1 4h1m4-4h1m-1 4h1m-6 8v-4h4v4",
  dashboards: "M9 19V6m6 13V10m6 9V3M3 19h18",
  grupo: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-4a4 4 0 100-8 4 4 0 000 8zm7 1a4 4 0 10-4-4",
  orcamento: "M12 8c-1.66 0-3 .9-3 2s1.34 2 3 2 3 .9 3 2-1.34 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2m9-8a9 9 0 11-18 0 9 9 0 0118 0z",
  socios: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-4a4 4 0 100-8 4 4 0 000 8zm7 1a4 4 0 10-4-4M9 20v-2a3 3 0 015.356-1.857",
  agente: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
};

function Icone({ nome }: { nome: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d={ICONES[nome]} />
    </svg>
  );
}

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
        titulo: "Envio de DRE",
        descricao: "Envie seus DREs em PDF e acompanhe o processamento.",
        icone: "dre",
      },
      {
        href: "/portal/dashboards",
        titulo: "Dashboards",
        descricao: "Indicadores consolidados das suas empresas.",
        icone: "dashboards",
      },
      {
        href: "/portal/grupo",
        titulo: "Visão do grupo",
        descricao: "Consolidado de todas as unidades e comparativo entre elas.",
        icone: "grupo",
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

  useEffect(() => {
    portalApi
      .get("/auth/me")
      .then(({ data }) => setNome(data.nome ?? data.email ?? "Cliente"))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  const primeiroNome = nome.split(" ")[0];

  return (
    <PortalShell titulo="Portal do Cliente">
      <section className="rounded-2xl bg-institucional px-6 py-8 text-white shadow-sm sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-moss-100">
          holderjob
        </p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          {carregando ? "Carregando..." : `Olá, ${primeiroNome || "tudo bem"}!`}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/75">
          Acompanhe a saúde financeira do seu grupo, envie DREs e converse com o
          agente de IA — tudo em um só lugar.
        </p>
      </section>

      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo} className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-navy-500">
            {grupo.titulo}
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {grupo.cards.map((card) => (
              <Link
                key={card.titulo}
                href={card.href}
                className="group rounded-xl bg-white border border-navy-100 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-moss-500 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-moss-50 text-moss-700 transition-colors group-hover:bg-moss-600 group-hover:text-white">
                  <Icone nome={card.icone} />
                </div>
                <h3 className="mt-3 font-semibold text-navy-800">{card.titulo}</h3>
                <p className="mt-1 text-sm text-navy-500">{card.descricao}</p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </PortalShell>
  );
}
