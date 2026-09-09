"use client";

// C3 — Línea de tiempo con DOS series del promedio de tiempo hábil:
// "Sin herramienta" (files Padre + SV) contra "Con herramienta" (réplicas
// verificadas V). Comparten eje X y eje Y. La serie "Con herramienta" arranca
// donde hay datos V (agosto). SVG solo para las líneas; puntos, ejes y rótulos
// son HTML posicionado para que el texto no se deforme.

import { useMemo, useState } from "react";
import { fmtHHMMSS } from "@/lib/horario";
import type { PuntoMes } from "@/lib/clonaciones";

const PLOT_H = 230;
const EJE_X_H = 26;
const GUTTER = 66;

const COL_PADRE = "#2f77bc"; // azul
const COL_V = "#d97b34"; // naranja

const PASOS = [60, 120, 300, 600, 900, 1800, 3600, 2 * 3600, 4 * 3600, 8 * 3600, 24 * 3600, 48 * 3600, 96 * 3600];
function topeEje(dataMax: number): number {
  const objetivo = dataMax / 4;
  const paso = PASOS.find((p) => p >= objetivo) ?? Math.ceil(objetivo / 86_400) * 86_400;
  return Math.max(paso * 4, 60);
}
function fmtCorto(seg: number | null): string {
  if (seg == null) return "—";
  const s = Math.round(seg);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

interface Serie { clave: string; label: string; valor: number | null; volumen: number }

function alinear(padreSv: PuntoMes[], v: PuntoMes[]) {
  const claves = [...new Set([...padreSv, ...v].map((p) => p.clave))].sort();
  const idx = (arr: PuntoMes[]) => new Map(arr.map((p) => [p.clave, p]));
  const mP = idx(padreSv), mV = idx(v);
  const linea = (m: Map<string, PuntoMes>): Serie[] =>
    claves.map((clave) => {
      const p = m.get(clave);
      return {
        clave,
        label: p?.label ?? clave,
        valor: p ? p.promedio : null,
        volumen: p?.volumen ?? 0,
      };
    });
  return { claves, padreSv: linea(mP), v: linea(mV) };
}

export default function TimelineOrigenClonacion({
  padreSv, v, seleccion, onSeleccionarMes,
}: {
  padreSv: PuntoMes[];
  v: PuntoMes[];
  seleccion: string[];
  onSeleccionarMes: (clave: string) => void;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const { claves, padreSv: sP, v: sV } = useMemo(() => alinear(padreSv, v), [padreSv, v]);
  const n = claves.length;

  if (n === 0) {
    return (
      <div className="rounded-xl border py-10 text-center text-[1.05rem] text-[var(--text-muted)]"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        Sin datos para los filtros seleccionados.
      </div>
    );
  }

  const todos = [...sP, ...sV].map((s) => s.valor).filter((x): x is number => x != null);
  const tope = topeEje(Math.max(1, ...todos));
  const xPct = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const yPct = (val: number) => (1 - val / tope) * 100;

  const linea = (serie: Serie[]) => {
    const pts = serie
      .map((s, i) => ({ i, x: xPct(i), y: s.valor == null ? null : yPct(s.valor) }))
      .filter((p): p is { i: number; x: number; y: number } => p.y != null);
    return pts.map((p, k) => `${k === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  };
  const pathP = linea(sP);
  const pathV = linea(sV);

  const ticks = [0, 1, 2, 3, 4].map((k) => (tope * (4 - k)) / 4);
  const sel = new Set(seleccion);

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.92rem] text-[var(--text-muted)]">
          Promedio de tiempo hábil: con vs sin herramienta · clic en un mes para filtrarlo
        </span>
        <div className="flex items-center gap-4 text-[0.92rem]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded" style={{ background: COL_PADRE }} /> Sin herramienta
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded" style={{ background: COL_V }} /> Con herramienta
          </span>
        </div>
      </div>

      <div className="flex">
        <div className="relative shrink-0" style={{ width: GUTTER, height: PLOT_H }}>
          {ticks.map((t, k) => (
            <span key={k} className="absolute right-2 -translate-y-1/2 tabular-nums text-[0.81rem] text-[var(--text-muted)]"
              style={{ top: `${(k / 4) * 100}%` }}>
              {k === 4 ? "0" : fmtCorto(t)}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          <div className="relative" style={{ height: PLOT_H }}>
            {ticks.map((_, k) => (
              <div key={k} className="absolute inset-x-0 border-t"
                style={{ top: `${(k / 4) * 100}%`, borderColor: "var(--border)", opacity: k === 4 ? 1 : 0.5 }} />
            ))}

            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              {pathP && <path d={pathP} fill="none" stroke={COL_PADRE} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
              {pathV && <path d={pathV} fill="none" stroke={COL_V} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
            </svg>

            {([[sP, COL_PADRE], [sV, COL_V]] as const).map(([serie, col], si) =>
              serie.map((s, i) =>
                s.valor == null ? null : (
                  <span key={`${si}-${i}`} className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                    style={{
                      left: `${xPct(i)}%`, top: `${yPct(s.valor)}%`,
                      background: activo === i ? col : "var(--bg-surface)", borderColor: col, borderWidth: 2,
                    }} />
                ),
              ),
            )}
          </div>

          <div className="relative" style={{ height: EJE_X_H }}>
            {claves.map((clave, i) => {
              const visible = n <= 14 || i % Math.ceil(n / 14) === 0 || i === n - 1;
              return (
                <span key={clave} className="absolute top-1 -translate-x-1/2 whitespace-nowrap text-[0.83rem]"
                  style={{
                    left: `${xPct(i)}%`,
                    visibility: visible ? undefined : "hidden",
                    fontWeight: activo === i ? 700 : 400,
                    color: activo === i ? "var(--accent-light)" : sel.size && !sel.has(clave) ? "var(--text-disabled)" : "var(--text-muted)",
                  }}>
                  {sP[i]?.label ?? sV[i]?.label ?? clave}
                </span>
              );
            })}
          </div>

          {activo != null && (
            <div className="pointer-events-none absolute top-0 border-l"
              style={{ left: `${xPct(activo)}%`, height: PLOT_H, borderColor: "var(--accent)", opacity: 0.5 }} />
          )}

          <div className="absolute inset-x-0 top-0 flex" style={{ height: PLOT_H }}>
            {claves.map((clave, i) => (
              <button key={clave} className="h-full flex-1" style={{ minWidth: 0 }}
                onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)}
                onClick={() => onSeleccionarMes(clave)}
                aria-label={`${sP[i]?.label ?? clave}: sin herramienta ${fmtHHMMSS(sP[i]?.valor)}, con herramienta ${fmtHHMMSS(sV[i]?.valor)}`} />
            ))}
          </div>
        </div>
      </div>

      {activo != null && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {([["Sin herramienta", sP[activo], COL_PADRE], ["Con herramienta", sV[activo], COL_V]] as const).map(([tit, s, col]) => (
            <div key={tit} className="rounded-lg border p-2.5" style={{ borderColor: col, background: "var(--bg-hover)" }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[0.95rem] font-bold text-[var(--text-primary)]">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: col }} /> {tit}
                </span>
                <span className="text-[0.87rem] text-[var(--text-muted)]">{s?.label}</span>
              </div>
              <div className="mt-1 tabular-nums text-[1.35rem] font-extrabold" style={{ color: "var(--text-primary)" }}>
                {fmtHHMMSS(s?.valor)}
              </div>
              <div className="text-[0.85rem] text-[var(--text-muted)]">{(s?.volumen ?? 0).toLocaleString("es-GT")} clonaciones</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
