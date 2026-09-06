"use client";

import { Fragment, ReactNode } from "react";

/**
 * Renderer de markdown simples (sem dependência externa) — suporta o que o
 * LLM tende a gerar: #/##/### (títulos), **negrito** e listas com "- "/"* ".
 * Mantém o bundle enxuto (projeto evita libs pesadas tipo react-markdown).
 */

function formatarInline(texto: string, keyPrefix: string): ReactNode {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return partes.map((parte, i) => {
    const negrito = parte.match(/^\*\*([^*]+)\*\*$/);
    return (
      <Fragment key={`${keyPrefix}-${i}`}>
        {negrito ? <strong>{negrito[1]}</strong> : parte}
      </Fragment>
    );
  });
}

export function MarkdownSimples({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  const blocos: ReactNode[] = [];
  let listaAtual: string[] = [];

  function fecharLista() {
    if (listaAtual.length === 0) return;
    const itens = listaAtual;
    blocos.push(
      <ul key={`ul-${blocos.length}`} className="my-1 list-disc space-y-0.5 pl-5">
        {itens.map((item, i) => (
          <li key={i}>{formatarInline(item, `li-${blocos.length}-${i}`)}</li>
        ))}
      </ul>
    );
    listaAtual = [];
  }

  linhas.forEach((linhaBruta, idx) => {
    const linha = linhaBruta.trim();
    if (!linha) {
      fecharLista();
      return;
    }

    const bullet = linha.match(/^[-*]\s+(.*)/);
    if (bullet) {
      listaAtual.push(bullet[1]);
      return;
    }
    fecharLista();

    const h3 = linha.match(/^###\s+(.*)/);
    if (h3) {
      blocos.push(
        <h3 key={idx} className="mt-2 text-sm font-semibold text-navy-800 first:mt-0">
          {formatarInline(h3[1], `h3-${idx}`)}
        </h3>
      );
      return;
    }
    const h2 = linha.match(/^##\s+(.*)/);
    if (h2) {
      blocos.push(
        <h2 key={idx} className="mt-2 text-base font-bold text-navy-900 first:mt-0">
          {formatarInline(h2[1], `h2-${idx}`)}
        </h2>
      );
      return;
    }
    const h1 = linha.match(/^#\s+(.*)/);
    if (h1) {
      blocos.push(
        <h1 key={idx} className="mt-2 text-lg font-bold text-navy-900 first:mt-0">
          {formatarInline(h1[1], `h1-${idx}`)}
        </h1>
      );
      return;
    }

    blocos.push(
      <p key={idx} className="leading-relaxed">
        {formatarInline(linha, `p-${idx}`)}
      </p>
    );
  });
  fecharLista();

  return <div className="space-y-1">{blocos}</div>;
}
