"use client";

// ROI — dos fuentes independientes, cada una un archivo de Google Sheets
// distinto y su propio Apps Script: "003" (hoja "ROI", pestaña "003", tiempos
// de trámite) y "Clonación de Files" (archivo "Clonacion files", pestaña
// "clonacion"). Cada pestaña de la UI carga y recarga por su cuenta — ver
// apps-script/roi-log-README.md y apps-script/roi-clonacion-README.md.

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/api";
import { ErrorBox, Loader, SectionHeader } from "@/components/ui";
import ReporteTramites from "@/components/tramites/ReporteTramites";
import ReporteClonacion from "@/components/clonacion/ReporteClonacion";
import type { RoiRow, ClonacionRow } from "@/types";

/** «hace 12 min» — el Apps Script sirve un caché que se refresca cada 30 min. */
function antiguedad(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "recién actualizado";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

type Tab = "tramites" | "clonacion";

interface Carga<T> {
  rows: T[] | null;
  generado?: string;
  loading: boolean;
  error: string | null;
}

export default function RoiPage() {
  const [tab, setTab] = useState<Tab>("tramites");
  const [tramites, setTramites] = useState<Carga<RoiRow>>({ rows: null, loading: true, error: null });
  const [clonacion, setClonacion] = useState<Carga<ClonacionRow>>({ rows: null, loading: false, error: null });

  const cargarTramites = useCallback(async () => {
    setTramites((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await authedFetch("/api/roi");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const data = (await res.json()) as { rows: RoiRow[]; generado?: string };
      setTramites({ rows: data.rows, generado: data.generado, loading: false, error: null });
    } catch (err) {
      setTramites((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Error al cargar la hoja ROI" }));
    }
  }, []);

  const cargarClonacion = useCallback(async () => {
    setClonacion((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await authedFetch("/api/roi/clonacion");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const data = (await res.json()) as { rows: ClonacionRow[]; generado?: string };
      setClonacion({ rows: data.rows, generado: data.generado, loading: false, error: null });
    } catch (err) {
      setClonacion((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Error al cargar la hoja de Clonación" }));
    }
  }, []);

  useEffect(() => { cargarTramites(); }, [cargarTramites]);
  // La pestaña de Clonación carga la primera vez que se visita, no de entrada
  // — son fuentes independientes y no siempre hace falta la segunda.
  useEffect(() => {
    if (tab === "clonacion" && clonacion.rows === null && !clonacion.loading) cargarClonacion();
  }, [tab, clonacion.rows, clonacion.loading, cargarClonacion]);

  const generado = tab === "tramites" ? tramites.generado : clonacion.generado;
  const loading = tab === "tramites" ? tramites.loading : clonacion.loading;
  const error = tab === "tramites" ? tramites.error : clonacion.error;
  const recargar = tab === "tramites" ? cargarTramites : cargarClonacion;

  return (
    <div>
      <SectionHeader title="ROI" badge={tab === "tramites" ? "PM-003" : "Clonación"}>
        {generado && (
          <span className="text-[0.72rem] text-[var(--text-muted)]"
            title={`El Apps Script armó estos datos el ${new Date(generado).toLocaleString("es-GT")}`}>
            datos {antiguedad(generado)}
          </span>
        )}
        <button
          onClick={recargar}
          disabled={loading}
          className="ml-auto rounded-lg border px-3 py-1.5 text-[0.78rem] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
        >
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </SectionHeader>

      {/* Pestañas */}
      <div className="mb-5 mt-4 inline-flex rounded-lg border p-0.5" style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}>
        {(["tramites", "clonacion"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="rounded-md px-4 py-1.5 text-sm font-medium transition-colors"
            style={tab === t ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}
          >
            {t === "tramites" ? "003" : "Clonación de Files"}
          </button>
        ))}
      </div>

      {loading && !(tab === "tramites" ? tramites.rows : clonacion.rows) ? (
        <Loader />
      ) : error ? (
        <ErrorBox msg={error} />
      ) : tab === "tramites" ? (
        !tramites.rows || tramites.rows.length === 0 ? (
          <div className="rounded-xl border p-4 text-[0.82rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
            Sin registros todavía.
          </div>
        ) : (
          <ReporteTramites rows={tramites.rows} />
        )
      ) : !clonacion.rows || clonacion.rows.length === 0 ? (
        <div className="rounded-xl border p-4 text-[0.82rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
          Sin registros todavía.
        </div>
      ) : (
        <ReporteClonacion rows={clonacion.rows} />
      )}
    </div>
  );
}
