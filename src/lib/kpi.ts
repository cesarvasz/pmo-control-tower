// src/lib/kpi.ts
// ── KPI PMO ──────────────────────────────────────────────────────────────────
// Métrica ponderada general (global y por PM). Cada componente aporta
// (logro × peso), con logro = min(real / meta, 100%) y piso 0%. La meta es el valor
// que rinde el 100% del peso (no un tope de la métrica). Los pesos suman 100:
//   EVM 30 · NPS 10 · Beneficio HardSaving (Confirmado) 25 · Cumplimiento de Entrega 15
//   · Reproceso 20. Metas: EVM 100%, NPS 50, Beneficio $11,000, Entregas 100%, Reproceso 100%.
//   · EVM: el % rinde directo el peso (90% → 0.9×30). NPS: <0 → 0; 0–50 proporcional;
//     >50 tope en 50. Beneficio: $11,000 = 100% (tope). Entregas y Reproceso: el % es
//     directamente la fracción del peso (85% → 0.85×peso).
// El Reproceso mide el % de REQ cerrados "limpios" (ideal 100%): cada cerrado
// penaliza por defecto —incluso sin responsable asignado— y también si es PM; solo
// se excusa con un responsable ≠ PM (misma regla que Entregas). Si no hay REQ
// cerrados (reprocesoPct = null) el componente queda "pendiente" y se excluye del
// máximo alcanzable (achievable).
//
// La UI (tarjeta/modal) es puramente presentacional: recibe el resultado de
// computeKpi() y lo pinta. Así el mismo cálculo sirve para el KPI del equipo y
// para el de cada PM.

import { fmtMoney } from "@/lib/business";

export const KPI_META = { evm: 1.0, nps: 50, benefit: 11000, entregas: 1.0, reproceso: 1.0 };
export const KPI_W = { evm: 30, nps: 10, benefit: 25, entregas: 15, reproceso: 20 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export type KpiInput = { evm: number | null; nps: number | null; benefit: number; entregasPct: number | null; reprocesoPct?: number | null };
export interface KpiComponent {
  key: string;
  label: string;
  weight: number;
  logro: number;
  real: string;
  meta: string;
  pending?: boolean;
}
export interface KpiResult {
  score: number;          // 0..100 (máx. actual 80 con el 5º pendiente)
  achievable: number;     // suma de pesos medibles hoy (80)
  ratio: number;          // score / achievable → 0..1 (para color)
  components: KpiComponent[];
}

export function computeKpi({ evm, nps, benefit, entregasPct, reprocesoPct = null }: KpiInput): KpiResult {
  const components: KpiComponent[] = [
    { key: "evm", label: "EVM", weight: KPI_W.evm,
      logro: evm != null ? clamp01(evm / KPI_META.evm) : 0,
      real: evm != null ? `${Math.round(evm * 100)}%` : "—", meta: "100%" },
    { key: "nps", label: "NPS", weight: KPI_W.nps,
      logro: nps != null ? clamp01(nps / KPI_META.nps) : 0,
      real: nps != null ? `${nps}` : "—", meta: `${KPI_META.nps}` },
    { key: "benefit", label: "Beneficio HardSaving", weight: KPI_W.benefit,
      logro: clamp01(benefit / KPI_META.benefit),
      real: fmtMoney(benefit), meta: fmtMoney(KPI_META.benefit) },
    { key: "entregas", label: "Cumplimiento de Entrega", weight: KPI_W.entregas,
      logro: entregasPct != null ? clamp01(entregasPct / 100 / KPI_META.entregas) : 0,
      real: entregasPct != null ? `${entregasPct}%` : "—", meta: `${Math.round(KPI_META.entregas * 100)}%` },
    // Reproceso: % de REQ cerrados sin reproceso imputable al PM. Sin REQ cerrados → pendiente.
    { key: "reproceso", label: "Reproceso", weight: KPI_W.reproceso,
      logro: reprocesoPct != null ? clamp01(reprocesoPct / 100 / KPI_META.reproceso) : 0,
      real: reprocesoPct != null ? `${reprocesoPct}%` : "—", meta: `${Math.round(KPI_META.reproceso * 100)}%`,
      pending: reprocesoPct == null },
  ];
  const score = components.reduce((s, c) => s + c.logro * c.weight, 0);
  const achievable = components.filter((c) => !c.pending).reduce((s, c) => s + c.weight, 0);
  const ratio = achievable > 0 ? score / achievable : 0;
  return { score, achievable, ratio, components };
}

/** Color semántico del KPI según su ratio de logro sobre lo medible (0..1). */
export function kpiColorFor(ratio: number): string {
  return ratio >= 0.9 ? "var(--ok)" : ratio >= 0.75 ? "var(--warn)" : "var(--bad)";
}

/** Tinte de fondo semántico del KPI (para badges/pills), según su ratio (0..1). */
export function kpiBgFor(ratio: number): string {
  return ratio >= 0.9 ? "var(--ok-bg)" : ratio >= 0.75 ? "var(--warn-bg)" : "var(--bad-bg)";
}

/** Color de un componente individual según su logro (gris si está pendiente). */
export function kpiCompColor(c: KpiComponent): string {
  return c.pending ? "#6b7280" : c.logro >= 0.9 ? "var(--ok)" : c.logro >= 0.75 ? "var(--warn)" : "var(--bad)";
}
