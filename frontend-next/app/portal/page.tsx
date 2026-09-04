"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "@/components/portal-shell";
import { portalApi } from "@/lib/portal-api";

const CARDS = [
  {
    href: "/portal/dre",
    titulo: "Envio de DRE",
    descricao: "Envie seus DREs em PDF e acompanhe o processamento.",
  },
  {
    href: "/portal/empresas",
    titulo: "Minhas empresas",
    descricao: "Veja as unidades cadastradas do seu grupo.",
  },
  {
    href: "/portal/dashboards",
    titulo: "Dashboards",
    descricao: "Indicadores consolidados das suas empresas.",
  },
  {
    href: "/portal/grupo",
    titulo: "Visão do grupo",
    descricao: "Consolidado de todas as unidades e comparativo entre elas.",
  },
  {
    href: "/portal/orcamento",
    titulo: "Orçamento",
    descricao: "Defina metas por mês e compare o previsto com o realizado.",
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

  return (
    <PortalShell titulo="Portal do Cliente">
      <p className="text-navy-700">
        {carregando ? "Carregando..." : `Bem-vindo, ${nome}.`}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => (
          <Link
            key={card.titulo}
            href={card.href}
            className="rounded-xl bg-white border border-navy-100 p-5 shadow-sm transition-colors hover:border-moss-500"
          >
            <h2 className="font-semibold text-navy-800">{card.titulo}</h2>
            <p className="text-sm text-navy-500 mt-1">{card.descricao}</p>
          </Link>
        ))}
      </div>
    </PortalShell>
  );
}
