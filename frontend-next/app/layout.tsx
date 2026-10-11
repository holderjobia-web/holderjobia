import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CinkFinanças — Inteligência Financeira",
  description: "SaaS de CFO/BI para administração de empresas: DREs, notas e dashboards.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
