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
  ativo: boolean;
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
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("");
  const [salvandoSocio, setSalvandoSocio] = useState(false);

  // Participação por empresa
  const [empresaId, setEmpresaId] = useState("");
  const [partData, setPartData] = useState<RespParticipacoes | null>(null);
  const [novoSocioId, setNovoSocioId] = useState("");
  const [novoPercentual, setNovoPercentual] = useState("");
  const [salvandoPart, setSalvandoPart] = useState(false);

  // Distribuição
  const [redeId, setRedeId] = useState("");
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
  }, [redeId]);

  async function criarSocio(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvandoSocio(true);
    try {
      await portalApi.post("/socios", {
        nome: nome.trim(),
        cpf: cpf.trim() || null,
        email: email.trim() || null,
        papel: papel.trim() || null,
      });
      setNome("");
      setCpf("");
      setEmail("");
      setPapel("");
      await carregarBase();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao cadastrar o sócio.");
    } finally {
      setSalvandoSocio(false);
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
              Cadastre os sócios do grupo (só dados — sem login).
            </p>
          </div>
        </div>

        <form onSubmit={criarSocio} className="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">Nome</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do sócio"
              required
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">
              CPF (opcional)
            </label>
            <input
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">
              E-mail (opcional)
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy-500 mb-1">
              Papel (opcional)
            </label>
            <div className="flex gap-2">
              <input
                value={papel}
                onChange={(e) => setPapel(e.target.value)}
                placeholder="ex.: sócio-administrador"
                className="flex-1 rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              />
              <button
                type="submit"
                disabled={salvandoSocio}
                className="rounded-lg bg-moss-600 px-4 py-2 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
              >
                {salvandoSocio ? "..." : "Adicionar"}
              </button>
            </div>
          </div>
        </form>

        {socios.length === 0 ? (
          <p className="mt-4 text-sm text-navy-400">Nenhum sócio cadastrado ainda.</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {socios.map((s) => (
              <span
                key={s.id}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  s.ativo ? "bg-navy-50 text-navy-700" : "bg-navy-100 text-navy-400"
                }`}
              >
                {s.nome}
                {s.papel ? ` · ${s.papel}` : ""}
                {!s.ativo ? " · inativo" : ""}
              </span>
            ))}
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
              Derivada da retirada declarada na DRE × % de cada sócio. Nada é
              gravado — recalculado a cada consulta.
            </p>
          </div>
        </div>

        {redesSelecao.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setRedeId("")}
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
                onClick={() => setRedeId(r.id)}
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
        </div>

        {dist && dist.alertas.length > 0 && (
          <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <Icone nome="alerta" className="h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-xs font-semibold text-amber-800">
                Pontos para validar internamente:
              </p>
              <ul className="mt-1 list-disc pl-4 text-xs text-amber-800">
                {dist.alertas.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

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
