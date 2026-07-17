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
