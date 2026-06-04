"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Control Tower", subtitle: "Resumen de portafolios PMO" },
  "/iniciativas": { title: "Iniciativas", subtitle: "Board de iniciativas PMO · Monday.com" },
  "/req": { title: "REQ", subtitle: "Requerimientos VALOR Lite · Monday.com" },
  "/proyectos": { title: "Proyectos", subtitle: "Portafolios de proyectos · Monday.com" },
};

const THEME_KEY = "pmo-theme";

export default function Topbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { data, loading, refresh } = useData();
  const meta = PAGE_META[pathname] ?? { title: "PMO Dashboard", subtitle: "" };

  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Inicializa el tema desde localStorage/preferencia del sistema al montar.
  // localStorage solo existe en el cliente, por eso debe leerse en un efecto
  // (no en el inicializador de useState, que correría también en SSR).
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as "dark" | "light" | null;
    const sys = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    const initial = saved ?? sys;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronización inicial desde un sistema externo (localStorage)
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  };

  const lastUpdate = data?.fetchedAt
    ? `Actualizado: ${data.fetchedAt.toLocaleString("es-GT", {
        dateStyle: "short",
        timeStyle: "medium",
      })}`
    : "";

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between border-b bg-[var(--bg-surface)] px-8 py-4 transition-colors"
      style={{ borderColor: "var(--border)" }}
    >
      <div>
        <div className="text-[1.15rem] font-semibold text-[var(--text-primary)]">
          {meta.title}
        </div>
        <div className="text-[0.78rem] text-[var(--text-muted)]">{meta.subtitle}</div>
      </div>

      <div className="flex items-center gap-3 text-[0.8rem] text-[var(--text-muted)]">
        {lastUpdate && (
          <span className="hidden text-[var(--text-muted)] md:inline">{lastUpdate}</span>
        )}
        {user?.email && (
          <span className="hidden text-[var(--text-secondary)] sm:inline">{user.email}</span>
        )}
        <button
          onClick={toggleTheme}
          title="Cambiar tema"
          className="flex h-8 w-8 items-center justify-center rounded-lg border bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
        >
          {theme === "dark" ? "🌙" : "☀️"}
        </button>
        <button
          onClick={() => refresh()}
          disabled={loading}
          className="rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[0.8rem] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Actualizando..." : "↻ Actualizar"}
        </button>
        <button
          onClick={() => logout()}
          className="rounded-md border px-3 py-1.5 text-[0.8rem] text-[var(--text-secondary)] transition-colors hover:border-[#ef4444] hover:text-[#ef4444]"
          style={{ borderColor: "var(--border)" }}
        >
          Salir
        </button>
      </div>
    </header>
  );
}
