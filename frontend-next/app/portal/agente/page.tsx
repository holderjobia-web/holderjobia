"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import PortalShell from "@/components/portal-shell";
import { Icone } from "@/components/icons";
import { MarkdownSimples } from "@/components/markdown-simples";
import { SeletorEmpresa, type EmpresaOpcao, type RedeOpcao } from "@/components/seletor-empresa";
import { portalApi } from "@/lib/portal-api";

type Empresa = EmpresaOpcao;
type Rede = RedeOpcao;

type Mensagem = {
  id: string;
  papel: "usuario" | "agente";
  texto: string;
};

const SUGESTOES = [
  "Como está a margem líquida esse mês?",
  "Resuma a saúde financeira do grupo",
  "Alguma unidade com queda de receita?",
  "Como estão as vendas por categoria?",
];

export default function AgentePage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [redes, setRedes] = useState<Rede[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      portalApi.get<Empresa[]>("/empresas"),
      portalApi.get<Rede[]>("/redes"),
    ])
      .then(([empRes, redesRes]) => {
        setEmpresas(empRes.data);
        setRedes(redesRes.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, enviando]);

  async function perguntar(texto: string) {
    if (!texto || enviando) return;

    setErro("");
    const minhaMsg: Mensagem = { id: crypto.randomUUID(), papel: "usuario", texto };
    setMensagens((atual) => [...atual, minhaMsg]);
    setPergunta("");
    setEnviando(true);

    try {
      const { data } = await portalApi.post("/agente/perguntar", {
        pergunta: texto,
        empresa_id: empresaId || undefined,
      });
      setMensagens((atual) => [
        ...atual,
        { id: crypto.randomUUID(), papel: "agente", texto: data.resposta },
      ]);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao consultar o agente.");
    } finally {
      setEnviando(false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    await perguntar(pergunta.trim());
  }

  const empresaSelecionada = empresas.find((e) => e.id === empresaId) ?? null;

  return (
    <PortalShell titulo="Agente de IA">
      <SeletorEmpresa
        empresas={empresas}
        redes={redes}
        value={empresaId}
        onChange={setEmpresaId}
        titulo="Contexto da conversa"
        descricao="Selecione uma empresa para focar a conversa nela, ou deixe em branco para falar sobre todo o grupo."
      />

      <section className="mt-4 flex h-[65vh] flex-col overflow-hidden rounded-xl bg-white border border-navy-100 shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-navy-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-moss-50 text-moss-700">
              <Icone nome="agente" className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold text-navy-800">
              {empresaSelecionada
                ? `Falando sobre ${empresaSelecionada.codigo} — ${empresaSelecionada.nome_razao_social}`
                : "Falando sobre todo o grupo"}
            </p>
          </div>
          {mensagens.length > 0 && (
            <button
              type="button"
              onClick={() => setMensagens([])}
              className="text-xs font-medium text-navy-400 hover:text-red-600"
            >
              Limpar conversa
            </button>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {mensagens.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-moss-50 text-moss-700">
                <Icone nome="agente" className="h-6 w-6" />
              </div>
              <p className="max-w-sm text-sm text-navy-500">
                Pergunte sobre margem, evolução de receita, retirada, orçamento ou
                sócios. O agente responde só com base nos dados já cadastrados e
                avisa quando não tiver informação suficiente.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => perguntar(s)}
                    className="rounded-full border border-navy-100 px-3 py-1.5 text-xs text-navy-600 hover:border-moss-400 hover:bg-moss-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            mensagens.map((m) => (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${m.papel === "usuario" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    m.papel === "usuario"
                      ? "bg-navy-700 text-white"
                      : "bg-moss-100 text-moss-700"
                  }`}
                >
                  <Icone nome={m.papel === "usuario" ? "empresas" : "agente"} className="h-3.5 w-3.5" />
                </div>
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                    m.papel === "usuario"
                      ? "whitespace-pre-wrap bg-navy-700 text-white"
                      : "bg-moss-50 text-navy-800 border border-moss-100"
                  }`}
                >
                  {m.papel === "agente" ? <MarkdownSimples texto={m.texto} /> : m.texto}
                </div>
              </div>
            ))
          )}

          {enviando && (
            <div className="flex items-end gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-moss-100 text-moss-700">
                <Icone nome="agente" className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-moss-100 bg-moss-50 px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-moss-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-moss-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-moss-400" />
              </div>
            </div>
          )}
          <div ref={fimRef} />
        </div>

        {erro && <p className="px-5 pb-2 text-sm text-red-600">{erro}</p>}

        <form onSubmit={enviar} className="flex gap-2 border-t border-navy-100 p-3">
          <input
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            placeholder="Ex.: como está a margem líquida da rede nos últimos 3 meses?"
            className="flex-1 rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
          />
          <button
            type="submit"
            disabled={enviando || !pergunta.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-moss-600 px-4 py-2 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
          >
            Enviar
            <Icone nome="enviar" className="h-4 w-4" />
          </button>
        </form>
      </section>
    </PortalShell>
  );
}
