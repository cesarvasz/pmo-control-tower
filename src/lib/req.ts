// src/lib/req.ts
// REQ (Requerimientos VALOR Lite): deadline por fase, EV/PV/AC, SPI/CPI/Scope/VEM
// y veredicto de entrega a tiempo. Funciones puras sobre items de Monday.

import { addBusinessDays, businessDays, parseYMD, today } from "@/lib/business";
import { colText, colDisplay } from "@/lib/monday-cols";
import { calcVem } from "@/lib/health";
import { lookupBenefitType } from "@/lib/proj";
import type {
  MondayItem,
  ReqBaseline,
  ReqItem,
  ReqOnTime,
  ReqPhaseInfo,
  ReqPhaseOnTime,
} from "@/types";

// ─────────────────────────────────────────────────────────────────────
// REQ (Requerimientos VALOR Lite)
// ─────────────────────────────────────────────────────────────────────
export const REQ_COLS = {
  id: "pulse_id_mm3fs4r8",
  pm: "multiple_person_mm3gq5vr",
  resp: "multiple_person_mkvdkw7j",
  status: "status",
  estrategia: "board_relation_mm3g4b09", // relación a "Estrategia 🔝" (display_value = nombre)
  cku: "board_relation_mm3gzm38",        // relación a CKU (display_value = nombre)
  cpmStart: "timeline9",
  estDev: "date_mm3gqxw0",
  costRH: "labor_budget_spent",
  costSoft: "numeric_mm3gbavc",
  benefit: "numeric_mkvcd6nf",
  creation: "pulse_log_mkvyjb6s",
  tld: "dropdown_mm3gpacy",
  type: "dropdown_mm3sms28",
  cpmEndEst: "date_mkwcqzvf",
  vDone: "date_mm3ggd8v",
  aDone: "date_mm3gfn1r",
  lDone: "date_mm3g8mqz",
  oDone: "date_mm3g5j38",
  rDone: "date_mm3gfd8b", // "R Done": fecha real de cierre (fase Cierre ROI) = fecha de entrega
};

export const REQ_GROUP_LABEL: Record<string, string> = {
  "Valuación | Req Terminado": "Valuación",
  "Aprobación | Value Gate": "Aprobación",
  "Launch | Desarrollo": "Desarrollo",
  "Operación | Implementación": "Operación",
  "Revisión | Cierre ROI": "Cierre ROI",
  "REQ Cerrados": "Cerrados",
  "En espera +Info CKU": "En Espera",
};

export const REQ_GROUP_COLOR: Record<string, string> = {
  "Valuación": "#6c63ff",
  "Aprobación": "#3b82f6",
  "Desarrollo": "#f59e0b",
  "Operación": "#10b981",
  "Cierre ROI": "#14b8a6",
  "Cerrados": "#9ca3af",
  "En Espera": "#ef4444",
};

export const REQ_PIPELINE = ["Valuación", "Aprobación", "Desarrollo", "Operación", "Cierre ROI", "Cerrados", "En Espera"];
export const REQ_ACTIVE_GRUPOS = new Set(["Valuación", "Aprobación", "Desarrollo", "Operación", "Cierre ROI"]);

/**
 * ¿El REQ se entregó a tiempo? La ENTREGA es la fase Cierre ROI: su fecha real es "R Done"
 * (se llena al cerrar el REQ) y su objetivo es cpmEndEst (SaaS) o oDone + 20 días hábiles.
 * El veredicto usa SOLO esa fase; si no hay R Done (REQ no cerrado) → n/a ("—").
 * Las fases anteriores (Valuación/Aprobación/Desarrollo/Operación) se calculan solo para el
 * desglose del tooltip (`phases`), con las mismas reglas de deadline de la app.
 */
function computeReqOnTime(d: {
  cpmStart: Date | null; vDone: Date | null; aDone: Date | null; lDone: Date | null;
  oDone: Date | null; rDone: Date | null; estDev: Date | null; cpmEndEst: Date | null;
  tld: string; isSaas: boolean;
}): ReqOnTime {
  const devTarget = d.aDone
    ? (d.estDev ? d.estDev
      : d.tld === "JA" ? addBusinessDays(d.aDone, 7, true)
      : d.tld === "LM" ? addBusinessDays(d.aDone, 32, true)
      : d.tld === "S/dev" ? new Date(d.aDone)
      : null)
    : null;
  const opTarget = (d.isSaas && d.cpmEndEst)
    ? addBusinessDays(d.cpmEndEst, -20, true)
    : d.lDone ? addBusinessDays(d.lDone, 3, true) : null;
  const cierreTarget = (d.isSaas && d.cpmEndEst)
    ? d.cpmEndEst
    : d.oDone ? addBusinessDays(d.oDone, 20, true) : null;

  const specs: { name: string; actual: Date | null; target: Date | null }[] = [
    { name: "Valuación",  actual: d.vDone, target: d.cpmStart ? addBusinessDays(d.cpmStart, 1, true) : null },
    { name: "Aprobación", actual: d.aDone, target: d.vDone ? addBusinessDays(d.vDone, 2, true) : null },
    { name: "Desarrollo", actual: d.lDone, target: devTarget },
    { name: "Operación",  actual: d.oDone, target: opTarget },
    { name: "Cierre ROI", actual: d.rDone, target: cierreTarget },
  ];

  const midnight = (x: Date) => { const c = new Date(x); c.setHours(0, 0, 0, 0); return c; };
  const phases: ReqPhaseOnTime[] = specs.map((s) => {
    if (!s.actual || !s.target) return { name: s.name, actual: s.actual, target: s.target, late: false, slipDays: 0 };
    const a = midnight(s.actual), tgt = midnight(s.target);
    const late = a.getTime() > tgt.getTime();
    return { name: s.name, actual: s.actual, target: s.target, late, slipDays: late ? businessDays(tgt, a, true) : 0 };
  });
  // La entrega = la fase Cierre ROI (R Done). Solo esa define el veredicto.
  const delivery = phases[phases.length - 1];
  const evaluable = !!(delivery.actual && delivery.target);
  const verdict: ReqOnTime["verdict"] = !evaluable ? "n/a" : delivery.late ? "late" : "on-time";
  return { verdict, deliveryPhase: evaluable ? delivery.name : null, slipDays: delivery.slipDays, phases };
}

export function reqProcess(items: MondayItem[], baselines: Record<string, ReqBaseline> = {}, benefitTypeMap: Map<string, string> = new Map()): ReqItem[] {
  const t = today();

  return items.map((item): ReqItem => {
    const col = (id: string) => colText(item.column_values, id);
    const grpFull = item.group.title;
    const grp = REQ_GROUP_LABEL[grpFull] || grpFull;
    const costRH = parseFloat(col(REQ_COLS.costRH)) || 0;
    const costSft = parseFloat(col(REQ_COLS.costSoft)) || 0;
    const benefit = parseFloat(col(REQ_COLS.benefit)) || 0;
    const tld = col(REQ_COLS.tld);

    const cpmStart = parseYMD(col(REQ_COLS.cpmStart).split(" - ")[0]);
    const vDone = parseYMD(col(REQ_COLS.vDone));
    const aDone = parseYMD(col(REQ_COLS.aDone));
    const lDone = parseYMD(col(REQ_COLS.lDone));
    const oDone = parseYMD(col(REQ_COLS.oDone));
    const rDone = parseYMD(col(REQ_COLS.rDone));
    const estDev = parseYMD(col(REQ_COLS.estDev));
    const type = col(REQ_COLS.type);
    const cpmEndEst = parseYMD(col(REQ_COLS.cpmEndEst));
    const isSaas = type === "SaaS";

    // ── Deadline por grupo ──
    let startDate: Date | null = null;
    let deadline: Date | null = null;

    if (grp === "Valuación") {
      startDate = cpmStart;
      if (startDate) deadline = addBusinessDays(startDate, 1, true);
    } else if (grp === "Aprobación") {
      startDate = vDone;
      if (startDate) deadline = addBusinessDays(startDate, 2, true);
    } else if (grp === "Desarrollo") {
      startDate = aDone;
      if (startDate) {
        if (estDev) deadline = estDev;
        else if (tld === "JA") deadline = addBusinessDays(startDate, 7, true);
        else if (tld === "LM") deadline = addBusinessDays(startDate, 32, true);
        else if (tld === "S/dev") deadline = new Date(startDate);
      }
    } else if (grp === "Operación") {
      startDate = lDone;
      if (isSaas && cpmEndEst) deadline = addBusinessDays(cpmEndEst, -20, true);
      else if (startDate) deadline = addBusinessDays(startDate, 3, true);
    } else if (grp === "Cierre ROI") {
      startDate = oDone;
      if (isSaas && cpmEndEst) deadline = cpmEndEst;
      else if (startDate) deadline = addBusinessDays(startDate, 20, true);
    }

    // ── Estado ──
    let estado = grp === "Cerrados" ? "CERRADO" : grp === "En Espera" ? "EN_ESPERA" : "EN PROCESO";
    let dias: number | null = null, limite: number | null = null;

    if (deadline && REQ_ACTIVE_GRUPOS.has(grp)) {
      const dl = new Date(deadline); dl.setHours(0, 0, 0, 0);
      estado = dl < t ? "ATRASADO" : dl.getTime() === t.getTime() ? "PARA HOY" : "EN TIEMPO";
      if (startDate) {
        dias = businessDays(startDate, t, true);
        limite = businessDays(startDate, deadline, true);
      }
    }

    const status = col(REQ_COLS.status);

    // ── Costo por fase ──
    // Costo planificado (baseline) → EV.  Costo actual (Monday) → AC.
    // Si no hay baseline aún (costSft no resuelto), EV = AC.
    const REQ_PHASES = ["Valuación", "Aprobación", "Desarrollo", "Operación", "Cierre ROI"];
    const KNOWN_HOURS = 23;
    const costTotal = costRH + costSft;

    const baseline = baselines[col(REQ_COLS.id)];
    const baseCostRH  = baseline?.costRH  ?? costRH;
    const baseCostSft = baseline?.costSft ?? costSft;
    const baseCostTotal = baseCostRH + baseCostSft;

    // Costo planificado por fase (para EV)
    const baseRate = baseCostRH / KNOWN_HOURS;
    const basePhaseCost: Record<string, number> = {
      "Valuación":  baseRate * 3,
      "Aprobación": baseRate * 4,
      "Desarrollo": baseCostTotal - baseRate * KNOWN_HOURS,
      "Operación":  baseRate * 4,
      "Cierre ROI": baseRate * 12,
    };

    // Costo actual por fase (para AC y PV)
    const rate = costRH / KNOWN_HOURS;
    const phaseCost: Record<string, number> = {
      "Valuación":  rate * 3,
      "Aprobación": rate * 4,
      "Desarrollo": costTotal - rate * KNOWN_HOURS,
      "Operación":  rate * 4,
      "Cierre ROI": rate * 12,
    };

    // ── Fases completadas (por fechas Done; F5 por status "ROI 30D") ──
    const phaseDone: Record<string, boolean> = {
      "Valuación":  !!vDone,
      "Aprobación": !!aDone,
      "Desarrollo": !!lDone,
      "Operación":  !!oDone,
      "Cierre ROI": status === "ROI 30D",
    };

    // ── Cronograma en días (para PV y timeline) ──
    const devDays0 = tld === "LM" ? 32 : tld === "S/dev" ? 0 : 7;
    const phaseDurs0 = [1, 2, devDays0, 3, 20];
    const PHASE_IDX: Record<string, number> = {
      "Valuación": 0, "Aprobación": 1, "Desarrollo": 2, "Operación": 3, "Cierre ROI": 4,
    };
    const phaseIdx = PHASE_IDX[grp] ?? -1;
    const expectedDays = phaseIdx >= 0
      ? phaseDurs0.slice(0, phaseIdx + 1).reduce((a, b) => a + b, 0)
      : null;
    const elapsed = cpmStart ? businessDays(cpmStart, t, true) : 0;

    // ── EV / PV / AC + desglose por fase ──
    // EV = Σ basePhaseCost de fases completadas (costo planificado).
    // PV = EV + phaseCost[fase actual] si el REQ está atrasado (costo actual).
    // AC = Σ phaseCost de fases completadas (costo actual de Monday).
    const phases: ReqPhaseInfo[] = REQ_PHASES.map((p, i) => ({
      name: p, cost: phaseCost[p], durDays: phaseDurs0[i], done: phaseDone[p], inPv: false,
    }));
    const ev = REQ_PHASES.reduce((s, p) => s + (phaseDone[p] ? basePhaseCost[p] : 0), 0);
    const ac = REQ_PHASES.reduce((s, p) => s + (phaseDone[p] ? phaseCost[p] : 0), 0);
    // Si está atrasado, el PV incluye el costo de la fase actual aunque el item no
    // haya avanzado de grupo: el atraso baja el SPI además del Scope.
    const pv = ev + (estado === "ATRASADO" ? phaseCost[grp] ?? 0 : 0);

    // ── SPI / CPI / Scope / VEM ──
    let spi: number | null = null, cpi: number | null = null, scope: number | null = null;
    if (REQ_ACTIVE_GRUPOS.has(grp)) {
      spi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : 1;
      cpi = ac > 0 ? Math.round((ev / ac) * 100) / 100 : 1;
      // Scope: 0 si el REQ está atrasado, 1 de lo contrario.
      scope = estado === "ATRASADO" ? 0 : 1;
    }
    const vemRaw = calcVem(spi, cpi, scope);
    const vem = vemRaw !== null ? Math.round(vemRaw * 100) / 100 : null;

    return {
      id: col(REQ_COLS.id),
      name: item.name,
      grupo: grp,
      pm: col(REQ_COLS.pm),
      resp: col(REQ_COLS.resp),
      status,
      estrategia: colDisplay(item.column_values, REQ_COLS.estrategia).trim(),
      cku: colDisplay(item.column_values, REQ_COLS.cku).trim(),
      costRH, costSft, benefit,
      valueNet: benefit - costRH - costSft,
      tld, type, cpmEndEst,
      creation: col(REQ_COLS.creation),
      estado, deadline, inicioReq: cpmStart, inicio: startDate, dias, limite,
      elapsed: cpmStart ? elapsed : null,
      expectedDays: REQ_ACTIVE_GRUPOS.has(grp) ? expectedDays : null,
      estDev,
      phases,
      onTime: computeReqOnTime({ cpmStart, vDone, aDone, lDone, oDone, rDone, estDev, cpmEndEst, tld, isSaas }),
      benefitType: lookupBenefitType(item.name, benefitTypeMap),
      ev, pv, ac,
      spi, cpi, scope, vem,
    };
  });
}
