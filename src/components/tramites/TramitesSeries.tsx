"use client";

// Sección 2 — Series de tiempo: una gráfica por etapa más el Total, con EJE X
// compartido y cursor sincronizado. Barras de volumen de fondo.
//
// Cada gráfica escala su propio eje Y: T2 y T3 son casi instantáneos (medianas de
// 0 s y 3 s) mientras T1 ronda las 32 h. Con un Y común esas dos etapas serían una
// línea plana pegada al cero. El eje compartido es el X (el tiempo), que es lo que
// permite comparar periodos y sincronizar el cursor.
//
// SVG a mano, como el resto de la app (no hay librería de gráficas).

import { useMemo, useState } from "react";
import { fmtHHMMSS } from "@/lib/horario";
import { ETAPAS, type EtapaKey, type PuntoSerie } from "@/lib/tramites";

const SERIES: { key: EtapaKey | "total"; label: string; corto: string }[] = [
  ...ETAPAS.map((e) => ({ key: e.key, label: e.label, corto: e.key.toUpperCase() })),
  { key: "total" as const, label: "Total · ciclo completo", corto: "Total" },
];

const ALTO = 90;
const PAD_Y = 10;

function Grafica({
  serie, sKey, label, activo, onHover, onSalir, onClicar,
}: {
  serie: PuntoSerie[];
  sKey: EtapaKey | "total";
  label: string;
  activo: number | null;
  onHover: (i: number) => void;
  onSalir: () => void;
  onClicar: (clave: string) => void;
}) {
  const valores = serie.map((p) => p.valores[sKey]);
  const max = Math.max(1, ...valores.map((v) => v ?? 0));
  const maxVol = Math.max(1, ...serie.map((p) => p.volumen));
  const n = serie.length;

  // Coordenadas en un viewBox 0..100 (x) que escala con el ancho del contenedor.
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number | null) => (v == null ? null : ALTO - PAD_Y - (v / max) * (ALTO - PAD_Y * 2));

  const puntos = serie
    .map((p, i) => ({ i, cx: x(i), cy: y(p.valores[sKey]) }))
    .filter((p): p is { i: number; cx: number; cy: number } => p.cy != null);

  const path = puntos.map((p, k) => `${k === 0 ? "M" : "L"}${p.cx} ${p.cy}`).join(" ");
  const area = puntos.length
    ? `${path} L${puntos[puntos.length - 1].cx} ${ALTO - PAD_Y} L${puntos[0].cx} ${ALTO - PAD_Y} Z`
    : "";

  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[0.74rem] font-bold text-[var(--text-primary)]">{label}</span>
        <span className="tabular-nums text-[0.72rem] text-[var(--text-muted)]">
          {activo != null ? fmtHHMMSS(serie[activo]?.valores[sKey]) : `máx ${fmtHHMMSS(max)}`}
        </span>
      </div>

      <svg
        viewBox={`0 0 100 ${ALTO}`}
        preserveAspectRatio="none"
        className="h-[90px] w-full cursor-pointer"
        onMouseLeave={onSalir}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = (e.clientX - r.left) / r.width;
          onHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
        }}
        onClick={() => { if (activo != null) onClicar(serie[activo].clave); }}
      >
        {/* Volumen de fondo */}
        {serie.map((p, i) => {
          const w = n === 1 ? 40 : 100 / n * 0.62;
          const h = (p.volumen / maxVol) * (ALTO - PAD_Y * 2) * 0.55;
          return (
            <rect
              key={p.clave}
              x={x(i) - w / 2} y={ALTO - PAD_Y - h} width={w} height={h}
              fill="var(--text-muted)" opacity={activo === i ? 0.28 : 0.14}
            />
          );
        })}

        {/* Cursor sincronizado */}
        {activo != null && (
          <line x1={x(activo)} x2={x(activo)} y1={0} y2={ALTO - PAD_Y}
            stroke="var(--accent)" strokeWidth={0.4} opacity={0.7} vectorEffect="non-scaling-stroke" />
        )}

        {/* Serie */}
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
    </div>
  );
}

export default function TramitesSeries({
  serie, porDia, onSeleccionarPeriodo,
}: {
  serie: PuntoSerie[];
  porDia: boolean;
  onSeleccionarPeriodo: (clave: string) => void;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const punto = activo != null ? serie[activo] : null;

  // Etiquetas del eje X compartido: se ralean para no amontonarse.
  const etiquetas = useMemo(() => {
    const paso = Math.max(1, Math.ceil(serie.length / 12));
    return serie.map((p, i) => ({ ...p, visible: i % paso === 0 || i === serie.length - 1 }));
  }, [serie]);

  if (serie.length === 0) {
    return (
      <div className="rounded-xl border py-10 text-center text-[0.82rem] text-[var(--text-muted)]"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        Sin datos para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[0.72rem] text-[var(--text-muted)]">
          Eje de tiempo compartido y cursor sincronizado · barras de fondo = volumen ·
          clic en un {porDia ? "día" : "mes"} para filtrarlo
        </span>
        {punto && (
          <span className="text-[0.72rem] font-semibold text-[var(--accent-light)]">
            {punto.label} · {punto.volumen} expedientes
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SERIES.map((s) => (
          <Grafica
            key={s.key}
            serie={serie}
            sKey={s.key}
            label={s.label}
            activo={activo}
            onHover={setActivo}
            onSalir={() => setActivo(null)}
            onClicar={onSeleccionarPeriodo}
          />
        ))}
      </div>

      {/* Eje X compartido */}
      <div className="mt-1.5 flex justify-between px-1 text-[0.66rem] text-[var(--text-muted)]">
        {etiquetas.map((p, i) => (
          <span key={p.clave} className={p.visible ? "" : "invisible"}
            style={{ fontWeight: activo === i ? 700 : 400, color: activo === i ? "var(--accent-light)" : undefined }}>
            {p.label}
          </span>
        ))}
      </div>

      {/* Tarjeta del periodo bajo el cursor */}
      {punto && (
        <div className="mt-3 rounded-xl border p-3" style={{ background: "var(--bg-surface)", borderColor: "var(--accent)" }}>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-[0.82rem] font-bold text-[var(--text-primary)]">{punto.label}</span>
            <span className="text-[0.72rem] text-[var(--text-muted)]">{punto.volumen} expedientes</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {SERIES.map((s) => (
              <div key={s.key} className="rounded-lg px-2 py-1.5 text-center" style={{ background: "var(--bg-hover)" }}>
                <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{s.corto}</div>
                <div className="tabular-nums text-[0.82rem] font-bold text-[var(--text-primary)]">
                  {fmtHHMMSS(punto.valores[s.key])}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
