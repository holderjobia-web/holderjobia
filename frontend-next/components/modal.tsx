"use client";

import { ReactNode, useEffect } from "react";
import { Icone } from "@/components/icons";

/** Modal simples (sem dependência externa) — fecha no Esc, no X ou no fundo. */
export function Modal({
  titulo,
  subtitulo,
  aberto,
  onFechar,
  children,
  rodape,
}: {
  titulo: string;
  subtitulo?: string;
  aberto: boolean;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    // Trava o scroll do fundo enquanto o modal está aberto
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={onFechar}
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/60 p-0 sm:items-center sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:h-[85vh] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-navy-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-navy-800 sm:text-base">
              {titulo}
            </h2>
            {subtitulo && (
              <p className="truncate text-xs text-navy-500">{subtitulo}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="shrink-0 rounded-lg border border-navy-100 p-1.5 text-navy-500 transition-colors hover:bg-navy-50 hover:text-navy-800"
          >
            <Icone nome="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-navy-50/30">{children}</div>

        {rodape && (
          <div className="border-t border-navy-100 px-4 py-3 sm:px-5">{rodape}</div>
        )}
      </div>
    </div>
  );
}
