"use client";

import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import { LayoutDashboard, FileChartColumn, ShoppingBag, Target, Users, MessageSquareText, FolderClosed, Building2 } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { portalApi, clearPortalToken } from "@/lib/portal-api";

const NAV = [
  { href: "/portal", label: "Visão geral", icone: LayoutDashboard, grupo: "Acompanhamento" },
  { href: "/portal/dre", label: "DRE & Dashboards", icone: FileChartColumn, grupo: "Acompanhamento" },
  { href: "/portal/vendas", label: "Vendas", icone: ShoppingBag, grupo: "Acompanhamento" },
  { href: "/portal/orcamento", label: "Orçamento", icone: Target, grupo: "Acompanhamento" },
  { href: "/portal/empresas", label: "Empresas", icone: Building2, grupo: "Organização" },
  { href: "/portal/socios", label: "Sócios & Distribuição", icone: Users, grupo: "Organização" },
  { href: "/portal/acervos", label: "Acervos", icone: FolderClosed, grupo: "Organização" },
  { href: "/portal/agente", label: "Agente IA", icone: MessageSquareText, grupo: "Inteligência" },
];

export default function PortalShell({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function sair() {
    portalApi.post("/auth/logout").catch(() => {});
    clearPortalToken();
    router.push("/portal/login");
  }

  return <WorkspaceShell titulo={titulo} itens={NAV} inicio="/portal" onSair={sair}>{children}</WorkspaceShell>;
}
