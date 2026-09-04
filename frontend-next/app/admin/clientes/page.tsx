"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminShell from "@/components/admin-shell";
import { adminApi } from "@/lib/admin-api";

type Cliente = {
  id: string;
  nome: string;
  cnpj: string | null;
  ativo: boolean;
  criado_em: string;
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const { data } = await adminApi.get<Cliente[]>("/admin/clientes");
      setClientes(data);
    } catch {
      setErro("Não foi possível carregar os clientes.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      await adminApi.post("/admin/clientes", {
        nome: nome.trim(),
        cnpj: cnpj.trim() || null,
      });
      setNome("");
      setCnpj("");
      await carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao criar o cliente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AdminShell titulo="Clientes">
      <section className="rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
        <h2 className="font-semibold text-navy-800">Novo cliente</h2>
        <form onSubmit={criar} className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do cliente"
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
          <button
            type="submit"
            disabled={salvando}
            className="rounded-lg bg-moss-600 px-4 py-2 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Adicionar"}
          </button>
        </form>
        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
      </section>

      <section className="mt-6 rounded-xl bg-white border border-navy-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-700">
            <tr>
              <th className="text-left font-semibold px-4 py-3">Nome</th>
              <th className="text-left font-semibold px-4 py-3">CNPJ</th>
              <th className="text-left font-semibold px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-navy-500">
                  Carregando...
                </td>
              </tr>
            ) : clientes.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-navy-500">
                  Nenhum cliente cadastrado ainda.
                </td>
              </tr>
            ) : (
              clientes.map((c) => (
                <tr key={c.id} className="border-t border-navy-100">
                  <td className="px-4 py-3 text-navy-800 font-medium">{c.nome}</td>
                  <td className="px-4 py-3 text-navy-600">{c.cnpj ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.ativo
                          ? "bg-moss-100 text-moss-800"
                          : "bg-navy-100 text-navy-600"
                      }`}
                    >
                      {c.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
