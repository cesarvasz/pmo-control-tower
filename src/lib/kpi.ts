// src/lib/kpi.ts
// ── KPI PMO ──────────────────────────────────────────────────────────────────
// Métrica ponderada general (global y por PM). Cada componente aporta
// (logro × peso), con logro = min(real / meta, 100%) y piso 0%. La meta es el valor
// que rinde el 100% del peso (no un tope de la métrica). Los pesos suman 100:
//   EVM 25 · NPS 15 · Beneficio HardSaving 25 · Cumplimiento de Entrega 10 · Reproceso 10 ·
//   Cumplimiento Metodología VALOR 15.
//   · Metodología VALOR: la nota (0-100) VIGENTE del PM, o sea la del mes en curso. Cada mes
//     arranca en 100% y un admin la baja a mano en /calidad-cumplimiento → Metodología
//     (ver lib/metodologia.ts). Antes de que empiece la medición queda "pendiente" y no
//     resta del máximo alcanzable.
//   · EVM: el % rinde directo el peso (90% → 0.9×25). NPS: NPS ≤ 0 → 0%, 0 < NPS ≤ 50
//     → proporcional (NPS/50), NPS > 50 → 100% (ver npsKpiLogro() en lib/nps.ts).
//     Beneficio: ver computeBenefitKpi() abajo. Entregas y Reproceso:
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
import { npsKpiLogro } from "@/lib/nps";

export const KPI_META = { evm: 1.0, nps: 50, benefitAnnual: 84000, entregas: 1.0, reproceso: 1.0, metodologia: 1.0 };
export type KpiWeights = { evm: number; nps: number; benefit: number; entregas: number; reproceso: number; metodologia: number };
export const KPI_W: KpiWeights = { evm: 25, nps: 15, benefit: 25, entregas: 10, reproceso: 10, metodologia: 15 };
/** Pesos del KPI de los Players por CKU (/players): EVM 25 · Beneficio 25 · Cumplimiento de
 *  Entrega ("Compromiso") 20 · Calidad de Entregas (reproceso) 20 · NPS 10. Suman 100.
 *  Metodología VALOR no aplica a los CKU (peso 0 → el componente no se muestra). */
export const KPI_W_CKU: KpiWeights = { evm: 25, nps: 10, benefit: 25, entregas: 20, reproceso: 20, metodologia: 0 };
// Beneficio (peso 25) se reparte 90% Aprobación VPB / 10% Confirmación VPC.
export const BENEFIT_SPLIT = { aprobacion: 0.90, confirmacion: 0.10 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Logro del componente NPS — ver npsKpiLogro en lib/nps.ts (fuente única,
 *  compartida con el pop-up de rangos, NpsRangesModal). NPS ≤ 0 → 0%;
 *  0 < NPS ≤ 50 → proporcional (NPS/50); NPS > 50 → 100%. */
const npsLogro = npsKpiLogro;

/** Meta del Beneficio CONFIRMADO de un PM a la fecha: $84,000 ÷ 12 × meses YA
 *  terminados del año (el mes en curso no cuenta: el 15-oct son 9, no 10). En
 *  enero es 0 — todavía no hay mes cerrado contra el cual medir. `month` es 1-12. */
export function metaConfirmacionAcumulada(month: number = today().getMonth() + 1): number {
  return (KPI_META.benefitAnnual / 12) * Math.max(0, month - 1);
}

/** Semáforo del Confirmado: fracción de su meta a meses terminados (0 si aún no hay meta). */
export function ratioConfirmacion(benefitConfirmado: number, month?: number): number {
  const meta = metaConfirmacionAcumulada(month);
  return meta > 0 ? benefitConfirmado / meta : 0;
}

export interface BenefitKpiBreakdown {
  month: number;             // mes del año (1-12) usado para la meta acumulada
  metaAnual: number;         // $84,000
  metaMensual: number;       // metaAnual / 12
  metaAcumulada: number;     // metaMensual × mes actual — lo que se "debería llevar" a la fecha
  mesesTerminados: number;   // month − 1: el mes en curso NO cuenta para la Confirmación
  metaConfirmacion: number;  // metaMensual × mesesTerminados
  benefitAprobado: number;
  benefitConfirmado: number;
  logroAprobacion: number;   // benefitAprobado / metaAcumulada, tope 100%
  logroConfirmacion: number; // benefitConfirmado / metaConfirmacion, tope 100%
  pesoAprobacion: number;    // 25 × 90% = 22.5
  pesoConfirmacion: number;  // 25 × 10% = 2.5
  ptsAprobacion: number;     // logroAprobacion × pesoAprobacion
  ptsConfirmacion: number;   // logroConfirmacion × pesoConfirmacion
  total: number;             // ptsAprobacion + ptsConfirmacion (0..30)
}

/**
 * Componente "Beneficio HardSaving" del KPI (peso 25), repartido 90/10 entre
 * Aprobación VPB y Confirmación VPC. La meta anual ($84,000) se prorratea por mes
 * calendario: metaAcumulada = (84000/12) × mes_actual — "lo que se debería llevar"
 * a la fecha. Cada mitad se mide por separado, con tope en 100%:
 *   · Aprobación: benefitAprobado / metaAcumulada (incluye el mes en curso).
 *   · Confirmación: benefitConfirmado / metaConfirmacion, con SOLO los meses ya
 *     terminados (15-oct → 9 meses, no 10) — ver metaConfirmacionAcumulada.
 * `month` es 1-12; por defecto el mes calendario actual.
 */
export function computeBenefitKpi(
  benefitAprobado: number,
  benefitConfirmado: number,
  month: number = today().getMonth() + 1,
  weights: KpiWeights = KPI_W,
): BenefitKpiBreakdown {
  const metaAnual = KPI_META.benefitAnnual;
  const metaMensual = metaAnual / 12;
  const metaAcumulada = metaMensual * month;
  const mesesTerminados = month - 1;
  const metaConfirmacion = metaConfirmacionAcumulada(month);
  const pesoAprobacion = weights.benefit * BENEFIT_SPLIT.aprobacion;
  const pesoConfirmacion = weights.benefit * BENEFIT_SPLIT.confirmacion;
  const logroAprobacion = metaAcumulada > 0 ? clamp01(benefitAprobado / metaAcumulada) : 0;
  const logroConfirmacion = metaConfirmacion > 0 ? clamp01(benefitConfirmado / metaConfirmacion) : 0;
  const ptsAprobacion = logroAprobacion * pesoAprobacion;
  const ptsConfirmacion = logroConfirmacion * pesoConfirmacion;
  return {
    month, metaAnual, metaMensual, metaAcumulada, mesesTerminados, metaConfirmacion, benefitAprobado, benefitConfirmado,
    logroAprobacion, logroConfirmacion, pesoAprobacion, pesoConfirmacion,
    ptsAprobacion, ptsConfirmacion, total: ptsAprobacion + ptsConfirmacion,
  };
}

export type KpiInput = {
  evm: number | null; nps: number | null;
  benefitAprobado: number; benefitConfirmado: number;
  entregasPct: number | null; reprocesoPct?: number | null;
  /** Promedio (0-100) de las notas de Metodología VALOR de las fases calificadas; null = sin calificar. */
  metodologiaPct?: number | null;
  /** Mes del año (1-12) para la meta acumulada de Beneficio. Por defecto, el mes actual. */
  month?: number;
  /** Pesos de los componentes. Por defecto KPI_W (PM / equipo); los CKU usan KPI_W_CKU. */
  weights?: KpiWeights;
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
  score: number;          // 0..100
  achievable: number;     // suma de pesos medibles hoy (excluye componentes pendientes)
  ratio: number;          // score / achievable → 0..1 (para color)
  components: KpiComponent[];
}

export function computeKpi({ evm, nps, benefitAprobado, benefitConfirmado, entregasPct, reprocesoPct = null, metodologiaPct = null, month, weights = KPI_W }: KpiInput): KpiResult {
  const W = weights;
  const b = computeBenefitKpi(benefitAprobado, benefitConfirmado, month, W);
  const components: KpiComponent[] = [
    { key: "evm", label: "EVM", weight: W.evm,
      logro: evm != null ? clamp01(evm / KPI_META.evm) : 0,
      real: evm != null ? `${Math.round(evm * 100)}%` : "—", meta: "100%" },
    { key: "nps", label: "NPS", weight: W.nps,
      logro: npsLogro(nps),
      real: nps != null ? `${nps}` : "—", meta: `≥${KPI_META.nps}` },
    { key: "benefit", label: "Beneficio HardSaving", weight: W.benefit,
      logro: W.benefit > 0 ? b.total / W.benefit : 0,
      real: fmtMoney(benefitAprobado + benefitConfirmado), meta: fmtMoney(b.metaAcumulada) },
    { key: "entregas", label: "Cumplimiento de Entrega", weight: W.entregas,
      logro: entregasPct != null ? clamp01(entregasPct / 100 / KPI_META.entregas) : 0,
      real: entregasPct != null ? `${entregasPct}%` : "—", meta: `${Math.round(KPI_META.entregas * 100)}%` },
    // Reproceso: % de REQ cerrados sin reproceso imputable al PM. Sin REQ cerrados → pendiente.
    { key: "reproceso", label: "Reproceso", weight: W.reproceso,
      logro: reprocesoPct != null ? clamp01(reprocesoPct / 100 / KPI_META.reproceso) : 0,
      real: reprocesoPct != null ? `${reprocesoPct}%` : "—", meta: `${Math.round(KPI_META.reproceso * 100)}%`,
      pending: reprocesoPct == null },
    // Metodología VALOR: nota vigente (mes en curso) puesta por el Admin; arranca en 100%. Sin medición → pendiente.
    { key: "metodologia", label: "Cumplimiento Metodología VALOR", weight: W.metodologia,
      logro: metodologiaPct != null ? clamp01(metodologiaPct / 100 / KPI_META.metodologia) : 0,
      real: metodologiaPct != null ? `${Math.round(metodologiaPct)}%` : "—", meta: `${Math.round(KPI_META.metodologia * 100)}%`,
      pending: metodologiaPct == null },
  ].filter((c) => c.weight > 0);
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
