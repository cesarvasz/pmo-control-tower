"use client";

// ROI — datos de la hoja de Google (pestaña "003") vía Apps Script.
// Fuente independiente del resto del dashboard (ver apps-script/roi-log-README.md).
//
// La página es el reporte PM-003: tiempos de trámite por expediente. El Apps
// Script manda la hoja codificada y src/lib/roi.ts la decodifica; aquí llegan
// las filas ya reconstruidas.

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/api";
import { ErrorBox, Loader, SectionHeader } from "@/components/ui";
import ReporteTramites from "@/components/tramites/ReporteTramites";
import type { RoiRow } from "@/types";

export default function RoiPage() {
  const [rows, setRows] = useState<RoiRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/roi");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const data = (await res.json()) as { rows: RoiRow[] };
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la hoja ROI");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => { await load(); })();
  }, [load]);

  return (
    <div>
      <SectionHeader title="ROI" badge="PM-003">
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto rounded-lg border px-3 py-1.5 text-[0.78rem] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
        >
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </SectionHeader>

      <div className="mt-4">
        {loading && !rows ? (
          <Loader />
        ) : error ? (
          <ErrorBox msg={error} />
        ) : !rows || rows.length === 0 ? (
          <div className="rounded-xl border p-4 text-[0.82rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
            Sin registros todavía.
          </div>
        ) : (
          <ReporteTramites rows={rows} />
        )}
      </div>
    </div>
  );
}
