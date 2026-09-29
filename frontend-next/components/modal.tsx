"use client";

import { ReactNode, useEffect, useRef } from "react";
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
  const painelRef = useRef<HTMLDivElement>(null);
  const fecharRef = useRef(onFechar);
  useEffect(() => { fecharRef.current = onFechar; }, [onFechar]);

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    painelRef.current?.focus();
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") fecharRef.current();
      if (e.key === "Tab") {
        const elementos = painelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), iframe');
        const primeiro = elementos?.[0];
        const ultimo = elementos?.[elementos.length - 1];
        if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === painelRef.current)) {
          e.preventDefault(); ultimo?.focus();
        } else if (!e.shiftKey && (document.activeElement === ultimo || document.activeElement === painelRef.current)) {
          e.preventDefault(); primeiro?.focus();
        }
      }
    }
    document.addEventListener("keydown", aoTeclar);
    // Trava o scroll do fundo enquanto o modal está aberto
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      anterior?.focus();
    };
  }, [aberto]);

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
        ref={painelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-xl bg-white shadow-xl outline-none sm:h-[85dvh] sm:rounded-xl"
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
            className="icon-button"
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
