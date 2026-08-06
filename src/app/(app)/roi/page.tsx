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

/** «hace 12 min» — el Apps Script sirve un caché que se refresca cada 30 min. */
function antiguedad(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "recién actualizado";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

export default function RoiPage() {
  const [rows, setRows] = useState<RoiRow[] | null>(null);
  const [generado, setGenerado] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/roi");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const data = (await res.json()) as { rows: RoiRow[]; generado?: string };
      setRows(data.rows);
      setGenerado(data.generado);
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
        {generado && (
          <span className="text-[0.72rem] text-[var(--text-muted)]"
            title={`El Apps Script armó estos datos el ${new Date(generado).toLocaleString("es-GT")}`}>
            datos {antiguedad(generado)}
          </span>
        )}
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
