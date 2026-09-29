"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Building2, Menu, X, LogOut, ChevronRight, type LucideIcon } from "lucide-react";

type Item = { href: string; label: string; icone: LucideIcon; grupo: string };

export function WorkspaceShell({ titulo, children, itens, inicio, onSair, administrativo = false }: {
  titulo: string; children: ReactNode; itens: Item[]; inicio: string; onSair: () => void; administrativo?: boolean;
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setAberto(false); }, [pathname]);
  useEffect(() => {
    if (!aberto) return;
    function fechar(event: KeyboardEvent) {
      if (event.key === "Escape") { setAberto(false); menuRef.current?.focus(); }
    }
    document.addEventListener("keydown", fechar);
    return () => document.removeEventListener("keydown", fechar);
  }, [aberto]);
  const atual = itens.find((item) => item.href !== inicio && pathname.startsWith(item.href));
  return (
    <div className="min-h-screen bg-navy-50">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3">Ir para o conteúdo</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-navy-100 bg-white lg:flex">
        <Link href={inicio} className="flex h-24 items-center gap-3 px-7 text-navy-900" aria-label="holderjob início">
          <Building2 className="h-7 w-7 text-moss-700" strokeWidth={1.5} />
          <span className="text-xl font-bold">holderjob<span className="text-moss-600">.</span></span>
        </Link>
        <p className="px-7 pb-6 text-xs text-navy-500">{administrativo ? "Administração" : "Gestão de empresas"}</p>
        <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-4">
          {[...new Set(itens.map((item) => item.grupo))].map((grupo) => (
            <div key={grupo} className="mb-7">
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase text-navy-400">{grupo}</p>
              {itens.filter((item) => item.grupo === grupo).map((item) => {
                const ativo = item.href === inicio ? pathname === inicio : pathname.startsWith(item.href);
                const Icon = item.icone;
                return <Link key={item.href} href={item.href} aria-current={ativo ? "page" : undefined}
                  className={`my-1 flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${ativo ? "bg-moss-50 font-semibold text-moss-800" : "text-navy-500 hover:bg-navy-50 hover:text-navy-800"}`}>
                  <Icon size={18} strokeWidth={1.6} className="shrink-0" />{item.label}
                </Link>;
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-navy-100 p-4">
          <button onClick={onSair} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-navy-500 hover:bg-navy-50"><LogOut size={16} />Sair da conta</button>
        </div>
      </aside>
      <div className="min-w-0 lg:pl-60">
        <header className="relative z-20 border-b border-navy-100 bg-white">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-8">
            <div className="flex min-w-0 items-center gap-3 text-xs text-navy-500">
              <button ref={menuRef} type="button" aria-label={aberto ? "Fechar menu" : "Abrir menu"} aria-controls="menu-movel" aria-expanded={aberto} onClick={() => setAberto(!aberto)} className="icon-button lg:hidden">{aberto ? <X size={20} /> : <Menu size={20} />}</button>
              <Link href={inicio} className="font-semibold text-navy-800 lg:hidden">holderjob.</Link>
              <span className="hidden sm:inline">{administrativo ? "Administração" : "Área de gestão"}</span>
              <ChevronRight size={14} className="hidden shrink-0 sm:block" />
              <span className="truncate text-navy-700">{atual?.label ?? "Visão geral"}</span>
            </div>
            <span className="hidden text-xs text-navy-500 sm:inline">{administrativo ? "Acesso administrativo" : "Inteligência financeira"}</span>
          </div>
          {aberto && <nav id="menu-movel" aria-label="Navegação móvel" className="max-h-[70dvh] overflow-auto border-t border-navy-100 px-4 pb-4 lg:hidden">
            {itens.map((item) => { const Icon = item.icone; return <Link key={item.href} href={item.href} onClick={() => setAberto(false)} aria-current={(item.href === inicio ? pathname === inicio : pathname.startsWith(item.href)) ? "page" : undefined} className="flex min-h-11 items-center gap-3 border-b border-navy-50 py-3 text-sm text-navy-700 aria-[current=page]:font-semibold aria-[current=page]:text-moss-700"><Icon size={16} />{item.label}</Link>; })}
            <button onClick={onSair} className="mt-3 flex min-h-11 items-center gap-3 text-sm text-navy-500"><LogOut size={16} />Sair da conta</button>
          </nav>}
        </header>
        <main id="conteudo" className="mx-auto max-w-[1480px] px-4 py-6 sm:px-8 sm:py-8">
          <div className="mb-6 flex items-end justify-between gap-4 border-b border-navy-100 pb-5">
            <h1 className="text-xl font-semibold text-navy-900 sm:text-2xl">{titulo}</h1>
          </div>
          <div className="workspace-content">{children}</div>
        </main>
      </div>
    </div>
  );
}