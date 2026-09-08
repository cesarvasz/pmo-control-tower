import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

// Inter solo para el "Status Ejecutivo" por proyecto (ver components/StatusReport.tsx
// y lib/reportTheme.ts) — se expone como variable CSS, NO cambia la fuente global
// de la app ("Segoe UI", ver globals.css).
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PMO Dashboard",
  description: "Suite de dashboards PMO · Monday.com",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" data-theme="dark" className={`h-full ${inter.variable}`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
