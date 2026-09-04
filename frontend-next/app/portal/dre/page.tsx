"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import PortalShell from "@/components/portal-shell";
import { portalApi } from "@/lib/portal-api";

type Empresa = { id: string; codigo: string; nome_razao_social: string };

type Upload = {
  id: string;
  empresa_id: string | null;
  nome_arquivo: string;
  tamanho_bytes: number | null;
  mes_referencia: string | null;
  status: string;
  erro_detalhe: string | null;
  criado_em: string;
};

const STATUS_LABEL: Record<string, { texto: string; cor: string }> = {
  recebido: { texto: "Recebido", cor: "bg-navy-100 text-navy-700" },
  processando: { texto: "Processando", cor: "bg-amber-100 text-amber-700" },
  processado: { texto: "Processado", cor: "bg-moss-100 text-moss-800" },
  erro: { texto: "Erro", cor: "bg-red-100 text-red-700" },
};

function formatarTamanho(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function EnvioDrePage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [mes, setMes] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function carregarUploads() {
    try {
      const { data } = await portalApi.get<Upload[]>("/dre/uploads");
      setUploads(data);
    } catch {
      setErro("Não foi possível carregar os envios.");
    }
  }

  useEffect(() => {
    portalApi
      .get<Empresa[]>("/empresas")
      .then(({ data }) => setEmpresas(data))
      .catch(() => {});
    carregarUploads();
  }, []);

  function nomeEmpresa(id: string | null): string {
    if (!id) return "—";
    const emp = empresas.find((e) => e.id === id);
    return emp ? `${emp.codigo} — ${emp.nome_razao_social}` : "—";
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setOk("");
    const arquivo = fileRef.current?.files?.[0];
    if (!arquivo) {
      setErro("Selecione um arquivo PDF.");
      return;
    }

    const form = new FormData();
    form.append("arquivo", arquivo);
    if (empresaId) form.append("empresa_id", empresaId);
    if (mes) form.append("mes_referencia", mes);

    setEnviando(true);
    try {
      await portalApi.post("/dre/uploads", form, {
        headers: { "Content-Type": undefined },
      });
      setOk("DRE enviado com sucesso. Ele entrará na fila de processamento.");
      setEmpresaId("");
      setMes("");
      if (fileRef.current) fileRef.current.value = "";
      await carregarUploads();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao enviar o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PortalShell titulo="Envio de DRE">
      <section className="rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
        <h2 className="font-semibold text-navy-800">Enviar DRE (PDF)</h2>
        <p className="text-sm text-navy-500 mt-1">
          Envie o DRE em PDF (até 20 MB). Empresa e mês são opcionais — o
          processamento identifica os dados no arquivo.
        </p>
        <form onSubmit={enviar} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Arquivo PDF
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              required
              className="block w-full text-sm text-navy-700 file:mr-3 file:rounded-lg file:border-0 file:bg-moss-600 file:px-4 file:py-2 file:text-white file:font-semibold hover:file:bg-moss-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Empresa (opcional)
            </label>
            <select
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            >
              <option value="">— Não especificar —</option>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.codigo} — {emp.nome_razao_social}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Mês de referência (opcional)
            </label>
            <input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={enviando}
              className="rounded-lg bg-moss-600 px-5 py-2 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
            >
              {enviando ? "Enviando..." : "Enviar DRE"}
            </button>
          </div>
        </form>
        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
        {ok && <p className="mt-2 text-sm text-moss-700">{ok}</p>}
      </section>

      <section className="mt-6 rounded-xl bg-white border border-navy-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-navy-100">
          <h2 className="font-semibold text-navy-800">Envios recentes</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-700">
            <tr>
              <th className="text-left font-semibold px-4 py-3">Arquivo</th>
              <th className="text-left font-semibold px-4 py-3">Empresa</th>
              <th className="text-left font-semibold px-4 py-3">Mês</th>
              <th className="text-left font-semibold px-4 py-3">Tamanho</th>
              <th className="text-left font-semibold px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {uploads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-navy-500">
                  Nenhum DRE enviado ainda.
                </td>
              </tr>
            ) : (
              uploads.map((u) => {
                const st = STATUS_LABEL[u.status] ?? STATUS_LABEL.recebido;
                return (
                  <tr key={u.id} className="border-t border-navy-100">
                    <td className="px-4 py-3 text-navy-800 font-medium">
                      {u.nome_arquivo}
                    </td>
                    <td className="px-4 py-3 text-navy-600">
                      {nomeEmpresa(u.empresa_id)}
                    </td>
                    <td className="px-4 py-3 text-navy-600">
                      {u.mes_referencia
                        ? u.mes_referencia.slice(0, 7).split("-").reverse().join("/")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-navy-600">
                      {formatarTamanho(u.tamanho_bytes)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cor}`}
                        title={u.erro_detalhe ?? undefined}
                      >
                        {st.texto}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </PortalShell>
  );
}
