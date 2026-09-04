"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminShell from "@/components/admin-shell";
import { adminApi } from "@/lib/admin-api";

type Cliente = { id: string; nome: string };

type Empresa = {
  id: string;
  codigo: string;
  nome_razao_social: string;
  cnpj: string | null;
  segmento: string | null;
  percentual_participacao: number | null;
  ativa: boolean;
};

export default function EmpresasPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [segmento, setSegmento] = useState("");
  const [participacao, setParticipacao] = useState("");

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
      const { data } = await adminApi.get<Empresa[]>("/admin/empresas", {
        params: { cliente_id: id },
      });
      setEmpresas(data);
    } catch {
      setErro("Não foi possível carregar as empresas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarEmpresas(clienteId);
  }, [clienteId]);

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
      });
      setCodigo("");
      setNome("");
      setCnpj("");
      setSegmento("");
      setParticipacao("");
      await carregarEmpresas(clienteId);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao criar a empresa.");
    } finally {
      setSalvando(false);
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
            <h2 className="font-semibold text-navy-800">Nova empresa / unidade</h2>
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
                  <th className="text-left font-semibold px-4 py-3">Segmento</th>
                  <th className="text-left font-semibold px-4 py-3">%</th>
                  <th className="text-left font-semibold px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-navy-500">
                      Carregando...
                    </td>
                  </tr>
                ) : empresas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-navy-500">
                      Nenhuma empresa cadastrada para este cliente.
                    </td>
                  </tr>
                ) : (
                  empresas.map((emp) => (
                    <tr key={emp.id} className="border-t border-navy-100">
                      <td className="px-4 py-3 text-navy-800 font-medium">
                        {emp.codigo}
                      </td>
                      <td className="px-4 py-3 text-navy-800">
                        {emp.nome_razao_social}
                      </td>
                      <td className="px-4 py-3 text-navy-600">
                        {emp.segmento ?? "—"}
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </AdminShell>
  );
}
