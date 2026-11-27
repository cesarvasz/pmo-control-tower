"use client";

// Gráficas del análisis de tiempos ROI 008 (pestaña «Ducafast SV» de ROI).
// Recharts, igual que /portafolio, con los colores del tema: cada tramo tiene su
// color fijo de .viz-etapas (T1 azul · T2 aqua · T3 naranja — la misma paleta
// validada de los tramos de 003) y se usa igual en todas las gráficas.

import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtHabil } from "@/lib/horario008";
import {
  MEDIDAS, MIN_FILES_GRAFICA, TRAMO_KEYS, etiquetaMes, fmtNum, fmtPct, mesCorto,
  type Aporte, type FilaMes, type Tramo,
} from "@/lib/tiempos008";

/** Color fijo de cada tramo (definidos en globals.css → .viz-etapas, con su versión clara y oscura). */
export const COLOR_TRAMO: Record<Tramo, string> = {
  t1: "var(--etapa-1)",
  t2: "var(--etapa-2)",
  t3: "var(--etapa-3)",
};
export const COLOR_DUCAFAST = "var(--accent-light)";
export const COLOR_SIN_DUCAFAST = "var(--text-disabled)";

const TOOLTIP_BOX = "rounded-lg border px-3 py-2 text-[0.75rem] shadow-sm";
const TOOLTIP_STYLE = { background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" };
const EJE = { fontSize: 11, fill: "var(--text-muted)" };

const Vacio = ({ msg }: { msg: string }) => (
  <p className="py-10 text-center text-[0.8rem] text-[var(--text-muted)]">{msg}</p>
);

function FilaTip({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
        {color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="font-semibold tabular-nums">{valor}</span>
    </div>
  );
}

/** ¿La serie abarca más de un año? Entonces el eje dice «ene 26» en vez de «ene». */
const variosAnios = (meses: { mes: string }[]) => new Set(meses.map((m) => m.mes.slice(0, 4))).size > 1;

// ── ¿Dónde se va el tiempo? ──────────────────────────────────────────────

export function DondeSeVa({ aporte }: { aporte: Aporte }) {
  const [activo, setActivo] = useState<Tramo | null>(null);
  if (!aporte.n || aporte.total == null) return <Vacio msg="Sin files con la cadena completa con estos filtros." />;

  // Dónde empieza cada segmento (suma de los anteriores), para ubicar su tooltip.
  const segmentos = aporte.partes.map((p, i) => ({
    ...p, inicio: aporte.partes.slice(0, i).reduce((s, x) => s + x.pct, 0),
  }));
  const visibles = segmentos.filter((s) => s.pct > 0);
  const tip = segmentos.find((s) => s.key === activo);

  return (
    <div>
      <div className="relative">
        <div className="viz-track" style={{ height: 30 }} role="img"
          aria-label={segmentos.map((s) => `${MEDIDAS[s.key].corto} ${fmtPct(s.pct)}`).join(", ")}>
          {visibles.map((s, i) => (
            <div key={s.key}
              className={`viz-seg ${visibles.length === 1 ? "viz-seg--only" : i === 0 ? "viz-seg--first" : i === visibles.length - 1 ? "viz-seg--last" : ""}`}
              style={{ width: `${s.pct * 100}%`, background: COLOR_TRAMO[s.key], cursor: "default" }}
              onMouseEnter={() => setActivo(s.key)} onMouseLeave={() => setActivo(null)}
              onFocus={() => setActivo(s.key)} onBlur={() => setActivo(null)} tabIndex={0} />
          ))}
        </div>
        {tip && (
          <div className={`pointer-events-none absolute bottom-full z-10 mb-2 -translate-x-1/2 whitespace-nowrap ${TOOLTIP_BOX}`}
            style={{ ...TOOLTIP_STYLE, left: `${Math.min(Math.max((tip.inicio + tip.pct / 2) * 100, 12), 88)}%` }}>
            <div className="mb-1 font-semibold">{MEDIDAS[tip.key].corto} · {MEDIDAS[tip.key].label}</div>
            <FilaTip label="Aporte" valor={fmtPct(tip.pct)} color={COLOR_TRAMO[tip.key]} />
            <FilaTip label="Promedio" valor={fmtHabil(tip.promedio)} />
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {segmentos.map((s) => (
          <div key={s.key} className="flex min-w-0 items-start gap-2 text-[0.78rem]">
            <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLOR_TRAMO[s.key] }} />
            <div className="min-w-0">
              <div className="truncate text-[var(--text-secondary)]" title={MEDIDAS[s.key].label}>
                <strong className="text-[var(--text-primary)]">{MEDIDAS[s.key].corto}</strong> · {MEDIDAS[s.key].label}
              </div>
              <div className="tabular-nums text-[var(--text-primary)]">
                <strong>{fmtPct(s.pct)}</strong> <span className="text-[var(--text-muted)]">· {fmtHabil(s.promedio)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tiempos por mes ──────────────────────────────────────────────────────

interface PuntoTiempo {
  mes: string;
  eje: string;
  files: number;
  /** En horas, para el eje. */
  mediana: number | null;
  promedio: number | null;
  medianaSeg: number | null;
  promedioSeg: number | null;
}

/** Etiqueta al final de cada línea (solo en el último punto): «Mediana» / «Promedio». */
function etiquetaFinal(nombre: string, ultimo: number, arriba: boolean) {
  function EtiquetaFinal(p: { x?: number | string; y?: number | string; index?: number }) {
    if (p.index !== ultimo || p.x == null || p.y == null) return null;
    return (
      <text x={Number(p.x) + 10} y={Number(p.y) + (arriba ? -6 : 12)} fontSize={11} fontWeight={600}
        fill="var(--text-secondary)">{nombre}</text>
    );
  }
  return EtiquetaFinal;
}

export function TiemposPorMes({ porMes, tramo }: { porMes: FilaMes[]; tramo: Tramo }) {
  const conAnio = variosAnios(porMes);
  const datos: PuntoTiempo[] = porMes
    .filter((m) => m.con >= MIN_FILES_GRAFICA)
    .map((m) => {
      const e = m.tramos[tramo];
      return {
        mes: m.mes, eje: mesCorto(m.mes, conAnio), files: m.con,
        mediana: e.mediana == null ? null : e.mediana / 3600,
        promedio: e.promedio == null ? null : e.promedio / 3600,
        medianaSeg: e.mediana, promedioSeg: e.promedio,
      };
    });
  if (!datos.length) {
    return <Vacio msg={`Ningún mes tiene ${MIN_FILES_GRAFICA} o más files con Ducafast con estos filtros.`} />;
  }

  // El último punto con dato de cada serie lleva su nombre; el mayor va arriba para no encimarse.
  const ultimoDe = (k: "mediana" | "promedio") => {
    for (let i = datos.length - 1; i >= 0; i--) if (datos[i][k] != null) return i;
    return -1;
  };
  const uMed = ultimoDe("mediana"), uProm = ultimoDe("promedio");
  const promArriba = uMed !== uProm || (datos[uProm]?.promedio ?? 0) >= (datos[uMed]?.mediana ?? 0);
  const color = COLOR_TRAMO[tramo];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[0.74rem] text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden><line x1="0" y1="4" x2="22" y2="4" stroke={color} strokeWidth="2" /></svg>
          Mediana
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden><line x1="0" y1="4" x2="22" y2="4" stroke={color} strokeWidth="2" strokeDasharray="5 3" /></svg>
          Promedio
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={datos} margin={{ top: 14, right: 70, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="eje" tick={EJE} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={EJE} axisLine={false} tickLine={false} width={48}
            tickFormatter={(v: number) => `${Math.round(v * 10) / 10} h`} />
          <Tooltip cursor={{ stroke: "var(--border)" }} isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as PuntoTiempo | undefined) : undefined;
              if (!p) return null;
              return (
                <div className={TOOLTIP_BOX} style={TOOLTIP_STYLE}>
                  <div className="mb-1 font-semibold">{etiquetaMes(p.mes)}</div>
                  <FilaTip label="Files con Ducafast" valor={fmtNum(p.files)} />
                  <FilaTip label="Mediana" valor={fmtHabil(p.medianaSeg)} color={color} />
                  <FilaTip label="Promedio" valor={fmtHabil(p.promedioSeg)} />
                </div>
              );
            }} />
          <Line name="Mediana" type="monotone" dataKey="mediana" stroke={color} strokeWidth={2}
            dot={{ r: 4, strokeWidth: 0, fill: color }} activeDot={{ r: 5 }} isAnimationActive={false}>
            <LabelList dataKey="mediana" content={etiquetaFinal("Mediana", uMed, !promArriba)} />
          </Line>
          <Line name="Promedio" type="monotone" dataKey="promedio" stroke={color} strokeWidth={2} strokeDasharray="6 4"
            dot={{ r: 4, strokeWidth: 2, stroke: color, fill: "var(--bg-surface)" }} activeDot={{ r: 5 }} isAnimationActive={false}>
            <LabelList dataKey="promedio" content={etiquetaFinal("Promedio", uProm, promArriba)} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Files con y sin Ducafast por mes ─────────────────────────────────────

interface PuntoUso {
  mes: string;
  eje: string;
  total: number;
  con: number;
  sin: number;
  pct: number | null;
  pctLabel: string;
}

export function UsoPorMes({ porMes }: { porMes: FilaMes[] }) {
  if (!porMes.length) return <Vacio msg="Sin files con estos filtros." />;
  const conAnio = variosAnios(porMes);
  const datos: PuntoUso[] = porMes.map((m) => ({
    mes: m.mes, eje: mesCorto(m.mes, conAnio), total: m.total, con: m.con, sin: m.sin, pct: m.pct, pctLabel: fmtPct(m.pct),
  }));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[0.74rem] text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_DUCAFAST }} />Ducafast</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_SIN_DUCAFAST }} />Sin Ducafast</span>
        <span className="text-[var(--text-muted)]">Arriba de cada barra: % con Ducafast</span>
      </div>
      <ResponsiveContainer width="100%" height={270}>
        <BarChart data={datos} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="eje" tick={EJE} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={EJE} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => fmtNum(v)} />
          <Tooltip cursor={{ fill: "var(--bg-hover)" }} isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as PuntoUso | undefined) : undefined;
              if (!p) return null;
              return (
                <div className={TOOLTIP_BOX} style={TOOLTIP_STYLE}>
                  <div className="mb-1 font-semibold">{etiquetaMes(p.mes)}</div>
                  <FilaTip label="Total" valor={fmtNum(p.total)} />
                  <FilaTip label="Ducafast" valor={fmtNum(p.con)} color={COLOR_DUCAFAST} />
                  <FilaTip label="Sin Ducafast" valor={fmtNum(p.sin)} color={COLOR_SIN_DUCAFAST} />
                  <FilaTip label="% Ducafast" valor={fmtPct(p.pct)} />
                </div>
              );
            }} />
          <Bar dataKey="con" name="Ducafast" stackId="u" fill={COLOR_DUCAFAST} stroke="var(--bg-surface)" strokeWidth={1}
            isAnimationActive={false} />
          <Bar dataKey="sin" name="Sin Ducafast" stackId="u" fill={COLOR_SIN_DUCAFAST} stroke="var(--bg-surface)" strokeWidth={1}
            radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="pctLabel" position="top" style={{ fill: "var(--text-secondary)", fontSize: 10, fontWeight: 700 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Selector T1 / T2 / T3 (botones segmentados, mismo estilo que la pestaña 003). */
export function SelectorTramo({ valor, onChange }: { valor: Tramo; onChange: (t: Tramo) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }} role="group" aria-label="Tramo">
      {TRAMO_KEYS.map((k) => (
        <button key={k} onClick={() => onChange(k)} title={MEDIDAS[k].label} aria-pressed={valor === k}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[0.78rem] font-semibold transition-colors"
          style={{
            background: valor === k ? "var(--bg-accent-soft)" : "var(--bg-surface)",
            color: valor === k ? "var(--accent-light)" : "var(--text-secondary)",
          }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_TRAMO[k] }} />
          {MEDIDAS[k].corto}
        </button>
      ))}
    </div>
  );
}
