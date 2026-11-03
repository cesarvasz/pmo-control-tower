// src/lib/health.ts
// ─────────────────────────────────────────────────────────────────────
// VEM — FUENTE ÚNICA DE VERDAD (fórmula + umbrales + config visual)
// Todo cálculo de VEM/salud DEBE pasar por aquí para que los cambios
// se propaguen en cascada a todas las páginas y tarjetas.
// ─────────────────────────────────────────────────────────────────────

export type HealthStatus = "on-track" | "in-risk" | "off-track";

/** Umbrales de salud en % ENTERO (el que se ve en pantalla): de onTrack para arriba On Track, de
 *  inRisk a onTrack−1 At Risk, de inRisk−1 para abajo Off Track. Hoy: 95+ · 90–94 · 89−. */
export const VEM_THRESHOLDS = { onTrack: 95, inRisk: 90 } as const;

/** VEM = promedio de SPI, CPI y Scope (todos en fracción 0–1). null si falta alguno. */
export function calcVem(spi: number | null, cpi: number | null, scope01: number | null): number | null {
  if (spi === null || cpi === null || scope01 === null) return null;
  return (spi + cpi + scope01) / 3;
}

// ─────────────────────────────────────────────────────────────────────
// NOTA EVM (equipo y por PM) — promedio PONDERADO de las fuentes
// ─────────────────────────────────────────────────────────────────────
/** Las fuentes de la nota EVM: Iniciativas y una por CLASE de Proyectos y PML (A, B, C — la que se
 *  les asigna en Calidad & Cumplimiento → Clasificación, ver lib/claseProyecto.ts). Antes eran
 *  Iniciativas / PML / Proyectos. */
export type FuenteEvm = "ini" | "A" | "B" | "C";
export const FUENTES_EVM: readonly FuenteEvm[] = ["ini", "A", "B", "C"];
export const FUENTE_EVM_LABEL: Record<FuenteEvm, string> = { ini: "Iniciativas", A: "Clase A", B: "Clase B", C: "Clase C" };

/** Peso de cada fuente en la nota EVM: la Clase A manda (lo más grande), luego B y C; las
 *  Iniciativas son señal temprana (poca plata comprometida todavía). Suman 1. */
export const EVM_WEIGHTS: Record<FuenteEvm, number> = { ini: 0.10, C: 0.25, B: 0.30, A: 0.35 };

/** Los pesos como texto para tooltips: «Iniciativas 10% · Clase A 35% · Clase B 30% · Clase C 25%». */
export const EVM_PESOS_TXT = FUENTES_EVM.map((f) => `${FUENTE_EVM_LABEL[f]} ${Math.round(EVM_WEIGHTS[f] * 100)}%`).join(" · ");

/** La nota (0–1) de cada fuente; null si esa fuente no tiene nada que medir. */
export type PartesEvm = Record<FuenteEvm, number | null>;

/**
 * Nota EVM (0–1) = promedio ponderado de las sub-notas de Iniciativas y de las Clases A, B y C
 * (ver EVM_WEIGHTS). Una fuente sin datos (null) NO cuenta y su peso se reparte a prorrata entre
 * las presentes, así la nota sigue en escala 0–1 aunque un PM no tenga, por ejemplo, nada de Clase C.
 * null si no hay ninguna fuente.
 */
export function weightedEvm(parts: PartesEvm): number | null {
  const present = FUENTES_EVM
    .filter((f) => parts[f] !== null)
    .map((f) => ({ v: parts[f] as number, w: EVM_WEIGHTS[f] }));
  if (present.length === 0) return null;
  const wSum = present.reduce((s, p) => s + p.w, 0);
  return present.reduce((s, p) => s + p.v * p.w, 0) / wSum;
}

/** Deriva el estado de salud a partir de un índice VEM (0–1). Se compara el índice REDONDEADO a %
 *  entero, que es el que se muestra: un 89.6 % que sale como «90%» es At Risk, no Off Track. */
export function healthStatusFromIndex(index: number | null): HealthStatus | null {
  if (index === null) return null;
  const pct = Math.round(index * 100);
  return pct >= VEM_THRESHOLDS.onTrack ? "on-track"
       : pct >= VEM_THRESHOLDS.inRisk  ? "in-risk"
       : "off-track";
}

/** Los rangos como texto para tooltips: «≥95% On Track · 90–94% At Risk · <90% Off Track». */
export const VEM_RANGOS_TXT =
  `≥${VEM_THRESHOLDS.onTrack}% On Track · ${VEM_THRESHOLDS.inRisk}–${VEM_THRESHOLDS.onTrack - 1}% At Risk · <${VEM_THRESHOLDS.inRisk}% Off Track`;

/** Estado de salud de un PM: el de su nota EVM (la del % de su tarjeta) con los umbrales de
 *  VEM_THRESHOLDS. Ya no es «el peor» de sus Iniciativas, PML y Proyectos: un solo atraso no lo
 *  vuelve Off Track si el promedio ponderado aguanta. Un PM sin nada que medir (nota null) queda
 *  On Track, igual que sus bloques vacíos en la tarjeta («0 total · On Track 100%»). */
export function pmHealthStatus(evm: number | null): HealthStatus {
  return healthStatusFromIndex(evm) ?? "on-track";
}

/** Config visual por estado de salud (color, fondo, wording, icono). */
export const HEALTH_CFG: Record<HealthStatus, { color: string; bg: string; label: string; icon: string }> = {
  "on-track":  { color: "#10b981", bg: "var(--health-on-track-bg)",  label: "On Track",  icon: "✓" },
  "in-risk":   { color: "#f59e0b", bg: "var(--health-in-risk-bg)",   label: "At Risk",   icon: "⚠" },
  "off-track": { color: "#ef4444", bg: "var(--health-off-track-bg)", label: "Off Track", icon: "✕" },
};

/** Config visual a partir de un índice VEM numérico (atajo para tarjetas/pills). */
export function vemCfg(v: number) {
  return HEALTH_CFG[healthStatusFromIndex(v) ?? "off-track"];
}
