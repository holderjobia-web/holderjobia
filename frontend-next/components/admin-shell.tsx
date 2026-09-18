"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { Icone } from "@/components/icons";
import { adminApi, clearAdminToken } from "@/lib/admin-api";

const NAV = [
  { href: "/admin", label: "Início" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/empresas", label: "Empresas" },
  { href: "/admin/usuarios", label: "Usuários" },
];

export default function AdminShell({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  function sair() {
    adminApi.post("/admin/auth/logout").catch(() => {});
    clearAdminToken();
    router.push("/admin/login");
  }

  function estaAtivo(href: string): boolean {
    return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen bg-[#f6f7f4]">
      <header className="bg-navy-700 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-moss-300 sm:text-xs">
              holderjob
            </span>
            <h1 className="truncate text-base font-bold leading-tight sm:text-lg">{titulo}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={sair}
              className="rounded-lg border border-white/25 px-3 py-1.5 text-sm transition-colors hover:bg-white/10"
            >
              Sair
            </button>
            <button
              type="button"
              onClick={() => setMenuAberto((v) => !v)}
              aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuAberto}
              className="rounded-lg border border-white/25 p-2 transition-colors hover:bg-white/10 sm:hidden"
            >
              <Icone nome={menuAberto ? "x" : "lista"} className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="mx-auto hidden max-w-6xl gap-1 px-6 sm:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                estaAtivo(item.href)
                  ? "border-moss-300 text-white"
                  : "border-transparent text-white/70 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {menuAberto && (
          <nav className="border-t border-white/15 px-4 pb-3 sm:hidden">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  estaAtivo(item.href)
                    ? "bg-white/15 font-semibold text-white"
                    : "text-white/80 hover:bg-white/10"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl animate-fade-in px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
