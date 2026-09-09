"use client";

// C3 — Línea de tiempo mensual. Dos paneles con el MISMO eje X (un solo eje Y
// por panel, nunca dos escalas en la misma gráfica):
//   · arriba  — la medida seleccionada (mediana / promedio / P90) como línea,
//               con eje Y, líneas guía y el valor rotulado en cada punto.
//   · abajo   — el volumen de clonaciones del mes, como barras.
// Todo responde a los filtros (la serie ya llega filtrada). SVG solo para la
// línea/área; puntos, rótulos y ejes son HTML posicionado para que el texto no
// se deforme y los valores se lean nítidos a cualquier ancho.

import { useState } from "react";
import { fmtHHMMSS } from "@/lib/horario";
import { METRICA_LABEL, type Metrica, type PuntoMes } from "@/lib/clonaciones";

const PLOT_H = 190; // alto del panel de la línea, en px
const STRIP_H = 58; // alto del panel de volumen
const EJE_X_H = 20; // alto de la fila de meses
const GUTTER = 56; // ancho de la columna de etiquetas del eje Y

/** Pasos "redondos" en segundos para el tope del eje Y. */
const PASOS = [60, 120, 300, 600, 900, 1800, 3600, 2 * 3600, 4 * 3600, 8 * 3600, 24 * 3600, 48 * 3600, 96 * 3600];

function topeEje(dataMax: number): number {
  const objetivo = dataMax / 4;
  const paso = PASOS.find((p) => p >= objetivo) ?? Math.ceil(objetivo / 86_400) * 86_400;
  return Math.max(paso * 4, 60);
}

/** Compacto para rótulos de la gráfica: "45m", "1:54", "31:00". El tooltip y la
 *  tarjeta de detalle siguen mostrando hh:mm:ss completo. */
function fmtCorto(seg: number | null): string {
  if (seg == null) return "—";
  const s = Math.round(seg);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export default function TimelineClonacion({
  serie, metrica, seleccion, onSeleccionarMes,
}: {
  serie: PuntoMes[];
  metrica: Metrica;
  seleccion: string[];
  onSeleccionarMes: (clave: string) => void;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const n = serie.length;

  if (n === 0) {
    return (
      <div className="rounded-xl border py-10 text-center text-[0.82rem] text-[var(--text-muted)]"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        Sin datos para los filtros seleccionados.
      </div>
    );
  }

  const valores = serie.map((p) => p[metrica]);
  const medibles = valores.filter((v): v is number => v != null);
  const dataMax = Math.max(1, ...medibles);
  const tope = topeEje(dataMax);
  const maxVol = Math.max(1, ...serie.map((p) => p.volumen));

  const xPct = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const yPct = (v: number) => (1 - v / tope) * 100; // 0 = arriba, 100 = base

  const puntos = serie
    .map((p, i) => ({ i, x: xPct(i), y: valores[i] == null ? null : yPct(valores[i] as number) }))
    .filter((p): p is { i: number; x: number; y: number } => p.y != null);
  const path = puntos.map((p, k) => `${k === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const area = puntos.length >= 2
    ? `${path} L${puntos[puntos.length - 1].x} 100 L${puntos[0].x} 100 Z`
    : "";

  const ticks = [0, 1, 2, 3, 4].map((k) => (tope * (4 - k)) / 4); // de arriba (tope) a 0
  const sel = new Set(seleccion);
  const punto = activo != null ? serie[activo] : null;

  // Con muchos meses, rotular todos los puntos amontona: se rotulan extremos,
  // pico, valle y el mes bajo el cursor.
  const iPico = medibles.length ? valores.indexOf(Math.max(...medibles)) : -1;
  const iValle = medibles.length ? valores.indexOf(Math.min(...medibles)) : -1;
  const rotular = (i: number) =>
    n <= 12 || i === 0 || i === n - 1 || i === iPico || i === iValle || i === activo;

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[0.72rem] text-[var(--text-muted)]">
          Línea = <strong className="text-[var(--text-secondary)]">{METRICA_LABEL[metrica].toLowerCase()}</strong> de tiempo hábil ·
          barras = volumen de clonaciones · clic en un mes para filtrarlo
        </span>
        {punto ? (
          <span className="tabular-nums text-[0.72rem] font-semibold text-[var(--accent-light)]">
            {punto.label} · {fmtHHMMSS(punto[metrica])} · {punto.volumen.toLocaleString("es-GT")} clonaciones
          </span>
        ) : iPico >= 0 ? (
          <span className="tabular-nums text-[0.72rem] text-[var(--text-muted)]">
            pico {serie[iPico].label} · {fmtHHMMSS(valores[iPico])}
          </span>
        ) : null}
      </div>

      <div className="flex">
        {/* Columna de etiquetas del eje Y */}
        <div className="relative shrink-0" style={{ width: GUTTER, height: PLOT_H }}>
          {ticks.map((t, k) => (
            <span key={k} className="absolute right-2 -translate-y-1/2 tabular-nums text-[0.62rem] text-[var(--text-muted)]"
              style={{ top: `${(k / 4) * 100}%` }}>
              {k === 4 ? "0" : fmtCorto(t)}
            </span>
          ))}
        </div>

        {/* Área de trazado + volumen + eje X, todo con el mismo eje horizontal */}
        <div className="relative flex-1">
          {/* Panel de la línea */}
          <div className="relative" style={{ height: PLOT_H }}>
            {ticks.map((_, k) => (
              <div key={k} className="absolute inset-x-0 border-t"
                style={{ top: `${(k / 4) * 100}%`, borderColor: "var(--border)", opacity: k === 4 ? 1 : 0.5 }} />
            ))}

            {medibles.length >= 1 && (
              <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                {area && <path d={area} fill="var(--accent)" opacity={0.1} />}
                {path && (
                  <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2}
                    vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                )}
              </svg>
            )}

            {/* Puntos + valor rotulado */}
            {puntos.map((p) => {
              const abajo = p.y < 16; // cerca del techo: el rótulo va debajo
              // Los rótulos de los extremos se alinean hacia adentro para no
              // pisar el eje Y (izquierda) ni salirse de la caja (derecha).
              const borde = p.i === 0 ? "ini" : p.i === n - 1 ? "fin" : "mid";
              return (
                <div key={p.i} className="pointer-events-none absolute" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                  <span className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                    style={{
                      background: activo === p.i ? "var(--accent)" : "var(--bg-surface)",
                      borderColor: "var(--accent)", borderWidth: 2,
                      boxShadow: activo === p.i ? "0 0 0 3px var(--bg-accent-soft)" : undefined,
                    }} />
                  {rotular(p.i) && (
                    <span className="absolute whitespace-nowrap rounded px-1 tabular-nums text-[0.66rem] font-bold"
                      style={{
                        top: abajo ? 10 : undefined, bottom: abajo ? undefined : 10,
                        left: borde === "fin" ? undefined : 0,
                        right: borde === "fin" ? 0 : undefined,
                        transform: borde === "mid" ? "translateX(-50%)" : undefined,
                        color: activo === p.i ? "var(--accent-light)" : "var(--text-secondary)",
                        background: activo === p.i ? "var(--bg-accent-soft)" : "transparent",
                      }}>
                      {fmtCorto(valores[p.i])}
                    </span>
                  )}
                </div>
              );
            })}

            {medibles.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-[0.75rem] text-[var(--text-muted)]">
                Sin tiempos medibles en el periodo (faltan Solicitud_fecha)
              </div>
            )}
          </div>

          {/* Panel de volumen */}
          <div className="relative border-t" style={{ height: STRIP_H, borderColor: "var(--border)" }}>
            {serie.map((p, i) => {
              const h = Math.max(3, (p.volumen / maxVol) * (STRIP_H - 16));
              const on = sel.size === 0 || sel.has(p.clave);
              return (
                <div key={p.clave} className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
                  style={{ left: `${xPct(i)}%`, width: `${n === 1 ? 50 : 100 / n}%` }}>
                  {rotular(i) && (
                    <span className="mb-0.5 tabular-nums text-[0.6rem] text-[var(--text-muted)]"
                      style={{ color: activo === i ? "var(--accent-light)" : undefined }}>
                      {p.volumen.toLocaleString("es-GT")}
                    </span>
                  )}
                  <div className="rounded-t-sm" style={{
                    width: "58%", maxWidth: 26,
                    height: h,
                    background: activo === i || on ? "var(--accent)" : "var(--text-disabled)",
                    opacity: activo === i ? 0.9 : on ? 0.34 : 0.18,
                  }} />
                </div>
              );
            })}
          </div>

          {/* Eje X */}
          <div className="relative" style={{ height: EJE_X_H }}>
            {serie.map((p, i) => {
              const visible = n <= 14 || i % Math.ceil(n / 14) === 0 || i === n - 1;
              return (
                <span key={p.clave}
                  className="absolute top-1 -translate-x-1/2 whitespace-nowrap text-[0.64rem]"
                  style={{
                    left: `${xPct(i)}%`,
                    visibility: visible ? undefined : "hidden",
                    fontWeight: activo === i ? 700 : 400,
                    color: activo === i ? "var(--accent-light)" : "var(--text-muted)",
                  }}>
                  {p.label}
                </span>
              );
            })}
          </div>

          {/* Cursor vertical, atraviesa los dos paneles */}
          {activo != null && (
            <div className="pointer-events-none absolute top-0 border-l"
              style={{ left: `${xPct(activo)}%`, height: PLOT_H + STRIP_H, borderColor: "var(--accent)", opacity: 0.5 }} />
          )}

          {/* Zonas sensibles: una por mes, cubren línea + volumen */}
          <div className="absolute inset-x-0 top-0 flex" style={{ height: PLOT_H + STRIP_H }}>
            {serie.map((p, i) => (
              <button
                key={p.clave}
                className="h-full flex-1"
                style={{ minWidth: 0 }}
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
                onClick={() => onSeleccionarMes(p.clave)}
                aria-label={`${p.label}: ${METRICA_LABEL[metrica]} ${fmtHHMMSS(p[metrica])}, ${p.volumen.toLocaleString("es-GT")} clonaciones`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Tarjeta del mes bajo el cursor — valores exactos de las 3 medidas */}
      {punto && (
        <div className="mt-3 rounded-xl border p-3" style={{ background: "var(--bg-hover)", borderColor: "var(--accent)" }}>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-[0.82rem] font-bold text-[var(--text-primary)]">{punto.label}</span>
            <span className="text-[0.72rem] text-[var(--text-muted)]">
              {punto.n.toLocaleString("es-GT")} medibles de {punto.volumen.toLocaleString("es-GT")}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["mediana", "promedio", "p90"] as Metrica[]).map((m) => (
              <div key={m} className="rounded-lg px-2 py-1.5 text-center"
                style={{ background: "var(--bg-surface)", boxShadow: m === metrica ? "inset 0 0 0 1.5px var(--accent)" : undefined }}>
                <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{METRICA_LABEL[m]}</div>
                <div className="tabular-nums text-[0.82rem] font-bold text-[var(--text-primary)]">{fmtHHMMSS(punto[m])}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
