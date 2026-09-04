"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import PortalShell from "@/components/portal-shell";
import { portalApi } from "@/lib/portal-api";

type Empresa = { id: string; codigo: string; nome_razao_social: string };

type Orcamento = {
  id: string;
  mes_referencia: string;
  receita_liquida: number | null;
  lucro_liquido: number | null;
  retirada: number | null;
  observacao: string | null;
};

type Variacao = { valor: number | null; percentual: number | null };

type CampoComparativo = {
  previsto: number | null;
  realizado: number | null;
  variacao: Variacao;
};

type MesComparativo = {
  mes_referencia: string;
  tem_previsto: boolean;
  tem_realizado: boolean;
  receita_liquida: CampoComparativo;
  lucro_liquido: CampoComparativo;
  retirada: CampoComparativo;
};

type RespComparativo = {
  empresa_id: string;
  campos: string[];
  meses: MesComparativo[];
};

const CAMPO_LABEL: Record<string, string> = {
  receita_liquida: "Receita líquida",
  lucro_liquido: "Lucro líquido",
  retirada: "Retirada",
};

const MESES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function moeda(v: number | null): string {
  return v == null ? "—" : brl.format(v);
}

function rotuloMes(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${MESES_ABREV[Number(mes) - 1]}/${ano.slice(2)}`;
}

function numOuNull(v: string): number | null {
  const t = v.trim();
  return t === "" ? null : Number(t);
}

// converte um valor já salvo (pode ter centavos de digitação antiga) p/ dígitos inteiros da máscara
function paraDigitos(v: number | null): string {
  return v != null ? String(Math.round(v)) : "";
}

// campo de valor em reais: guarda só dígitos (reais inteiros) e exibe formatado com separador de milhar
function CampoMoeda({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const exibicao = value ? Number(value).toLocaleString("pt-BR") : "";
  return (
    <div
      className={`flex items-center gap-1 rounded-lg text-sm text-navy-800 focus-within:border-moss-500 ${className}`}
    >
      <span className="text-navy-400">R$</span>
      <input
        type="text"
        inputMode="numeric"
        value={exibicao}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent text-right outline-none"
      />
    </div>
  );
}

export default function OrcamentoPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [metas, setMetas] = useState<Orcamento[]>([]);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  // formulário de nova meta
  const [mes, setMes] = useState("");
  const [receita, setReceita] = useState("");
  const [lucro, setLucro] = useState("");
  const [retirada, setRetirada] = useState("");
  const [salvando, setSalvando] = useState(false);

  // edição inline
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editReceita, setEditReceita] = useState("");
  const [editLucro, setEditLucro] = useState("");
  const [editRetirada, setEditRetirada] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  // comparativo
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [comparativo, setComparativo] = useState<RespComparativo | null>(null);
  const [carregandoComp, setCarregandoComp] = useState(false);

  useEffect(() => {
    portalApi
      .get<Empresa[]>("/empresas")
      .then(({ data }) => {
        setEmpresas(data);
        if (data.length === 1) setEmpresaId(data[0].id);
      })
      .catch(() => {});
  }, []);

  async function carregarMetas() {
    if (!empresaId) {
      setMetas([]);
      return;
    }
    try {
      const { data } = await portalApi.get<Orcamento[]>("/orcamento", {
        params: { empresa_id: empresaId },
      });
      setMetas(data);
    } catch {
      setErro("Não foi possível carregar as metas.");
    }
  }

  useEffect(() => {
    setComparativo(null);
    carregarMetas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function criarMeta(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setOk("");
    if (!empresaId) {
      setErro("Selecione uma empresa.");
      return;
    }
    if (!mes) {
      setErro("Informe o mês da meta.");
      return;
    }
    setSalvando(true);
    try {
      await portalApi.post("/orcamento", {
        empresa_id: empresaId,
        mes_referencia: mes,
        receita_liquida: numOuNull(receita),
        lucro_liquido: numOuNull(lucro),
        retirada: numOuNull(retirada),
      });
      setMes("");
      setReceita("");
      setLucro("");
      setRetirada("");
      setOk("Meta cadastrada.");
      await carregarMetas();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao cadastrar a meta.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(m: Orcamento) {
    setEditandoId(m.id);
    setEditReceita(paraDigitos(m.receita_liquida));
    setEditLucro(paraDigitos(m.lucro_liquido));
    setEditRetirada(paraDigitos(m.retirada));
    setErro("");
    setOk("");
  }

  async function salvarEdicao(m: Orcamento) {
    setSalvandoEdicao(true);
    setErro("");
    try {
      await portalApi.patch(`/orcamento/${m.id}`, {
        receita_liquida: numOuNull(editReceita),
        lucro_liquido: numOuNull(editLucro),
        retirada: numOuNull(editRetirada),
      });
      setEditandoId(null);
      await carregarMetas();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao salvar a meta.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function excluirMeta(m: Orcamento) {
    if (!window.confirm(`Excluir a meta de ${rotuloMes(m.mes_referencia)}?`)) return;
    setErro("");
    try {
      await portalApi.delete(`/orcamento/${m.id}`);
      await carregarMetas();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao excluir a meta.");
    }
  }

  async function carregarComparativo() {
    if (!empresaId) {
      setErro("Selecione uma empresa.");
      return;
    }
    setCarregandoComp(true);
    setErro("");
    try {
      const { data } = await portalApi.get<RespComparativo>("/orcamento/comparativo", {
        params: { empresa_id: empresaId, de: de || undefined, ate: ate || undefined },
      });
      setComparativo(data);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao carregar o comparativo.");
    } finally {
      setCarregandoComp(false);
    }
  }

  return (
    <PortalShell titulo="Orçamento">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-navy-700">Empresa:</label>
        <select
          value={empresaId}
          onChange={(e) => setEmpresaId(e.target.value)}
          className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
        >
          <option value="">Selecione…</option>
          {empresas.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.codigo} — {emp.nome_razao_social}
            </option>
          ))}
        </select>
      </div>

      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
      {ok && <p className="mt-3 text-sm text-moss-700">{ok}</p>}

      {empresaId && (
        <>
          <section className="mt-5 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
            <h2 className="font-semibold text-navy-800">Cadastrar meta do mês</h2>
            <p className="mt-1 text-sm text-navy-500">
              Informe quanto você espera para o mês. Campos em branco = não consta
              (não assumimos zero).
            </p>
            <form onSubmit={criarMeta} className="mt-3 grid gap-3 sm:grid-cols-5">
              <input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                required
                className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              />
              <CampoMoeda
                value={receita}
                onChange={setReceita}
                placeholder="Receita líquida"
                className="border border-navy-100 px-3 py-2"
              />
              <CampoMoeda
                value={lucro}
                onChange={setLucro}
                placeholder="Lucro líquido"
                className="border border-navy-100 px-3 py-2"
              />
              <CampoMoeda
                value={retirada}
                onChange={setRetirada}
                placeholder="Retirada"
                className="border border-navy-100 px-3 py-2"
              />
              <button
                type="submit"
                disabled={salvando}
                className="rounded-lg bg-moss-600 px-4 py-2 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Adicionar"}
              </button>
            </form>
          </section>

          <section className="mt-6 rounded-xl bg-white border border-navy-100 shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b border-navy-100">
              <h2 className="font-semibold text-navy-800">Metas cadastradas</h2>
            </div>
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-navy-50 text-navy-700">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Mês</th>
                  <th className="text-right font-semibold px-4 py-3">Receita líq.</th>
                  <th className="text-right font-semibold px-4 py-3">Lucro líq.</th>
                  <th className="text-right font-semibold px-4 py-3">Retirada</th>
                  <th className="text-right font-semibold px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {metas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-navy-500">
                      Nenhuma meta cadastrada ainda.
                    </td>
                  </tr>
                ) : (
                  metas.map((m) => {
                    const emEdicao = editandoId === m.id;
                    return (
                      <tr key={m.id} className="border-t border-navy-100">
                        <td className="px-4 py-3 text-navy-800 font-medium">
                          {rotuloMes(m.mes_referencia)}
                        </td>
                        <td className="px-4 py-3 text-right text-navy-700">
                          {emEdicao ? (
                            <CampoMoeda
                              value={editReceita}
                              onChange={setEditReceita}
                              className="w-28 border border-navy-200 px-2 py-1"
                            />
                          ) : (
                            moeda(m.receita_liquida)
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-navy-700">
                          {emEdicao ? (
                            <CampoMoeda
                              value={editLucro}
                              onChange={setEditLucro}
                              className="w-28 border border-navy-200 px-2 py-1"
                            />
                          ) : (
                            moeda(m.lucro_liquido)
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-navy-700">
                          {emEdicao ? (
                            <CampoMoeda
                              value={editRetirada}
                              onChange={setEditRetirada}
                              className="w-28 border border-navy-200 px-2 py-1"
                            />
                          ) : (
                            moeda(m.retirada)
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {emEdicao ? (
                            <>
                              <button
                                type="button"
                                onClick={() => salvarEdicao(m)}
                                disabled={salvandoEdicao}
                                className="rounded-lg bg-moss-600 px-3 py-1 text-xs font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
                              >
                                {salvandoEdicao ? "Salvando..." : "Salvar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditandoId(null)}
                                className="ml-2 rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-600 hover:bg-navy-50"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => iniciarEdicao(m)}
                                className="rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => excluirMeta(m)}
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

          <section className="mt-6 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
            <h2 className="font-semibold text-navy-800">Previsto × Realizado</h2>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-navy-500">De</label>
                <input
                  type="month"
                  value={de}
                  onChange={(e) => setDe(e.target.value)}
                  className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
                />
              </div>
              <div>
                <label className="block text-xs text-navy-500">Até</label>
                <input
                  type="month"
                  value={ate}
                  onChange={(e) => setAte(e.target.value)}
                  className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
                />
              </div>
              <button
                type="button"
                onClick={carregarComparativo}
                disabled={carregandoComp}
                className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
              >
                {carregandoComp ? "Carregando..." : "Comparar"}
              </button>
            </div>

            {comparativo && (
              <div className="mt-4 overflow-x-auto">
                {comparativo.meses.length === 0 ? (
                  <p className="text-sm text-navy-500">
                    Nenhum dado no período (nem meta, nem DRE).
                  </p>
                ) : (
                  <table className="w-full text-sm min-w-[820px]">
                    <thead className="bg-navy-50 text-navy-700">
                      <tr>
                        <th className="text-left font-semibold px-3 py-2">Mês</th>
                        {comparativo.campos.map((c) => (
                          <th
                            key={c}
                            colSpan={3}
                            className="text-center font-semibold px-3 py-2 border-l border-navy-100"
                          >
                            {CAMPO_LABEL[c] ?? c}
                          </th>
                        ))}
                      </tr>
                      <tr className="text-xs text-navy-500">
                        <th className="px-3 py-1"></th>
                        {comparativo.campos.map((c) => (
                          <Fragment key={c}>
                            <th className="px-3 py-1 text-right border-l border-navy-100">
                              Previsto
                            </th>
                            <th className="px-3 py-1 text-right">
                              Realizado
                            </th>
                            <th className="px-3 py-1 text-right">
                              Variação
                            </th>
                          </Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparativo.meses.map((m) => (
                        <tr key={m.mes_referencia} className="border-t border-navy-100">
                          <td className="px-3 py-2 text-navy-800 font-medium">
                            {rotuloMes(m.mes_referencia)}
                          </td>
                          {comparativo.campos.map((c) => {
                            const campo = m[c as keyof MesComparativo] as CampoComparativo;
                            const v = campo.variacao;
                            const cor =
                              v.valor == null
                                ? "text-navy-400"
                                : v.valor >= 0
                                  ? "text-moss-700"
                                  : "text-red-600";
                            return (
                              <Fragment key={c}>
                                <td className="px-3 py-2 text-right text-navy-600 border-l border-navy-100">
                                  {moeda(campo.previsto)}
                                </td>
                                <td className="px-3 py-2 text-right text-navy-800">
                                  {moeda(campo.realizado)}
                                </td>
                                <td className={`px-3 py-2 text-right font-medium ${cor}`}>
                                  {v.valor == null ? "—" : moeda(v.valor)}
                                  {v.percentual != null && (
                                    <span className="block text-xs font-normal">
                                      {v.percentual > 0 ? "+" : ""}
                                      {v.percentual.toFixed(1).replace(".", ",")}%
                                    </span>
                                  )}
                                </td>
                              </Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </PortalShell>
  );
}
