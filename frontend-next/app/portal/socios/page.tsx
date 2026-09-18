"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PortalShell from "@/components/portal-shell";
import { Icone } from "@/components/icons";
import { SeletorEmpresa, type EmpresaOpcao } from "@/components/seletor-empresa";
import { portalApi } from "@/lib/portal-api";

type Socio = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  papel: string | null;
  endereco: string | null;
  cro: string | null;
  ativo: boolean;
};

type CamposSocio = {
  nome: string;
  cpf: string;
  email: string;
  papel: string;
  endereco: string;
  cro: string;
};

const SOCIO_VAZIO: CamposSocio = {
  nome: "",
  cpf: "",
  email: "",
  papel: "",
  endereco: "",
  cro: "",
};

type Empresa = EmpresaOpcao;

type Rede = { id: string; nome: string };

type Participacao = {
  id: string;
  socio_id: string;
  socio_nome: string | null;
  percentual: number | null;
  papel: string | null;
};

type RespParticipacoes = {
  empresa_id: string;
  total_percentual: number;
  soma_fecha_100: boolean;
  participacoes: Participacao[];
};

type RedeOpcao = { id: string | null; nome: string; unidades: number };

type SocioDistribuido = {
  socio_id: string;
  socio_nome: string | null;
  valor_distribuido: number | null;
  empresas: {
    empresa_id: string;
    codigo: string | null;
    nome: string | null;
    percentual: number | null;
    valor: number | null;
  }[];
};

type RespDistribuicao = {
  rede_selecionada: string | null;
  empresa_selecionada: string | null;
  redes: RedeOpcao[];
  socios: SocioDistribuido[];
  empresas: {
    empresa_id: string;
    codigo: string | null;
    nome: string | null;
    retirada_total: number | null;
    soma_percentual: number;
    soma_fecha_100: boolean;
    tem_participacao: boolean;
  }[];
  alertas: string[];
};

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function moeda(v: number | null): string {
  return v == null ? "—" : brl.format(v);
}

function pct(v: number | null): string {
  return v == null ? "—" : `${Number(v).toFixed(2).replace(".", ",")}%`;
}

export default function SociosPage() {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [redesSelecao, setRedesSelecao] = useState<Rede[]>([]);
  const [erro, setErro] = useState("");

  // Cadastro de sócio
  const [novoSocio, setNovoSocio] = useState<CamposSocio>(SOCIO_VAZIO);
  const [salvandoSocio, setSalvandoSocio] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<CamposSocio>(SOCIO_VAZIO);

  // Participação por empresa
  const [empresaId, setEmpresaId] = useState("");
  const [partData, setPartData] = useState<RespParticipacoes | null>(null);
  const [novoSocioId, setNovoSocioId] = useState("");
  const [novoPercentual, setNovoPercentual] = useState("");
  const [salvandoPart, setSalvandoPart] = useState(false);

  // Distribuição
  const [redeId, setRedeId] = useState("");
  const [unidadeDist, setUnidadeDist] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [dist, setDist] = useState<RespDistribuicao | null>(null);
  const [carregandoDist, setCarregandoDist] = useState(false);

  async function carregarBase() {
    try {
      const [sRes, eRes, rRes] = await Promise.all([
        portalApi.get<Socio[]>("/socios"),
        portalApi.get<Empresa[]>("/empresas"),
        portalApi.get<Rede[]>("/redes"),
      ]);
      setSocios(sRes.data);
      setEmpresas(eRes.data);
      setRedesSelecao(rRes.data);
    } catch {
      setErro("Não foi possível carregar sócios e empresas.");
    }
  }

  useEffect(() => {
    carregarBase();
  }, []);

  async function carregarParticipacoes(id: string) {
    if (!id) {
      setPartData(null);
      return;
    }
    try {
      const { data } = await portalApi.get<RespParticipacoes>(
        `/empresas/${id}/participacoes`
      );
      setPartData(data);
    } catch {
      setErro("Não foi possível carregar as participações.");
    }
  }

  useEffect(() => {
    carregarParticipacoes(empresaId);
  }, [empresaId]);

  async function carregarDistribuicao() {
    setCarregandoDist(true);
    setErro("");
    try {
      const params: Record<string, string> = {};
      if (redeId) params.rede_id = redeId;
      if (unidadeDist) params.empresa_id = unidadeDist;
      if (de) params.de = de;
      if (ate) params.ate = ate;
      const { data } = await portalApi.get<RespDistribuicao>("/dre/distribuicao", {
        params,
      });
      setDist(data);
    } catch {
      setErro("Não foi possível calcular a distribuição.");
    } finally {
      setCarregandoDist(false);
    }
  }

  useEffect(() => {
    carregarDistribuicao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redeId, unidadeDist]);

  async function criarSocio(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvandoSocio(true);
    try {
      await portalApi.post("/socios", {
        nome: novoSocio.nome.trim(),
        cpf: novoSocio.cpf.trim() || null,
        email: novoSocio.email.trim() || null,
        papel: novoSocio.papel.trim() || null,
        endereco: novoSocio.endereco.trim() || null,
        cro: novoSocio.cro.trim() || null,
      });
      setNovoSocio(SOCIO_VAZIO);
      await carregarBase();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao cadastrar o sócio.");
    } finally {
      setSalvandoSocio(false);
    }
  }

  function abrirEdicao(s: Socio) {
    setEditandoId(s.id);
    setEdicao({
      nome: s.nome ?? "",
      cpf: s.cpf ?? "",
      email: s.email ?? "",
      papel: s.papel ?? "",
      endereco: s.endereco ?? "",
      cro: s.cro ?? "",
    });
  }

  async function salvarEdicao(id: string) {
    setErro("");
    try {
      await portalApi.patch(`/socios/${id}`, {
        nome: edicao.nome.trim(),
        cpf: edicao.cpf.trim() || null,
        email: edicao.email.trim() || null,
        papel: edicao.papel.trim() || null,
        endereco: edicao.endereco.trim() || null,
        cro: edicao.cro.trim() || null,
      });
      setEditandoId(null);
      await carregarBase();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao salvar o sócio.");
    }
  }

  async function alternarAtivo(s: Socio) {
    setErro("");
    try {
      await portalApi.patch(`/socios/${s.id}`, { ativo: !s.ativo });
      await carregarBase();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao atualizar o sócio.");
    }
  }

  async function adicionarParticipacao(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvandoPart(true);
    try {
      await portalApi.post("/participacoes", {
        empresa_id: empresaId,
        socio_id: novoSocioId,
        percentual: Number(novoPercentual),
      });
      setNovoSocioId("");
      setNovoPercentual("");
      await carregarParticipacoes(empresaId);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao adicionar a participação.");
    } finally {
      setSalvandoPart(false);
    }
  }

  async function removerParticipacao(id: string) {
    setErro("");
    try {
      await portalApi.delete(`/participacoes/${id}`);
      await carregarParticipacoes(empresaId);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao remover a participação.");
    }
  }

  const sociosDisponiveis = useMemo(
    () => socios.filter((s) => s.ativo),
    [socios]
  );

  // Unidades oferecidas no filtro da distribuição, restritas à rede escolhida.
  const empresasDaRede = useMemo(
    () => (redeId ? empresas.filter((e) => e.rede_id === redeId) : empresas),
    [empresas, redeId]
  );

  const unidadeDistSelecionada =
    empresas.find((e) => e.id === unidadeDist) ?? null;

  const empresaSelecionada = empresas.find((e) => e.id === empresaId) ?? null;

  return (
    <PortalShell titulo="Sócios & Distribuição">
      {erro && <p className="mb-4 text-sm text-red-600">{erro}</p>}

      {/* Sócios */}
      <section className="rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-moss-50 text-moss-700">
            <Icone nome="socios" className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-navy-800">Sócios</h2>
            <p className="text-sm text-navy-500">
              Cadastro dos sócios do grupo (só dados — sem login no sistema).
            </p>
          </div>
        </div>

        <form onSubmit={criarSocio} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">Nome</label>
            <input
              value={novoSocio.nome}
              onChange={(e) => setNovoSocio({ ...novoSocio, nome: e.target.value })}
              placeholder="Nome completo"
              required
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">CPF</label>
            <input
              value={novoSocio.cpf}
              onChange={(e) => setNovoSocio({ ...novoSocio, cpf: e.target.value })}
              placeholder="000.000.000-00"
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">E-mail</label>
            <input
              type="email"
              value={novoSocio.email}
              onChange={(e) => setNovoSocio({ ...novoSocio, email: e.target.value })}
              placeholder="nome@email.com"
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">Papel</label>
            <input
              value={novoSocio.papel}
              onChange={(e) => setNovoSocio({ ...novoSocio, papel: e.target.value })}
              placeholder="ex.: sócio-administrador"
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">CRO</label>
            <input
              value={novoSocio.cro}
              onChange={(e) => setNovoSocio({ ...novoSocio, cro: e.target.value })}
              placeholder="ex.: CRO-SP 12345"
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">Endereço</label>
            <input
              value={novoSocio.endereco}
              onChange={(e) => setNovoSocio({ ...novoSocio, endereco: e.target.value })}
              placeholder="Rua, nº, bairro, cidade/UF"
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={salvandoSocio}
              className="w-full rounded-lg bg-moss-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60 sm:w-auto"
            >
              {salvandoSocio ? "Salvando..." : "Cadastrar sócio"}
            </button>
          </div>
        </form>

        {socios.length === 0 ? (
          <p className="mt-4 text-sm text-navy-400">Nenhum sócio cadastrado ainda.</p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-lg border border-navy-100">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-700">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Nome</th>
                  <th className="text-left font-semibold px-3 py-2">CPF</th>
                  <th className="text-left font-semibold px-3 py-2">E-mail</th>
                  <th className="text-left font-semibold px-3 py-2">Papel</th>
                  <th className="text-left font-semibold px-3 py-2">CRO</th>
                  <th className="text-left font-semibold px-3 py-2">Endereço</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {socios.map((s) =>
                  editandoId === s.id ? (
                    <tr key={s.id} className="border-t border-navy-100 bg-moss-50/40">
                      {(["nome", "cpf", "email", "papel", "cro", "endereco"] as const).map(
                        (campo) => (
                          <td key={campo} className="px-2 py-2">
                            <input
                              value={edicao[campo]}
                              onChange={(e) =>
                                setEdicao({ ...edicao, [campo]: e.target.value })
                              }
                              className="w-full min-w-[7rem] rounded border border-navy-200 px-2 py-1 text-xs text-navy-800 outline-none focus:border-moss-500"
                            />
                          </td>
                        )
                      )}
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => salvarEdicao(s.id)}
                          className="rounded-lg bg-moss-600 px-3 py-1 text-xs font-semibold text-white hover:bg-moss-700"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditandoId(null)}
                          className="ml-2 rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-600 hover:bg-navy-50"
                        >
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={s.id}
                      className={`border-t border-navy-100 ${s.ativo ? "" : "opacity-60"}`}
                    >
                      <td className="px-3 py-2 font-medium text-navy-800">
                        {s.nome}
                        {!s.ativo && (
                          <span className="ml-2 rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-medium text-navy-500">
                            inativo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-navy-600">{s.cpf || "—"}</td>
                      <td className="px-3 py-2 text-navy-600">{s.email || "—"}</td>
                      <td className="px-3 py-2 text-navy-600">{s.papel || "—"}</td>
                      <td className="px-3 py-2 text-navy-600">{s.cro || "—"}</td>
                      <td className="px-3 py-2 text-navy-600">
                        <span
                          className="block max-w-[14rem] truncate"
                          title={s.endereco || undefined}
                        >
                          {s.endereco || "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => abrirEdicao(s)}
                          className="rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-600 hover:bg-navy-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => alternarAtivo(s)}
                          className="ml-2 rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-600 hover:bg-navy-50"
                        >
                          {s.ativo ? "Inativar" : "Ativar"}
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Participação por empresa */}
      <div className="mt-6">
        <SeletorEmpresa
          empresas={empresas}
          redes={redesSelecao}
          value={empresaId}
          onChange={setEmpresaId}
          titulo="Participação por empresa"
          descricao="Escolha a unidade para vincular sócios e conferir se a soma fecha 100%."
        />
      </div>

      {!empresaId ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/40 px-6 py-14 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-navy-300 shadow-sm">
            <Icone nome="socios" className="h-6 w-6" />
          </div>
          <p className="font-medium text-navy-700">Selecione uma empresa acima</p>
          <p className="text-sm text-navy-400">
            Vincule os sócios e o % de participação de cada um.
          </p>
        </div>
      ) : (
        <section className="mt-6 rounded-xl bg-white border border-navy-100 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 p-5 pb-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-moss-50 text-moss-700">
              <Icone nome="socios" className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-navy-800">
                Participações — {empresaSelecionada?.codigo}
              </h2>
              <p className="text-sm text-navy-500">{empresaSelecionada?.nome_razao_social}</p>
            </div>
            {partData && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  partData.soma_fecha_100
                    ? "bg-moss-100 text-moss-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                Soma: {pct(partData.total_percentual)}
                {partData.soma_fecha_100 ? "" : " (não fecha 100%)"}
              </span>
            )}
          </div>

          <form onSubmit={adicionarParticipacao} className="grid gap-3 p-5 pt-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-navy-500 mb-1">Sócio</label>
              <select
                value={novoSocioId}
                onChange={(e) => setNovoSocioId(e.target.value)}
                required
                className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              >
                <option value="">Selecione o sócio</option>
                {sociosDisponiveis.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-navy-500 mb-1">
                % de participação
              </label>
              <input
                value={novoPercentual}
                onChange={(e) => setNovoPercentual(e.target.value)}
                type="number"
                min={0}
                max={100}
                step="0.01"
                placeholder="0 a 100"
                required
                className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={salvandoPart}
                className="w-full rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
              >
                {salvandoPart ? "Salvando..." : "Vincular sócio"}
              </button>
            </div>
          </form>

          <div className="border-t border-navy-100">
            {!partData || partData.participacoes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy-50 text-navy-300">
                  <Icone nome="socios" className="h-6 w-6" />
                </div>
                <p className="text-sm text-navy-500">
                  Nenhum sócio vinculado a esta empresa.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop / tablet */}
                <table className="hidden w-full text-sm md:table">
                  <thead className="bg-navy-50 text-navy-700">
                    <tr>
                      <th className="text-left font-semibold px-4 py-2">Sócio</th>
                      <th className="text-left font-semibold px-4 py-2">Papel</th>
                      <th className="text-right font-semibold px-4 py-2">%</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {partData.participacoes.map((p) => (
                      <tr key={p.id} className="border-t border-navy-100">
                        <td className="px-4 py-2 text-navy-800">{p.socio_nome ?? "—"}</td>
                        <td className="px-4 py-2 text-navy-600">{p.papel ?? "—"}</td>
                        <td className="px-4 py-2 text-right text-navy-800">
                          {pct(p.percentual)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => removerParticipacao(p.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile */}
                <div className="divide-y divide-navy-100 md:hidden">
                  {partData.participacoes.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy-800">
                          {p.socio_nome ?? "—"}
                        </p>
                        <p className="text-xs text-navy-500">
                          {p.papel ?? "—"} · {pct(p.percentual)}
                        </p>
                      </div>
                      <button
                        onClick={() => removerParticipacao(p.id)}
                        className="shrink-0 rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* Distribuição de lucros */}
      <section className="mt-6 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-moss-50 text-moss-700">
            <Icone nome="orcamento" className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-navy-800">Distribuição de lucros</h2>
            <p className="text-sm text-navy-500">
              {unidadeDistSelecionada
                ? `Somente ${unidadeDistSelecionada.codigo} — ${unidadeDistSelecionada.nome_razao_social}.`
                : "Somando todas as unidades do filtro atual."}{" "}
              Derivada da retirada declarada na DRE × % de cada sócio.
            </p>
          </div>
        </div>

        {redesSelecao.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setRedeId("");
                setUnidadeDist("");
              }}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                redeId === ""
                  ? "border-navy-700 bg-navy-700 text-white"
                  : "border-navy-100 bg-white text-navy-600 hover:border-navy-300"
              }`}
            >
              Todos os negócios
            </button>
            {redesSelecao.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setRedeId(r.id);
                  setUnidadeDist("");
                }}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  redeId === r.id
                    ? "border-navy-700 bg-navy-700 text-white"
                    : "border-navy-100 bg-white text-navy-600 hover:border-navy-300"
                }`}
              >
                {r.nome}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">Unidade</label>
            <select
              value={unidadeDist}
              onChange={(e) => setUnidadeDist(e.target.value)}
              className="w-56 rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            >
              <option value="">Todas as unidades</option>
              {empresasDaRede.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.codigo} — {emp.nome_razao_social}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">De</label>
            <input
              type="month"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">Até</label>
            <input
              type="month"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </div>
          <button
            onClick={carregarDistribuicao}
            disabled={carregandoDist}
            className="rounded-lg bg-moss-600 px-4 py-2 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
          >
            {carregandoDist ? "Calculando..." : "Aplicar período"}
          </button>
          {(unidadeDist || de || ate) && (
            <button
              type="button"
              onClick={() => {
                setUnidadeDist("");
                setDe("");
                setAte("");
              }}
              className="rounded-lg border border-navy-200 px-3 py-2 text-sm font-medium text-navy-600 hover:bg-navy-50"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-navy-100">
          {!dist || dist.socios.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy-50 text-navy-300">
                <Icone nome="orcamento" className="h-6 w-6" />
              </div>
              <p className="text-sm text-navy-500">
                Sem distribuição no período (cadastre participações e envie DREs
                com retirada).
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-700">
                <tr>
                  <th className="text-left font-semibold px-4 py-2">Sócio</th>
                  <th className="text-right font-semibold px-4 py-2">
                    Distribuição no período
                  </th>
                </tr>
              </thead>
              <tbody>
                {dist.socios.map((s) => (
                  <tr key={s.socio_id} className="border-t border-navy-100">
                    <td className="px-4 py-2 text-navy-800">{s.socio_nome ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-medium text-navy-900">
                      {moeda(s.valor_distribuido)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </PortalShell>
  );
}
