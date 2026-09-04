"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import { portalApi, clearPortalToken } from "@/lib/portal-api";

const NAV = [
  { href: "/portal", label: "Início" },
  { href: "/portal/dre", label: "Envio de DRE" },
  { href: "/portal/dashboards", label: "Dashboards" },
  { href: "/portal/grupo", label: "Visão do grupo" },
  { href: "/portal/orcamento", label: "Orçamento" },
  { href: "/portal/socios", label: "Sócios & Distribuição" },
  { href: "/portal/agente", label: "Agente IA" },
  { href: "/portal/empresas", label: "Minhas empresas" },
];

export default function PortalShell({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function sair() {
    portalApi.post("/auth/logout").catch(() => {});
    clearPortalToken();
    router.push("/portal/login");
  }

  return (
    <div className="min-h-screen bg-[#f6f7f4]">
      <header className="bg-moss-700 text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="text-moss-100 text-xs font-semibold tracking-widest uppercase">
              holderjob
            </span>
            <h1 className="text-lg font-bold leading-tight">{titulo}</h1>
          </div>
          <button
            onClick={sair}
            className="text-sm rounded-lg border border-white/25 px-3 py-1.5 hover:bg-white/10 transition-colors"
          >
            Sair
          </button>
        </div>
        <nav className="max-w-6xl mx-auto px-6 flex gap-1">
          {NAV.map((item) => {
            const ativo =
              item.href === "/portal"
                ? pathname === "/portal"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 text-sm border-b-2 transition-colors ${
                  ativo
                    ? "border-moss-100 text-white"
                    : "border-transparent text-white/70 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 animate-fade-in">{children}</main>
    </div>
  );
}
