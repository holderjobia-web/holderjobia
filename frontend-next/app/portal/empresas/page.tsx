"use client";

import { useEffect, useState } from "react";
import PortalShell from "@/components/portal-shell";
import { portalApi } from "@/lib/portal-api";

type Empresa = {
  id: string;
  codigo: string;
  nome_razao_social: string;
  cnpj: string | null;
  segmento: string | null;
  percentual_participacao: number | null;
  ativa: boolean;
  status_maturidade: string | null;
};

export default function MinhasEmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    portalApi
      .get<Empresa[]>("/empresas")
      .then(({ data }) => setEmpresas(data))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  return (
    <PortalShell titulo="Minhas empresas">
      <section className="rounded-xl bg-white border border-navy-100 shadow-sm overflow-hidden">
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
                  Nenhuma empresa cadastrada. Fale com o administrador.
                </td>
              </tr>
            ) : (
              empresas.map((emp) => (
                <tr key={emp.id} className="border-t border-navy-100">
                  <td className="px-4 py-3 text-navy-800 font-medium">{emp.codigo}</td>
                  <td className="px-4 py-3 text-navy-800">{emp.nome_razao_social}</td>
                  <td className="px-4 py-3 text-navy-600">{emp.segmento ?? "—"}</td>
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
    </PortalShell>
  );
}
