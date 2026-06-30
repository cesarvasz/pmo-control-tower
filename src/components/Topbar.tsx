"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import AsuetosModal from "@/components/AsuetosModal";
import CalcHabilesModal from "@/components/CalcHabilesModal";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Control Tower", subtitle: "Resumen de portafolios PMO" },
  "/iniciativas": { title: "Iniciativas", subtitle: "Board de iniciativas PMO · Monday.com" },
  "/req": { title: "REQ", subtitle: "Requerimientos VALOR Lite · Monday.com" },
  "/proyectos": { title: "Proyectos", subtitle: "Portafolios de proyectos · Monday.com" },
  "/usuarios": { title: "Usuarios", subtitle: "Gestión de usuarios y asignación de roles" },
  "/roles": { title: "Roles", subtitle: "Roles, permisos y grupos" },
  "/grupos": { title: "Grupos", subtitle: "Organiza las páginas del menú lateral" },
};

const THEME_KEY = "pmo-theme";

type Theme = "dark" | "light" | "c807" | "rose";
const THEMES: Theme[] = ["dark", "light", "c807", "rose"];
const THEME_META: Record<Theme, { icon: string; label: string }> = {
  dark: { icon: "🌙", label: "Oscuro" },
  light: { icon: "☀️", label: "Claro" },
  c807: { icon: "🌿", label: "C807 (VALOR)" },
  rose: { icon: "🌸", label: "Rose" },
};

interface TopbarProps {
  onMenuClick?: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { data, loading, refresh } = useData();
  const meta = PAGE_META[pathname] ?? { title: "PMO Dashboard", subtitle: "" };

  const [theme, setTheme] = useState<Theme>("dark");
  const [showAsuetos, setShowAsuetos] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  // Inicializa el tema desde localStorage/preferencia del sistema al montar.
  // localStorage solo existe en el cliente, por eso debe leerse en un efecto
  // (no en el inicializador de useState, que correría también en SSR).
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    const sys = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    const initial = saved && THEMES.includes(saved) ? saved : sys;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronización inicial desde un sistema externo (localStorage)
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  // Cicla entre los 3 temas: Oscuro → Claro → C807 → Oscuro…
  const cycleTheme = () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
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
      className="sticky top-0 z-50 flex items-center justify-between border-b bg-[var(--bg-surface)] px-4 py-4 transition-colors md:px-8"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-3">
        {/* Hamburger — solo móvil */}
        <button
          onClick={onMenuClick}
          title="Menú"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] md:hidden"
          style={{ borderColor: "var(--border)" }}
        >
          ☰
        </button>
        <div>
          <div className="text-[1.05rem] font-semibold text-[var(--text-primary)] md:text-[1.15rem]">
            {meta.title}
          </div>
          <div className="hidden text-[0.78rem] text-[var(--text-muted)] sm:block">{meta.subtitle}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[0.8rem] text-[var(--text-muted)] md:gap-3">
        {lastUpdate && (
          <span className="hidden text-[var(--text-muted)] md:inline">{lastUpdate}</span>
        )}
        {user?.email && (
          <span className="hidden text-[var(--text-secondary)] sm:inline">{user.email}</span>
        )}
        <button
          onClick={() => setShowCalc(true)}
          title="Calculadora de días hábiles"
          className="flex h-8 w-8 items-center justify-center rounded-lg border bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
        >
          🧮
        </button>
        <button
          onClick={() => setShowAsuetos(true)}
          title="Asuetos oficiales de Guatemala 2026"
          className="flex h-8 w-8 items-center justify-center rounded-lg border bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
        >
          🌴
        </button>
        <button
          onClick={cycleTheme}
          title={`Tema: ${THEME_META[theme].label} · clic para cambiar`}
          className="flex h-8 w-8 items-center justify-center rounded-lg border bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
        >
          {THEME_META[theme].icon}
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

      {showAsuetos && <AsuetosModal onClose={() => setShowAsuetos(false)} />}
      {showCalc && <CalcHabilesModal onClose={() => setShowCalc(false)} />}
    </header>
  );
}
