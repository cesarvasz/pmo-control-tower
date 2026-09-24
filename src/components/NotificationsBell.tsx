"use client";

// Campanita de notificaciones del Topbar: "qué hay que hacer hoy", por PM,
// usando las fechas límite de los 3 boards (Iniciativas, PML, Proyectos —
// ver src/lib/notifications.ts, función pura que hace todo el cálculo).
// 3 pestañas: hace 3 días, hoy y próximos 3 días — SOLO lo pendiente; lo ya
// Done/Cerrado nunca aparece aquí (pedido explícito del usuario).

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { fmtDate } from "@/lib/business";
import { buildTodoNotifications, type TodoNotification } from "@/lib/notifications";

type TabKey = "atras" | "hoy" | "adelante";
const TABS: { key: TabKey; label: string }[] = [
  { key: "atras", label: "Hace 3 días" },
  { key: "hoy", label: "Hoy" },
  { key: "adelante", label: "Próximos 3 días" },
];

const BOARD_COLOR: Record<TodoNotification["board"], string> = {
  Iniciativas: "var(--accent-light)",
  PML: "#a78bfa",
  Proyectos: "#38bdf8",
};

function Row({ n, tab, onClick }: { n: TodoNotification; tab: TabKey; onClick: () => void }) {
  const statusColor = tab === "atras" ? "var(--bad, #ef4444)" : "var(--text-secondary)";
  return (
    <Link
      href={n.href}
      onClick={onClick}
      className="flex flex-col gap-1 border-b px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[var(--bg-hover)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[0.6rem] font-bold uppercase tracking-wide" style={{ color: BOARD_COLOR[n.board] }}>
          {n.board}
        </span>
        <span className="ml-auto text-[0.66rem] text-[var(--text-muted)]">{fmtDate(n.date)}</span>
      </div>
      <div className="text-[0.82rem] font-medium leading-snug text-[var(--text-primary)]">{n.name}</div>
      {n.context && <div className="truncate text-[0.72rem] text-[var(--text-muted)]">{n.context}</div>}
      <span
        className="mt-0.5 w-fit whitespace-nowrap rounded-full px-2 py-0.5 text-[0.66rem] font-bold"
        style={{ color: statusColor, background: `${statusColor}18` }}
      >
        {n.status || "—"}
      </span>
    </Link>
  );
}

export default function NotificationsBell() {
  const { data } = useData();
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("hoy");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const buckets = useMemo(() => {
    if (!data || !me) return { atras: [], hoy: [], adelante: [] };
    return buildTodoNotifications(data, { email: me.email, displayName: me.displayName });
  }, [data, me]);

  const badgeCount = buckets.hoy.length;
  const rows = buckets[tab];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title="Qué hay que hacer hoy"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        style={{ borderColor: "var(--border)" }}
      >
        🔔
        {badgeCount > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[0.6rem] font-bold text-white"
            style={{ background: "var(--bad, #ef4444)" }}
          >
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-[300] flex max-h-[70vh] w-[340px] flex-col overflow-hidden rounded-xl border shadow-lg sm:w-[380px]"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="flex-1 px-2 py-2.5 text-center text-[0.72rem] font-semibold transition-colors"
                style={{
                  color: tab === t.key ? "var(--accent-light)" : "var(--text-muted)",
                  borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                {t.label}
                {buckets[t.key].length > 0 && <span className="ml-1 opacity-70">({buckets[t.key].length})</span>}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto">
            {rows.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-[0.8rem] text-[var(--text-muted)]">
                Nada por aquí.
              </p>
            ) : (
              rows.map((n) => <Row key={n.key} n={n} tab={tab} onClick={() => setOpen(false)} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
