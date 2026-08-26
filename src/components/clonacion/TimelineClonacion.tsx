"use client";

// C3 — Línea de tiempo mensual: barras de volumen al fondo + línea de la
// medida seleccionada. SVG a mano, mismo patrón que TramitesSeries.tsx (no hay
// librería de gráficas en la app). Clic en un mes lo agrega o quita del filtro.

import { useState } from "react";
import { fmtHHMMSS } from "@/lib/horario";
import { METRICA_LABEL, type Metrica, type PuntoMes } from "@/lib/clonaciones";

const ALTO = 150;
const PAD_Y = 10;

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
  const valores = serie.map((p) => p[metrica]);
  const max = Math.max(1, ...valores.map((v) => v ?? 0));
  const maxVol = Math.max(1, ...serie.map((p) => p.volumen));

  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number | null) => (v == null ? null : ALTO - PAD_Y - (v / max) * (ALTO - PAD_Y * 2));

  const puntos = serie
    .map((p, i) => ({ i, cx: x(i), cy: y(p[metrica]) }))
    .filter((p): p is { i: number; cx: number; cy: number } => p.cy != null);
  const path = puntos.map((p, k) => `${k === 0 ? "M" : "L"}${p.cx} ${p.cy}`).join(" ");
  const area = puntos.length
    ? `${path} L${puntos[puntos.length - 1].cx} ${ALTO - PAD_Y} L${puntos[0].cx} ${ALTO - PAD_Y} Z`
    : "";

  const sel = new Set(seleccion);
  const punto = activo != null ? serie[activo] : null;

  if (n === 0) {
    return (
      <div className="rounded-xl border py-10 text-center text-[0.82rem] text-[var(--text-muted)]"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        Sin datos para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[0.72rem] text-[var(--text-muted)]">
          Barras = volumen · línea = {METRICA_LABEL[metrica].toLowerCase()} · clic en un mes para filtrarlo
        </span>
        {punto && (
          <span className="text-[0.72rem] font-semibold text-[var(--accent-light)]">
            {punto.label} · {punto.volumen.toLocaleString("es-GT")} clonaciones
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 100 ${ALTO}`}
        preserveAspectRatio="none"
        className="h-[150px] w-full cursor-pointer"
        onMouseLeave={() => setActivo(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = (e.clientX - r.left) / r.width;
          setActivo(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
        }}
        onClick={() => { if (activo != null) onSeleccionarMes(serie[activo].clave); }}
      >
        {/* Volumen de fondo */}
        {serie.map((p, i) => {
          const w = n === 1 ? 40 : (100 / n) * 0.62;
          const h = (p.volumen / maxVol) * (ALTO - PAD_Y * 2) * 0.55;
          const on = sel.size === 0 || sel.has(p.clave);
          return (
            <rect
              key={p.clave}
              x={x(i) - w / 2} y={ALTO - PAD_Y - h} width={w} height={h}
              fill={on ? "var(--accent)" : "var(--text-disabled)"}
              opacity={activo === i ? 0.4 : on ? 0.22 : 0.14}
            />
          );
        })}

        {activo != null && (
          <line x1={x(activo)} x2={x(activo)} y1={0} y2={ALTO - PAD_Y}
            stroke="var(--accent)" strokeWidth={0.4} opacity={0.7} vectorEffect="non-scaling-stroke" />
        )}

        {area && <path d={area} fill="var(--accent)" opacity={0.12} />}
        {path && (
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.6}
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {puntos.map((p) => (
          <circle key={p.i} cx={p.cx} cy={p.cy} r={activo === p.i ? 2.4 : 1.4}
            fill="var(--accent)" stroke="var(--bg-surface)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {/* Eje X */}
      <div className="mt-1.5 flex justify-between px-1 text-[0.66rem] text-[var(--text-muted)]">
        {serie.map((p, i) => (
          <span key={p.clave} className={n > 14 && i % Math.ceil(n / 14) !== 0 && i !== n - 1 ? "invisible" : ""}
            style={{ fontWeight: activo === i ? 700 : 400, color: activo === i ? "var(--accent-light)" : undefined }}>
            {p.label}
          </span>
        ))}
      </div>

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
