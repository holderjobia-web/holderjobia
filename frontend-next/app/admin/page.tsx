"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/admin-shell";
import { adminApi } from "@/lib/admin-api";

const CARDS = [
  {
    href: "/admin/clientes",
    titulo: "Clientes",
    descricao: "Cadastre e gerencie os clientes (tenants) da plataforma.",
  },
  {
    href: "/admin/empresas",
    titulo: "Empresas",
    descricao: "Unidades de cada cliente, com código único e participação.",
  },
  {
    href: "/admin/usuarios",
    titulo: "Usuários",
    descricao: "Crie acessos ao portal e gere senhas temporárias.",
  },
];

export default function AdminDashboard() {
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    adminApi
      .get("/admin/auth/me")
      .then(({ data }) => setNome(data.nome ?? data.email ?? "Administrador"))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  return (
    <AdminShell titulo="Administração">
      <p className="text-navy-700">
        {carregando ? "Carregando..." : `Bem-vindo, ${nome}.`}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl bg-white border border-navy-100 p-5 shadow-sm transition-colors hover:border-moss-500"
          >
            <h2 className="font-semibold text-navy-800">{card.titulo}</h2>
            <p className="text-sm text-navy-500 mt-1">{card.descricao}</p>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
