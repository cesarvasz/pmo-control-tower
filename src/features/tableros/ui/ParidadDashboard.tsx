"use client";

// «Dashboard completo: Monday vs Supabase» (preparación de la Fase 6). Arma el dashboard de la app
// con la copia de Monday y con los tableros de Supabase y los compara: los indicadores del Control
// Tower lado a lado y cada sección. Si sale igual, todas las páginas saldrían igual leyendo de
// Supabase. Solo lectura.

import { useState } from "react";
import { Pill } from "@/components/ui";
import type { ResultadoParidadDashboard } from "../dominio/dashboard";
import { Boton, enviar, Nota, Tarjeta } from "./comun";

type Comparacion = ResultadoParidadDashboard & { copiaDel: string | null; duracionMs: number };

const ESTADO_KPI = {
  igual: { tono: "ok" as const, texto: "✓" },
  explicada: { tono: "neutral" as const, texto: "decidida" },
  distinta: { tono: "bad" as const, texto: "≠" },
};

const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString("es-GT", { maximumFractionDigits: 2 }));

export default function ParidadDashboard({ deshabilitado }: { deshabilitado?: boolean }) {
  const [data, setData] = useState<Comparacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  async function comparar() {
    setCargando(true); setFallo(null);
    try { setData(await enviar<Comparacion>("/api/tableros/paridad-dashboard", "GET")); }
    catch (e) { setFallo(e instanceof Error ? e.message : "Error"); }
    finally { setCargando(false); }
  }

  const avisos = data ? data.secciones.reduce((n, s) => n + s.avisos.length, 0) : 0;

  return (
    <Tarjeta
      titulo="Dashboard completo: Monday vs Supabase"
      accion={<Boton disabled={cargando || deshabilitado} onClick={comparar}>{cargando ? "Comparando…" : data ? "Comparar otra vez" : "Comparar dashboard"}</Boton>}
    >
      <p className="text-[0.8rem] text-[var(--text-muted)]">
        Arma el dashboard de la app (el que alimenta Control Tower, Players, Portafolio, Proyectos…) con Monday y con los tableros de Supabase,
        y los compara. Si sale igual, la app puede leer directo de Supabase sin que cambie ningún número. No escribe nada.
      </p>
      {fallo && <Nota tono="mal">{fallo}</Nota>}
      {data && (
        <div className="mt-3 flex flex-col gap-3">
          {data.igual
            ? <Nota tono="ok">Sale igual: leyendo de Supabase, todas las páginas darían lo mismo que hoy con Monday.</Nota>
            : <Nota tono="mal">Hay diferencias (abajo). Leer de Supabase cambiaría esos datos en la app.</Nota>}

          <div className="table-wrap">
            <table className="pmo">
              <thead><tr><th>Indicador del Control Tower</th><th style={{ textAlign: "right" }}>Monday</th><th style={{ textAlign: "right" }}>Supabase</th><th /></tr></thead>
              <tbody>
                {data.kpis.map((k) => (
                  <tr key={k.clave}>
                    <td>{k.etiqueta}</td>
                    <td style={{ textAlign: "right" }}>{fmt(k.monday)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(k.supabase)}</td>
                    <td><Pill tone={ESTADO_KPI[k.estado].tono} small>{ESTADO_KPI[k.estado].texto}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table className="pmo">
              <thead><tr><th>Sección</th><th style={{ textAlign: "right" }}>Monday</th><th style={{ textAlign: "right" }}>Supabase</th><th>Resultado</th></tr></thead>
              <tbody>
                {data.secciones.map((s) => (
                  <tr key={s.clave}>
                    <td>{s.nombre}</td>
                    <td style={{ textAlign: "right" }}>{s.monday.toLocaleString("es-GT")}</td>
                    <td style={{ textAlign: "right" }}>{s.supabase.toLocaleString("es-GT")}</td>
                    <td style={{ fontSize: ".78rem" }}>
                      {s.total === 0 ? <Pill tone="ok" small>✓ Igual</Pill> : (
                        <button type="button" onClick={() => setAbierta(abierta === s.clave ? null : s.clave)}>
                          <Pill tone="bad" small>{s.total} diferencia{s.total === 1 ? "" : "s"} {abierta === s.clave ? "▴" : "▾"}</Pill>
                        </button>
                      )}
                      {s.explicadas.map((x) => <span key={x.motivo} className="ml-1.5 text-[var(--text-muted)]" title={x.motivo}>{x.cantidad} decidida{x.cantidad === 1 ? "" : "s"}</span>)}
                      {s.avisos.length > 0 && <span className="ml-1.5 text-[var(--text-muted)]">{s.avisos.length} aviso{s.avisos.length === 1 ? "" : "s"}</span>}
                      {abierta === s.clave && (
                        <ul className="mt-1.5 max-h-48 overflow-y-auto text-[0.75rem] text-[var(--text-secondary)]">
                          {s.muestra.map((d, i) => <li key={i}>{d}</li>)}
                          {s.total > s.muestra.length && <li className="text-[var(--text-muted)]">… y {s.total - s.muestra.length} más</li>}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {avisos > 0 && (
            <Nota>
              {avisos} valor{avisos === 1 ? "" : "es"} de Monday con personas que no están en el directorio (en Supabase quedan vacíos; no cuentan como
              diferencia): <strong>{data.personasFuera.join(", ")}</strong>. Agrégalas al Directorio RH de Monday y llegan con la siguiente sincronización.
            </Nota>
          )}
          {data.secciones.flatMap((s) => s.explicadas).filter((x, i, l) => l.findIndex((y) => y.motivo === x.motivo) === i).map((x) => (
            <Nota key={x.motivo}><strong>Diferencia decidida</strong> (no cuenta): {x.motivo}</Nota>
          ))}
          {data.soloEnLaApp.length > 0 && (
            <p className="text-[0.75rem] text-[var(--text-muted)]">
              Tableros de proyecto que existen solo en la app (no vienen de Monday; leyendo de Supabase aparecerían como proyectos): {data.soloEnLaApp.join(", ")}.
            </p>
          )}
          <p className="text-[0.72rem] text-[var(--text-muted)]">
            Monday se lee de la copia en Supabase{data.copiaDel ? ` (actualizada ${new Date(data.copiaDel).toLocaleString("es-GT")})` : ""}, que se llena en la
            misma sincronización que los tableros. No entran el calendario, la hoja ni el ROI (Apps Script y Sheets): no dependen de la fuente.
            Tardó {(data.duracionMs / 1000).toFixed(1)} s.
          </p>
        </div>
      )}
    </Tarjeta>
  );
}
