import Link from "next/link";

export default function Home() {
  return (
    <main className="bg-institucional min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl text-center text-white animate-fade-in">
        <p className="text-moss-300 font-semibold tracking-[0.3em] text-sm uppercase">
          Inteligência Financeira
        </p>
        <h1 className="mt-4 text-5xl font-bold">holderjob</h1>
        <p className="mt-4 text-navy-100 text-lg max-w-xl mx-auto">
          Consolidação de DREs, notas e dashboards para administração de múltiplas
          empresas. Um CFO digital para o seu grupo.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          <Link
            href="/portal/login"
            className="rounded-xl bg-moss-600 hover:bg-moss-700 transition-colors px-6 py-5 text-left shadow-lg"
          >
            <span className="block text-lg font-semibold">Portal do Cliente</span>
            <span className="block text-sm text-moss-50/80 mt-1">
              Acesse os dashboards e envie seus documentos.
            </span>
          </Link>

          <Link
            href="/admin/login"
            className="rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition-colors px-6 py-5 text-left"
          >
            <span className="block text-lg font-semibold">Administração</span>
            <span className="block text-sm text-navy-100 mt-1">
              Área restrita da equipe holderjob.
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
