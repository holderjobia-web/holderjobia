"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "@/components/portal-shell";
import { Icone } from "@/components/icons";
import { portalApi } from "@/lib/portal-api";

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
