"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, clearAdminToken } from "@/lib/admin-api";

export default function AdminDashboard() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    adminApi
      .get("/admin/auth/me")
      .then(({ data }) => setNome(data.nome ?? data.email ?? "Administrador"))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  function sair() {
    adminApi.post("/admin/auth/logout").catch(() => {});
    clearAdminToken();
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-[#f6f7f4]">
      <header className="bg-navy-700 text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="text-moss-300 text-xs font-semibold tracking-widest uppercase">
              holderjob
            </span>
            <h1 className="text-lg font-bold leading-tight">Administração</h1>
          </div>
          <button
            onClick={sair}
            className="text-sm rounded-lg border border-white/25 px-3 py-1.5 hover:bg-white/10 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <p className="text-navy-700">
          {carregando ? "Carregando..." : `Bem-vindo, ${nome}.`}
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {["Clientes", "Empresas", "Consolidação"].map((item) => (
            <div
              key={item}
              className="rounded-xl bg-white border border-navy-100 p-5 shadow-sm"
            >
              <h2 className="font-semibold text-navy-800">{item}</h2>
              <p className="text-sm text-navy-500 mt-1">Em construção.</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
