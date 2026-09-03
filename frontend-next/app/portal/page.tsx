"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { portalApi, clearPortalToken } from "@/lib/portal-api";

export default function PortalDashboard() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    portalApi
      .get("/auth/me")
      .then(({ data }) => setNome(data.nome ?? data.email ?? "Cliente"))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  function sair() {
    portalApi.post("/auth/logout").catch(() => {});
    clearPortalToken();
    router.push("/portal/login");
  }

  return (
    <div className="min-h-screen bg-[#f6f7f4]">
      <header className="bg-moss-700 text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="text-moss-100 text-xs font-semibold tracking-widest uppercase">
              holderjob
            </span>
            <h1 className="text-lg font-bold leading-tight">Portal do Cliente</h1>
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
          {["Dashboards", "Envio de DRE", "Minhas empresas"].map((item) => (
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
