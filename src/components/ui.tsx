"use client";

import type { ReactNode } from "react";

// ── Loader / Error ─────────────────────────────────────────────────────
// Logo PMO con la "O" convertida en rueda de carga giratoria + "Procesando…".
// Se muestra la variante de letras verdes en temas claros (light/c807/rose)
// y la de letras blancas en temas oscuros (dark/ironman) vía CSS (globals.css).
export function Loader() {
  return (
    <div
      className="flex min-h-[80vh] flex-col items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <img className="loader-pmo loader-pmo--light" src="/loader-pmo-verde.svg" alt="" />
      <img className="loader-pmo loader-pmo--dark" src="/loader-pmo-blanco.svg" alt="" />
      <span className="sr-only">Procesando…</span>
    </div>
  );
}

export function ErrorBox({ msg }: { msg: string }) {
  return (
    <div
      className="my-5 rounded-lg border px-6 py-5"
      style={{ background: "var(--pill-atrasado-bg)", borderColor: "var(--pill-atrasado-br)", color: "var(--pill-atrasado-fg)" }}
    >
      <strong>Error al conectar</strong>
      <br />
      {msg}
    </div>
  );
}

export function EmptyRow({ msg = "Sin resultados para los filtros seleccionados." }: { msg?: string }) {
  return <div className="px-10 py-10 text-center text-[var(--text-muted)]">{msg}</div>;
}

// ── Stat Card (métrica clickable) ──────────────────────────────────────
interface StatCardProps {
  value: ReactNode;
  label: string;
  color?: string;
  borderColor?: string;
  active?: boolean;
  onClick?: () => void;
  valueSize?: string;
}

export function StatCard({
  value,
  label,
  color,
  borderColor,
  active,
  onClick,
  valueSize = "2.2rem",
}: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-[18px] text-center transition-transform ${
        onClick ? "cursor-pointer hover:-translate-y-0.5" : ""
      }`}
      style={{
        background: "var(--bg-surface)",
        borderColor: borderColor ?? "var(--border)",
        boxShadow: active ? `0 0 0 2px ${color ?? "var(--accent)"}` : undefined,
      }}
    >
      <div style={{ fontSize: valueSize, fontWeight: 700, lineHeight: 1, color: color ?? "var(--card-value-total)" }}>
        {value}
      </div>
      <div className="mt-1.5 text-[0.75rem] uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </div>
    </div>
  );
}

// ── Estado pill ────────────────────────────────────────────────────────
const ESTADO_PILL: Record<string, [string, string]> = {
  ATRASADO: ["pill-atrasado", "✕ Off Track"],
  "PARA HOY": ["pill-parahoy", "⚠ At Risk"],
  "EN TIEMPO": ["pill-entiempo", "✓ On Track"],
  APROBADA: ["pill-aprobada", "✓ Aprobada"],
  "EN PROCESO": ["pill-skip", "— Pendiente"],
  EN_ESPERA: ["pill-skip", "En Espera"],
  SKIP: ["pill-skip", "— N/A"],
};

export function EstadoPill({ estado, small }: { estado: string; small?: boolean }) {
  const [cls, lbl] = ESTADO_PILL[estado] ?? ["pill-skip", estado];
  return (
    <span className={`pill ${cls}`} style={small ? { fontSize: ".68rem" } : undefined}>
      {lbl}
    </span>
  );
}

// ── Pill genérico por "tono" ───────────────────────────────────────────
// Lenguaje de estado unificado en toda la app: ✓ ok · ⚠ warn · ✕ bad · — neutral.
// Reutiliza las clases .pill-* (temáticas) para respetar los 5 temas.
export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";
const TONE_CLASS: Record<Tone, string> = {
  ok: "pill-entiempo",
  warn: "pill-parahoy",
  bad: "pill-atrasado",
  info: "pill-aprobada",
  neutral: "pill-skip",
};
export const TONE_ICON: Record<Tone, string> = { ok: "✓", warn: "⚠", bad: "✕", info: "•", neutral: "—" };

export function Pill({ tone, children, small, title }: { tone: Tone; children: ReactNode; small?: boolean; title?: string }) {
  return (
    <span className={`pill ${TONE_CLASS[tone]}`} title={title} style={small ? { fontSize: ".68rem" } : undefined}>
      {children}
    </span>
  );
}

// ── Section header ─────────────────────────────────────────────────────
export function SectionHeader({ title, badge, children }: { title: string; badge?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
      {badge !== undefined && (
        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]">
          {badge}
        </span>
      )}
      {children}
    </div>
  );
}

// ── Filter reset ───────────────────────────────────────────────────────
export function FilterReset({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="self-end whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm text-[var(--text-muted)] transition-colors hover:border-[#ef4444] hover:text-[#ef4444]"
      style={{ borderColor: "var(--border)" }}
    >
      ✕ Limpiar
    </button>
  );
}
