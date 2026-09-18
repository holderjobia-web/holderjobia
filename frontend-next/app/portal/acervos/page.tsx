"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import PortalShell from "@/components/portal-shell";
import { Icone } from "@/components/icons";
import { Modal } from "@/components/modal";
import { EmpresaOpcao, RedeOpcao, SeletorEmpresa } from "@/components/seletor-empresa";
import { portalApi } from "@/lib/portal-api";

type PreviaTabela = { colunas: string[]; linhas: string[][]; total_linhas: number };

type Upload = {
  id: string;
  empresa_id: string;
  categoria: string;
  nome_arquivo: string;
  extensao: string | null;
  tamanho_bytes: number | null;
  descricao: string | null;
  status: string;
  erro_detalhe: string | null;
  criado_em: string;
};

const CATEGORIAS: { valor: string; label: string }[] = [
  { valor: "contrato", label: "Contrato" },
  { valor: "planilha_obra", label: "Planilha de obra" },
  { valor: "fotos", label: "Fotos" },
  { valor: "plantas", label: "Plantas" },
  { valor: "documentos_gerais", label: "Documentos em geral" },
];
const LABEL_CATEGORIA: Record<string, string> = Object.fromEntries(
  CATEGORIAS.map((c) => [c.valor, c.label])
);

const STATUS_LABEL: Record<string, { texto: string; cor: string; icone: string }> = {
  recebido: { texto: "Recebido", cor: "bg-navy-100 text-navy-700", icone: "relogio" },
  indexado: { texto: "Indexado no agente", cor: "bg-moss-100 text-moss-800", icone: "check" },
  sem_texto: { texto: "Guardado", cor: "bg-navy-100 text-navy-600", icone: "arquivo" },
  erro: { texto: "Erro ao indexar", cor: "bg-red-100 text-red-700", icone: "alerta" },
};

function formatarTamanho(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function AcervosPage() {
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);
  const [redes, setRedes] = useState<RedeOpcao[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);

  // Filtros da lista
  const [filtroEmpresaId, setFiltroEmpresaId] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [busca, setBusca] = useState("");

  // Form de envio
  const [empresaUploadId, setEmpresaUploadId] = useState("");
  const [categoriaUpload, setCategoriaUpload] = useState("");
  const [descricao, setDescricao] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Modal de visualização
  const [visualizando, setVisualizando] = useState<Upload | null>(null);
  const [urlArquivo, setUrlArquivo] = useState<string | null>(null);
  const [tipoArquivo, setTipoArquivo] = useState<string>("outro");
  const [previa, setPrevia] = useState<PreviaTabela | null>(null);
  const [carregandoArquivo, setCarregandoArquivo] = useState(false);
  const [erroArquivo, setErroArquivo] = useState("");

  async function carregarUploads() {
    try {
      const params = new URLSearchParams();
      if (filtroEmpresaId) params.set("empresa_id", filtroEmpresaId);
      if (filtroCategoria) params.set("categoria", filtroCategoria);
      if (busca.trim()) params.set("busca", busca.trim());
      const { data } = await portalApi.get<Upload[]>(`/acervos/uploads?${params.toString()}`);
      setUploads(data);
    } catch {
      setErro("Não foi possível carregar os arquivos.");
    }
  }

  useEffect(() => {
    Promise.all([
      portalApi.get<EmpresaOpcao[]>("/empresas"),
      portalApi.get<RedeOpcao[]>("/redes"),
    ])
      .then(([e, r]) => {
        setEmpresas(e.data);
        setRedes(r.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    carregarUploads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEmpresaId, filtroCategoria]);

  useEffect(() => {
    const t = setTimeout(carregarUploads, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function nomeEmpresa(id: string): string {
    const emp = empresas.find((e) => e.id === id);
    return emp ? `${emp.codigo} — ${emp.nome_razao_social}` : "—";
  }

  function adicionarArquivos(lista: FileList | File[] | null) {
    if (!lista) return;
    setArquivos((prev) => [...prev, ...Array.from(lista)]);
  }

  function removerArquivo(idx: number) {
    setArquivos((prev) => prev.filter((_, i) => i !== idx));
  }

  function limparArquivos() {
    setArquivos([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    adicionarArquivos(e.dataTransfer.files);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setOk("");
    if (arquivos.length === 0) {
      setErro("Selecione ao menos 1 arquivo.");
      return;
    }
    if (!empresaUploadId) {
      setErro("Selecione a unidade.");
      return;
    }
    if (!categoriaUpload) {
      setErro("Selecione a categoria.");
      return;
    }

    const form = new FormData();
    arquivos.forEach((a) => form.append("arquivos", a));
    form.append("empresa_id", empresaUploadId);
    form.append("categoria", categoriaUpload);
    if (descricao.trim()) form.append("descricao", descricao.trim());

    setEnviando(true);
    try {
      const { data } = await portalApi.post<Array<{ nome_arquivo: string; erro?: string }>>(
        "/acervos/uploads",
        form,
        { headers: { "Content-Type": undefined } }
      );
      const falhas = data.filter((d) => d.erro);
      if (falhas.length === 0) {
        setOk(`${data.length} arquivo(s) enviado(s) com sucesso.`);
      } else {
        setErro(
          `${falhas.length} de ${data.length} arquivo(s) falharam: ` +
            falhas.map((f) => `${f.nome_arquivo} (${f.erro})`).join("; ")
        );
        if (falhas.length < data.length) {
          setOk(`${data.length - falhas.length} arquivo(s) enviado(s) com sucesso.`);
        }
      }
      setDescricao("");
      limparArquivos();
      await carregarUploads();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao enviar os arquivos.");
    } finally {
      setEnviando(false);
    }
  }

  async function visualizar(u: Upload) {
    setVisualizando(u);
    setUrlArquivo(null);
    setPrevia(null);
    setErroArquivo("");
    setCarregandoArquivo(true);
    try {
      const { data } = await portalApi.get<{
        url: string | null;
        tipo: string;
        previa: PreviaTabela | null;
        erro_previa: string | null;
      }>(`/acervos/uploads/${u.id}/arquivo`);
      setUrlArquivo(data.url);
      setTipoArquivo(data.tipo);
      setPrevia(data.previa);
      if (data.erro_previa) setErroArquivo(data.erro_previa);
    } catch (err: any) {
      setErroArquivo(err?.response?.data?.detail ?? "Não foi possível abrir o arquivo.");
    } finally {
      setCarregandoArquivo(false);
    }
  }

  async function excluir(u: Upload) {
    if (!window.confirm(`Excluir "${u.nome_arquivo}"? Esta ação não tem volta.`)) return;
    setErro("");
    setOk("");
    setExcluindoId(u.id);
    try {
      await portalApi.delete(`/acervos/uploads/${u.id}`);
      setOk("Arquivo excluído.");
      await carregarUploads();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao excluir o arquivo.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <PortalShell titulo="Acervos">
      <section className="rounded-xl bg-white border border-navy-100 p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-moss-50 text-moss-700">
            <Icone nome="upload" className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-navy-800">Enviar arquivos</h2>
            <p className="text-sm text-navy-500">
              Até 50 MB por arquivo, qualquer formato. Contratos/planilhas/CSV/texto
              alimentam automaticamente o agente de IA.
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
                multiple
                onChange={(e: ChangeEvent<HTMLInputElement>) => adicionarArquivos(e.target.files)}
                className="hidden"
              />
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-navy-400 shadow-sm">
                <Icone nome="upload" className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-navy-700">
                Clique para escolher arquivos ou arraste aqui
              </p>
              <p className="text-xs text-navy-400">Qualquer formato · até 50 MB cada · vários de uma vez</p>
            </div>

            {arquivos.length > 0 && (
              <ul className="mt-3 divide-y divide-navy-100 rounded-lg border border-navy-100">
                {arquivos.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-navy-700">{a.name}</span>
                    <span className="shrink-0 text-xs text-navy-400">{formatarTamanho(a.size)}</span>
                    <button
                      type="button"
                      onClick={() => removerArquivo(i)}
                      className="shrink-0 text-navy-400 hover:text-red-600"
                      aria-label={`Remover ${a.name}`}
                    >
                      <Icone nome="x" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Unidade</label>
            <select
              value={empresaUploadId}
              onChange={(e) => setEmpresaUploadId(e.target.value)}
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
            <label className="block text-sm font-medium text-navy-700 mb-1">Categoria</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS.map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  onClick={() => setCategoriaUpload(c.valor)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    categoriaUpload === c.valor
                      ? "bg-moss-600 text-white"
                      : "bg-navy-50 text-navy-600 hover:bg-navy-100"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Descrição (opcional)
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              placeholder="Uma anotação livre sobre este envio, se quiser."
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={enviando}
              className="w-full rounded-lg bg-moss-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60 sm:w-auto"
            >
              {enviando ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </form>
        {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
        {ok && <p className="mt-3 text-sm text-moss-700">{ok}</p>}
      </section>

      <section className="mt-6 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
        <SeletorEmpresa
          empresas={empresas}
          redes={redes}
          value={filtroEmpresaId}
          onChange={setFiltroEmpresaId}
          titulo="Filtrar por unidade"
          descricao="Deixe sem seleção para ver arquivos de todas as unidades."
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltroCategoria("")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtroCategoria === "" ? "bg-navy-700 text-white" : "bg-navy-50 text-navy-600 hover:bg-navy-100"
            }`}
          >
            Todas as categorias
          </button>
          {CATEGORIAS.map((c) => (
            <button
              key={c.valor}
              type="button"
              onClick={() => setFiltroCategoria(c.valor)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filtroCategoria === c.valor ? "bg-navy-700 text-white" : "bg-navy-50 text-navy-600 hover:bg-navy-100"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative mt-3">
          <Icone nome="olho" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome do arquivo..."
            className="w-full rounded-lg border border-navy-100 py-2 pl-9 pr-3 text-sm text-navy-800 outline-none focus:border-moss-500"
          />
        </div>
      </section>

      <section className="mt-6 rounded-xl bg-white border border-navy-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-navy-100">
          <Icone nome="lista" className="h-5 w-5 text-navy-500" />
          <h2 className="font-semibold text-navy-800">Arquivos</h2>
        </div>

        {uploads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Icone nome="acervos" className="h-8 w-8 text-navy-300" />
            <p className="text-sm text-navy-500">Nenhum arquivo encontrado.</p>
          </div>
        ) : (
          <>
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
                          <span className="block max-w-[15rem] truncate" title={u.nome_arquivo}>
                            {u.nome_arquivo}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-navy-600">
                          <span className="block max-w-[10rem] truncate" title={nomeEmpresa(u.empresa_id)}>
                            {nomeEmpresa(u.empresa_id)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-navy-600">
                          {LABEL_CATEGORIA[u.categoria] ?? u.categoria}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-navy-600">
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
                            onClick={() => visualizar(u)}
                            className="inline-flex items-center gap-1 rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-600 hover:bg-navy-50"
                          >
                            <Icone nome="olho" className="h-3.5 w-3.5" />
                            Visualizar
                          </button>
                          <button
                            type="button"
                            onClick={() => excluir(u)}
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => visualizar(u)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-navy-200 px-3 py-1.5 text-xs font-semibold text-navy-600 hover:bg-navy-50"
                      >
                        <Icone nome="olho" className="h-3.5 w-3.5" />
                        Visualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => excluir(u)}
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

      <Modal
        aberto={visualizando !== null}
        onFechar={() => setVisualizando(null)}
        titulo={visualizando?.nome_arquivo ?? ""}
        subtitulo={visualizando ? nomeEmpresa(visualizando.empresa_id) : undefined}
        rodape={
          urlArquivo ? (
            <a
              href={urlArquivo}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-moss-700 hover:text-moss-800"
            >
              <Icone nome="baixar" className="h-4 w-4" />
              Baixar arquivo original
            </a>
          ) : undefined
        }
      >
        {carregandoArquivo ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-navy-200 border-t-moss-600" />
            <p className="text-sm text-navy-500">Abrindo o arquivo...</p>
          </div>
        ) : tipoArquivo === "pdf" && urlArquivo ? (
          <iframe src={urlArquivo} title="Visualização do arquivo" className="h-full w-full" />
        ) : tipoArquivo === "imagem" && urlArquivo ? (
          <div className="flex h-full items-center justify-center p-4">
            <img src={urlArquivo} alt={visualizando?.nome_arquivo} className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        ) : (tipoArquivo === "xlsx" || tipoArquivo === "csv") && previa ? (
          <div className="p-4">
            <p className="mb-3 text-xs text-navy-500">
              Mostrando as primeiras {previa.linhas.length} de {previa.total_linhas} linha(s) do arquivo.
            </p>
            <div className="overflow-x-auto rounded-lg border border-navy-100 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-navy-50 text-navy-700">
                  <tr>
                    {previa.colunas.map((c, i) => (
                      <th key={i} className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previa.linhas.map((linha, i) => (
                    <tr key={i} className="border-t border-navy-100">
                      {linha.map((celula, j) => (
                        <td key={j} className="whitespace-nowrap px-3 py-1.5 text-navy-700">
                          {celula}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : tipoArquivo === "office" && urlArquivo ? (
          <iframe
            src={`https://docs.google.com/gview?url=${encodeURIComponent(urlArquivo)}&embedded=true`}
            title="Visualização do arquivo"
            className="h-full w-full"
          />
        ) : (tipoArquivo === "texto" || tipoArquivo === "outro") && urlArquivo ? (
          <iframe src={urlArquivo} title="Visualização do arquivo" className="h-full w-full" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Icone nome="alerta" className="h-8 w-8 text-red-500" />
            <p className="text-sm text-red-600">
              {erroArquivo || "Não foi possível pré-visualizar este arquivo. Baixe o arquivo original abaixo."}
            </p>
          </div>
        )}
      </Modal>
    </PortalShell>
  );
}
