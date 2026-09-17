"use client";

import { DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Icone } from "@/components/icons";
import { portalApi } from "@/lib/portal-api";

type Empresa = { id: string; codigo: string; nome_razao_social: string };

type Upload = {
  id: string;
  empresa_id: string | null;
  categoria: string;
  nome_arquivo: string;
  tamanho_bytes: number | null;
  mes_referencia: string | null;
  status: string;
  erro_detalhe: string | null;
  criado_em: string;
};

const CATEGORIAS = [
  { valor: "ortodontia", label: "Ortodontia" },
  { valor: "clinico_geral", label: "Clínico geral" },
  { valor: "implante", label: "Implante" },
];

const LABEL_CATEGORIA: Record<string, string> = {
  ortodontia: "Ortodontia",
  clinico_geral: "Clínico geral",
  implante: "Implante",
};

const STATUS_LABEL: Record<string, { texto: string; cor: string; icone: string }> = {
  recebido: { texto: "Recebido", cor: "bg-navy-100 text-navy-700", icone: "relogio" },
  processando: { texto: "Processando", cor: "bg-amber-100 text-amber-700", icone: "relogio" },
  processado: { texto: "Processado", cor: "bg-moss-100 text-moss-800", icone: "check" },
  erro: { texto: "Erro", cor: "bg-red-100 text-red-700", icone: "alerta" },
};

function formatarTamanho(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function EnvioVendasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [mes, setMes] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function carregarUploads() {
    try {
      const { data } = await portalApi.get<Upload[]>("/vendas/uploads");
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

  async function processar(id: string) {
    setErro("");
    setOk("");
    setProcessandoId(id);
    try {
      const { data } = await portalApi.post<{
        status: string;
        gravados?: number;
        divergencias?: string[];
        motivo?: string;
        linhas_validas?: number;
        linhas_invalidas?: number;
      }>(`/vendas/uploads/${id}/processar`);
      if (data.status === "processado") {
        const partes = [
          `Processado com sucesso. ${data.gravados ?? 0} mês(es) gravado(s).`,
          data.linhas_invalidas
            ? `${data.linhas_invalidas} linha(s) ignorada(s) por dado inválido.`
            : "",
        ].filter(Boolean);
        setOk(partes.join(" "));
      } else {
        const partes = [
          data.motivo,
          data.divergencias?.length
            ? `Divergências: ${data.divergencias.join(" | ")}`
            : "",
        ].filter(Boolean);
        setErro(partes.join(" — ") || "Processamento concluído com pendências.");
      }
      await carregarUploads();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao processar o arquivo.");
    } finally {
      setProcessandoId(null);
    }
  }

  async function excluirEnvio(u: Upload) {
    const aviso =
      `Excluir o envio "${u.nome_arquivo}"?\n\n` +
      "Isso remove a planilha e também os lançamentos mensais que ela gerou nos " +
      "dashboards de vendas. Esta ação não tem volta.";
    if (!window.confirm(aviso)) return;
    setErro("");
    setOk("");
    setExcluindoId(u.id);
    try {
      const { data } = await portalApi.delete<{
        envio_removido: boolean;
        lancamentos_removidos: number;
      }>(`/vendas/uploads/${u.id}`);
      const n = data.lancamentos_removidos;
      setOk(
        n > 0
          ? `Envio excluído. ${n} lançamento(s) mensal(is) removido(s) dos dashboards.`
          : "Envio excluído."
      );
      await carregarUploads();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao excluir o envio.");
    } finally {
      setExcluindoId(null);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setOk("");
    if (!arquivo) {
      setErro("Selecione um arquivo .xlsx.");
      return;
    }
    if (!empresaId) {
      setErro("Selecione a unidade.");
      return;
    }
    if (!categoria) {
      setErro("Selecione a categoria.");
      return;
    }

    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("empresa_id", empresaId);
    form.append("categoria", categoria);
    if (mes) form.append("mes_referencia", mes);

    setEnviando(true);
    try {
      await portalApi.post("/vendas/uploads", form, {
        headers: { "Content-Type": undefined },
      });
      setOk("Planilha enviada com sucesso. Ela entrará na fila de processamento.");
      setMes("");
      limparArquivo();
      await carregarUploads();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao enviar o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  function selecionarArquivo(file: File | null) {
    setErro("");
    if (file && !file.name.toLowerCase().endsWith(".xlsx")) {
      setErro("Selecione um arquivo no formato .xlsx.");
      return;
    }
    setArquivo(file);
  }

  function limparArquivo() {
    setArquivo(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file && fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileRef.current.files = dt.files;
    }
    selecionarArquivo(file);
  }

  return (
    <>
      <section className="rounded-xl bg-white border border-navy-100 p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-moss-50 text-moss-700">
            <Icone nome="upload" className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-navy-800">Enviar planilha de Vendas (.xlsx)</h2>
            <p className="text-sm text-navy-500">
              Até 20 MB. Unidade e categoria são obrigatórias — o mês é detectado
              automaticamente pela data de cada venda.
            </p>
          </div>
        </div>

        <form onSubmit={enviar} className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                arrastando
                  ? "border-moss-500 bg-moss-50"
                  : "border-navy-200 bg-navy-50/40 hover:border-moss-400 hover:bg-moss-50"
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => selecionarArquivo(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {arquivo ? (
                <>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-moss-100 text-moss-700">
                    <Icone nome="vendas" className="h-6 w-6" />
                  </div>
                  <p className="max-w-full truncate text-sm font-medium text-navy-800">
                    {arquivo.name}
                  </p>
                  <p className="text-xs text-navy-500">{formatarTamanho(arquivo.size)}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      limparArquivo();
                    }}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-navy-500 hover:text-red-600"
                  >
                    <Icone nome="x" className="h-3.5 w-3.5" />
                    Remover
                  </button>
                </>
              ) : (
                <>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-navy-400 shadow-sm">
                    <Icone nome="upload" className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-navy-700">
                    Clique para escolher um .xlsx ou arraste aqui
                  </p>
                  <p className="text-xs text-navy-400">XLSX · até 20 MB</p>
                </>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Unidade
            </label>
            <select
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            >
              <option value="">— Selecione —</option>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.codigo} — {emp.nome_razao_social}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Categoria
            </label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            >
              <option value="">— Selecione —</option>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Mês de referência (opcional, só rótulo do envio)
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
              className="w-full rounded-lg bg-moss-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60 sm:w-auto"
            >
              {enviando ? "Enviando..." : "Enviar planilha"}
            </button>
          </div>
        </form>
        {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
        {ok && <p className="mt-3 text-sm text-moss-700">{ok}</p>}
      </section>

      <section className="mt-6 rounded-xl bg-white border border-navy-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-navy-100">
          <Icone nome="lista" className="h-5 w-5 text-navy-500" />
          <h2 className="font-semibold text-navy-800">Envios recentes</h2>
        </div>

        {uploads.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-navy-500">
            Nenhuma planilha de vendas enviada ainda.
          </p>
        ) : (
          <>
            {/* Desktop / tablet: tabela */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-navy-50 text-navy-700">
                  <tr>
                    <th className="text-left font-semibold px-4 py-3">Arquivo</th>
                    <th className="text-left font-semibold px-4 py-3">Unidade</th>
                    <th className="text-left font-semibold px-4 py-3">Categoria</th>
                    <th className="text-left font-semibold px-4 py-3">Tamanho</th>
                    <th className="text-left font-semibold px-4 py-3">Status</th>
                    <th className="text-left font-semibold px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => {
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
                          {LABEL_CATEGORIA[u.categoria] ?? u.categoria}
                        </td>
                        <td className="px-4 py-3 text-navy-600">
                          {formatarTamanho(u.tamanho_bytes)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.cor}`}
                            title={u.erro_detalhe ?? undefined}
                          >
                            <Icone nome={st.icone} className="h-3.5 w-3.5" />
                            {st.texto}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => processar(u.id)}
                            disabled={processandoId === u.id || u.status === "processando"}
                            className="rounded-lg border border-moss-600 px-3 py-1 text-xs font-semibold text-moss-700 hover:bg-moss-50 disabled:opacity-50"
                          >
                            {processandoId === u.id
                              ? "Processando..."
                              : u.status === "processado"
                                ? "Reprocessar"
                                : "Processar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => excluirEnvio(u)}
                            disabled={excluindoId === u.id}
                            className="ml-2 rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            {excluindoId === u.id ? "Excluindo..." : "Excluir"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: lista de cards */}
            <div className="divide-y divide-navy-100 md:hidden">
              {uploads.map((u) => {
                const st = STATUS_LABEL[u.status] ?? STATUS_LABEL.recebido;
                return (
                  <div key={u.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-navy-800">
                        {u.nome_arquivo}
                      </p>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.cor}`}
                        title={u.erro_detalhe ?? undefined}
                      >
                        <Icone nome={st.icone} className="h-3.5 w-3.5" />
                        {st.texto}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-navy-500">
                      <div>
                        <dt className="text-navy-400">Unidade</dt>
                        <dd className="text-navy-700">{nomeEmpresa(u.empresa_id)}</dd>
                      </div>
                      <div>
                        <dt className="text-navy-400">Categoria</dt>
                        <dd className="text-navy-700">{LABEL_CATEGORIA[u.categoria] ?? u.categoria}</dd>
                      </div>
                      <div>
                        <dt className="text-navy-400">Tamanho</dt>
                        <dd className="text-navy-700">{formatarTamanho(u.tamanho_bytes)}</dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => processar(u.id)}
                        disabled={processandoId === u.id || u.status === "processando"}
                        className="flex-1 rounded-lg border border-moss-600 px-3 py-1.5 text-xs font-semibold text-moss-700 hover:bg-moss-50 disabled:opacity-50"
                      >
                        {processandoId === u.id
                          ? "Processando..."
                          : u.status === "processado"
                            ? "Reprocessar"
                            : "Processar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => excluirEnvio(u)}
                        disabled={excluindoId === u.id}
                        className="flex-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {excluindoId === u.id ? "Excluindo..." : "Excluir"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </>
  );
}
