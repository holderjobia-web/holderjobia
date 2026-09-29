"use client";

import { ReactNode, useId, useState } from "react";
import { Building2, Eye, EyeOff, LockKeyhole } from "lucide-react";

export function AuthFrame({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: ReactNode }) {
  return <main className="auth-surface flex min-h-dvh flex-col bg-navy-50">
    <header className="flex h-20 shrink-0 items-center justify-between border-b border-navy-100 bg-white px-6 sm:px-12">
      <div className="flex items-center gap-3"><Building2 size={28} className="text-moss-700" strokeWidth={1.5} /><span className="text-xl font-bold text-navy-900">holderjob<span className="text-moss-600">.</span></span></div>
      <span className="hidden text-xs text-navy-500 sm:block">Inteligência financeira</span>
    </header>
    <div className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-[420px] border-t-2 border-moss-700 bg-white px-6 py-8 sm:px-9 sm:py-10">
        <p className="mb-3 text-xs font-semibold text-moss-700">Gestão de empresas</p>
        <h1 className="text-2xl font-semibold text-navy-900">{titulo}</h1>
        <p className="mb-8 mt-2 text-sm leading-relaxed text-navy-500">{subtitulo}</p>
        {children}
      </div>
    </div>
    <footer className="flex items-center justify-center gap-2 px-5 pb-7 text-xs text-navy-500"><LockKeyhole size={13} />Acesso restrito</footer>
  </main>;
}

export function PasswordField({ label = "Senha", value, onChange, autoComplete = "current-password" }: {
  label?: string; value: string; onChange: (value: string) => void; autoComplete?: string;
}) {
  const [visivel, setVisivel] = useState(false);
  const id = useId();
  return <div>
    <label htmlFor={id} className="mb-2 block text-sm font-medium text-navy-700">{label}</label>
    <div className="relative">
      <input id={id} type={visivel ? "text" : "password"} required autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} className="field pr-12" />
      <button type="button" title={visivel ? "Ocultar senha" : "Mostrar senha"} aria-label={visivel ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visivel} onClick={() => setVisivel(!visivel)} className="icon-button absolute right-1 top-1/2 -translate-y-1/2">{visivel ? <EyeOff size={17} /> : <Eye size={17} />}</button>
    </div>
  </div>;
}