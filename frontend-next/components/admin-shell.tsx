"use client";

import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import { LayoutDashboard, Network, Building2, Users } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { adminApi, clearAdminToken } from "@/lib/admin-api";

const NAV = [
  { href: "/admin", label: "Visão geral", icone: LayoutDashboard, grupo: "Administração" },
  { href: "/admin/clientes", label: "Clientes", icone: Network, grupo: "Administração" },
  { href: "/admin/empresas", label: "Empresas", icone: Building2, grupo: "Administração" },
  { href: "/admin/usuarios", label: "Usuários", icone: Users, grupo: "Administração" },
];

export default function AdminShell({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function sair() {
    adminApi.post("/admin/auth/logout").catch(() => {});
    clearAdminToken();
    router.push("/admin/login");
  }

  return <WorkspaceShell titulo={titulo} itens={NAV} inicio="/admin" onSair={sair} administrativo>{children}</WorkspaceShell>;
}
