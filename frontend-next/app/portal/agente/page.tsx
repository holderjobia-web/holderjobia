"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import PortalShell from "@/components/portal-shell";
import { portalApi } from "@/lib/portal-api";

type Empresa = { id: string; codigo: string; nome_razao_social: string };

type Mensagem = {
  id: string;
  papel: "usuario" | "agente";
  texto: string;
  fontes?: string[];
};

export default function AgentePage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    portalApi
      .get<Empresa[]>("/empresas")
      .then(({ data }) => setEmpresas(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const texto = pergunta.trim();
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
        { id: crypto.randomUUID(), papel: "agente", texto: data.resposta, fontes: data.fontes },
      ]);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao consultar o agente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PortalShell titulo="Agente de IA">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-navy-700">Empresa (opcional):</label>
        <select
          value={empresaId}
          onChange={(e) => setEmpresaId(e.target.value)}
          className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
        >
          <option value="">Todas (visão do grupo)</option>
          {empresas.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.codigo} — {emp.nome_razao_social}
            </option>
          ))}
        </select>
      </div>

      <section className="mt-4 rounded-xl bg-white border border-navy-100 shadow-sm flex flex-col h-[65vh]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {mensagens.length === 0 && (
            <p className="text-sm text-navy-500">
              Pergunte sobre as suas empresas — margem, evolução de receita, retirada,
              orçamento, sócios. O agente responde só com base nos dados já cadastrados
              e avisa quando não tiver informação suficiente.
            </p>
          )}
          {mensagens.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
                m.papel === "usuario"
                  ? "ml-auto bg-navy-700 text-white"
                  : "bg-moss-50 text-navy-800 border border-moss-100"
              }`}
            >
              {m.texto}
              {m.fontes && m.fontes.length > 0 && (
                <p className="mt-2 text-xs text-navy-400">
                  Fontes: {m.fontes.join(" · ")}
                </p>
              )}
            </div>
          ))}
          {enviando && <p className="text-sm text-navy-400">Analisando...</p>}
          <div ref={fimRef} />
        </div>

        {erro && <p className="px-5 text-sm text-red-600">{erro}</p>}

        <form onSubmit={enviar} className="flex gap-2 border-t border-navy-100 p-3">
          <input
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            placeholder="Ex.: como está a margem líquida da rede nos últimos 3 meses?"
            className="flex-1 rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
          />
          <button
            type="submit"
            disabled={enviando}
            className="rounded-lg bg-moss-600 px-4 py-2 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
          >
            Enviar
          </button>
        </form>
      </section>
    </PortalShell>
  );
}
