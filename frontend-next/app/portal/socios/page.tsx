"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PortalShell from "@/components/portal-shell";
import { portalApi } from "@/lib/portal-api";

type Socio = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  papel: string | null;
  ativo: boolean;
};

type Empresa = {
  id: string;
  codigo: string;
  nome_razao_social: string;
};

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
      const [sRes, eRes] = await Promise.all([
        portalApi.get<Socio[]>("/socios"),
        portalApi.get<Empresa[]>("/empresas"),
      ]);
      setSocios(sRes.data);
      setEmpresas(eRes.data);
      if (eRes.data.length > 0 && !empresaId) setEmpresaId(eRes.data[0].id);
    } catch {
      setErro("Não foi possível carregar sócios e empresas.");
    }
  }

  useEffect(() => {
    carregarBase();
  }, []);

  async function carregarParticipacoes(id: string) {
    if (!id) return;
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

  const redes = dist?.redes ?? [];
  const sociosDisponiveis = useMemo(
    () => socios.filter((s) => s.ativo),
    [socios]
  );

  return (
    <PortalShell titulo="Sócios & Distribuição">
      {erro && <p className="mb-4 text-sm text-red-600">{erro}</p>}

      {/* Sócios */}
      <section className="rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
        <h2 className="font-semibold text-navy-800">Sócios</h2>
        <form onSubmit={criarSocio} className="mt-3 grid gap-3 sm:grid-cols-4">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do sócio"
            required
            className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
          />
          <input
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            placeholder="CPF (opcional)"
            className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail (opcional)"
            className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
          />
          <div className="flex gap-2">
            <input
              value={papel}
              onChange={(e) => setPapel(e.target.value)}
              placeholder="Papel (opcional)"
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
        </form>

        {socios.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {socios.map((s) => (
              <span
                key={s.id}
                className="rounded-full bg-navy-50 px-3 py-1 text-xs font-medium text-navy-700"
              >
                {s.nome}
                {s.papel ? ` · ${s.papel}` : ""}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Participação por empresa */}
      <section className="mt-6 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-navy-800">Participação por empresa</h2>
          <select
            value={empresaId}
            onChange={(e) => setEmpresaId(e.target.value)}
            className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
          >
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo} — {e.nome_razao_social}
              </option>
            ))}
          </select>
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

        <form
          onSubmit={adicionarParticipacao}
          className="mt-3 grid gap-3 sm:grid-cols-3"
        >
          <select
            value={novoSocioId}
            onChange={(e) => setNovoSocioId(e.target.value)}
            required
            className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
          >
            <option value="">Selecione o sócio</option>
            {sociosDisponiveis.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <input
            value={novoPercentual}
            onChange={(e) => setNovoPercentual(e.target.value)}
            type="number"
            min={0}
            max={100}
            step="0.01"
            placeholder="% de participação"
            required
            className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
          />
          <button
            type="submit"
            disabled={salvandoPart || !empresaId}
            className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
          >
            {salvandoPart ? "Salvando..." : "Vincular sócio"}
          </button>
        </form>

        <table className="mt-4 w-full text-sm">
          <thead className="bg-navy-50 text-navy-700">
            <tr>
              <th className="text-left font-semibold px-4 py-2">Sócio</th>
              <th className="text-left font-semibold px-4 py-2">Papel</th>
              <th className="text-right font-semibold px-4 py-2">%</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {!partData || partData.participacoes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-5 text-center text-navy-500">
                  Nenhum sócio vinculado a esta empresa.
                </td>
              </tr>
            ) : (
              partData.participacoes.map((p) => (
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
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Distribuição de lucros */}
      <section className="mt-6 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="font-semibold text-navy-800">Distribuição de lucros</h2>
          {redes.length > 0 && (
            <select
              value={redeId}
              onChange={(e) => setRedeId(e.target.value)}
              className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
            >
              <option value="">Todos os negócios</option>
              {redes
                .filter((r) => r.id != null)
                .map((r) => (
                  <option key={r.id} value={r.id as string}>
                    {r.nome} ({r.unidades})
                  </option>
                ))}
            </select>
          )}
          <label className="text-xs text-navy-600">
            De
            <input
              type="month"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="ml-1 rounded-lg border border-navy-100 px-2 py-1.5 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </label>
          <label className="text-xs text-navy-600">
            Até
            <input
              type="month"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="ml-1 rounded-lg border border-navy-100 px-2 py-1.5 text-sm text-navy-800 outline-none focus:border-moss-500"
            />
          </label>
          <button
            onClick={carregarDistribuicao}
            disabled={carregandoDist}
            className="rounded-lg bg-moss-600 px-4 py-2 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
          >
            {carregandoDist ? "Calculando..." : "Aplicar período"}
          </button>
        </div>

        <p className="mt-2 text-xs text-navy-500">
          Valores derivados da retirada declarada na DRE × % de cada sócio. Nada é
          gravado — recalculado a cada consulta.
        </p>

        {dist && dist.alertas.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-semibold text-amber-800">
              Pontos para validar internamente:
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
              {dist.alertas.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}

        <table className="mt-4 w-full text-sm">
          <thead className="bg-navy-50 text-navy-700">
            <tr>
              <th className="text-left font-semibold px-4 py-2">Sócio</th>
              <th className="text-right font-semibold px-4 py-2">
                Distribuição no período
              </th>
            </tr>
          </thead>
          <tbody>
            {!dist || dist.socios.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-5 text-center text-navy-500">
                  Sem distribuição no período (cadastre participações e envie DREs
                  com retirada).
                </td>
              </tr>
            ) : (
              dist.socios.map((s) => (
                <tr key={s.socio_id} className="border-t border-navy-100">
                  <td className="px-4 py-2 text-navy-800">{s.socio_nome ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-medium text-navy-900">
                    {moeda(s.valor_distribuido)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </PortalShell>
  );
}
