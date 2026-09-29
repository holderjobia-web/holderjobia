"use client";

import { useId, useState } from "react";
import { Search, X } from "lucide-react";

export type EmpresaOpcao = {
  id: string;
  codigo: string;
  nome_razao_social: string;
  rede_id: string | null;
};

export type RedeOpcao = { id: string; nome: string };

export function SeletorEmpresa({
  empresas,
  redes,
  value,
  onChange,
  titulo = "Empresa",
  descricao = "Escolha a unidade.",
  disabled = false,
}: {
  empresas: EmpresaOpcao[];
  redes: RedeOpcao[];
  value: string;
  onChange: (id: string) => void;
  titulo?: string;
  descricao?: string;
  disabled?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [redeId, setRedeId] = useState("");
  const id = useId();

  const temSemRede = empresas.some((e) => !e.rede_id);

  const empresasFiltradas = empresas.filter((empresa) => {
    const mesmaRede = !redeId || (redeId === "sem-rede" ? !empresa.rede_id : empresa.rede_id === redeId);
    return mesmaRede && `${empresa.codigo} ${empresa.nome_razao_social}`.toLocaleLowerCase("pt-BR").includes(busca.trim().toLocaleLowerCase("pt-BR"));
  });

  const selecionada = empresas.find((e) => e.id === value) ?? null;

  return (
    <section className="border-y border-navy-100 bg-white p-4 sm:p-5" aria-label={titulo}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-navy-800">{titulo}</h2>
        {value && <button type="button" disabled={disabled} onClick={() => onChange("")} className="inline-flex items-center gap-1 text-xs text-navy-500 hover:text-navy-800"><X size={14} />Limpar seleção</button>}
      </div>
      <fieldset disabled={disabled} className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <label htmlFor={`${id}-rede`} className="mb-1 block text-xs text-navy-500">Rede</label>
          <select id={`${id}-rede`} value={redeId} onChange={(event) => { setRedeId(event.target.value); onChange(""); }} className="field">
            <option value="">Todos os negócios</option>
            {redes.map((rede) => <option key={rede.id} value={rede.id}>{rede.nome}</option>)}
            {temSemRede && <option value="sem-rede">Sem rede</option>}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-busca`} className="mb-1 block text-xs text-navy-500">Buscar unidade</label>
          <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-navy-400" /><input id={`${id}-busca`} value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Nome ou código" className="field pl-9" /></div>
        </div>
        <div className="sm:col-span-2 xl:col-span-1">
          <label htmlFor={`${id}-unidade`} className="mb-1 block text-xs text-navy-500">Unidade</label>
          <select id={`${id}-unidade`} value={value} onChange={(event) => onChange(event.target.value)} className="field" title={selecionada?.nome_razao_social}>
            <option value="">Sem seleção</option>
            {selecionada && !empresasFiltradas.some((empresa) => empresa.id === value) && <option value={selecionada.id}>{selecionada.codigo} - {selecionada.nome_razao_social}</option>}
            {empresasFiltradas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.codigo} - {empresa.nome_razao_social}</option>)}
          </select>
        </div>
      </fieldset>
      {empresasFiltradas.length === 0 && <p className="mt-2 text-xs text-navy-500">Nenhuma unidade encontrada.</p>}
      {selecionada && <p className="mt-3 break-words text-xs text-navy-500">{selecionada.codigo} - {selecionada.nome_razao_social}</p>}
    </section>
  );
}
