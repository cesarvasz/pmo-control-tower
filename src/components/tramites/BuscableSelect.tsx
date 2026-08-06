"use client";

// Variante BUSCABLE de MultiSelect (mismo lenguaje visual y misma API), para
// listas largas donde el desplegable plano no alcanza: Persona son decenas hoy y
// cientos cuando el origen crezca. Añade caja de búsqueda, tope de resultados
// visibles y una marca opcional (ej. ejecutor automatizado).

import { useEffect, useMemo, useRef, useState } from "react";

export interface BSOption {
  value: string;
  label: string;
  count: number;
  /** Marca lateral opcional (ej. "⚙" para ejecutores automatizados). */
  marca?: string;
}

interface Props {
  label: string;
  options: BSOption[];
  selected: string[];
  onChange: (valores: string[]) => void;
  /** Ancho mínimo del disparador; por defecto el mismo que MultiSelect. */
  minWidth?: number;
  placeholder?: string;
}

const MAX_VISIBLES = 60;

export default function BuscableSelect({
  label, options, selected, onChange, minWidth = 190, placeholder = "Buscar…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const filtradas = useMemo(() => {
    if (!q.trim()) return options;
    const n = norm(q);
    return options.filter((o) => norm(o.label).includes(n));
  }, [options, q]);

  const visibles = filtradas.slice(0, MAX_VISIBLES);
  const ocultas = filtradas.length - visibles.length;
  const isAll = selected.length === 0;
  const triggerLabel = isAll
    ? "Todos"
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
      : `${selected.length} seleccionados`;
  const allCount = options.reduce((s, o) => s + o.count, 0);

  const toggle = (value: string, checked: boolean) =>
    onChange(checked ? [...selected.filter((v) => v !== value), value] : selected.filter((v) => v !== value));

  return (
    <div ref={wrapRef} className="relative flex flex-col gap-1.5">
      <label className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </label>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="flex items-center justify-between gap-2.5 whitespace-nowrap rounded-lg border px-3 py-2 text-sm transition-colors"
        style={{
          minWidth,
          borderColor: isAll ? "var(--border)" : "var(--accent)",
          background: isAll ? "var(--bg-surface)" : "var(--bg-accent-soft)",
          color: isAll ? "var(--text-primary)" : "var(--accent-light)",
        }}
      >
        <span className="max-w-[220px] truncate">{triggerLabel}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"
          className="flex-shrink-0 opacity-50 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-[300] min-w-[260px] overflow-hidden rounded-xl border shadow-lg"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="p-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none"
              style={{ background: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto">
            <label className="flex cursor-pointer select-none items-center gap-2 px-3.5 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
              <input
                type="checkbox"
                checked={isAll}
                onChange={() => onChange([])}
                className="h-3.5 w-3.5 flex-shrink-0 cursor-pointer accent-[var(--accent)]"
              />
              <span>Todos</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">({allCount})</span>
            </label>
            <div className="h-px" style={{ background: "var(--border)" }} />

            {visibles.length === 0 ? (
              <div className="px-3.5 py-3 text-sm text-[var(--text-muted)]">Sin coincidencias.</div>
            ) : (
              visibles.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer select-none items-center gap-2 px-3.5 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={(e) => toggle(o.value, e.target.checked)}
                    className="h-3.5 w-3.5 flex-shrink-0 cursor-pointer accent-[var(--accent)]"
                  />
                  <span className="truncate" title={o.label}>{o.label}</span>
                  {o.marca && (
                    <span className="shrink-0 text-[0.7rem] text-[var(--text-muted)]" title="Ejecutor automatizado">
                      {o.marca}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-[var(--text-muted)]">({o.count})</span>
                </label>
              ))
            )}

            {ocultas > 0 && (
              <div className="px-3.5 py-2 text-[0.72rem] text-[var(--text-muted)]" style={{ borderTop: "1px solid var(--border)" }}>
                +{ocultas} más — afina la búsqueda.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
