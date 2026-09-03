"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { portalApi, savePortalToken } from "@/lib/portal-api";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const { data } = await portalApi.post("/auth/login", { email, senha });
      savePortalToken(data.access_token, data.usuario ?? {});
      if (data.password_must_change) {
        router.push("/portal/alterar-senha");
      } else {
        router.push("/portal");
      }
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 429) {
        setErro("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else if (status === 401) {
        setErro("E-mail ou senha inválidos.");
      } else if (status === 403) {
        setErro("Conta temporariamente bloqueada. Tente novamente mais tarde.");
      } else {
        setErro(err.response?.data?.detail ?? "Não foi possível entrar. Tente novamente.");
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="bg-institucional min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center text-white mb-8">
          <p className="text-moss-300 font-semibold tracking-[0.25em] text-xs uppercase">
            holderjob
          </p>
          <h1 className="mt-2 text-2xl font-bold">Portal do Cliente</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-xl p-8 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Senha</label>
            <input
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-500/20"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-lg bg-moss-600 hover:bg-moss-700 disabled:opacity-60 text-white font-semibold py-2.5 transition-colors"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
