"use client";

import { FormEvent, useEffect, useState } from "react";
import PortalShell from "@/components/portal-shell";
import { portalApi } from "@/lib/portal-api";

type Rede = { id: string; nome: string; segmento: string | null; ativo: boolean };

type Empresa = {
  id: string;
  codigo: string;
  nome_razao_social: string;
  cnpj: string | null;
  segmento: string | null;
  percentual_participacao: number | null;
  ativa: boolean;
  status_maturidade: string | null;
  rede_id: string | null;
};

export default function MinhasEmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [redes, setRedes] = useState<Rede[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [segmento, setSegmento] = useState("");
  const [participacao, setParticipacao] = useState("");
  const [redeId, setRedeId] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [novaRede, setNovaRede] = useState("");
  const [novaRedeSegmento, setNovaRedeSegmento] = useState("");
  const [salvandoRede, setSalvandoRede] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editCodigo, setEditCodigo] = useState("");
  const [editNome, setEditNome] = useState("");
  const [editCnpj, setEditCnpj] = useState("");
  const [editSegmento, setEditSegmento] = useState("");
  const [editParticipacao, setEditParticipacao] = useState("");
  const [editRedeId, setEditRedeId] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [redeEditandoId, setRedeEditandoId] = useState<string | null>(null);
  const [redeEditNome, setRedeEditNome] = useState("");
  const [redeEditSegmento, setRedeEditSegmento] = useState("");
  const [salvandoRedeEdicao, setSalvandoRedeEdicao] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const [empRes, redesRes] = await Promise.all([
        portalApi.get<Empresa[]>("/empresas"),
        portalApi.get<Rede[]>("/redes"),
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
    carregar();
  }, []);

  async function criarRede(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvandoRede(true);
    try {
      await portalApi.post("/redes", {
        nome: novaRede.trim(),
        segmento: novaRedeSegmento.trim() || null,
      });
      setNovaRede("");
      setNovaRedeSegmento("");
      await carregar();
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
      await portalApi.post("/empresas", {
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
      await carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao criar a empresa.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(emp: Empresa) {
    setEditandoId(emp.id);
    setEditCodigo(emp.codigo);
    setEditNome(emp.nome_razao_social);
    setEditCnpj(emp.cnpj ?? "");
    setEditSegmento(emp.segmento ?? "");
    setEditParticipacao(
      emp.percentual_participacao != null ? String(emp.percentual_participacao) : ""
    );
    setEditRedeId(emp.rede_id ?? "");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
  }

  async function salvarEdicao(emp: Empresa) {
    if (!editCodigo.trim()) {
      setErro("O código da empresa não pode ficar em branco.");
      return;
    }
    if (!editNome.trim()) {
      setErro("O nome da empresa não pode ficar em branco.");
      return;
    }
    setSalvandoEdicao(true);
    setErro("");
    try {
      await portalApi.patch(`/empresas/${emp.id}`, {
        codigo: editCodigo.trim(),
        nome_razao_social: editNome.trim(),
        cnpj: editCnpj.trim() || null,
        segmento: editSegmento.trim() || null,
        percentual_participacao: editParticipacao ? Number(editParticipacao) : null,
        rede_id: editRedeId || null,
      });
      setEditandoId(null);
      await carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao salvar as alterações.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function alternarAtiva(emp: Empresa) {
    setErro("");
    try {
      await portalApi.patch(`/empresas/${emp.id}`, { ativa: !emp.ativa });
      await carregar();
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
      await portalApi.delete(`/empresas/${emp.id}`);
      await carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao excluir a empresa.");
    }
  }

  function iniciarEdicaoRede(rede: Rede) {
    setRedeEditandoId(rede.id);
    setRedeEditNome(rede.nome);
    setRedeEditSegmento(rede.segmento ?? "");
    setErro("");
  }

  function cancelarEdicaoRede() {
    setRedeEditandoId(null);
  }

  async function salvarEdicaoRede(rede: Rede) {
    if (!redeEditNome.trim()) {
      setErro("O nome da rede não pode ficar em branco.");
      return;
    }
    setSalvandoRedeEdicao(true);
    setErro("");
    try {
      await portalApi.patch(`/redes/${rede.id}`, {
        nome: redeEditNome.trim(),
        segmento: redeEditSegmento.trim() || null,
      });
      setRedeEditandoId(null);
      await carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao salvar a rede.");
    } finally {
      setSalvandoRedeEdicao(false);
    }
  }

  async function alternarAtivoRede(rede: Rede) {
    setErro("");
    try {
      await portalApi.patch(`/redes/${rede.id}`, { ativo: !rede.ativo });
      await carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao alterar o status da rede.");
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
      await portalApi.delete(`/redes/${rede.id}`);
      await carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao excluir a rede.");
    }
  }

  return (
    <PortalShell titulo="Minhas empresas">
      <section className="rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
        <h2 className="font-semibold text-navy-800">Redes / negócios</h2>
        <p className="mt-1 text-sm text-navy-500">
          Agrupe as unidades por negócio (ex.: rede odontológica, pizzaria). A visão
          de grupo consolida por rede.
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
          <ul className="mt-3 divide-y divide-navy-100 rounded-lg border border-navy-100">
            {redes.map((r) => {
              const emEdicao = redeEditandoId === r.id;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  {emEdicao ? (
                    <>
                      <input
                        value={redeEditNome}
                        onChange={(e) => setRedeEditNome(e.target.value)}
                        placeholder="Nome da rede"
                        className="rounded-lg border border-navy-200 px-2 py-1 text-sm outline-none focus:border-moss-500"
                      />
                      <input
                        value={redeEditSegmento}
                        onChange={(e) => setRedeEditSegmento(e.target.value)}
                        placeholder="Segmento"
                        className="rounded-lg border border-navy-200 px-2 py-1 text-sm outline-none focus:border-moss-500"
                      />
                      <div className="ml-auto flex gap-2">
                        <button
                          type="button"
                          onClick={() => salvarEdicaoRede(r)}
                          disabled={salvandoRedeEdicao}
                          className="rounded-lg bg-moss-600 px-3 py-1 text-xs font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
                        >
                          {salvandoRedeEdicao ? "Salvando..." : "Salvar"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelarEdicaoRede}
                          className="rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-600 hover:bg-navy-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-navy-800">{r.nome}</span>
                      {r.segmento && (
                        <span className="text-xs text-navy-500">{r.segmento}</span>
                      )}
                      {!r.ativo && (
                        <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs font-medium text-navy-600">
                          Inativa
                        </span>
                      )}
                      <div className="ml-auto flex gap-2">
                        <button
                          type="button"
                          onClick={() => iniciarEdicaoRede(r)}
                          className="rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => alternarAtivoRede(r)}
                          className="rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                        >
                          {r.ativo ? "Inativar" : "Ativar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => excluirRede(r)}
                          className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Excluir
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-5 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
        <h2 className="font-semibold text-navy-800">Cadastrar empresa</h2>
        <form onSubmit={criar} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código (único)"
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
                  Nenhuma empresa cadastrada ainda.
                </td>
              </tr>
            ) : (
              empresas.map((emp) => {
                const emEdicao = editandoId === emp.id;
                return (
                  <tr key={emp.id} className="border-t border-navy-100">
                    <td className="px-4 py-3 text-navy-800 font-medium">
                      {emEdicao ? (
                        <input
                          value={editCodigo}
                          onChange={(e) => setEditCodigo(e.target.value)}
                          className="w-24 rounded-lg border border-navy-200 px-2 py-1 text-sm outline-none focus:border-moss-500"
                        />
                      ) : (
                        emp.codigo
                      )}
                    </td>
                    <td className="px-4 py-3 text-navy-800">
                      {emEdicao ? (
                        <div className="flex flex-col gap-1">
                          <input
                            value={editNome}
                            onChange={(e) => setEditNome(e.target.value)}
                            placeholder="Nome / razão social"
                            className="w-full rounded-lg border border-navy-200 px-2 py-1 text-sm outline-none focus:border-moss-500"
                          />
                          <input
                            value={editCnpj}
                            onChange={(e) => setEditCnpj(e.target.value)}
                            placeholder="CNPJ (opcional)"
                            className="w-full rounded-lg border border-navy-200 px-2 py-1 text-xs outline-none focus:border-moss-500"
                          />
                        </div>
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
                      {emEdicao ? (
                        <input
                          value={editParticipacao}
                          onChange={(e) => setEditParticipacao(e.target.value)}
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          className="w-20 rounded-lg border border-navy-200 px-2 py-1 text-sm outline-none focus:border-moss-500"
                        />
                      ) : emp.percentual_participacao != null ? (
                        `${emp.percentual_participacao}%`
                      ) : (
                        "—"
                      )}
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
    </PortalShell>
  );
}
