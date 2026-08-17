"use client";

import { useEffect, useRef, useState } from "react";

export interface MSOption {
  value: string;
  label: string;
  count: number;
}

interface MultiSelectProps {
  label: string;
  options: MSOption[];
  selected: string[];
  onToggle: (value: string, checked: boolean) => void;
  onToggleAll: () => void;
  disabled?: boolean;
}

export default function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  onToggleAll,
  disabled = false,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const isAll = selected.length === 0;
  const triggerLabel = isAll
    ? "Todos"
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
      : `${selected.length} seleccionados`;
  const allCount = options.reduce((s, o) => s + o.count, 0);

  return (
    <div ref={wrapRef} className="relative flex flex-col gap-1.5">
      <label className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((o) => !o);
        }}
        className={`flex min-w-[190px] items-center justify-between gap-2.5 whitespace-nowrap rounded-lg border px-3 py-2 text-sm transition-colors ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
        style={{
          borderColor: disabled ? "var(--border)" : (isAll ? "var(--border)" : "var(--accent)"),
          background: disabled ? "var(--bg-surface)" : (isAll ? "var(--bg-surface)" : "var(--bg-accent-soft)"),
          color: disabled ? "var(--text-muted)" : (isAll ? "var(--text-primary)" : "var(--accent-light)"),
        }}
      >
        <span>{triggerLabel}</span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          className="flex-shrink-0 opacity-50 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-[300] min-w-[200px] overflow-hidden rounded-xl border shadow-lg"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <label className="flex cursor-pointer select-none items-center gap-2 px-3.5 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            <input
              type="checkbox"
              checked={isAll}
              onChange={onToggleAll}
              className="h-3.5 w-3.5 flex-shrink-0 cursor-pointer accent-[var(--accent)]"
            />
            <span>Todos</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">({allCount})</span>
          </label>
          <div className="h-px" style={{ background: "var(--border)" }} />
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer select-none items-center gap-2 px-3.5 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={(e) => onToggle(o.value, e.target.checked)}
                className="h-3.5 w-3.5 flex-shrink-0 cursor-pointer accent-[var(--accent)]"
              />
              <span>{o.label}</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">({o.count})</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
