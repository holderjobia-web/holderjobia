"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminShell from "@/components/admin-shell";
import { adminApi } from "@/lib/admin-api";

type Cliente = { id: string; nome: string };

type Rede = { id: string; nome: string; segmento: string | null };

type Empresa = {
  id: string;
  codigo: string;
  nome_razao_social: string;
  cnpj: string | null;
  segmento: string | null;
  percentual_participacao: number | null;
  ativa: boolean;
  rede_id: string | null;
};

export default function EmpresasPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [redes, setRedes] = useState<Rede[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [segmento, setSegmento] = useState("");
  const [participacao, setParticipacao] = useState("");
  const [redeId, setRedeId] = useState("");

  const [novaRede, setNovaRede] = useState("");
  const [novaRedeSegmento, setNovaRedeSegmento] = useState("");
  const [salvandoRede, setSalvandoRede] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editSegmento, setEditSegmento] = useState("");
  const [editRedeId, setEditRedeId] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  useEffect(() => {
    adminApi
      .get<Cliente[]>("/admin/clientes")
      .then(({ data }) => {
        setClientes(data);
        if (data.length > 0) setClienteId(data[0].id);
      })
      .catch(() => setErro("Não foi possível carregar os clientes."));
  }, []);

  async function carregarEmpresas(id: string) {
    if (!id) return;
    setCarregando(true);
    try {
      const [empRes, redesRes] = await Promise.all([
        adminApi.get<Empresa[]>("/admin/empresas", { params: { cliente_id: id } }),
        adminApi.get<Rede[]>("/admin/redes", { params: { cliente_id: id } }),
      ]);
      setEmpresas(empRes.data);
      setRedes(redesRes.data);
    } catch {
      setErro("Não foi possível carregar as empresas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarEmpresas(clienteId);
  }, [clienteId]);

  async function criarRede(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvandoRede(true);
    try {
      await adminApi.post("/admin/redes", {
        cliente_id: clienteId,
        nome: novaRede.trim(),
        segmento: novaRedeSegmento.trim() || null,
      });
      setNovaRede("");
      setNovaRedeSegmento("");
      await carregarEmpresas(clienteId);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao criar a rede.");
    } finally {
      setSalvandoRede(false);
    }
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      await adminApi.post("/admin/empresas", {
        cliente_id: clienteId,
        codigo: codigo.trim(),
        nome_razao_social: nome.trim(),
        cnpj: cnpj.trim() || null,
        segmento: segmento.trim() || null,
        percentual_participacao: participacao ? Number(participacao) : null,
        rede_id: redeId || null,
      });
      setCodigo("");
      setNome("");
      setCnpj("");
      setSegmento("");
      setParticipacao("");
      setRedeId("");
      await carregarEmpresas(clienteId);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao criar a empresa.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(emp: Empresa) {
    setEditandoId(emp.id);
    setEditNome(emp.nome_razao_social);
    setEditSegmento(emp.segmento ?? "");
    setEditRedeId(emp.rede_id ?? "");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
  }

  async function salvarEdicao(emp: Empresa) {
    if (!editNome.trim()) {
      setErro("O nome da empresa não pode ficar em branco.");
      return;
    }
    setSalvandoEdicao(true);
    setErro("");
    try {
      await adminApi.patch(`/admin/empresas/${emp.id}`, {
        nome_razao_social: editNome.trim(),
        segmento: editSegmento.trim() || null,
        rede_id: editRedeId || null,
      });
      setEditandoId(null);
      await carregarEmpresas(clienteId);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao salvar as alterações.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function alternarAtiva(emp: Empresa) {
    setErro("");
    try {
      await adminApi.patch(`/admin/empresas/${emp.id}`, { ativa: !emp.ativa });
      await carregarEmpresas(clienteId);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao alterar o status.");
    }
  }

  async function excluirEmpresa(emp: Empresa) {
    const confirmacao = window.prompt(
      `EXCLUIR a empresa "${emp.nome_razao_social}"?\n\n` +
        "Isso remove permanentemente TODO o histórico de DRE, uploads e " +
        "participações societárias vinculadas a ela. Esta ação NÃO tem volta.\n\n" +
        `Para confirmar, digite o código da unidade: ${emp.codigo}`
    );
    if (confirmacao === null) return;
    if (confirmacao.trim() !== emp.codigo) {
      setErro("Código não confere. Exclusão cancelada.");
      return;
    }
    setErro("");
    try {
      await adminApi.delete(`/admin/empresas/${emp.id}`);
      await carregarEmpresas(clienteId);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao excluir a empresa.");
    }
  }

  async function excluirRede(rede: Rede) {
    const aviso =
      `Excluir a rede/negócio "${rede.nome}"?\n\n` +
      "As empresas vinculadas continuam existindo, mas ficam sem rede. " +
      "Esta ação não tem volta.";
    if (!window.confirm(aviso)) return;
    setErro("");
    try {
      await adminApi.delete(`/admin/redes/${rede.id}`);
      await carregarEmpresas(clienteId);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao excluir a rede.");
    }
  }

  return (
    <AdminShell titulo="Empresas">
      {clientes.length === 0 ? (
        <p className="text-navy-600">
          Cadastre um cliente antes de adicionar empresas.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-navy-700">Cliente:</label>
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            >
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <section className="mt-5 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
            <h2 className="font-semibold text-navy-800">Redes / negócios</h2>
            <p className="mt-1 text-sm text-navy-500">
              Agrupe as unidades por negócio (ex.: rede odontológica, pizzaria). A
              visão de grupo consolida por rede.
            </p>
            <form onSubmit={criarRede} className="mt-3 grid gap-3 sm:grid-cols-3">
              <input
                value={novaRede}
                onChange={(e) => setNovaRede(e.target.value)}
                placeholder="Nome da rede"
                required
                className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              />
              <input
                value={novaRedeSegmento}
                onChange={(e) => setNovaRedeSegmento(e.target.value)}
                placeholder="Segmento (opcional)"
                className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              />
              <button
                type="submit"
                disabled={salvandoRede}
                className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
              >
                {salvandoRede ? "Salvando..." : "Adicionar rede"}
              </button>
            </form>
            {redes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {redes.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-2 rounded-full bg-navy-50 px-3 py-1 text-xs font-medium text-navy-700"
                  >
                    {r.nome}
                    <button
                      type="button"
                      onClick={() => excluirRede(r)}
                      title="Excluir rede"
                      className="text-navy-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="mt-5 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
            <form onSubmit={criar} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Código (único por cliente)"
                required
                className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              />
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome / razão social"
                required
                minLength={2}
                className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              />
              <input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="CNPJ (opcional)"
                className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              />
              <input
                value={segmento}
                onChange={(e) => setSegmento(e.target.value)}
                placeholder="Segmento (opcional)"
                className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              />
              <input
                value={participacao}
                onChange={(e) => setParticipacao(e.target.value)}
                type="number"
                min={0}
                max={100}
                step="0.01"
                placeholder="% participação (opcional)"
                className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              />
              <select
                value={redeId}
                onChange={(e) => setRedeId(e.target.value)}
                className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              >
                <option value="">Sem rede</option>
                {redes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={salvando}
                className="rounded-lg bg-moss-600 px-4 py-2 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Adicionar empresa"}
              </button>
            </form>
            {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
          </section>

          <section className="mt-6 rounded-xl bg-white border border-navy-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-700">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Código</th>
                  <th className="text-left font-semibold px-4 py-3">Nome</th>
                  <th className="text-left font-semibold px-4 py-3">Rede</th>
                  <th className="text-left font-semibold px-4 py-3">Segmento</th>
                  <th className="text-left font-semibold px-4 py-3">%</th>
                  <th className="text-left font-semibold px-4 py-3">Status</th>
                  <th className="text-right font-semibold px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-navy-500">
                      Carregando...
                    </td>
                  </tr>
                ) : empresas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-navy-500">
                      Nenhuma empresa cadastrada para este cliente.
                    </td>
                  </tr>
                ) : (
                  empresas.map((emp) => {
                    const emEdicao = editandoId === emp.id;
                    return (
                      <tr key={emp.id} className="border-t border-navy-100">
                        <td className="px-4 py-3 text-navy-800 font-medium">
                          {emp.codigo}
                        </td>
                        <td className="px-4 py-3 text-navy-800">
                          {emEdicao ? (
                            <input
                              value={editNome}
                              onChange={(e) => setEditNome(e.target.value)}
                              className="w-full rounded-lg border border-navy-200 px-2 py-1 text-sm outline-none focus:border-moss-500"
                            />
                          ) : (
                            emp.nome_razao_social
                          )}
                        </td>
                        <td className="px-4 py-3 text-navy-600">
                          {emEdicao ? (
                            <select
                              value={editRedeId}
                              onChange={(e) => setEditRedeId(e.target.value)}
                              className="w-full rounded-lg border border-navy-200 px-2 py-1 text-sm outline-none focus:border-moss-500"
                            >
                              <option value="">Sem rede</option>
                              {redes.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.nome}
                                </option>
                              ))}
                            </select>
                          ) : (
                            redes.find((r) => r.id === emp.rede_id)?.nome ?? "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-navy-600">
                          {emEdicao ? (
                            <input
                              value={editSegmento}
                              onChange={(e) => setEditSegmento(e.target.value)}
                              className="w-full rounded-lg border border-navy-200 px-2 py-1 text-sm outline-none focus:border-moss-500"
                            />
                          ) : (
                            emp.segmento ?? "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-navy-600">
                          {emp.percentual_participacao != null
                            ? `${emp.percentual_participacao}%`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              emp.ativa
                                ? "bg-moss-100 text-moss-800"
                                : "bg-navy-100 text-navy-600"
                            }`}
                          >
                            {emp.ativa ? "Ativa" : "Inativa"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {emEdicao ? (
                            <>
                              <button
                                type="button"
                                onClick={() => salvarEdicao(emp)}
                                disabled={salvandoEdicao}
                                className="rounded-lg bg-moss-600 px-3 py-1 text-xs font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
                              >
                                {salvandoEdicao ? "Salvando..." : "Salvar"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelarEdicao}
                                className="ml-2 rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-600 hover:bg-navy-50"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => iniciarEdicao(emp)}
                                className="rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => alternarAtiva(emp)}
                                className="ml-2 rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                              >
                                {emp.ativa ? "Inativar" : "Ativar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => excluirEmpresa(emp)}
                                className="ml-2 rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </AdminShell>
  );
}
