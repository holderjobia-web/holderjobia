"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import PortalShell from "@/components/portal-shell";
import { ArrowUp, ArrowUpRight, Copy, Check, RotateCcw, LoaderCircle } from "lucide-react";
import { MarkdownSimples } from "@/components/markdown-simples";
import { SeletorEmpresa, type EmpresaOpcao, type RedeOpcao } from "@/components/seletor-empresa";
import { portalApi } from "@/lib/portal-api";

type Empresa = EmpresaOpcao;
type Rede = RedeOpcao;

type Mensagem = {
  id: string;
  papel: "usuario" | "agente";
  texto: string;
  contexto: string;
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
  const [copiada, setCopiada] = useState("");
  const conversaRef = useRef<HTMLDivElement>(null);

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
    const conversa = conversaRef.current;
    if (conversa) conversa.scrollTo({ top: conversa.scrollHeight, behavior: "smooth" });
  }, [mensagens, enviando]);

  async function perguntar(texto: string) {
    if (!texto || enviando) return;

    setErro("");
    const contexto = empresas.find((empresa) => empresa.id === empresaId)?.nome_razao_social ?? "Todo o grupo";
    const minhaMsg: Mensagem = { id: crypto.randomUUID(), papel: "usuario", texto, contexto };
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
        { id: crypto.randomUUID(), papel: "agente", texto: data.resposta, contexto },
      ]);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao consultar o agente.");
      setPergunta(texto);
    } finally {
      setEnviando(false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    await perguntar(pergunta.trim());
  }

  const empresaSelecionada = empresas.find((e) => e.id === empresaId) ?? null;

  async function copiar(mensagem: Mensagem) {
    try { await navigator.clipboard.writeText(mensagem.texto); setCopiada(mensagem.id); }
    catch { setErro("Não foi possível copiar a resposta."); }
  }

  return (
    <PortalShell titulo="Agente IA">
      <SeletorEmpresa
        empresas={empresas}
        redes={redes}
        value={empresaId}
        onChange={setEmpresaId}
        titulo="Contexto da conversa"
        disabled={enviando}
      />

      <section className="mt-5 flex h-[640px] max-h-[80dvh] min-h-[420px] flex-col border-y border-navy-100 bg-white lg:h-[calc(100dvh-390px)]">
        <div className="flex items-center justify-between gap-3 border-b border-navy-100 px-4 py-3 sm:px-6">
          <div className="min-w-0"><h2 className="text-sm font-semibold text-navy-800">Análise financeira</h2><p className="mt-1 truncate text-xs text-navy-500" title={empresaSelecionada?.nome_razao_social}>{empresaSelecionada ? `${empresaSelecionada.codigo} - ${empresaSelecionada.nome_razao_social}` : "Todo o grupo"}</p></div>
          <button type="button" disabled={enviando || !mensagens.length} title="Nova conversa" aria-label="Nova conversa" onClick={() => { if (window.confirm("Limpar esta conversa?")) { setMensagens([]); setErro(""); setCopiada(""); } }} className="icon-button"><RotateCcw size={17} /></button>
        </div>
        <div ref={conversaRef} role="log" aria-live="polite" aria-busy={enviando} aria-label="Conversa com o agente" className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-8">
          {mensagens.length === 0 ? <div className="mx-auto max-w-2xl py-10 sm:py-14">
            <p className="mb-2 text-xs font-semibold uppercase text-moss-700">Visão de gestão</p>
            <h3 className="mb-8 text-xl font-medium text-navy-900">O que precisa de atenção hoje?</h3>
            <div className="divide-y divide-navy-100 border-y border-navy-100">
              {SUGESTOES.map((sugestao) => <button key={sugestao} type="button" onClick={() => perguntar(sugestao)} className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left text-sm text-navy-600 hover:text-moss-700"><span>{sugestao}</span><ArrowUpRight size={16} className="shrink-0" /></button>)}
            </div>
          </div> : <div className="mx-auto max-w-3xl divide-y divide-navy-100">
            {mensagens.map((mensagem) => <article key={mensagem.id} className="py-6">
              <div className="mb-3 flex items-center justify-between gap-3"><p className="min-w-0 text-xs font-semibold text-navy-500">{mensagem.papel === "usuario" ? "Você" : "Análise"}<span className="ml-2 break-words font-normal text-navy-400">{mensagem.contexto}</span></p>
                {mensagem.papel === "agente" && <button type="button" title={copiada === mensagem.id ? "Resposta copiada" : "Copiar resposta"} aria-label={copiada === mensagem.id ? "Resposta copiada" : "Copiar resposta"} onClick={() => copiar(mensagem)} className="icon-button">{copiada === mensagem.id ? <Check size={15} /> : <Copy size={15} />}</button>}
              </div>
              <div className={`break-words text-sm leading-7 text-navy-800 ${mensagem.papel === "usuario" ? "whitespace-pre-wrap font-medium" : ""}`}>{mensagem.papel === "agente" ? <MarkdownSimples texto={mensagem.texto} /> : mensagem.texto}</div>
            </article>)}
          </div>}
          {enviando && <p role="status" className="mx-auto flex max-w-3xl items-center gap-3 pb-6 text-sm text-navy-500"><LoaderCircle size={16} className="animate-spin" />Consultando os dados...</p>}
        </div>
        {erro && <p role="alert" className="px-5 py-2 text-sm text-red-600">{erro}</p>}
        <form onSubmit={enviar} className="border-t border-navy-100 p-4 sm:px-6">
          <label htmlFor="pergunta-agente" className="sr-only">Sua pergunta</label>
          <div className="flex items-end gap-3">
            <textarea id="pergunta-agente" rows={2} maxLength={2000} value={pergunta} onChange={(event) => setPergunta(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); enviar(event); } }} placeholder="Escreva sua pergunta..." className="field min-h-20 flex-1 resize-none" />
            <button type="submit" disabled={enviando || !pergunta.trim()} title="Enviar pergunta" aria-label="Enviar pergunta" className="button-primary h-11 w-11 shrink-0 px-0"><ArrowUp size={20} /></button>
          </div>
        </form>
      </section>
    </PortalShell>
  );
}
