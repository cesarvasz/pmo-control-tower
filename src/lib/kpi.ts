// src/lib/kpi.ts
// ── KPI PMO ──────────────────────────────────────────────────────────────────
// Métrica ponderada general (global y por PM). Cada componente aporta
// (logro × peso), con logro = min(real / meta, 100%) y piso 0%. La meta es el valor
// que rinde el 100% del peso (no un tope de la métrica). Los pesos suman 100:
//   EVM 30 · NPS 10 · Beneficio HardSaving 25 · Cumplimiento de Entrega 15 · Reproceso 20.
//   · EVM: el % rinde directo el peso (90% → 0.9×30). NPS: escalonado por rango, ver
//     npsLogro() abajo. Beneficio: ver computeBenefitKpi() abajo. Entregas y Reproceso:
//     el % es directamente la fracción del peso (85% → 0.85×peso).
// El Reproceso mide la NOTA PROMEDIO de sus unidades (ideal 100%): REQ cerrados +
// items de la FASE 3 (Launch/Desarrollo, ver isFase3 en dashboard.ts) de Proyecto
// que ya midan Calidad (ver calidadUnits). REQ: nota binaria — 100 si se excusa
// con un responsable ≠ PM, 0 si no (sin asignar penaliza, igual que siempre). Item
// de Proyecto: nota graduada 0/50/100 (ver calcItemNota en dashboard.ts) — 50% si
// se asigna explícitamente un responsable ≠ PM (SIEMPRE manual, sin bypass
// automático por haber salido a tiempo) + 50% si se recuperó (ningún hito con
// Limit Date después del fin del CPM del item, ver hitosFueraDeCpm — solo se
// verifica el fin, no el inicio: "Start Date" no es un arranque fijo, se corre
// conforme avanza el trabajo). Si
// no hay unidades en scope (reprocesoPct = null) el componente queda "pendiente" y
// se excluye del máximo alcanzable (achievable).
//
// La UI (tarjeta/modal) es puramente presentacional: recibe el resultado de
// computeKpi() y lo pinta. Así el mismo cálculo sirve para el KPI del equipo y
// para el de cada PM.

import { fmtMoney, today } from "@/lib/business";
import { NPS_RANGES } from "@/lib/nps";

export const KPI_META = { evm: 1.0, nps: 50, benefitAnnual: 135000, entregas: 1.0, reproceso: 1.0 };
export const KPI_W = { evm: 30, nps: 10, benefit: 25, entregas: 15, reproceso: 20 };
// Beneficio (peso 25) se reparte 70% Aprobación VPB / 30% Confirmación VPC.
export const BENEFIT_SPLIT = { aprobacion: 0.70, confirmacion: 0.30 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Logro del componente NPS: escalonado por rango — ver NPS_RANGES en lib/nps.ts
 *  (fuente única, compartida con npsCfg y el pop-up de rangos). */
function npsLogro(nps: number | null): number {
  if (nps == null) return 0;
  const r = NPS_RANGES.find((r) => nps >= r.min && nps <= r.max);
  return r ? r.logro : 0;
}

export interface BenefitKpiBreakdown {
  month: number;             // mes del año (1-12) usado para la meta acumulada
  metaAnual: number;         // $135,000
  metaMensual: number;       // metaAnual / 12
  metaAcumulada: number;     // metaMensual × mes actual — lo que se "debería llevar" a la fecha
  benefitAprobado: number;
  benefitConfirmado: number;
  logroAprobacion: number;   // benefitAprobado / metaAcumulada, tope 100%
  logroConfirmacion: number; // benefitConfirmado / metaAcumulada, tope 100%
  pesoAprobacion: number;    // 25 × 70% = 17.5
  pesoConfirmacion: number;  // 25 × 30% = 7.5
  ptsAprobacion: number;     // logroAprobacion × pesoAprobacion
  ptsConfirmacion: number;   // logroConfirmacion × pesoConfirmacion
  total: number;             // ptsAprobacion + ptsConfirmacion (0..25)
}

/**
 * Componente "Beneficio HardSaving" del KPI (peso 25), repartido 70/30 entre
 * Aprobación VPB y Confirmación VPC. La meta anual ($135,000) se prorratea por mes
 * calendario: metaAcumulada = (135000/12) × mes_actual — "lo que se debería llevar"
 * a la fecha. Cada mitad se mide por separado: Beneficio de esa etapa / metaAcumulada,
 * con tope en 100%. `month` es 1-12; por defecto el mes calendario actual.
 */
export function computeBenefitKpi(
  benefitAprobado: number,
  benefitConfirmado: number,
  month: number = today().getMonth() + 1,
): BenefitKpiBreakdown {
  const metaAnual = KPI_META.benefitAnnual;
  const metaMensual = metaAnual / 12;
  const metaAcumulada = metaMensual * month;
  const pesoAprobacion = KPI_W.benefit * BENEFIT_SPLIT.aprobacion;
  const pesoConfirmacion = KPI_W.benefit * BENEFIT_SPLIT.confirmacion;
  const logroAprobacion = metaAcumulada > 0 ? clamp01(benefitAprobado / metaAcumulada) : 0;
  const logroConfirmacion = metaAcumulada > 0 ? clamp01(benefitConfirmado / metaAcumulada) : 0;
  const ptsAprobacion = logroAprobacion * pesoAprobacion;
  const ptsConfirmacion = logroConfirmacion * pesoConfirmacion;
  return {
    month, metaAnual, metaMensual, metaAcumulada, benefitAprobado, benefitConfirmado,
    logroAprobacion, logroConfirmacion, pesoAprobacion, pesoConfirmacion,
    ptsAprobacion, ptsConfirmacion, total: ptsAprobacion + ptsConfirmacion,
  };
}

export type KpiInput = {
  evm: number | null; nps: number | null;
  benefitAprobado: number; benefitConfirmado: number;
  entregasPct: number | null; reprocesoPct?: number | null;
  /** Mes del año (1-12) para la meta acumulada de Beneficio. Por defecto, el mes actual. */
  month?: number;
};
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

export function computeKpi({ evm, nps, benefitAprobado, benefitConfirmado, entregasPct, reprocesoPct = null, month }: KpiInput): KpiResult {
  const b = computeBenefitKpi(benefitAprobado, benefitConfirmado, month);
  const components: KpiComponent[] = [
    { key: "evm", label: "EVM", weight: KPI_W.evm,
      logro: evm != null ? clamp01(evm / KPI_META.evm) : 0,
      real: evm != null ? `${Math.round(evm * 100)}%` : "—", meta: "100%" },
    { key: "nps", label: "NPS", weight: KPI_W.nps,
      logro: npsLogro(nps),
      real: nps != null ? `${nps}` : "—", meta: `≥${KPI_META.nps}` },
    { key: "benefit", label: "Beneficio HardSaving", weight: KPI_W.benefit,
      logro: KPI_W.benefit > 0 ? b.total / KPI_W.benefit : 0,
      real: fmtMoney(benefitAprobado + benefitConfirmado), meta: fmtMoney(b.metaAcumulada) },
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
