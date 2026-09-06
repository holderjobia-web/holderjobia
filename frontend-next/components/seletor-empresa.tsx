"use client";

import { useMemo, useState } from "react";
import { Icone } from "@/components/icons";

export type EmpresaOpcao = {
  id: string;
  codigo: string;
  nome_razao_social: string;
  rede_id: string | null;
};

export type RedeOpcao = { id: string; nome: string };

/**
 * Seletor de empresa reutilizável: filtro por rede (pills) + busca + grid
 * compacto de chips (só o código, nome truncado embaixo) — escala bem para
 * clientes com muitas unidades. Clicar no chip ativo desseleciona.
 */
export function SeletorEmpresa({
  empresas,
  redes,
  value,
  onChange,
  titulo = "Empresa",
  descricao = "Escolha a unidade.",
}: {
  empresas: EmpresaOpcao[];
  redes: RedeOpcao[];
  value: string;
  onChange: (id: string) => void;
  titulo?: string;
  descricao?: string;
}) {
  const [busca, setBusca] = useState("");
  const [redeId, setRedeId] = useState("");

  const temSemRede = empresas.some((e) => !e.rede_id);

  const empresasPorRede = useMemo(() => {
    if (!redeId) return empresas;
    if (redeId === "sem-rede") return empresas.filter((e) => !e.rede_id);
    return empresas.filter((e) => e.rede_id === redeId);
  }, [empresas, redeId]);

  const empresasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return empresasPorRede;
    return empresasPorRede.filter(
      (emp) =>
        emp.codigo.toLowerCase().includes(termo) ||
        emp.nome_razao_social.toLowerCase().includes(termo)
    );
  }, [empresasPorRede, busca]);

  const selecionada = empresas.find((e) => e.id === value) ?? null;

  return (
    <section className="rounded-xl bg-white border border-navy-100 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-moss-50 text-moss-700">
          <Icone nome="empresas" className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-navy-800">{titulo}</h2>
          <p className="text-sm text-navy-500">{descricao}</p>
        </div>
      </div>

      {empresas.length > 6 && (
        <div className="relative mt-4">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400">
            <Icone nome="lista" className="h-4 w-4" />
          </span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código ou nome..."
            className="w-full rounded-lg border border-navy-100 py-2 pl-9 pr-3 text-sm text-navy-800 outline-none focus:border-moss-500 sm:w-96"
          />
        </div>
      )}

      {redes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setRedeId("")}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              redeId === ""
                ? "border-navy-700 bg-navy-700 text-white"
                : "border-navy-100 bg-white text-navy-600 hover:border-navy-300"
            }`}
          >
            Todos os negócios
          </button>
          {redes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRedeId(r.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                redeId === r.id
                  ? "border-navy-700 bg-navy-700 text-white"
                  : "border-navy-100 bg-white text-navy-600 hover:border-navy-300"
              }`}
            >
              {r.nome}
            </button>
          ))}
          {temSemRede && (
            <button
              type="button"
              onClick={() => setRedeId("sem-rede")}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                redeId === "sem-rede"
                  ? "border-navy-700 bg-navy-700 text-white"
                  : "border-navy-100 bg-white text-navy-600 hover:border-navy-300"
              }`}
            >
              Sem rede
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid max-h-56 grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2 overflow-y-auto pr-1">
        {empresasFiltradas.length === 0 ? (
          <p className="col-span-full text-sm text-navy-400">
            Nenhuma empresa encontrada.
          </p>
        ) : (
          empresasFiltradas.map((emp) => {
            const ativa = emp.id === value;
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => onChange(ativa ? "" : emp.id)}
                title={ativa ? "Clique para desmarcar" : emp.nome_razao_social}
                className={`relative rounded-lg border px-2 py-1.5 text-left transition-colors ${
                  ativa
                    ? "border-moss-600 bg-moss-600 text-white"
                    : "border-navy-100 bg-white text-navy-700 hover:border-moss-400 hover:bg-moss-50"
                }`}
              >
                {ativa && (
                  <span className="absolute right-1 top-1">
                    <Icone nome="check" className="h-3 w-3" />
                  </span>
                )}
                <p className="text-sm font-semibold leading-tight">{emp.codigo}</p>
                <p
                  className={`truncate text-[11px] leading-tight ${
                    ativa ? "text-white/80" : "text-navy-500"
                  }`}
                >
                  {emp.nome_razao_social}
                </p>
              </button>
            );
          })
        )}
      </div>
      {selecionada && (
        <p className="mt-2 text-xs text-navy-500">
          Selecionada:{" "}
          <span className="font-medium text-navy-700">
            {selecionada.codigo} — {selecionada.nome_razao_social}
          </span>
          <button
            type="button"
            onClick={() => onChange("")}
            className="ml-2 font-medium text-navy-400 hover:text-red-600"
          >
            Limpar seleção
          </button>
        </p>
      )}
    </section>
  );
}
