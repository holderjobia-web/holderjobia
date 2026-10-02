"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import PortalShell from "@/components/portal-shell";
import Image from "next/image";
import { ChevronDown, Pencil, Search, Upload as UploadIcon, Trash2 } from "lucide-react";
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
  { valor: "controle_mensal", label: "Controle mensal de contas pagas" },
  { valor: "documentos_gerais", label: "Documentos em geral" },
];
const LABEL_CATEGORIA: Record<string, string> = Object.fromEntries(
  CATEGORIAS.map((c) => [c.valor, c.label])
);

const STATUS_LABEL: Record<string, { texto: string; cor: string; icone: string }> = {
  recebido: { texto: "Em análise", cor: "bg-navy-100 text-navy-700", icone: "relogio" },
  indexado: { texto: "Disponível ao agente", cor: "bg-moss-100 text-moss-800", icone: "check" },
  sem_texto: { texto: "Somente arquivo", cor: "bg-navy-100 text-navy-600", icone: "arquivo" },
  erro: { texto: "Consulta indisponível", cor: "bg-red-100 text-red-700", icone: "alerta" },
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

  // Edição de unidade/categoria/descrição
  const [editando, setEditando] = useState<Upload | null>(null);
  const [editEmpresaId, setEditEmpresaId] = useState("");
  const [editCategoria, setEditCategoria] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState("");

  // Modal de visualização
  const [visualizando, setVisualizando] = useState<Upload | null>(null);
  const [urlArquivo, setUrlArquivo] = useState<string | null>(null);
  const [tipoArquivo, setTipoArquivo] = useState<string>("outro");
  const [previa, setPrevia] = useState<PreviaTabela | null>(null);
  const [carregandoArquivo, setCarregandoArquivo] = useState(false);
  const [erroArquivo, setErroArquivo] = useState("");
  const [textoArquivo, setTextoArquivo] = useState("");
  const requisicaoArquivo = useRef<AbortController | null>(null);

  useEffect(() => () => { if (urlArquivo) URL.revokeObjectURL(urlArquivo); }, [urlArquivo]);
  useEffect(() => () => requisicaoArquivo.current?.abort(), []);

  function fecharArquivo() {
    requisicaoArquivo.current?.abort();
    setVisualizando(null);
    setUrlArquivo(null);
  }

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
    requisicaoArquivo.current?.abort();
    const controller = new AbortController();
    requisicaoArquivo.current = controller;
    setVisualizando(u);
    setUrlArquivo(null);
    setPrevia(null);
    setErroArquivo("");
    setTextoArquivo("");
    setTipoArquivo("outro");
    setCarregandoArquivo(true);
    try {
      const { data } = await portalApi.get<{
        url: string | null;
        tipo: string;
        previa: PreviaTabela | null;
        erro_previa: string | null;
      }>(`/acervos/uploads/${u.id}/arquivo`, { signal: controller.signal });
      const { data: conteudo } = await portalApi.get<Blob>(`/acervos/uploads/${u.id}/conteudo`, {
        responseType: "blob", signal: controller.signal,
      });
      const texto = data.tipo === "texto" ? await conteudo.text() : "";
      if (controller.signal.aborted) return;
      setUrlArquivo(URL.createObjectURL(conteudo));
      setTextoArquivo(texto);
      setTipoArquivo(data.tipo);
      setPrevia(data.previa);
      if (data.erro_previa) setErroArquivo(data.erro_previa);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setErroArquivo(err?.response?.data?.detail ?? "Não foi possível abrir o arquivo.");
    } finally {
      if (!controller.signal.aborted) setCarregandoArquivo(false);
    }
  }

  function abrirEdicao(u: Upload) {
    setEditando(u);
    setEditEmpresaId(u.empresa_id);
    setEditCategoria(u.categoria);
    setEditDescricao(u.descricao ?? "");
    setErroEdicao("");
  }

  async function salvarEdicao(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setErroEdicao("");
    setSalvandoEdicao(true);
    try {
      await portalApi.patch(`/acervos/uploads/${editando.id}`, {
        empresa_id: editEmpresaId,
        categoria: editCategoria,
        descricao: editDescricao.trim() || null,
      });
      setEditando(null);
      setOk("Informações do arquivo atualizadas.");
      await carregarUploads();
    } catch (err: any) {
      setErroEdicao(err?.response?.data?.detail ?? "Falha ao salvar as alterações.");
    } finally {
      setSalvandoEdicao(false);
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
      <details className="group border-y border-navy-100 bg-white px-4 sm:px-5">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 py-4 text-sm font-semibold text-navy-800 [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-3"><UploadIcon size={18} className="text-moss-700" />Novo envio</span><ChevronDown size={16} className="group-open:rotate-180" /></summary>

        <form onSubmit={enviar} className="grid gap-4 pb-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Selecionar arquivos"
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileRef.current?.click(); } }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors ${
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
              <label htmlFor="unidade-upload" className="block text-sm font-medium text-navy-700 mb-1">Unidade</label>
            <select
              id="unidade-upload"
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
            <label htmlFor="categoria-upload" className="block text-sm font-medium text-navy-700 mb-1">Categoria</label>
            <select id="categoria-upload" value={categoriaUpload} onChange={(event) => setCategoriaUpload(event.target.value)} className="field"><option value="">Selecione</option>{CATEGORIAS.map((categoria) => <option key={categoria.valor} value={categoria.valor}>{categoria.label}</option>)}</select>
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
              className="button-primary w-full sm:w-auto"
            >
              <UploadIcon size={16} />
              {enviando ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </form>
      </details>
      {erro && <p role="alert" className="my-3 break-words text-sm text-red-600">{erro}</p>}
      {ok && <p role="status" className="my-3 text-sm text-moss-700">{ok}</p>}

      <div className="mt-6">
        <SeletorEmpresa
          empresas={empresas}
          redes={redes}
          value={filtroEmpresaId}
          onChange={setFiltroEmpresaId}
          titulo="Filtrar por unidade"
          descricao="Deixe sem seleção para ver arquivos de todas as unidades."
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_240px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
          <input
            type="text"
            aria-label="Buscar arquivos"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome do arquivo..."
            className="field pl-9"
          />
        </div>
        <select aria-label="Filtrar categoria" value={filtroCategoria} onChange={(event) => setFiltroCategoria(event.target.value)} className="field"><option value="">Todas as categorias</option>{CATEGORIAS.map((categoria) => <option key={categoria.valor} value={categoria.valor}>{categoria.label}</option>)}</select>
        </div>
      </div>

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
                    <th className="text-left font-semibold px-4 py-3">Consulta pelo agente</th>
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
                            title={u.erro_detalhe ?? (u.status === "sem_texto" ? "Arquivo salvo, sem texto extraível para consulta." : "Arquivo salvo; texto disponível para consulta.")}
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
                            onClick={() => abrirEdicao(u)}
                            title="Editar unidade e categoria"
                            aria-label={`Editar ${u.nome_arquivo}`}
                            className="icon-button ml-1"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => excluir(u)}
                            disabled={excluindoId === u.id}
                            title="Excluir arquivo"
                            aria-label={`Excluir ${u.nome_arquivo}`}
                            className="icon-button ml-1 hover:text-red-600"
                          >
                            <Trash2 size={16} />
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
                        title={u.erro_detalhe ?? (u.status === "sem_texto" ? "Arquivo salvo, sem texto extraível para consulta." : "Arquivo salvo; texto disponível para consulta.")}
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
                        onClick={() => abrirEdicao(u)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-navy-200 px-3 py-1.5 text-xs font-semibold text-navy-600 hover:bg-navy-50"
                      >
                        <Pencil size={14} />
                        Editar
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
        onFechar={fecharArquivo}
        titulo={visualizando?.nome_arquivo ?? ""}
        subtitulo={visualizando ? nomeEmpresa(visualizando.empresa_id) : undefined}
        rodape={
          urlArquivo ? (
            <a
              href={urlArquivo}
              download={visualizando?.nome_arquivo}
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
            <Image unoptimized width={1200} height={900} src={urlArquivo} alt={visualizando?.nome_arquivo ?? "Anexo"} className="max-h-full max-w-full object-contain" />
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
        ) : tipoArquivo === "texto" && urlArquivo ? (
          <pre className="whitespace-pre-wrap break-words p-6 text-sm text-navy-800">{textoArquivo}</pre>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Icone nome="alerta" className="h-8 w-8 text-red-500" />
            <p className="text-sm text-red-600">
              {erroArquivo || "Não foi possível pré-visualizar este arquivo. Baixe o arquivo original abaixo."}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        aberto={editando !== null}
        onFechar={() => setEditando(null)}
        titulo="Editar arquivo"
        subtitulo={editando?.nome_arquivo}
        compacto
      >
        <form onSubmit={salvarEdicao} className="grid gap-4 bg-white p-4 sm:p-5">
          <div>
            <label htmlFor="unidade-edicao" className="mb-1 block text-sm font-medium text-navy-700">Unidade</label>
            <select
              id="unidade-edicao"
              value={editEmpresaId}
              onChange={(e) => setEditEmpresaId(e.target.value)}
              className="field"
              required
            >
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.codigo} — {emp.nome_razao_social}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="categoria-edicao" className="mb-1 block text-sm font-medium text-navy-700">Categoria</label>
            <select
              id="categoria-edicao"
              value={editCategoria}
              onChange={(e) => setEditCategoria(e.target.value)}
              className="field"
              required
            >
              {CATEGORIAS.map((categoria) => (
                <option key={categoria.valor} value={categoria.valor}>{categoria.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="descricao-edicao" className="mb-1 block text-sm font-medium text-navy-700">Descrição (opcional)</label>
            <textarea
              id="descricao-edicao"
              value={editDescricao}
              onChange={(e) => setEditDescricao(e.target.value)}
              rows={2}
              className="field"
            />
          </div>
          {erroEdicao && <p role="alert" className="break-words text-sm text-red-600">{erroEdicao}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setEditando(null)} className="rounded-lg border border-navy-200 px-4 py-2 text-sm font-semibold text-navy-600 hover:bg-navy-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvandoEdicao} className="button-primary">
              {salvandoEdicao ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>
    </PortalShell>
  );
}
