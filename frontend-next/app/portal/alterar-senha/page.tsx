"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { portalApi } from "@/lib/portal-api";

/** Requisitos de senha (defesa em profundidade — o backend também valida). */
function validarForcaSenha(senha: string): string[] {
  const faltando: string[] = [];
  if (senha.length < 8) faltando.push("mínimo de 8 caracteres");
  if (!/[A-Z]/.test(senha)) faltando.push("uma letra maiúscula");
  if (!/[a-z]/.test(senha)) faltando.push("uma letra minúscula");
  if (!/[0-9]/.test(senha)) faltando.push("um número");
  if (!/[^A-Za-z0-9]/.test(senha)) faltando.push("um caractere especial");
  return faltando;
}

export default function AlterarSenhaPage() {
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    if (novaSenha !== confirmar) {
      setErro("A confirmação não corresponde à nova senha.");
      return;
    }
    const faltando = validarForcaSenha(novaSenha);
    if (faltando.length > 0) {
      setErro(`A senha precisa conter: ${faltando.join(", ")}.`);
      return;
    }

    setCarregando(true);
    try {
      await portalApi.post("/auth/alterar-senha", {
        senha_atual: senhaAtual,
        nova_senha: novaSenha,
      });
      router.push("/portal");
    } catch (err: any) {
      setErro(err.response?.data?.detail ?? "Não foi possível alterar a senha.");
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
          <h1 className="mt-2 text-2xl font-bold">Defina uma nova senha</h1>
          <p className="text-navy-100 text-sm mt-1">
            Por segurança, altere a senha temporária antes de continuar.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-xl p-8 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Senha atual
            </label>
            <input
              type="password"
              required
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Nova senha
            </label>
            <input
              type="password"
              required
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Confirmar nova senha
            </label>
            <input
              type="password"
              required
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-500/20"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-lg bg-moss-600 hover:bg-moss-700 disabled:opacity-60 text-white font-semibold py-2.5 transition-colors"
          >
            {carregando ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </div>
    </main>
  );
}
