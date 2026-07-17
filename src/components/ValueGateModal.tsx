"use client";

import { fmtDate } from "@/lib/business";
import Modal from "@/components/Modal";

/** Acción del VPA unificada (proyecto o REQ) para el resumen y el detalle. */
export interface VpaAction {
  id: string;
  source: "PM" | "REQ";
  title: string;
  subtitle: string;
  estado: string;
  deadline: Date | null;
  done: boolean;
}

interface Cfg { color: string; icon: string; label: string; rank: number }

// Orden: primero Hoy, luego Atrasado, luego En Tiempo, y por último los Done.
function cfgFor(a: VpaAction): Cfg {
  if (a.done) return { color: "#6b7280", icon: "✓", label: "Done", rank: 10 };
  switch (a.estado) {
    case "PARA HOY":  return { color: "#f59e0b", icon: "⚠", label: "Hoy",       rank: 0 };
    case "ATRASADO":  return { color: "#ef4444", icon: "✕", label: "Atrasado",  rank: 1 };
    case "EN TIEMPO": return { color: "#10b981", icon: "✓", label: "En Tiempo", rank: 2 };
    default:          return { color: "#6b7280", icon: "•", label: a.estado,    rank: 5 };
  }
}

const SRC_COLOR: Record<VpaAction["source"], string> = { PM: "#8b5cf6", REQ: "#0ea5e9" };

export default function ValueGateModal({ items, onClose }: { items: VpaAction[]; onClose: () => void }) {
  const rows = items
    .map((a) => ({ a, cfg: cfgFor(a) }))
    .sort((x, y) => x.cfg.rank - y.cfg.rank);

  return (
    <Modal open onClose={onClose} width={512}>
        {/* Header */}
        <div
          className="flex shrink-0 items-start justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">
              VPA Actions
            </div>
            <div className="mt-0.5 text-[1.1rem] font-bold text-[var(--text-primary)]">
              Detalle de acciones · {rows.length}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {rows.length === 0 ? (
            <div className="py-8 text-center text-[0.85rem] text-[var(--text-muted)]">
              No hay acciones del VPA pendientes ni completadas.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
              {rows.map(({ a, cfg }, i) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{
                    borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                    borderLeft: `3px solid ${cfg.color}`,
                  }}
                >
                  <span style={{ color: cfg.color, fontWeight: 700 }}>{cfg.icon}</span>
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[0.6rem] font-bold"
                    style={{ color: SRC_COLOR[a.source], background: SRC_COLOR[a.source] + "22" }}
                  >
                    {a.source}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.82rem] font-medium text-[var(--text-primary)]" title={a.title}>
                      {a.title}
                    </div>
                    <div className="truncate text-[0.66rem] text-[var(--text-muted)]" title={a.subtitle}>
                      {a.subtitle}
                    </div>
                  </div>
                  <span className="shrink-0 text-[0.7rem] font-bold uppercase" style={{ color: cfg.color }}>
                    {cfg.label}
                  </span>
                  {a.deadline && (
                    <span className="shrink-0 text-[0.68rem] font-semibold" style={{ color: cfg.color }}>
                      {fmtDate(a.deadline)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </Modal>
  );
}
