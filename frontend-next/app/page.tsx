import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  FileText,
  FolderOpen,
  Layers,
  LockKeyhole,
  PieChart,
  ScanSearch,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "holderjob — Inteligência financeira para grupos de empresas",
  description:
    "Consolide os DREs de todas as suas empresas, acompanhe margens, retiradas e metas e converse com um CFO digital. Tudo em um só lugar.",
};

const RECURSOS: { icone: LucideIcon; titulo: string; texto: string }[] = [
  {
    icone: ScanSearch,
    titulo: "Leitura automática de DRE",
    texto: "Envie o PDF e o sistema extrai receita, custos, resultado e lucro, reconhecendo diferentes layouts de demonstrativo.",
  },
  {
    icone: ShieldCheck,
    titulo: "Conferência contábil",
    texto: "Cada mês é validado pelas contas de fechamento. Divergências são sinalizadas, nunca corrigidas ou sobrescritas em silêncio.",
  },
  {
    icone: Layers,
    titulo: "Visão do grupo e por unidade",
    texto: "Consolide todas as empresas, separe por rede de negócio e compare o desempenho de cada unidade em um ranking.",
  },
  {
    icone: Users,
    titulo: "Sócios e distribuição de lucros",
    texto: "Cruze a retirada declarada com a participação societária e veja quanto cabe a cada sócio, empresa por empresa.",
  },
  {
    icone: Target,
    titulo: "Orçamento previsto × realizado",
    texto: "Defina metas mensais por unidade e acompanhe a variação contra o resultado que o DRE efetivamente trouxe.",
  },
  {
    icone: PieChart,
    titulo: "Vendas por categoria",
    texto: "Suba a planilha mensal de vendas e acompanhe valor recebido, ticket médio e mix de procedimentos por unidade.",
  },
  {
    icone: FolderOpen,
    titulo: "Acervo de documentos",
    texto: "Contratos, plantas, fotos e controles mensais organizados por unidade, com busca e visualização no próprio sistema.",
  },
  {
    icone: Bot,
    titulo: "Agente de IA consultivo",
    texto: "Pergunte sobre qualquer unidade ou sobre o grupo. As respostas partem dos seus dados e apontam riscos, não só elogios.",
  },
];

const PASSOS = [
  {
    titulo: "Cadastre suas unidades",
    texto: "Empresas, redes de negócio e sócios com a participação de cada um, em poucos minutos.",
  },
  {
    titulo: "Envie os demonstrativos",
    texto: "DREs em PDF, planilhas de vendas e documentos. A leitura e a conferência são automáticas.",
  },
  {
    titulo: "Acompanhe e decida",
    texto: "Dashboards, metas e um agente de IA para transformar números em decisão.",
  },
];

const GARANTIAS = [
  { titulo: "Dados isolados por cliente", texto: "Cada grupo enxerga somente as próprias empresas." },
  { titulo: "Nenhum número inventado", texto: "Valor ausente aparece como “não consta”, nunca como zero." },
  { titulo: "Divergência sempre visível", texto: "Se os números não fecham, o sistema avisa e mantém o dado original." },
  { titulo: "Acesso protegido", texto: "Senhas fortes, bloqueio por tentativas e arquivos em armazenamento privado." },
];

const BARRAS = [46, 58, 52, 70, 64, 82];
const MESES = ["Mai", "Jun", "Jul", "Ago", "Set", "Out"];

function Logo({ claro = false }: { claro?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Building2 size={26} strokeWidth={1.6} className={claro ? "text-moss-300" : "text-moss-700"} />
      <span className={`text-xl font-bold tracking-tight ${claro ? "text-white" : "text-navy-900"}`}>
        holderjob<span className="text-moss-400">.</span>
      </span>
    </span>
  );
}

function PainelIlustrativo() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-3xl bg-moss-500/20 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-xl border border-white/15 bg-white shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50 px-4 py-3">
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
          </div>
          <span className="text-xs font-semibold text-navy-700">Visão do grupo</span>
          <span className="w-10" />
        </div>

        <div className="grid grid-cols-3 gap-3 p-4 sm:p-5">
          {[
            { rotulo: "Receita líquida", valor: "R$ 1,24 mi" },
            { rotulo: "Lucro líquido", valor: "R$ 392 mil" },
            { rotulo: "Margem", valor: "31,6%" },
          ].map((k) => (
            <div key={k.rotulo} className="rounded-lg border border-navy-100 p-3">
              <p className="text-[11px] text-navy-500">{k.rotulo}</p>
              <p className="mt-1 text-base font-bold text-navy-900 sm:text-lg">{k.valor}</p>
            </div>
          ))}
        </div>

        <div className="px-4 pb-2 sm:px-5">
          <div className="flex h-36 items-end gap-3 border-b border-navy-100 sm:h-44">
            {BARRAS.map((h, i) => (
              <div key={i} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className={`w-full rounded-t ${i === BARRAS.length - 1 ? "bg-moss-600" : "bg-moss-200"}`}
                  style={{ height: `${h}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3 text-center text-[11px] text-navy-400">
            {MESES.map((m) => (
              <span key={m} className="flex-1">{m}</span>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-navy-100 px-4 py-3 text-xs sm:px-5">
          <span className="inline-flex items-center gap-1.5 font-medium text-moss-700">
            <CheckCircle2 size={14} /> Contas conferidas
          </span>
          <span className="text-navy-400">Dados ilustrativos</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh bg-white text-navy-800">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-900/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="holderjob — início">
            <Logo claro />
          </Link>
          <nav aria-label="Seções" className="hidden items-center gap-8 text-sm text-navy-200 md:flex">
            <a href="#recursos" className="hover:text-white">Recursos</a>
            <a href="#como-funciona" className="hover:text-white">Como funciona</a>
            <a href="#seguranca" className="hover:text-white">Segurança</a>
          </nav>
          <Link href="/portal/login" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-moss-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-moss-400">
            Entrar
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-navy-900 text-white">
          <div
            className="absolute inset-0 opacity-60"
            aria-hidden
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "radial-gradient(ellipse at 30% 30%, black 20%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse at 30% 30%, black 20%, transparent 75%)",
            }}
          />
          <div
            className="absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-moss-600/30 blur-3xl"
            aria-hidden
          />

          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:py-28">
            <div className="animate-fade-in">
              <p className="inline-flex items-center gap-2 rounded-full border border-moss-400/40 bg-moss-500/10 px-3 py-1 text-xs font-semibold text-moss-200">
                <TrendingUp size={14} /> Inteligência financeira para grupos de empresas
              </p>
              <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                Todas as suas empresas,{" "}
                <span className="text-moss-300">uma única visão financeira.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">
                Consolide os DREs de dezenas de unidades, acompanhe margens, retiradas e metas e converse com um CFO digital. Sem planilhas manuais e sem perder o controle.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/portal/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-moss-500 px-6 text-base font-semibold text-white shadow-lg shadow-moss-900/40 transition-colors hover:bg-moss-400">
                  Acessar o portal
                  <ArrowRight size={18} />
                </Link>
                <a href="#recursos" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/25 px-6 text-base font-semibold text-white transition-colors hover:bg-white/10">
                  Conhecer os recursos
                </a>
              </div>
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-300">
                {["Dados isolados por cliente", "Conferência contábil automática", "Nenhum número inventado"].map((t) => (
                  <li key={t} className="inline-flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-moss-400" /> {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="animate-fade-in lg:pl-4">
              <PainelIlustrativo />
            </div>
          </div>
        </section>

        <section id="recursos" className="scroll-mt-16 bg-navy-50 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-moss-700">Recursos</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
                Do demonstrativo à decisão, sem sair do sistema
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-navy-500">
                Pensado para quem administra várias empresas e precisa de números confiáveis, rápidos e comparáveis.
              </p>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-navy-100 bg-navy-100 sm:grid-cols-2 lg:grid-cols-4">
              {RECURSOS.map((r) => (
                <article key={r.titulo} className="group bg-white p-6 transition-colors hover:bg-moss-50">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-moss-50 text-moss-700 transition-colors group-hover:bg-moss-600 group-hover:text-white">
                    <r.icone size={22} strokeWidth={1.7} />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-navy-900">{r.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-navy-500">{r.texto}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-16 bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-moss-700">Como funciona</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
                Três passos para enxergar o grupo inteiro
              </h2>
            </div>
            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {PASSOS.map((p, i) => (
                <li key={p.titulo} className="relative border-t-2 border-moss-600 pt-6">
                  <span className="text-4xl font-bold text-moss-200">0{i + 1}</span>
                  <h3 className="mt-3 text-lg font-semibold text-navy-900">{p.titulo}</h3>
                  <p className="mt-2 leading-relaxed text-navy-500">{p.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="seguranca" className="scroll-mt-16 bg-navy-900 py-20 text-white sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-moss-300">
                <LockKeyhole size={16} /> Segurança e governança
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Confiança nos números vem antes de tudo
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-navy-300">
                Dados financeiros pedem rigor. Por isso o sistema prefere avisar a adivinhar.
              </p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {GARANTIAS.map((g) => (
                <li key={g.titulo} className="rounded-xl border border-white/10 bg-white/5 p-5">
                  <CheckCircle2 size={20} className="text-moss-400" />
                  <h3 className="mt-3 font-semibold">{g.titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-navy-300">{g.texto}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-moss-700 py-16 text-white sm:py-20">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-5 sm:px-8 md:flex-row md:items-center">
            <div className="max-w-xl">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Pronto para ver o grupo inteiro em uma tela?
              </h2>
              <p className="mt-3 text-moss-100">Entre no portal e acompanhe suas empresas agora.</p>
            </div>
            <Link href="/portal/login" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-lg bg-white px-7 text-base font-semibold text-moss-800 transition-colors hover:bg-moss-50">
              Acessar o portal
              <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-navy-900 text-navy-300">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 px-5 py-8 text-sm sm:px-8 md:flex-row md:items-center">
          <Logo claro />
          <p className="inline-flex items-center gap-2 text-xs">
            <FileText size={13} /> Plataforma de gestão financeira para grupos de empresas. Acesso restrito a clientes.
          </p>
          <div className="flex items-center gap-5 text-xs">
            <Link href="/portal/login" className="hover:text-white">Portal do cliente</Link>
            <Link href="/admin/login" className="hover:text-white">Administração</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
