// src/lib/health.ts
// ─────────────────────────────────────────────────────────────────────
// VEM — FUENTE ÚNICA DE VERDAD (fórmula + umbrales + config visual)
// Todo cálculo de VEM/salud DEBE pasar por aquí para que los cambios
// se propaguen en cascada a todas las páginas y tarjetas.
// ─────────────────────────────────────────────────────────────────────

export type HealthStatus = "on-track" | "in-risk" | "off-track";

/** Umbrales de salud sobre el índice VEM (0–1). */
export const VEM_THRESHOLDS = { onTrack: 0.95, inRisk: 0.85 } as const;

/** VEM = promedio de SPI, CPI y Scope (todos en fracción 0–1). null si falta alguno. */
export function calcVem(spi: number | null, cpi: number | null, scope01: number | null): number | null {
  if (spi === null || cpi === null || scope01 === null) return null;
  return (spi + cpi + scope01) / 3;
}

// ─────────────────────────────────────────────────────────────────────
// NOTA EVM (equipo y por PM) — promedio PONDERADO de las 3 fuentes
// ─────────────────────────────────────────────────────────────────────
/** Peso de cada fuente en la nota EVM. Proyectos manda porque ahí está el
 *  grueso del valor y del trabajo medible; las Iniciativas son señal
 *  temprana (poca plata comprometida todavía). Suman 1. */
export const EVM_WEIGHTS = { ini: 0.10, req: 0.20, proj: 0.70 } as const;

/**
 * Nota EVM (0–1) = promedio ponderado de las sub-notas de Iniciativas, REQ y
 * Proyectos (ver EVM_WEIGHTS). Una fuente sin datos (null) NO cuenta y su peso
 * se reparte a prorrata entre las presentes, así la nota sigue en escala 0–1
 * aunque un PM no tenga REQ o proyectos. null si no hay ninguna fuente.
 */
export function weightedEvm(parts: { ini: number | null; req: number | null; proj: number | null }): number | null {
  const present: { v: number; w: number }[] = [];
  if (parts.ini !== null)  present.push({ v: parts.ini,  w: EVM_WEIGHTS.ini });
  if (parts.req !== null)  present.push({ v: parts.req,  w: EVM_WEIGHTS.req });
  if (parts.proj !== null) present.push({ v: parts.proj, w: EVM_WEIGHTS.proj });
  if (present.length === 0) return null;
  const wSum = present.reduce((s, p) => s + p.w, 0);
  return present.reduce((s, p) => s + p.v * p.w, 0) / wSum;
}

/** Deriva el estado de salud a partir de un índice VEM (0–1). */
export function healthStatusFromIndex(index: number | null): HealthStatus | null {
  if (index === null) return null;
  return index >= VEM_THRESHOLDS.onTrack ? "on-track"
       : index >= VEM_THRESHOLDS.inRisk  ? "in-risk"
       : "off-track";
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
