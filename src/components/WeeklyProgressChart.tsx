"use client";

// Histórico semanal del portafolio, debajo del scoreboard de PMs en Control
// Tower — pedido del usuario: "guardar un historico semanal de los datos...
// que se tenga una vista que muestre el progreso. Tiene que ser el EVM,
// Beneficio $ Confirmado, Calidad de entregas, Entregas a tiempo y NPS". Los
// snapshots los guarda el cron de cada lunes 8am (api/cron/weekly-snapshot,
// ver lib/weeklySnapshot.ts) — este componente solo lee y grafica.

import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { authedFetch } from "@/lib/api";
import { fmtMoney, parseYMD } from "@/lib/business";
import type { WeeklySnapshotDoc } from "@/types";

interface MetricCfg {
  key: keyof Pick<WeeklySnapshotDoc, "evm" | "beneficioConfirmado" | "calidad" | "cumplimiento" | "nps">;
  label: string;
  color: string;
  fmt: (v: number) => string;
}

const METRICS: MetricCfg[] = [
  { key: "evm", label: "EVM", color: "var(--accent)", fmt: (v) => `${Math.round(v)}%` },
  { key: "beneficioConfirmado", label: "Beneficio $ Confirmado", color: "#10b981", fmt: (v) => fmtMoney(v) },
  { key: "calidad", label: "Calidad de Entregas", color: "#a78bfa", fmt: (v) => `${Math.round(v)}%` },
  { key: "cumplimiento", label: "Cumplimiento de Entrega", color: "#38bdf8", fmt: (v) => `${Math.round(v)}%` },
  { key: "nps", label: "NPS", color: "#f59e0b", fmt: (v) => `${Math.round(v)}` },
];

const weekLabel = (weekOf: string): string => {
  const d = parseYMD(weekOf);
  return d ? d.toLocaleDateString("es-GT", { day: "2-digit", month: "short" }) : weekOf;
};

function MiniTooltip({ active, payload, fmt }: { active?: boolean; payload?: { value?: number; payload?: { weekOf: string } }[]; fmt: (v: number) => string }) {
  if (!active || !payload || payload.length === 0 || payload[0].value == null) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border px-2.5 py-1.5 text-[0.72rem] shadow-lg" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>
      <div className="font-semibold">{weekLabel(p.payload!.weekOf)}</div>
      <div className="text-[var(--text-secondary)]">{fmt(p.value!)}</div>
    </div>
  );
}

function MetricChart({ cfg, snapshots }: { cfg: MetricCfg; snapshots: WeeklySnapshotDoc[] }) {
  const points = snapshots.map((s) => ({ weekOf: s.weekOf, value: s[cfg.key] as number | null }));
  const withValue = points.filter((p) => p.value != null);
  const latest = withValue.length > 0 ? withValue[withValue.length - 1].value! : null;
  const prev = withValue.length > 1 ? withValue[withValue.length - 2].value! : null;
  const delta = latest !== null && prev !== null ? latest - prev : null;

  return (
    <div className="flex flex-col rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-1 text-[0.74rem] font-bold uppercase tracking-wide text-[var(--text-secondary)]">{cfg.label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-[1.6rem] font-extrabold leading-none" style={{ color: cfg.color }}>
          {latest !== null ? cfg.fmt(latest) : "—"}
        </span>
        {delta !== null && delta !== 0 && (
          <span className="text-[0.72rem] font-semibold" style={{ color: delta > 0 ? "var(--ok, #10b981)" : "var(--bad, #ef4444)" }}>
            {delta > 0 ? "▲" : "▼"} {cfg.fmt(Math.abs(delta))}
          </span>
        )}
      </div>
      <div style={{ height: 90 }} className="mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="weekOf" tickFormatter={weekLabel} tick={{ fontSize: 9, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip content={<MiniTooltip fmt={cfg.fmt} />} />
            <Line type="monotone" dataKey="value" stroke={cfg.color} strokeWidth={2} dot={{ r: 3, fill: cfg.color, strokeWidth: 0 }} connectNulls activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function WeeklyProgressChart() {
  const [snapshots, setSnapshots] = useState<WeeklySnapshotDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/weekly-snapshots");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = (await res.json()) as WeeklySnapshotDoc[];
        if (!cancelled) setSnapshots(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error al cargar el histórico");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) return null; // sección opcional: si falla, no interrumpe el resto de Control Tower
  if (snapshots === null) return null; // cargando en silencio, sin spinner propio

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Progreso semanal del portafolio</h2>
        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]">
          {snapshots.length} semana{snapshots.length !== 1 ? "s" : ""}
        </span>
      </div>
      {snapshots.length === 0 ? (
        <p className="rounded-xl border p-5 text-center text-[0.82rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
          Todavía no hay histórico — se guarda automáticamente cada lunes a las 8am.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {METRICS.map((cfg) => <MetricChart key={cfg.key} cfg={cfg} snapshots={snapshots} />)}
        </div>
      )}
    </div>
  );
}
