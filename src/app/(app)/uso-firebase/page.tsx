"use client";

// Consumo diario de Firestore (Cloud Monitoring) — mismo dato que la consola de
// Firebase (Firestore Database → Uso). Requiere que la cuenta de servicio
// (FIREBASE_ADMIN_*) tenga el rol IAM "Monitoring Viewer" en Google Cloud Console.

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/api";
import { ErrorBox, Loader, SectionHeader } from "@/components/ui";

interface UsageResp {
  reads: number;
  writes: number;
  deletes: number;
  windowStart: string;
  asOf: string;
  sparkLimits: { reads: number; writes: number; deletes: number };
}

const fmtN = (n: number) => n.toLocaleString("es-GT");
const fmtHM = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit", hour12: false });

function pctColor(pct: number): string {
  return pct >= 90 ? "var(--bad)" : pct >= 70 ? "var(--warn)" : "var(--ok)";
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pctColor(pct);
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[0.82rem] font-bold uppercase tracking-wide text-[var(--text-secondary)]">{label}</span>
        <span className="tabular-nums text-[0.78rem] font-semibold text-[var(--text-muted)]">
          <span style={{ color }}>{fmtN(used)}</span> / {fmtN(limit)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-1.5 text-right text-[0.72rem] font-bold" style={{ color }}>{pct}%</div>
    </div>
  );
}

export default function UsoFirebasePage() {
  const [data, setData] = useState<UsageResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/gcp-usage");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setData((await res.json()) as UsageResp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el uso de Firestore");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => { await load(); })();
  }, [load]);

  return (
    <div>
      <SectionHeader title="Uso de Firebase" badge="Firestore · hoy">
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto rounded-lg border px-3 py-1.5 text-[0.78rem] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
        >
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </SectionHeader>

      <p className="mb-5 text-[0.82rem] text-[var(--text-muted)]">
        Lecturas, escrituras y eliminaciones de Firestore consumidas hoy, vía Cloud Monitoring — el mismo dato oficial
        que muestra la consola de Firebase. El día se cuenta desde la medianoche en hora del Pacífico (América/Los
        Ángeles), que es cuando Firebase resetea la cuota diaria del plan Spark. Si el proyecto está en el plan Blaze
        no hay un tope duro, pero los números y el % contra el límite de Spark sirven igual como referencia.
      </p>

      {loading && !data ? (
        <Loader />
      ) : error ? (
        <ErrorBox
          msg={`${error}${error.toLowerCase().includes("permiso") || error.toLowerCase().includes("permission")
            ? " — revisa que la cuenta de servicio (FIREBASE_ADMIN_CLIENT_EMAIL) tenga el rol IAM \"Monitoring Viewer\" en Google Cloud Console → IAM."
            : ""}`}
        />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <UsageBar label="Lecturas" used={data.reads} limit={data.sparkLimits.reads} />
            <UsageBar label="Escrituras" used={data.writes} limit={data.sparkLimits.writes} />
            <UsageBar label="Eliminaciones" used={data.deletes} limit={data.sparkLimits.deletes} />
          </div>
          <div className="mt-4 text-[0.74rem] text-[var(--text-muted)]">
            Ventana: desde las {fmtHM(data.windowStart)} (medianoche Pacífico) hasta las {fmtHM(data.asOf)} de hoy.
          </div>
        </>
      ) : null}
    </div>
  );
}
