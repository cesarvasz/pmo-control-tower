"use client";

// Línea de tiempo del reporte "Digitalización OCR": la evolución de T1 y T2 por
// período. El selector Promedio / Mediana vive en la tarjeta de arriba
// (ResumenTiempoOcr) y llega aquí como `stat`. SVG a mano, como el resto de la
// app. Eje de tiempo en pasos de reloj (horas hábiles).

import { useState } from "react";
import { SectionHeader } from "@/components/ui";
import { marcasDeReloj } from "@/lib/ocrHabil";
import type { PuntoSerieOcr, StatSel } from "@/lib/digitalizacion";
import { fmtDur, nEs, etiquetaReloj } from "./fmt";

function Vacio() {
  return <div className="py-8 text-center text-[0.82rem] text-[var(--text-muted)]">Sin datos para los filtros seleccionados.</div>;
}

export default function GraficasOcr({ serie, stat }: { serie: PuntoSerieOcr[]; stat: StatSel }) {
  const [hover, setHover] = useState<number | null>(null);

  const promLabel = stat === "prom" ? "promedio" : "mediana";
  const t1Key: keyof PuntoSerieOcr = stat === "prom" ? "t1Prom" : "t1Mediana";
  const t2Key: keyof PuntoSerieOcr = stat === "prom" ? "t2Prom" : "t2Mediana";
  const lineas: { key: keyof PuntoSerieOcr; label: string; color: string }[] = [
    { key: t1Key, label: "T1", color: "var(--etapa-1)" },
    { key: t2Key, label: "T2", color: "var(--etapa-3)" },
  ];
  const val = (p: PuntoSerieOcr, key: keyof PuntoSerieOcr): number | null => {
    const v = p[key];
    return typeof v === "number" ? v : null;
  };

  return (
    <section className="mt-5 rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <SectionHeader
        title={`Evolución del tiempo · ${promLabel}`}
        badge={serie.length ? serie[0].label + (serie.length > 1 ? ` – ${serie[serie.length - 1].label}` : "") : undefined}
      />
      <p className="mb-3 text-[0.72rem] text-[var(--text-muted)]">
        <span style={{ color: "var(--etapa-1)" }}>T1</span> = Creación → documentos ·{" "}
        <span style={{ color: "var(--etapa-3)" }}>T2</span> = documentos → carta de licencia.
        Barras de fondo = volumen de files. Eje en pasos de reloj (horas hábiles).
      </p>

      {serie.length === 0 ? <Vacio /> : (() => {
        const VBW = 1000, ALTO = 170, PAD = 12;
        const n = serie.length;
        const maxSeg = Math.max(1, ...lineas.flatMap((l) => serie.map((p) => val(p, l.key) ?? 0)));
        const marcas = marcasDeReloj(maxSeg / 60);
        const maxEje = Math.max(maxSeg, (marcas[marcas.length - 1] ?? 0) * 60);
        const maxVol = Math.max(1, ...serie.map((p) => p.files));

        const x = (i: number) => (n === 1 ? VBW / 2 : (i / (n - 1)) * VBW);
        const y = (seg: number) => ALTO - PAD - (seg / maxEje) * (ALTO - PAD * 2);

        return (
          <>
            <div className="relative pl-[52px]">
              <div className="absolute left-0 top-0 flex flex-col justify-between py-[9px] pr-2 text-right text-[0.6rem] tabular-nums text-[var(--text-muted)]"
                style={{ width: 52, height: ALTO }}>
                {[...marcas].reverse().map((m) => <span key={m}>{etiquetaReloj(m)}</span>)}
              </div>
              <svg viewBox={`0 0 ${VBW} ${ALTO}`} preserveAspectRatio="none" className="block w-full" style={{ height: ALTO }}
                onMouseLeave={() => setHover(null)}
                onMouseMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
                }}>
                {marcas.map((m) => (
                  <line key={m} x1={0} x2={VBW} y1={y(m * 60)} y2={y(m * 60)}
                    stroke="var(--border)" strokeWidth={1} />
                ))}
                {serie.map((p, i) => {
                  const w = n === 1 ? VBW * 0.3 : (VBW / n) * 0.55;
                  const h = (p.files / maxVol) * (ALTO - PAD * 2) * 0.5;
                  return <rect key={p.clave} x={x(i) - w / 2} y={ALTO - PAD - h} width={w} height={h}
                    fill="var(--text-muted)" opacity={hover === i ? 0.28 : 0.13} />;
                })}
                {hover != null && (
                  <line x1={x(hover)} x2={x(hover)} y1={0} y2={ALTO - PAD}
                    stroke="var(--accent)" strokeWidth={1.4} opacity={0.7} />
                )}
                {lineas.map((l) => {
                  const pts = serie.map((p, i) => ({ i, seg: val(p, l.key) }))
                    .filter((q): q is { i: number; seg: number } => q.seg != null);
                  const path = pts.map((q, k) => `${k === 0 ? "M" : "L"}${x(q.i)} ${y(q.seg)}`).join(" ");
                  const hp = hover != null ? pts.find((q) => q.i === hover) : undefined;
                  return (
                    <g key={l.label}>
                      {path && <path d={path} fill="none" stroke={l.color} strokeWidth={2}
                        strokeLinejoin="round" strokeLinecap="round" />}
                      {pts.length === 1 && <circle cx={x(pts[0].i)} cy={y(pts[0].seg)} r={3} fill={l.color} />}
                      {hp && (
                        <circle cx={x(hp.i)} cy={y(hp.seg)} r={4} fill={l.color}
                          stroke="var(--bg-surface)" strokeWidth={1.5} />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="mt-1.5 flex justify-between pl-[52px] text-[0.62rem] text-[var(--text-muted)]">
              {serie.map((p, i) => {
                const paso = Math.max(1, Math.ceil(n / 12));
                return <span key={p.clave} className={i % paso === 0 || i === n - 1 ? "" : "invisible"}
                  style={{ fontWeight: hover === i ? 700 : 400, color: hover === i ? "var(--accent-light)" : undefined }}>
                  {p.label}
                </span>;
              })}
            </div>

            {hover != null && (
              <div className="mt-3 rounded-lg border p-2.5 text-[0.74rem]" style={{ borderColor: "var(--accent)" }}>
                <span className="font-bold text-[var(--text-primary)]">{serie[hover].label}</span>
                <span className="ml-2 text-[var(--text-muted)]">
                  {nEs(serie[hover].files)} files · {nEs(serie[hover].conT2)} con T2
                </span>
                <span className="ml-3" style={{ color: "var(--etapa-1)" }}>T1 {fmtDur(val(serie[hover], t1Key))}</span>
                <span className="ml-3" style={{ color: "var(--etapa-3)" }}>T2 {fmtDur(val(serie[hover], t2Key))}</span>
              </div>
            )}
          </>
        );
      })()}
    </section>
  );
}
