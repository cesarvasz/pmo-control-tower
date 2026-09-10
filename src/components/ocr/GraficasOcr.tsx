"use client";

// Gráfica del reporte "Digitalización OCR": la evolución de T1 y T2 por período
// (promedio y mediana activables) con barras de volumen al fondo. SVG a mano,
// como el resto de la app (no hay librería de gráficas). Eje de tiempo en pasos
// de reloj.

import { useState } from "react";
import { SectionHeader } from "@/components/ui";
import { marcasDeReloj } from "@/lib/ocrHabil";
import type { PuntoSerieOcr } from "@/lib/digitalizacion";
import { fmtMin, nEs, etiquetaReloj } from "./fmt";

const CARD = "rounded-xl border p-4";
const CARD_STYLE = { background: "var(--bg-surface)", borderColor: "var(--border)" } as const;

function Vacio() {
  return <div className="py-8 text-center text-[0.82rem] text-[var(--text-muted)]">Sin datos para los filtros seleccionados.</div>;
}

const LINEAS = [
  { key: "t1Prom", label: "T1 promedio", color: "var(--etapa-1)" },
  { key: "t1Mediana", label: "T1 mediana", color: "var(--etapa-2)" },
  { key: "t2Prom", label: "T2 promedio", color: "var(--etapa-3)" },
  { key: "t2Mediana", label: "T2 mediana", color: "var(--etapa-4)" },
] as const;

export default function GraficasOcr({ serie }: { serie: PuntoSerieOcr[] }) {
  const [activas, setActivas] = useState<Record<string, boolean>>({
    t1Prom: true, t1Mediana: true, t2Prom: true, t2Mediana: true,
  });
  const [hover, setHover] = useState<number | null>(null);

  return (
    <section className={`mt-7 ${CARD}`} style={CARD_STYLE}>
      <SectionHeader
        title="Evolución de T1 y T2"
        badge={serie.length ? serie[0].label + (serie.length > 1 ? ` – ${serie[serie.length - 1].label}` : "") : undefined}
      />
      <p className="mb-3 text-[0.72rem] text-[var(--text-muted)]">
        T1 = Creación → digitalización de documentos · T2 = documentos → carta de licencia.
        Línea por período; barras de fondo = volumen de files. Eje en pasos de reloj.
      </p>

      {serie.length === 0 ? <Vacio /> : (() => {
        // viewBox ancho (1000×ALTO) para que, estirado al ancho del panel, la
        // escala x quede cerca de 1 y las líneas se vean nítidas sin trucos.
        const VBW = 1000, ALTO = 160, PAD = 12;
        const n = serie.length;
        const visibles = LINEAS.filter((l) => activas[l.key]);
        const maxSeg = Math.max(1, ...visibles.flatMap((l) => serie.map((p) => p[l.key] ?? 0)));
        const marcas = marcasDeReloj(maxSeg / 60);
        const maxEje = Math.max(maxSeg, (marcas[marcas.length - 1] ?? 0) * 60);
        const maxVol = Math.max(1, ...serie.map((p) => p.files));

        const x = (i: number) => (n === 1 ? VBW / 2 : (i / (n - 1)) * VBW);
        const y = (seg: number) => ALTO - PAD - (seg / maxEje) * (ALTO - PAD * 2);

        return (
          <>
            <div className="mb-2 flex flex-wrap gap-3">
              {LINEAS.map((l) => (
                <label key={l.key} className="flex cursor-pointer items-center gap-1.5 text-[0.74rem] font-semibold">
                  <input type="checkbox" checked={!!activas[l.key]}
                    onChange={(e) => setActivas((s) => ({ ...s, [l.key]: e.target.checked }))}
                    className="h-3.5 w-3.5 cursor-pointer" style={{ accentColor: l.color }} />
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
                  {l.label}
                </label>
              ))}
            </div>

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
                {visibles.map((l) => {
                  const pts = serie.map((p, i) => ({ i, seg: p[l.key] }))
                    .filter((q): q is { i: number; seg: number } => q.seg != null);
                  const path = pts.map((q, k) => `${k === 0 ? "M" : "L"}${x(q.i)} ${y(q.seg)}`).join(" ");
                  const hp = hover != null ? pts.find((q) => q.i === hover) : undefined;
                  return (
                    <g key={l.key}>
                      {path && <path d={path} fill="none" stroke={l.color} strokeWidth={2}
                        strokeLinejoin="round" strokeLinecap="round" />}
                      {pts.length === 1 && (
                        <circle cx={x(pts[0].i)} cy={y(pts[0].seg)} r={3} fill={l.color} />
                      )}
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
                <span className="ml-2 text-[var(--text-muted)]">{nEs(serie[hover].files)} files · {nEs(serie[hover].conT2)} con T2</span>
                <div className="mt-1">
                  <span style={{ color: "var(--etapa-1)" }}>T1 prom {fmtMin(serie[hover].t1Prom)}</span>
                  <span className="mx-1 text-[var(--text-disabled)]">·</span>
                  <span style={{ color: "var(--etapa-2)" }}>T1 mediana {fmtMin(serie[hover].t1Mediana)}</span>
                </div>
                <div>
                  <span style={{ color: "var(--etapa-3)" }}>T2 prom {fmtMin(serie[hover].t2Prom)}</span>
                  <span className="mx-1 text-[var(--text-disabled)]">·</span>
                  <span style={{ color: "var(--etapa-4)" }}>T2 mediana {fmtMin(serie[hover].t2Mediana)}</span>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </section>
  );
}
