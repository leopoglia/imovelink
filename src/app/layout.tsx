import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

const fustat = localFont({
  src: "./fonts/Fustat-Latin.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  variable: "--font-fustat",
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Imovelink — Gestão de Imóveis e Prospecção Inteligente de Leads",
  description:
    "Organize seu portfólio de imóveis, acompanhe oportunidades e encontre o imóvel ideal para cada cliente com a busca inteligente do Imovelink.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={fustat.variable}>
      <body className="antialiased selection:bg-brand-100 selection:text-brand-900">
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
