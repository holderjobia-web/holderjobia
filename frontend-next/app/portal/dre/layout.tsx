"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import PortalShell from "@/components/portal-shell";

const ABAS = [
  { href: "/portal/dre", label: "Visão do grupo" },
  { href: "/portal/dre/dashboards", label: "Dashboards por unidade" },
  { href: "/portal/dre/envio", label: "Envio de DRE" },
];

export default function DreLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <PortalShell titulo="DRE & Dashboards">
      <div className="mb-6 flex flex-wrap gap-1 border-b border-navy-100">
        {ABAS.map((aba) => {
          const ativo =
            aba.href === "/portal/dre"
              ? pathname === "/portal/dre"
              : pathname.startsWith(aba.href);
          return (
            <Link
              key={aba.href}
              href={aba.href}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                ativo
                  ? "border-moss-600 text-moss-700"
                  : "border-transparent text-navy-500 hover:text-navy-700"
              }`}
            >
              {aba.label}
            </Link>
          );
        })}
      </div>
      {children}
    </PortalShell>
  );
}
