"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminShell from "@/components/admin-shell";
import { adminApi } from "@/lib/admin-api";

type Cliente = { id: string; nome: string };

type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  ativo: boolean;
  senha_temporaria: boolean;
};

export default function UsuariosPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState("admin_cliente");
  const [senhaGerada, setSenhaGerada] = useState("");

  useEffect(() => {
    adminApi
      .get<Cliente[]>("/admin/clientes")
      .then(({ data }) => {
        setClientes(data);
        if (data.length > 0) setClienteId(data[0].id);
      })
      .catch(() => setErro("Não foi possível carregar os clientes."));
  }, []);

  async function carregarUsuarios(id: string) {
    if (!id) return;
    setCarregando(true);
    try {
      const { data } = await adminApi.get<Usuario[]>("/admin/usuarios", {
        params: { cliente_id: id },
      });
      setUsuarios(data);
    } catch {
      setErro("Não foi possível carregar os usuários.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarUsuarios(clienteId);
  }, [clienteId]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSenhaGerada("");
    setSalvando(true);
    try {
      const { data } = await adminApi.post("/admin/usuarios", {
        cliente_id: clienteId,
        nome: nome.trim(),
        email: email.trim(),
        perfil,
      });
      setSenhaGerada(data.senha_temporaria);
      setNome("");
      setEmail("");
      setPerfil("admin_cliente");
      await carregarUsuarios(clienteId);
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Falha ao criar o usuário.");
    } finally {
      setSalvando(false);
    }
  }

  async function resetarSenha(id: string) {
    setErro("");
    setSenhaGerada("");
    try {
      const { data } = await adminApi.post(`/admin/usuarios/${id}/resetar-senha`);
      setSenhaGerada(data.senha_temporaria);
      await carregarUsuarios(clienteId);
    } catch {
      setErro("Falha ao resetar a senha.");
    }
  }

  return (
    <AdminShell titulo="Usuários do portal">
      {clientes.length === 0 ? (
        <p className="text-navy-600">
          Cadastre um cliente antes de criar usuários do portal.
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

          {senhaGerada && (
            <div className="mt-4 rounded-xl border border-moss-300 bg-moss-50 p-4">
              <p className="text-sm font-semibold text-moss-800">
                Senha temporária gerada — copie e envie ao usuário agora:
              </p>
              <code className="mt-1 block text-lg font-bold text-navy-800">
                {senhaGerada}
              </code>
              <p className="mt-1 text-xs text-moss-700">
                Ela não será exibida novamente. O usuário deverá trocá-la no
                primeiro acesso.
              </p>
            </div>
          )}

          <section className="mt-5 rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
            <h2 className="font-semibold text-navy-800">Novo usuário</h2>
            <form onSubmit={criar} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome"
                required
                minLength={2}
                className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="E-mail"
                required
                className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              />
              <select
                value={perfil}
                onChange={(e) => setPerfil(e.target.value)}
                className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-navy-800 outline-none focus:border-moss-500"
              >
                <option value="admin_cliente">Administrador do cliente</option>
                <option value="operador">Operador</option>
              </select>
              <button
                type="submit"
                disabled={salvando}
                className="rounded-lg bg-moss-600 px-4 py-2 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
              >
                {salvando ? "Criando..." : "Criar usuário"}
              </button>
            </form>
            {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
          </section>

          <section className="mt-6 rounded-xl bg-white border border-navy-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-700">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Nome</th>
                  <th className="text-left font-semibold px-4 py-3">E-mail</th>
                  <th className="text-left font-semibold px-4 py-3">Perfil</th>
                  <th className="text-left font-semibold px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-navy-500">
                      Carregando...
                    </td>
                  </tr>
                ) : usuarios.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-navy-500">
                      Nenhum usuário para este cliente.
                    </td>
                  </tr>
                ) : (
                  usuarios.map((u) => (
                    <tr key={u.id} className="border-t border-navy-100">
                      <td className="px-4 py-3 text-navy-800 font-medium">{u.nome}</td>
                      <td className="px-4 py-3 text-navy-600">{u.email}</td>
                      <td className="px-4 py-3 text-navy-600">
                        {u.perfil === "admin_cliente" ? "Admin" : "Operador"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.ativo
                              ? "bg-moss-100 text-moss-800"
                              : "bg-navy-100 text-navy-600"
                          }`}
                        >
                          {u.ativo ? "Ativo" : "Inativo"}
                        </span>
                        {u.senha_temporaria && (
                          <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            senha temp.
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => resetarSenha(u.id)}
                          className="text-xs font-medium text-navy-600 hover:text-moss-700 underline"
                        >
                          Resetar senha
                        </button>
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
