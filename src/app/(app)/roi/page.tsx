"use client";

// ROI — fuentes independientes, cada una con su propio Apps Script: "003" (hoja
// "ROI", pestaña "003", tiempos de trámite), "Tiempo 0" (la Clonación de Files:
// archivo "Clonacion files", pestaña "clonacion") e "Implementación" (el mismo
// archivo "Clonacion files", pestaña "implementacion") y "Ducafast SV" (la misma
// hoja ROI de 003, pestaña "008": análisis de tiempos). 003 y Tiempo 0 cargan al
// entrar: 003 usa también Clonación para su Beneficio T0. Implementación y
// Ducafast SV cargan la primera vez que se abre su pestaña — nada depende de
// ellas. Ver apps-script/roi-*-README.md.

import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/api";
import { ErrorBox, Loader, SectionHeader } from "@/components/ui";
import ReporteTramites from "@/components/tramites/ReporteTramites";
import ReporteClonacion from "@/components/clonacion/ReporteClonacion";
import ReporteImplementacion from "@/components/implementacion/ReporteImplementacion";
import ReporteTiempos008 from "@/components/roi008/ReporteTiempos008";
import type { RoiRow, ClonacionRow, ImplementacionRow, Roi008Row } from "@/types";

/** «hace 12 min» — el Apps Script sirve un caché que se refresca cada 30 min. */
function antiguedad(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "recién actualizado";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

type Tab = "tramites" | "clonacion" | "implementacion" | "ducafastSv";

interface Carga<T> {
  rows: T[] | null;
  generado?: string;
  loading: boolean;
  error: string | null;
  /** Encabezados de la hoja (solo ROI 008: valida que estén las columnas que necesita). */
  columnas?: string[];
}

export default function RoiPage() {
  const [tab, setTab] = useState<Tab>("tramites");
  const [tramites, setTramites] = useState<Carga<RoiRow>>({ rows: null, loading: true, error: null });
  const [clonacion, setClonacion] = useState<Carga<ClonacionRow>>({ rows: null, loading: true, error: null });
  const [implementacion, setImplementacion] = useState<Carga<ImplementacionRow>>({ rows: null, loading: true, error: null });
  const implementacionPedida = useRef(false);
  const [roi008, setRoi008] = useState<Carga<Roi008Row>>({ rows: null, loading: true, error: null });
  const roi008Pedido = useRef(false);

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

  const cargarImplementacion = useCallback(async () => {
    setImplementacion((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await authedFetch("/api/roi/implementacion");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const data = (await res.json()) as { rows: ImplementacionRow[]; generado?: string };
      setImplementacion({ rows: data.rows, generado: data.generado, loading: false, error: null });
    } catch (err) {
      setImplementacion((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Error al cargar la hoja de Implementación" }));
    }
  }, []);

  const cargarRoi008 = useCallback(async () => {
    setRoi008((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await authedFetch("/api/roi/008");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const data = (await res.json()) as { rows: Roi008Row[]; columnas?: string[]; generado?: string };
      setRoi008({ rows: data.rows, columnas: data.columnas, generado: data.generado, loading: false, error: null });
    } catch (err) {
      setRoi008((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Error al cargar la pestaña 008 de la hoja ROI" }));
    }
  }, []);

  // 003 y Clonación cargan desde el inicio: la pestaña 003 también necesita la
  // de Clonación para su "Beneficio T0" (ver ReporteTramites).
  useEffect(() => { cargarTramites(); cargarClonacion(); }, [cargarTramites, cargarClonacion]);

  // Implementación no alimenta a nadie: se pide la primera vez que se abre.
  useEffect(() => {
    if (tab === "implementacion" && !implementacionPedida.current) {
      implementacionPedida.current = true;
      cargarImplementacion();
    }
  }, [tab, cargarImplementacion]);

  // Ducafast SV (ROI 008) tampoco alimenta a nadie: se pide la primera vez que se abre.
  useEffect(() => {
    if (tab === "ducafastSv" && !roi008Pedido.current) {
      roi008Pedido.current = true;
      cargarRoi008();
    }
  }, [tab, cargarRoi008]);

  const carga: Carga<unknown> = tab === "tramites" ? tramites : tab === "clonacion" ? clonacion
    : tab === "implementacion" ? implementacion : roi008;
  const { generado, loading, error } = carga;
  // En 003, Actualizar refresca también Clonación (alimenta el Beneficio T0).
  const recargar = tab === "tramites" ? () => { cargarTramites(); cargarClonacion(); }
    : tab === "clonacion" ? cargarClonacion
    : tab === "implementacion" ? cargarImplementacion
    : cargarRoi008;

  const badge = tab === "tramites" ? "PM-003" : tab === "clonacion" ? "Clonación"
    : tab === "implementacion" ? "Implementación" : "ROI 008";

  return (
    <div>
      <SectionHeader title="ROI" badge={badge}>
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
        {([
          ["tramites", "003"],
          ["clonacion", "Tiempo 0"],
          ["implementacion", "Implementación"],
          ["ducafastSv", "Ducafast SV"],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="rounded-md px-4 py-1.5 text-sm font-medium transition-colors"
            style={tab === t ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && !carga.rows ? (
        <Loader />
      ) : error ? (
        <ErrorBox msg={error} />
      ) : tab === "tramites" ? (
        !tramites.rows || tramites.rows.length === 0 ? (
          <div className="rounded-xl border p-4 text-[0.82rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
            Sin registros todavía.
          </div>
        ) : (
          <ReporteTramites rows={tramites.rows} clonacion={{ rows: clonacion.rows, error: clonacion.error }} />
        )
      ) : tab === "clonacion" ? (
        !clonacion.rows || clonacion.rows.length === 0 ? (
          <div className="rounded-xl border p-4 text-[0.82rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
            Sin registros todavía.
          </div>
        ) : (
          <ReporteClonacion rows={clonacion.rows} />
        )
      ) : tab === "ducafastSv" ? (
        !roi008.rows || roi008.rows.length === 0 ? (
          <div className="rounded-xl border p-4 text-[0.82rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
            Sin registros todavía.
          </div>
        ) : (
          <ReporteTiempos008 rows={roi008.rows} columnas={roi008.columnas} />
        )
      ) : !implementacion.rows || implementacion.rows.length === 0 ? (
        <div className="rounded-xl border p-4 text-[0.82rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
          Sin registros todavía.
        </div>
      ) : (
        <ReporteImplementacion rows={implementacion.rows} />
      )}
    </div>
  );
}
