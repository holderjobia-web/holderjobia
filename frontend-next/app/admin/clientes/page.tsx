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

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCnpj, setEditCnpj] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

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

  function iniciarEdicao(c: Cliente) {
    setEditandoId(c.id);
    setEditNome(c.nome);
    setEditCnpj(c.cnpj ?? "");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
  }

  async function salvarEdicao(c: Cliente) {
    if (editNome.trim().length < 2) {
      setErro("O nome do cliente precisa ter ao menos 2 caracteres.");
      return;
    }
    setSalvandoEdicao(true);
    setErro("");
    try {
      await adminApi.patch(`/admin/clientes/${c.id}`, {
        nome: editNome.trim(),
        cnpj: editCnpj.trim() || null,
      });
      setEditandoId(null);
      await carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao salvar o cliente.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function alternarAtivo(c: Cliente) {
    setErro("");
    try {
      await adminApi.patch(`/admin/clientes/${c.id}`, { ativo: !c.ativo });
      await carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao alterar o status.");
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
              <th className="text-right font-semibold px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-navy-500">
                  Carregando...
                </td>
              </tr>
            ) : clientes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-navy-500">
                  Nenhum cliente cadastrado ainda.
                </td>
              </tr>
            ) : (
              clientes.map((c) => {
                const emEdicao = editandoId === c.id;
                return (
                  <tr key={c.id} className="border-t border-navy-100">
                    <td className="px-4 py-3 text-navy-800 font-medium">
                      {emEdicao ? (
                        <input
                          value={editNome}
                          onChange={(e) => setEditNome(e.target.value)}
                          className="w-full rounded-lg border border-navy-200 px-2 py-1 text-sm outline-none focus:border-moss-500"
                        />
                      ) : (
                        c.nome
                      )}
                    </td>
                    <td className="px-4 py-3 text-navy-600">
                      {emEdicao ? (
                        <input
                          value={editCnpj}
                          onChange={(e) => setEditCnpj(e.target.value)}
                          placeholder="CNPJ"
                          className="w-full rounded-lg border border-navy-200 px-2 py-1 text-sm outline-none focus:border-moss-500"
                        />
                      ) : (
                        c.cnpj ?? "—"
                      )}
                    </td>
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
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {emEdicao ? (
                        <>
                          <button
                            type="button"
                            onClick={() => salvarEdicao(c)}
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
                            onClick={() => iniciarEdicao(c)}
                            className="rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => alternarAtivo(c)}
                            className="ml-2 rounded-lg border border-navy-200 px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                          >
                            {c.ativo ? "Inativar" : "Ativar"}
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
    </AdminShell>
  );
}
