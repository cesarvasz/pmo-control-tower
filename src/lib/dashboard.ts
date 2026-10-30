// src/lib/dashboard.ts
// Agregados del Control Tower: salud por board y métricas por PM (EVM propio,
// NPS, % de entregas, costo/beneficio y KPI ponderado). Funciones PURAS sobre
// datos ya procesados (ini/req/proj), reutilizables y testeables.

import { today, businessDays, parseYMD } from "@/lib/business";
import { calcIniPMHealth, INI_LIMITS } from "@/lib/ini";
import { pmHealthStatus, weightedEvm } from "@/lib/health";
import { calcBoardMetrics, deriveBoardHealth, esPlantillaLite, splitBoardName, type BoardHealthData } from "@/lib/proj";
import { REQ_ACTIVE_GRUPOS } from "@/lib/req";
import { calcNpsFromRecords } from "@/lib/nps";
import { computeBenefitKpiCku, computeKpi, type KpiWeights } from "@/lib/kpi";
import { metodologiaActual, type MetodologiaMap } from "@/lib/metodologia";
import { lateExcused, type DelayMap, type DelayResponsible } from "@/lib/delay";
import { esActividadATiempo } from "@/lib/ckuAjustes";
import { construirExpedientes, ahorroDucafast, ahorroPorTiempos, TARIFA_HORA_DEFECTO, ETAPA_KEYS } from "@/lib/tramites";
import { construirRegistros, costoClonacionPorOrigen, TARIFA_CLONACION_DEFECTO } from "@/lib/clonaciones";
import type {
  CalMap, ClonacionRow, IniItem, NpsRecord, ProjBoard, ProjItem, ProjItemBaseline, ProjSubitem, ReqItem, RoiRow,
} from "@/types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Quita la letra de etapa con la que arrancan los grupos de la 3ª plantilla ("VALOR Lite", PM-015/016):
 *  "V | Valuación", "A | Aprobación", "L | Launch", "O | Operación (Implementación)" y
 *  "R | Resultado | Beneficio (Clase C)". Sin la letra, el resto de las reglas que miran el nombre de
 *  la fase (isFase1…isFase5, valorStageOf, los evaluadores de beneficio) la reconocen igual que en
 *  las otras dos plantillas. Un grupo sin letra se devuelve tal cual (solo recortado). */
export const sinLetraDeFase = (grupo: string): string => (grupo ?? "").trim().replace(/^[valor]\s*\|\s*/i, "");

// ¿El board usa la 3ª plantilla ("VALOR Lite")? Vive en proj.ts (que enriquece el PM del board); se reexporta aquí.
export { esPlantillaLite };

/** Value Gate (BC) firmado: en Monday el nombre varía por board — "Firmado y aprobado"
 *  en la fase Aprobación, "Actualizado y firmado" (sin "aprobado") en Launch. Se acepta
 *  cualquier variante que diga "firmado". */
const isVgSigned = (name: string) => {
  const n = norm(name);
  return n.includes("value gate") && n.includes("firmado");
};

/** ¿El nombre (ya normalizado, o crudo — se normaliza aquí) contiene alguno de los needles?
 *  Usado para aceptar el mismo step con el texto de CUALQUIERA de las dos plantillas de
 *  boards de Proyectos: la "vieja" y la "nueva" (PM-010/011/012, con Cost $/Limit Date
 *  fórmula — ver proj.ts). Miden el Beneficio $ igual; solo cambia cómo se llama el step. */
const includesAny = (name: string, needles: string[]) => {
  const n = norm(name);
  return needles.some((needle) => n.includes(needle));
};

/** El Business Case de la 3ª plantilla (Valuación): "BC + WBS heredados de PM-008…", "Business Case
 *  Lite + WBS 1 página…". No es "Costo de VOLT (insumo del BC)", que solo lo menciona. */
const esBusinessCaseLite = (name: string) => /^\s*(bc\b|business case)/.test(norm(name));

/** El Business Case (Benefit $ / Cost $) se redacta una sola vez, en el primer ítem
 *  de la fase Valuación — los steps de aprobación/gates no traen su propio monto. En la
 *  3ª plantilla ese ítem es el "BC + WBS" / "Business Case Lite" en lugar del Kick Off. */
export const findBusinessCase = (items: ProjItem[]) =>
  items.find((it) => norm(it.grupo).includes("valuacion") && norm(it.name).includes("kick off project meeting"))
  ?? (esPlantillaLite(items) ? items.find((it) => isFase1(it.grupo) && esBusinessCaseLite(it.name)) : undefined);

// ── Costo/beneficio por PM: 3 etapas, evaluación DESCENDENTE (Confirmación > Aprobación > Validación) ──
export type PmValueStage = "validacion" | "aprobacion" | "confirmacion";
/** Etapas ACUMULATIVAS de un ítem: Confirmación ⊆ Aprobación. Un confirmado sigue
 *  contando en Aprobación (a su valor aprobado = Business Case), y Confirmación es el
 *  subconjunto ya medido (valor real). Validación = ítems que aún no llegan a Aprobación. */
export interface StageAmounts {
  validacion?: { cost: number; benefit: number };
  aprobacion?: { cost: number; benefit: number };
  confirmacion?: { cost: number; benefit: number };
}
export interface PmValueItem { name: string; stages: StageAmounts }
export interface PmValue {
  totalCost: number; totalBenefit: number;
  validacionCost: number; validacionBenefit: number;      // Validación VPA
  aprobacionCost: number; aprobacionBenefit: number;      // Aprobación VPB
  confirmacionCost: number; confirmacionBenefit: number;  // Confirmación VPC
  /** Presente si confirmacionBenefit viene de ROI y no de Monday: de qué tramos (ver CONFIRMACION_ROI_PM). */
  confirmacionRoi?: string;
  detail: {
    reqs: PmValueItem[];
    projects: PmValueItem[];
  };
}

/** Etapa de un REQ según su fase (grupo). "Cierre ROI" (en revisión, aún no cerrado)
 *  cuenta como Aprobación hasta que el REQ efectivamente cierre. null = no cuenta
 *  (solo "En Espera" queda fuera). */
export function reqStage(r: { grupo: string }): PmValueStage | null {
  if (r.grupo === "Cerrados") return "confirmacion";
  if (r.grupo === "Desarrollo" || r.grupo === "Operación" || r.grupo === "Cierre ROI") return "aprobacion";
  if (r.grupo === "Valuación" || r.grupo === "Aprobación") return "validacion";
  return null;
}

/** Validación VPA (Proyecto): step Done en la fase "Valuación | Formulación del proyecto"
 *  que valida el Business Case — "VPA valida Business Case (Entregable Business Case
 *  validado por VPA)" en la plantilla vieja, "VPA VALIDADO (Entregable Business Case
 *  validado por VPA)" en la plantilla nueva (PM-010/011/012). Mismo hito, texto distinto.
 *  Beneficio/Costo = los del Business Case (Kick Off Project Meeting). */
function evalValidacion(items: ProjItem[]): { cost: number; benefit: number } | null {
  const step = items.find((it) => norm(it.grupo).includes("valuacion") && includesAny(it.name, ["vpa valida business case", "vpa validado"]));
  // 3ª plantilla (VALOR Lite): no hay un paso "VPA valida"; el Business Case Lite en Done es la validación.
  const bcLite = esPlantillaLite(items) ? items.find((it) => isFase1(it.grupo) && esBusinessCaseLite(it.name)) : undefined;
  if (step?.status !== "Done" && bcLite?.status !== "Done") return null;
  const bc = findBusinessCase(items);
  return { cost: bc?.cost ?? 0, benefit: bc?.benefit ?? 0 };
}

/** Aprobación VPB (Proyecto): "Plan de beneficios acordados con CFO" Done (fase
 *  "Aprobación | Value Gate") en las dos plantillas por igual, MÁS un gate de
 *  aprobación firmado — cuyo nombre y fase cambian entre plantillas:
 *  · Plantilla vieja: un Value Gate (BC) "firmado" Done, ya sea el de la fase
 *    Aprobación ("...Firmado y aprobado") o el de Launch ("...Actualizado y
 *    firmado"). Basta con UNO: el de Launch es el último de la secuencia, así
 *    que si está Done el de Aprobación ya pasó (y viceversa cuando el de Launch
 *    aún no se firmó).
 *  · Plantilla nueva: un solo step "VPA APROBADO (Entregable Business Case validado por
 *    Sponsor+VPA+PMO Mgr)" Done en Aprobación — no existe un segundo gate en Launch.
 *  Beneficio/Costo = los del Business Case (Kick Off Project Meeting) en ambos casos. */
function evalAprobacion(items: ProjItem[]): { cost: number; benefit: number } | null {
  // 3ª plantilla (VALOR Lite): sin EVM ni Plan de beneficios con CFO; la Aprobación es la fase A completa
  // (presupuesto asignado + entregables aprobados), todo en Done.
  if (esPlantillaLite(items)) {
    const faseA = items.filter((it) => isFase2(it.grupo));
    if (faseA.length === 0 || !faseA.every((it) => it.status === "Done")) return null;
    const bcLite = findBusinessCase(items);
    return { cost: bcLite?.cost ?? 0, benefit: bcLite?.benefit ?? 0 };
  }

  const cfo = items.find((it) => norm(it.grupo).includes("aprobacion") && norm(it.name).includes("plan de beneficios acordados con cfo"));
  if (cfo?.status !== "Done") return null;

  const vgAprobOld = items.find((it) => norm(it.grupo).includes("aprobacion") && isVgSigned(it.name));
  const vgLaunchOld = items.find((it) => norm(it.grupo).includes("launch") && isVgSigned(it.name));
  const vgAprobNew = items.find((it) => norm(it.grupo).includes("aprobacion") && norm(it.name).includes("vpa aprobado"));

  const gatesOk = vgAprobOld?.status === "Done" || vgLaunchOld?.status === "Done" || vgAprobNew?.status === "Done";
  if (!gatesOk) return null;

  const bc = findBusinessCase(items);
  return { cost: bc?.cost ?? 0, benefit: bc?.benefit ?? 0 };
}

/** Confirmación VPC (Proyecto): los 3 steps de medición real en la fase "Revisión |
 *  Cierre ROI" — "VPA Recopila datos a 30/60/90 días (Compara Valor real contra BC)" en
 *  la plantilla vieja, "VPA CONFIRMADO a 30/60/90 días (Compara Valor real contra BC)"
 *  en la nueva. Cascada: si un step está en "Working on it" (medición en curso) se usa
 *  ESE beneficio; si ya no hay ninguno en curso (todos los que existen están Done) se usa
 *  el más reciente (90 > 60 > 30). null si no hay ningún step en Working on it ni Done. */
function evalConfirmacion(items: ProjItem[]): { cost: number; benefit: number } | null {
  // 3ª plantilla (VALOR Lite): un solo paso en la fase R, "Beneficio confirmado mes 1 … (Clase C)",
  // en curso o Done. Sin los pasos de 30/60/90 días.
  if (esPlantillaLite(items)) {
    const lite = items.find((it) => isFase5(it.grupo) && norm(it.name).includes("beneficio confirmado"));
    return lite && (lite.status === "Working on it" || lite.status === "Done") ? { cost: lite.cost, benefit: lite.benefit } : null;
  }
  const step = (dias: 30 | 60 | 90) =>
    items.find((it) => norm(it.grupo).includes("cierre roi") && includesAny(it.name, [`recopila datos a ${dias} dias`, `confirmado a ${dias} dias`]));
  const d30 = step(30);
  const d60 = step(60);
  const d90 = step(90);
  const wip = [d30, d60, d90].find((s) => s?.status === "Working on it");   // en curso → ese
  if (wip) return { cost: wip.cost, benefit: wip.benefit };
  const done = [d90, d60, d30].find((s) => s?.status === "Done");           // todos Done → el más reciente
  return done ? { cost: done.cost, benefit: done.benefit } : null;
}

/** Etapa de un proyecto (board): evaluación descendente Confirmación → Aprobación →
 *  Validación; se toma la primera que cumpla todas sus condiciones. null = ninguna aplica. */
export function resolveProjStage(items: ProjItem[]): { stage: PmValueStage; cost: number; benefit: number } | null {
  const c = evalConfirmacion(items);
  if (c) return { stage: "confirmacion", ...c };
  const a = evalAprobacion(items);
  if (a) return { stage: "aprobacion", ...a };
  const v = evalValidacion(items);
  if (v) return { stage: "validacion", ...v };
  return null;
}

/** Montos por etapa ACUMULATIVA de un REQ. Su Benefit $ es el mismo en toda etapa
 *  alcanzada, así que un REQ Cerrado (Confirmación) aporta el mismo monto también a
 *  Aprobación. null si el REQ no cuenta (solo "En Espera" queda fuera). */
export function reqStageAmounts(r: ReqItem): StageAmounts | null {
  const st = reqStage(r);
  if (!st) return null;
  const amt = { cost: r.costRH + r.costSft, benefit: r.benefit };
  if (st === "validacion") return { validacion: amt };
  if (st === "aprobacion") return { aprobacion: amt };
  return { aprobacion: amt, confirmacion: amt }; // confirmado ⇒ también aprobado
}

/** Montos por etapa ACUMULATIVA de un proyecto (board). Confirmado ⇒ Aprobación al
 *  monto del Business Case (Kick Off) + Confirmación al valor real medido (step VPA
 *  Recopila). null si no alcanza ninguna etapa. */
export function projStageAmounts(items: ProjItem[]): StageAmounts | null {
  const resolved = resolveProjStage(items);
  if (!resolved) return null;
  const amt = { cost: resolved.cost, benefit: resolved.benefit };
  if (resolved.stage === "validacion") return { validacion: amt };
  if (resolved.stage === "aprobacion") return { aprobacion: amt };
  const bc = findBusinessCase(items);
  return { aprobacion: bc ? { cost: bc.cost, benefit: bc.benefit } : amt, confirmacion: amt };
}

/** Suma acumulativa de una lista de StageAmounts. Total = Validación + Aprobación
 *  (Confirmación es subconjunto de Aprobación → NO se vuelve a sumar en el total). */
export function sumStageAmounts(list: StageAmounts[]) {
  const acc = (k: keyof StageAmounts) => list.reduce(
    (s, x) => ({ cost: s.cost + (x[k]?.cost ?? 0), benefit: s.benefit + (x[k]?.benefit ?? 0) }),
    { cost: 0, benefit: 0 },
  );
  const validacion = acc("validacion"), aprobacion = acc("aprobacion"), confirmacion = acc("confirmacion");
  return {
    validacion, aprobacion, confirmacion,
    totalCost: validacion.cost + aprobacion.cost,
    totalBenefit: validacion.benefit + aprobacion.benefit,
  };
}

/** Confirmación del PORTAFOLIO (tarjetas Costo & Beneficio, Pipeline e
 *  histórico semanal): reemplaza por completo la Confirmación por
 *  proyecto/REQ de arriba (evalConfirmacion/reqStage) para esos 3 usos — es
 *  la suma del "Ahorro real con Ducafast" (ROI, pestaña 003) + el "Ahorro $"
 *  de Clonación de Files, ambos SIN filtros de UI (todo el histórico, tarifa
 *  default de cada módulo). NO tiene PM ni proyecto dueño, así que el KPI por
 *  PM (lib/kpi.ts, BENEFIT_SPLIT.confirmacion) y los reportes por proyecto
 *  (projectMetrics.ts/statusReportData.ts) siguen usando la Confirmación de
 *  Monday — ahí sí hace falta atribuirle el monto a un PM/proyecto. No hay
 *  costo asociado (es puro ahorro, no una inversión): solo retorna el
 *  beneficio. */
export function calcConfirmacionRoi(roiRows: RoiRow[], clonacionRows: ClonacionRow[]): number {
  const ahorroDuca = ahorroDucafast(construirExpedientes(roiRows), TARIFA_HORA_DEFECTO, ETAPA_KEYS).ahorro;
  const ahorroClon = costoClonacionPorOrigen(construirRegistros(clonacionRows), TARIFA_CLONACION_DEFECTO).contrafactual.ahorro;
  return ahorroDuca + ahorroClon;
}

/** La misma Confirmación vía ROI, partida en los tramos del "Beneficio por
 *  tiempos" de la pestaña 003: T0 = Clonación de Files, T1→T3 y T4→T5 = reparto
 *  del Ducafast T1–T5 (ver ahorroPorTiempos). t0 + t13 + t45 = total =
 *  calcConfirmacionRoi. Sin filtros y con las tarifas por defecto, igual que esa. */
export interface ConfirmacionRoiDetalle { t0: number; t13: number; t45: number; total: number }

export function calcConfirmacionRoiDetalle(roiRows: RoiRow[], clonacionRows: ClonacionRow[]): ConfirmacionRoiDetalle {
  const tiempos = ahorroPorTiempos(construirExpedientes(roiRows), TARIFA_HORA_DEFECTO);
  const t0 = costoClonacionPorOrigen(construirRegistros(clonacionRows), TARIFA_CLONACION_DEFECTO).contrafactual.ahorro;
  return { t0, t13: tiempos.t13.ahorro, t45: tiempos.t45.ahorro, total: t0 + tiempos.total.ahorro };
}

/** PMs cuya Confirmación VPC (Beneficio Confirmado de su Player/KPI) sale de ROI
 *  en vez de Monday, y de qué tramos. Entre los dos cubren la Confirmación vía ROI
 *  completa (T0 + T1→T3 + T4→T5), sin repetir ningún tramo. */
export const CONFIRMACION_ROI_PM: Record<string, { tramos: ("t0" | "t13" | "t45")[]; etiqueta: string }> = {
  "Luis Aguilar": { tramos: ["t0", "t45"], etiqueta: "ROI · T0 Clonación + T4 → T5" },
  "David Guzmán": { tramos: ["t13"], etiqueta: "ROI · T1 → T3" },
};

export interface ConfirmacionRoiPm { monto: number; etiqueta: string }

export function confirmacionRoiPorPm(d: ConfirmacionRoiDetalle): Record<string, ConfirmacionRoiPm> {
  return Object.fromEntries(Object.entries(CONFIRMACION_ROI_PM).map(([pm, c]) => [
    pm, { monto: c.tramos.reduce((s, k) => s + d[k], 0), etiqueta: c.etiqueta },
  ]));
}

/** CKU → PM de cuyo tramo de ROI hereda su Confirmación en /players: Javier toma
 *  los tiempos de Luis (T0 + T4→T5) y Victoria los de David (T1→T3). Los tramos
 *  salen de CONFIRMACION_ROI_PM, no se repiten aquí. */
export const CONFIRMACION_ROI_CKU: Record<string, string> = {
  "Javier Juarez": "Luis Aguilar",
  "Victoria Escobar": "David Guzmán",
};

/** `porPm` (el que devuelve el endpoint) re-indexado por CKU. */
export function confirmacionRoiPorCku(porPm: Record<string, ConfirmacionRoiPm>): Record<string, ConfirmacionRoiPm> {
  return Object.fromEntries(
    Object.entries(CONFIRMACION_ROI_CKU).filter(([, pm]) => porPm[pm]).map(([cku, pm]) => [cku, porPm[pm]]),
  );
}

/** Sustituye la Confirmación VPC de Monday de un PM por la de ROI, si le aplica.
 *  Solo cambia el beneficio confirmado (ROI no trae costo); Aprobación y el
 *  detalle por PML/proyecto siguen siendo los de Monday. */
export function conConfirmacionRoi(v: PmValue, c: ConfirmacionRoiPm | undefined): PmValue {
  return c ? { ...v, confirmacionBenefit: c.monto, confirmacionRoi: c.etiqueta } : v;
}

/** Mapa boardId → salud (EV/PV/AC + VEM) de cada board de Proyectos. */
export function buildBoardHealthMap(
  proj: ProjItem[],
  projBoards: { id: string }[],
  projItemBaselines: Record<string, ProjItemBaseline> = {},
): Map<string, BoardHealthData> {
  const map = new Map<string, BoardHealthData>();
  projBoards.forEach((b) => {
    map.set(b.id, deriveBoardHealth(calcBoardMetrics(proj.filter((r) => r.boardId === b.id), projItemBaselines)));
  });
  return map;
}

/** Nota EVM (0–1) de un PM: promedio PONDERADO Iniciativas 10% · PML 20% · Proyectos 70% (ver
 *  weightedEvm / EVM_WEIGHTS en lib/health.ts). Cada fuente vale el promedio de sus items; una
 *  sin datos no cuenta y su peso se reparte entre las otras. null si el PM no tiene ninguna.
 *  Es el % de la tarjeta del PM y de lo que sale su estado (ver pmHealthStatus). */
export function calcPmEvm(
  pm: string,
  ini: IniItem[],
  req: ReqItem[],
  projBoards: ProjBoard[],
  boardHealthMap: Map<string, BoardHealthData>,
  calMap: CalMap,
): number | null {
  const iniHealth = calcIniPMHealth(pm, ini, calMap);

  const reqVems = req
    .filter((r) => r.pm === pm && r.estado !== "CERRADO" && REQ_ACTIVE_GRUPOS.has(r.grupo) && r.vem != null)
    .map((r) => r.vem as number);
  const reqAvgVem = reqVems.length ? reqVems.reduce((s, v) => s + v, 0) / reqVems.length : null;

  const projHIs = projBoards
    .filter((b) => b.pm === pm && boardHealthMap.get(b.id)?.healthStatus !== null)
    .map((b) => boardHealthMap.get(b.id)?.healthIndex)
    .filter((v): v is number => v != null);
  const projAvgHI = projHIs.length > 0 ? projHIs.reduce((a, b) => a + b, 0) / projHIs.length : null;

  return weightedEvm({
    ini: iniHealth.total > 0 ? iniHealth.index : null,
    req: reqAvgVem,
    proj: projAvgHI,
  });
}

/** Costo/beneficio por PM en tres etapas (Validación VPA / Aprobación VPB / Confirmación
 *  VPC), evaluadas de forma DESCENDENTE por `reqStage`/`resolveProjStage`. */
export function calcPmValue(pm: string, req: ReqItem[], proj: ProjItem[], projBoards: ProjBoard[], hardOnly = false): PmValue {
  const hardBoardIds = new Set(projBoards.filter((b) => b.benefitType === "HardSaving").map((b) => b.id));

  const reqDetail: PmValueItem[] = [];
  for (const r of req) {
    if (r.pm !== pm) continue;
    if (hardOnly && r.benefitType !== "HardSaving") continue;
    const stages = reqStageAmounts(r);
    if (stages) reqDetail.push({ name: r.name, stages });
  }

  const pmBoardIds = new Set(projBoards.filter((b) => b.pm === pm).map((b) => b.id));
  const itemsByBoard = new Map<string, { name: string; items: ProjItem[] }>();
  for (const r of proj) {
    if (!pmBoardIds.has(r.boardId)) continue;
    if (hardOnly && !hardBoardIds.has(r.boardId)) continue;
    let a = itemsByBoard.get(r.boardId);
    if (!a) { a = { name: r.boardName, items: [] }; itemsByBoard.set(r.boardId, a); }
    a.items.push(r);
  }
  const projDetail: PmValueItem[] = [];
  for (const { name, items } of itemsByBoard.values()) {
    const stages = projStageAmounts(items);
    if (stages) projDetail.push({ name, stages });
  }

  const agg = sumStageAmounts([...reqDetail, ...projDetail].map((it) => it.stages));
  return {
    totalCost: agg.totalCost, totalBenefit: agg.totalBenefit,
    validacionCost: agg.validacion.cost, validacionBenefit: agg.validacion.benefit,
    aprobacionCost: agg.aprobacion.cost, aprobacionBenefit: agg.aprobacion.benefit,
    confirmacionCost: agg.confirmacion.cost, confirmacionBenefit: agg.confirmacion.benefit,
    detail: { reqs: reqDetail, projects: projDetail },
  };
}

// ── Compromiso de Entregas ───────────────────────────────────────────────
export interface EntregaStats { total: number; onTime: number; late: number; pct: number | null; }

/** Un step (item padre) o hito (subitem) de Proyecto YA evaluado (Done), con su
 *  propio veredicto — la unidad mínima que compone una fase. */
export interface FaseEntregaItem {
  id: string;
  kind: "step" | "hito";
  name: string;
  /** Nombre del item padre si es un hito; "" si es un step. */
  stepPadre: string;
  deadline: Date | null;
  verdict: "on-time" | "late";
}

interface FaseEntregaGroup {
  key: string;                 // projPhaseKey(boardId, grupo) — misma clave que Reproceso
  boardId: string;
  boardName: string;
  fase: string;                // grupo
  pm: string;
  /** Solo steps/hitos YA evaluados (Done); los pendientes no entran aún. */
  items: FaseEntregaItem[];
}

/** Agrupa steps (ProjItem) + hitos (ProjSubitem) de Proyectos por FASE (board +
 *  grupo) — la unidad de "Cumplimiento de Entrega" desde este cambio: antes se
 *  media por hito único (PMS ID), ahora se responde UN responsable por fase y se
 *  mide el total de fases con/sin atraso. Solo entran los steps/hitos que ya
 *  tienen veredicto (Done); los pendientes no cuentan todavía (medición
 *  progresiva, no espera a que la fase entera cierre — a diferencia de Reproceso). */
function groupFaseEntrega(projs: ProjItem[]): Map<string, FaseEntregaGroup> {
  const map = new Map<string, FaseEntregaGroup>();
  const grupoDe = (p: ProjItem) => {
    const key = projPhaseKey(p.boardId, p.grupo);
    let g = map.get(key);
    if (!g) { g = { key, boardId: p.boardId, boardName: p.boardName, fase: p.grupo, pm: p.pm, items: [] }; map.set(key, g); }
    return g;
  };
  for (const p of projs) {
    const g = grupoDe(p);
    if (p.entrega === "on-time" || p.entrega === "late") {
      g.items.push({ id: p.id, kind: "step", name: p.name, stepPadre: "", deadline: p.deadline, verdict: p.entrega });
    }
    for (const s of p.subitems) {
      if (s.entrega === "on-time" || s.entrega === "late") {
        g.items.push({ id: s.id, kind: "hito", name: s.name, stepPadre: p.name, deadline: s.deadline, verdict: s.entrega });
      }
    }
  }
  return map;
}

/** ¿Tiene la fase algún step/hito atrasado SIN excusar? Es la pregunta binaria que
 *  decide si la fase entera cuenta como "con atraso" — un solo responsable por
 *  fase decide la excusa de todos sus atrasos a la vez. */
const faseTieneAtrasoSinExcusar = (g: FaseEntregaGroup, delays: DelayMap): boolean =>
  g.items.some((it) => it.verdict === "late") && !lateExcused(g.key, delays);

/**
 * Veredicto RETROSPECTIVO de Cumplimiento de Entrega de una Iniciativa YA
 * APROBADA: una vez aprobada, `dias`/`limite`/`deadline` quedan en null (ver
 * iniProcess), así que no sirven para saber si llegó a tiempo — hay que
 * reconstruirlo con las fechas REALES de reunión (`meet1`/`meet2`) contra los
 * límites de cada etapa del embudo (INI_LIMITS): creación → Meeting 1 (5 días
 * hábiles) y Meeting 1 → Meeting 2/Aprobación (10 días hábiles).
 *
 * En la práctica muchas Iniciativas ya aprobadas NO tienen Meeting 2 registrado
 * en Monday (dato real: 14 de 19 casos) — exigirlo dejaba la mayoría afuera como
 * "n/a". Por eso, si falta Meeting 2, se evalúa SOLO la etapa 1 (creación →
 * Meeting 1) con los datos que sí existen, en vez de descartar la Iniciativa
 * entera. "n/a" (no evaluable, igual que un REQ sin R Done) solo si falta
 * `creacion` o `meet1` — ahí no hay ningún dato con el que reconstruir nada.
 * Las Iniciativas que no están APROBADA (todavía activas o en otras secciones
 * del embudo) tampoco son evaluables aquí: Cumplimiento de Entrega es
 * retrospectivo, no mide "en curso".
 */
export function iniEntregaVerdict(i: IniItem): "on-time" | "late" | "n/a" {
  if (i.estado !== "APROBADA") return "n/a";
  const meet1 = parseYMD(i.meet1);
  if (!i.creacion || !meet1) return "n/a";
  const etapa1OK = businessDays(i.creacion, meet1, true) <= INI_LIMITS.New;

  const meet2 = parseYMD(i.meet2);
  if (!meet2) return etapa1OK ? "on-time" : "late"; // sin Meeting 2: solo cuenta la etapa 1

  const etapa2OK = businessDays(meet1, meet2, true) <= INI_LIMITS["Meeting 1"];
  return etapa1OK && etapa2OK ? "on-time" : "late";
}

/** Cumplimiento de Entrega: REQ cerrados (1 unidad c/u) + FASES de Proyecto (1
 *  unidad c/u — board+grupo, no por hito individual) + Iniciativas APROBADAS (1
 *  unidad c/u, ver iniEntregaVerdict). Cada fase es binaria: "sin atraso" si
 *  ninguno de sus steps/hitos YA evaluados quedó atrasado sin excusar; "con
 *  atraso" si tiene al menos uno. Se responde UN responsable por fase (no por
 *  step/hito); si se excusa (responsable ≠ PM), toda la fase deja de penalizar.
 *  Una fase sin nada evaluado todavía no entra en el recorte (medición progresiva). */
export function calcEntregaStats(reqs: ReqItem[], projs: ProjItem[], delays: DelayMap, ini: IniItem[] = []): EntregaStats {
  const f = entregaPorFuente(reqs, projs, delays, ini);
  const total = f.req.total + f.proj.total + f.ini.total;
  const onTime = f.req.onTime + f.proj.onTime + f.ini.onTime;
  const late = total - onTime;
  const pct = total ? Math.round((onTime / total) * 100) : null;
  return { total, onTime, late, pct };
}

export interface FuenteEntrega { total: number; onTime: number }

/** Conteo de Cumplimiento de Entrega (con excusa por responsable) POR FUENTE:
 *  PML (REQ cerrados), Proyectos (fases) e Iniciativas aprobadas. Base común de
 *  calcEntregaStats (todo junto) y calcEntregaStatsPonderado (una nota por fuente). */
function entregaPorFuente(reqs: ReqItem[], projs: ProjItem[], delays: DelayMap, ini: IniItem[]): { req: FuenteEntrega; proj: FuenteEntrega; ini: FuenteEntrega } {
  const out = { req: { total: 0, onTime: 0 }, proj: { total: 0, onTime: 0 }, ini: { total: 0, onTime: 0 } };

  for (const r of reqs) {
    const v = r.onTime.verdict;
    if (v === "on-time") { out.req.total++; out.req.onTime++; }
    else if (v === "late" && !lateExcused(r.id, delays)) { out.req.total++; }
  }

  for (const g of groupFaseEntrega(projs).values()) {
    if (g.items.length === 0) continue; // nada evaluado aún en esta fase
    out.proj.total++;
    if (!faseTieneAtrasoSinExcusar(g, delays)) out.proj.onTime++;
  }

  for (const i of ini) {
    const v = iniEntregaVerdict(i);
    if (v === "on-time") { out.ini.total++; out.ini.onTime++; }
    else if (v === "late" && !lateExcused(i.id, delays)) { out.ini.total++; }
  }

  return out;
}

/** ¿Los items de este board siguen la plantilla NUEVA? Es VIEJA cuando su Fase 3 trae el
 *  step "Desarrollo por iteraciones…" (sus hitos son los entregables, y los demás steps
 *  de la fase son checkpoints); NUEVA si no (cada item de la Fase 3 es un entregable).
 *  Única regla de la app para decidirlo: projectMetrics.detectPlantilla delega aquí. */
export const esPlantillaNueva = (itemsDelBoard: ProjItem[]): boolean =>
  !itemsDelBoard.some((it) => isFase3(it.grupo) && isDesarrolloPorIteracionesStep(it.name));

/** Los items de Proyecto con los que se mide a un CKU (Cumplimiento y Calidad): SOLO la Fase 3
 *  (Launch) y SOLO de los boards con plantilla nueva — los de plantilla vieja ya no se toman en cuenta. */
export function proyectosFase3Nueva(projs: ProjItem[]): ProjItem[] {
  const porBoard = new Map<string, ProjItem[]>();
  for (const p of projs) {
    const lista = porBoard.get(p.boardId);
    if (lista) lista.push(p); else porBoard.set(p.boardId, [p]);
  }
  const out: ProjItem[] = [];
  for (const items of porBoard.values()) {
    if (esPlantillaNueva(items)) out.push(...items.filter((p) => isFase3(p.grupo)));
  }
  return out;
}

const normNombre = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const esPersona = (nombre: string | undefined, quien: string) => normNombre(nombre ?? "") === normNombre(quien);

/** Los entregables y actividades con los que se mide a un CKU en Proyectos: de la Fase 3 (Launch) de
 *  los boards con plantilla nueva, SOLO los items (entregables) cuyo Responsible es el CKU y, dentro de
 *  ellos, SOLO las actividades (subitems) cuyo Responsible es también el CKU. Lo que está a cargo de
 *  otra persona no se mide ni se muestra. El Responsible del item es el de su columna "Responsible"
 *  ("Resp" si esa viene vacía); el nombre se compara sin importar acentos ni mayúsculas. */
export function entregablesDelCku(projs: ProjItem[], cku: string): ProjItem[] {
  return proyectosFase3Nueva(projs)
    .filter((p) => esPersona(p.responsible?.trim() || p.resp, cku))
    .map((p) => ({ ...p, subitems: p.subitems.filter((s) => esPersona(s.responsible, cku)) }));
}

/** Cumplimiento de Entrega de un CKU: lo mismo que calcEntregaStatsPonderado (una nota por
 *  fuente, combinadas 10/20/70) pero en Proyectos la unidad es cada ACTIVIDAD (subitem) a cargo del
 *  CKU, de sus entregables de la Fase 3 (Launch) de los boards con plantilla nueva — ver
 *  entregablesDelCku y entregaActividadesCku. PML e Iniciativas no cambian. */
export function calcEntregaStatsCku(cku: string, reqs: ReqItem[], projs: ProjItem[], delays: DelayMap, ini: IniItem[] = []): EntregaStats {
  const f = entregaPorFuente(reqs, [], delays, ini);
  return combinarEntregaPonderada({ ...f, proj: entregaActividadesCku(entregablesDelCku(projs, cku), delays) });
}

/** Proyectos de un CKU: cada ACTIVIDAD (subitem) de los items que recibe (ya recortados a lo suyo, ver
 *  entregablesDelCku) es una unidad. Solo
 *  entran las que YA cerraron con veredicto (Done con fecha real y límite): a tiempo si cerró en o
 *  antes de su límite, con atraso si no. Las pendientes (sin cerrar, o sin fechas) no cuentan.
 *  El item no es unidad: solo sus actividades. La excusa es la de la FASE (un responsable por fase,
 *  ver projPhaseKey): si es ≠ CKU, el atraso de sus actividades sale de la cuenta, igual que un PML o
 *  una Iniciativa; si está sin asignar o es el CKU, penaliza. */
export function entregaActividadesCku(fase3: ProjItem[], delays: DelayMap): FuenteEntrega {
  const out = { total: 0, onTime: 0 };
  for (const p of fase3) {
    const excusada = lateExcused(projPhaseKey(p.boardId, p.grupo), delays);
    for (const s of p.subitems) {
      const entrega = entregaActividadCku(s);
      if (entrega === "on-time") { out.total++; out.onTime++; }
      else if (entrega === "late" && !excusada) out.total++;
    }
  }
  return out;
}

/** Veredicto de entrega de una actividad en la medición de un CKU: el de Monday (`entrega`), salvo que el
 *  PMO haya pedido dejarla a tiempo (ver ckuAjustes): una con atraso pasa a a tiempo; una sin veredicto
 *  (pendiente) sigue sin él. */
export const entregaActividadCku = (s: ProjSubitem): ProjSubitem["entrega"] =>
  s.entrega === "late" && esActividadATiempo(s.id) ? "on-time" : s.entrega;

/** Cumplimiento de Entrega medido COMO EL EVM (ver weightedEvm / EVM_WEIGHTS en
 *  lib/health.ts): el % a tiempo de cada fuente por separado (Iniciativas, PML,
 *  Proyectos), combinados 10% · 20% · 70%. Una fuente sin unidades no cuenta y su
 *  peso se reparte entre las demás. Los conteos (`total`/`onTime`/`late`) siguen
 *  siendo la suma de todas las unidades; solo `pct` cambia respecto a calcEntregaStats. */
export function calcEntregaStatsPonderado(reqs: ReqItem[], projs: ProjItem[], delays: DelayMap, ini: IniItem[] = []): EntregaStats {
  return combinarEntregaPonderada(entregaPorFuente(reqs, projs, delays, ini));
}

/** Fracción (0–1) a % entero para las notas ponderadas de un CKU. Un empate exacto (52.5) puede salir
 *  del punto flotante como 52.49999999999999 y redondear para abajo según el orden de las operaciones;
 *  el epsilon lo deja siempre hacia arriba (53), igual en el scoreboard y en el detalle de /players. */
export const redondearPct = (fraccion: number): number => Math.round(fraccion * 100 + 1e-9);

/** Combina el conteo por fuente en un EntregaStats: conteos = suma de todas las unidades, `pct` =
 *  nota por fuente ponderada 10/20/70 (la fuente sin unidades no cuenta). */
function combinarEntregaPonderada(f: { req: FuenteEntrega; proj: FuenteEntrega; ini: FuenteEntrega }): EntregaStats {
  const total = f.req.total + f.proj.total + f.ini.total;
  const onTime = f.req.onTime + f.proj.onTime + f.ini.onTime;
  const frac = (x: FuenteEntrega) => (x.total ? x.onTime / x.total : null);
  const ponderado = weightedEvm({ ini: frac(f.ini), req: frac(f.req), proj: frac(f.proj) });
  return { total, onTime, late: total - onTime, pct: ponderado === null ? null : redondearPct(ponderado) };
}

/** Variante "todos los atrasados" de Cumplimiento de Entrega — SOLO para la
 *  tarjeta principal del Control Tower (Players/KPI siguen excusando por
 *  responsable, ver calcEntregaStats). Una fase con al menos un atraso cuenta
 *  como "con atraso" sin importar el responsable asignado ni si es "PM". */
export function calcEntregaStatsRaw(reqs: ReqItem[], projs: ProjItem[], ini: IniItem[] = []): EntregaStats {
  let total = 0, onTime = 0;

  for (const r of reqs) {
    const v = r.onTime.verdict;
    if (v === "on-time") { total++; onTime++; }
    else if (v === "late") { total++; }
  }

  for (const g of groupFaseEntrega(projs).values()) {
    if (g.items.length === 0) continue;
    total++;
    if (!g.items.some((it) => it.verdict === "late")) onTime++;
  }

  for (const i of ini) {
    const v = iniEntregaVerdict(i);
    if (v === "on-time") { total++; onTime++; }
    else if (v === "late") { total++; }
  }

  const late = total - onTime;
  const pct = total ? Math.round((onTime / total) * 100) : null;
  return { total, onTime, late, pct };
}

// ── Reproceso (componente del KPI, peso 15) ──────────────────────────────
/** Clave sintética de atribución de una fase (grupo) de un proyecto. Usada por
 *  Cumplimiento de Entrega (Atraso, a nivel fase — ver groupFaseEntrega y la UI de
 *  Proyectos, cabecera de cada fase). Reproceso ya NO la usa: atribuye por step
 *  (p.id) — ver calcReprocesoStats/buildReprocesoRows más abajo. */
export const projPhaseKey = (boardId: string, grupo: string) => `${boardId}::${grupo}`;


/** Calidad/Reproceso de Proyecto SOLO mide la Fase 3 (Launch/Desarrollo) — es la
 *  única fase donde ocurre el desarrollo real; Valuación, Aprobación, Operación y
 *  Revisión son checkpoints administrativos, sin "rework" que medir. Se identifica
 *  por el nombre del grupo: en los boards reales todas las fase-3 arrancan con
 *  "Launch" (plantilla nueva: "Launch | Lanzamiento"; plantilla vieja: "Launch |
 *  Desarrollo"; 3ª plantilla: "L | Launch", ver sinLetraDeFase). Si un board futuro nombra su fase 3 distinto, hay que ajustar
 *  este chequeo — no hay forma robusta de detectarla por posición hoy (Monday no
 *  nos da el orden de los grupos, solo su nombre). */
export const isFase3 = (grupo: string): boolean => sinLetraDeFase(grupo).toLowerCase().startsWith("launch");

/** Fase 4 = Operación — el checkpoint administrativo que sigue a Launch (ver
 *  comentario de isFase3 arriba: Valuación(1) → Aprobación(2) → Launch(3) →
 *  Operación(4) → Revisión(5)). Se acentúa "Operación" en los boards reales,
 *  por eso se normaliza (sin acentos) antes de comparar. */
export const isFase4 = (grupo: string): boolean => norm(sinLetraDeFase(grupo)).startsWith("operacion");

/** Fase 1 = Valuación — formulación/Business Case, el arranque del proyecto. */
export const isFase1 = (grupo: string): boolean => norm(sinLetraDeFase(grupo)).startsWith("valuacion");

/** Fase 2 = Aprobación — Value Gate, el checkpoint antes de Launch. */
export const isFase2 = (grupo: string): boolean => norm(sinLetraDeFase(grupo)).startsWith("aprobacion");

/** Fase 5 = Revisión — el cierre administrativo/ROI que sigue a Operación. En la 3ª plantilla
 *  se llama "R | Resultado | Beneficio (Clase C)". */
export const isFase5 = (grupo: string): boolean => {
  const g = norm(sinLetraDeFase(grupo));
  return g.startsWith("revision") || g.startsWith("resultado");
};

// La plantilla "vieja" de Fase 3 tiene siempre 4 steps fijos que son CHECKPOINTS, no
// entregables ("Analisis técnico...", "Value Gate (BC)...", "Agenda BAT/UAT CKU" y
// "Desarrollo por iteraciones (Hitos) / Entrega(s) CKU") — el mismo hito real aparece
// duplicado como subitem independiente bajo 2-3 de esos checkpoints (confirmado con
// IDs de Monday). "Desarrollo por iteraciones..." es el checkpoint final: sus hitos
// reflejan el estado real de cada entregable, así que SI existe en la fase, la unidad
// de Calidad pasa a ser cada uno de SUS hitos (no el step). El nombre exacto varía
// ("...Entrega CKU" en la mayoría, "...Entregas CKU" en PM-001) — de ahí el match por
// substring. Ningún step de la plantilla nueva usa este nombre (son entregables como
// "POC", "MESA 2 - GT", etc. — "desarrollo por iteraciones" solo aparece como nombre
// de HITO dentro de su propio pipeline, nunca como nombre de STEP).
const DESARROLLO_ITERACIONES_RE = /desarrollo por iteraciones/i;
export const isDesarrolloPorIteracionesStep = (name: string): boolean => DESARROLLO_ITERACIONES_RE.test(name);

// Fase 5 (Revisión), SOLO plantilla vieja: el item "Cierre VMO (OP) del proyecto"
// fija el cierre real del proyecto — su Limit Date es tanto el fin de la fila de
// Fase 5 en el Gantt como la "Fecha cierre plan" del reporte (en vez del máximo
// Limit Date de Fase 4, que es lo que se usa cuando este item no existe — ver
// calcCompletionEstimate en projSummary.ts). La plantilla nueva no tiene este item.
// "Cierre VMO (OP) del proyecto" (plantillas vieja y nueva) o "HITO: Cierre VMO del proyecto" (3ª plantilla).
const CIERRE_VMO_RE = /cierre\s*vmo\s*(\(op\)\s*)?del\s*proyecto/i;
export const isCierreVmoStep = (name: string): boolean => CIERRE_VMO_RE.test(name);

/** Nombre corto de una fase para mostrar en una sola línea (Gantt, tabla de
 *  Causas de atraso): la parte ANTES del primer " | " ("Valuación | Formulación
 *  del proyecto" → "Valuación"), o el grupo tal cual si no tiene separador. */
export function shortPhaseName(grupo: string): string {
  // 3ª plantilla: sin la letra ("L | Launch" → "Launch") y sin el paréntesis ("Operación (Implementación)" → "Operación").
  const lite = sinLetraDeFase(grupo) !== grupo.trim();
  const base = lite ? sinLetraDeFase(grupo) : grupo;
  const i = base.indexOf(" | ");
  const corto = (i >= 0 ? base.slice(0, i) : base).trim() || base.trim();
  return lite ? corto.replace(/\s*\(.*\)\s*$/, "") || corto : corto;
}

/** Unidad de medición de Calidad dentro de una Fase 3: SIEMPRE un ITEM (step) —
 *  ver isDesarrolloPorIteracionesStep arriba para cuáles steps de la fase miden.
 *  Sus hitos son solo lectura (detalle en `cascade`/`pendingAtrasados`/`fueraDeCpm`),
 *  no unidades propias. Ver calcItemCalidad para cómo se calcula `recuperado` — la
 *  nota final (0/50/100) se arma aparte, en calcItemNota, con el responsable asignado. */
export interface CalidadUnit {
  id: string;                        // p.id — clave de atribución/Firestore
  kind: "step";
  name: string;
  pm: string;
  boardId: string;
  boardName: string;
  grupo: string;
  /** Status de Monday del item (Done / Working on it / Future Steps / ...). */
  status: string;
  deadline: Date | null;
  startDate: Date | null;
  /** Fecha real de cierre (End Date) — null mientras el item no está Done. */
  actualEnd: Date | null;
  /** true = ningún hito tiene Limit Date después del fin del CPM propio del item
   *  (PM se recuperó / nunca se salió del CPM). false = algún hito quedó después
   *  (ver fueraDeCpm), o el item no tiene su propio fin de CPM para verificarlo. */
  recuperado: boolean;
  /** Desglose histórico de entrega por hito (para el acordeón de detalle). */
  cascade: ReprocesoCascade | null;
  /** Hitos aún no Done que ya vencieron su propio CPM — informativo (por qué un item
   *  en curso ya aparece en la tabla antes de cerrar, ver calcItemCalidad/qualifies). */
  pendingAtrasados: PendingCalidadItem[];
  /** Hitos cuyo Limit Date cae después del fin del CPM del item — por qué no se
   *  recuperó (ver hitosFueraDeCpm). Vacío si `recuperado` es true. */
  fueraDeCpm: PendingCalidadItem[];
  /** true = el item ya cerró del todo (todos sus hitos Done; si no tiene hitos, el
   *  item mismo está Done). Habilita la calificación del responsable (el otro 50%
   *  de la nota, ver calcItemNota) — mientras el item siga en curso, `recuperado`
   *  todavía puede cambiar (un hito pendiente puede reprogramarse fuera del CPM
   *  más adelante), así que calificar antes sería prematuro. */
  allDone: boolean;
}

type CalidadGroup = { boardId: string; boardName: string; grupo: string; pm: string; steps: ProjItem[] };

/** Agrupa los steps de Fase 3 por proyecto (board+grupo) — agrupador compartido por
 *  calidadUnits() y calidadProjectStatus() para no repetir la lógica de scoping. */
function groupCalidad(projs: ProjItem[]): Map<string, CalidadGroup> {
  const groups = new Map<string, CalidadGroup>();
  for (const p of projs) {
    if (!isFase3(p.grupo)) continue;
    const key = projPhaseKey(p.boardId, p.grupo);
    let g = groups.get(key);
    if (!g) { g = { boardId: p.boardId, boardName: p.boardName, grupo: p.grupo, pm: p.pm, steps: [] }; groups.set(key, g); }
    g.steps.push(p);
  }
  return groups;
}

/** Steps de la fase cuyos hitos (o ellos mismos, si no tienen subitems) cuentan para
 *  Calidad — ver el comentario de isDesarrolloPorIteracionesStep arriba: plantilla
 *  vieja → solo "Desarrollo por iteraciones..."; plantilla nueva → todos los steps. */
function stepsQueMidenCalidad(g: CalidadGroup): ProjItem[] {
  const desarrolloStep = g.steps.find((p) => isDesarrolloPorIteracionesStep(p.name));
  return desarrolloStep ? [desarrolloStep] : g.steps;
}

/** Un hito o step de Fase 3 que TODAVÍA no está Done — insumo tanto de
 *  calcItemCalidad() (veredicto progresivo de un item en curso) como de
 *  calidadProjectStatus() (rollup por proyecto), para saber si, a día de hoy,
 *  sigue dentro de su propio CPM o ya lo venció. */
export interface PendingCalidadItem {
  id: string;
  name: string;
  deadline: Date | null;
  /** Nombre del step padre. */
  stepName: string;
}

/** Hitos del item cuyo Limit Date cae DESPUÉS del fin de su propio CPM — el chequeo
 *  real de "recuperado": no importa si el hito ya cerró o sigue pendiente, es
 *  consistencia de planeación (¿el pipeline quedó programado para cerrar dentro
 *  del compromiso del item?), no cumplimiento real.
 *
 *  SOLO se compara contra el FIN del CPM (`step.deadline`), nunca contra el
 *  inicio (`step.startDate`) — verificado con datos reales de Monday: "Start
 *  Date" no es el arranque fijo del compromiso, es un marcador que se corre
 *  hacia adelante conforme avanza el trabajo (a veces incluso queda DESPUÉS que
 *  el fin del CPM). Comparar contra ese inicio producía falsos positivos: hitos
 *  con Limit Date bien dentro del rango "CPM" real de Monday aparecían como
 *  "fuera de la ventana" solo porque `startDate` ya se había movido más allá de
 *  esas fechas. Sin `deadline` propio no se puede verificar → devuelve vacío; el
 *  "no se recuperó" en ese caso lo decide calcItemCalidad, no esta lista. */
function hitosFueraDeCpm(step: ProjItem): PendingCalidadItem[] {
  if (!step.deadline) return [];
  const { deadline } = step;
  return step.subitems
    .filter((s) => s.deadline != null && s.deadline > deadline)
    .map((s) => ({ id: s.id, name: s.name, deadline: s.deadline, stepName: step.name }));
}

/** Veredicto de Calidad de UN item (step) — mide PROGRESIVAMENTE (no exige que
 *  esté Done): `qualifies` se cumple si el item ya cerró, o tiene al menos un hito
 *  Done, o algún hito pendiente ya venció su propio CPM (mismo criterio que antes).
 *  `recuperado` (ver hitosFueraDeCpm) ya NO depende del status — es puramente si
 *  los hitos quedaron con Limit Date dentro del CPM del item (solo se verifica el
 *  fin, ver comentario de hitosFueraDeCpm). */
export interface ItemCalidad {
  recuperado: boolean;
  cascade: ReprocesoCascade;
  pendingAtrasados: PendingCalidadItem[];
  fueraDeCpm: PendingCalidadItem[];
  qualifies: boolean;
  /** true = el item ya cerró del todo (todos sus hitos Done; si no tiene hitos, el
   *  item mismo está Done) — ver CalidadUnit.allDone para el porqué. */
  allDone: boolean;
}

export function calcItemCalidad(step: ProjItem): ItemCalidad {
  const cascade = calcReprocesoCascade(step);
  const pendingAtrasados = step.subitems
    .filter((s) => s.status !== "Done" && s.deadline != null && s.deadline < today())
    .map((s) => ({ id: s.id, name: s.name, deadline: s.deadline, stepName: step.name }));
  const fueraDeCpm = hitosFueraDeCpm(step);
  const recuperado = step.deadline != null && fueraDeCpm.length === 0;
  const doneAny = step.subitems.some((s) => s.status === "Done");
  const qualifies = step.status === "Done" || doneAny || pendingAtrasados.length > 0;
  const allDone = step.subitems.length > 0
    ? step.subitems.every((s) => s.status === "Done")
    : step.status === "Done";
  return { recuperado, cascade, pendingAtrasados, fueraDeCpm, qualifies, allDone };
}

/** Resuelve las unidades de Calidad de TODOS los proyectos: agrupa los steps de Fase 3
 *  por proyecto (board+grupo), decide CUÁLES steps miden (ver isDesarrolloPorIteracionesStep
 *  arriba) y, para cada uno, su veredicto (ver calcItemCalidad). La unidad de
 *  atribución/KPI es siempre el ITEM — sus hitos son solo lectura (detalle en `cascade`).
 *  Único punto de la app que decide el alcance; calcReprocesoStats/calcReprocesoStatsRaw/
 *  buildReprocesoRows/buildReprocesoRowsRaw consumen su resultado sin repetir la lógica. */
export function calidadUnits(projs: ProjItem[]): CalidadUnit[] {
  const units: CalidadUnit[] = [];
  for (const g of groupCalidad(projs).values()) {
    for (const step of stepsQueMidenCalidad(g)) {
      const calc = calcItemCalidad(step);
      if (!calc.qualifies) continue;
      units.push({
        id: step.id, kind: "step", name: step.name, pm: g.pm,
        boardId: g.boardId, boardName: g.boardName, grupo: g.grupo, status: step.status,
        deadline: step.deadline, startDate: step.startDate, actualEnd: step.endDate,
        recuperado: calc.recuperado, cascade: calc.cascade,
        pendingAtrasados: calc.pendingAtrasados, fueraDeCpm: calc.fueraDeCpm, allDone: calc.allDone,
      });
    }
  }
  return units;
}

/** "Trayectoria" de Calidad de un proyecto en Fase 3, a día de hoy — responde si el PM
 *  se recuperó, usando la MISMA fuente de verdad que la nota del item (ver
 *  calcItemCalidad/hitosFueraDeCpm): no basta con que nada esté vencido hoy, ningún
 *  hito puede haber quedado reprogramado fuera del CPM de su propio item.
 *  · "atrasado": hay un problema sin resolver HOY — un hito pendiente (no Done) cuyo
 *    propio CPM ya venció, Y/O algún hito (Done o no) cuyo Limit Date quedó después
 *    del fin del CPM de su item. Cualquiera de los dos basta: todavía no se recuperó.
 *  · "recuperado": hubo un atraso en el pasado (alguna unidad Done llegó tarde), pero
 *    HOY no hay nada vencido ni nada fuera del CPM de su item — el PM se puso al día.
 *  · "sin-atrasos": nunca hubo un atraso Done, nada está vencido y nada quedó fuera
 *    del CPM de su item. */
export type CalidadTrayectoria = "sin-atrasos" | "recuperado" | "atrasado";

export interface CalidadProjectStatus {
  boardId: string;
  boardName: string;
  grupo: string;
  pm: string;
  doneTotal: number;
  doneLate: number;
  pendingTotal: number;
  /** Subconjunto de lo pendiente que ya venció su propio CPM sin haber cerrado. Un
   *  pendiente SIN CPM asignado (típico de "Future Steps" al fondo del pipeline, que
   *  Monday todavía no programó) no cuenta aquí — no hay fecha que haya incumplido
   *  todavía, a diferencia de un Done sin fechas (que sí penaliza, ver calcReprocesoCascade). */
  pendingAtrasados: PendingCalidadItem[];
  /** Hitos (Done o no) cuyo Limit Date cae después del fin del CPM de su propio item —
   *  ver hitosFueraDeCpm. Misma señal que usa la nota del item; puede solaparse con
   *  pendingAtrasados (un mismo hito puede estar vencido HOY y además fuera de CPM). */
  fueraDeCpm: PendingCalidadItem[];
  trayectoria: CalidadTrayectoria;
}

/** Trayectoria de Calidad por proyecto (board+fase 3) — ver CalidadTrayectoria arriba.
 *  Cuenta HITOS directamente (Done/pendientes) para doneTotal/doneLate, independiente
 *  de calidadUnits() y de qué es "una unidad" para el KPI; pero fueraDeCpm SÍ reutiliza
 *  hitosFueraDeCpm (misma fuente que calcItemCalidad) para que este rollup nunca
 *  contradiga la nota del item. Un grupo sin ninguna unidad Done ni nada pendiente
 *  (fase aún sin arrancar) no aparece en el resultado. */
export function calidadProjectStatus(projs: ProjItem[]): CalidadProjectStatus[] {
  const result: CalidadProjectStatus[] = [];
  for (const g of groupCalidad(projs).values()) {
    let doneTotal = 0, doneLate = 0;
    const pending: PendingCalidadItem[] = [];
    const fueraDeCpm: PendingCalidadItem[] = [];
    for (const step of stepsQueMidenCalidad(g)) {
      if (step.subitems.length > 0) {
        for (const s of step.subitems) {
          if (s.status === "Done") { doneTotal++; if (s.entrega === "late") doneLate++; }
          else pending.push({ id: s.id, name: s.name, deadline: s.deadline, stepName: step.name });
        }
      } else if (step.status === "Done") {
        doneTotal++;
        if (step.entrega === "late") doneLate++;
      } else {
        pending.push({ id: step.id, name: step.name, deadline: step.deadline, stepName: "" });
      }
      fueraDeCpm.push(...hitosFueraDeCpm(step));
    }
    if (doneTotal === 0 && pending.length === 0) continue;
    const pendingAtrasados = pending.filter((p) => p.deadline != null && p.deadline < today());
    const atrasado = pendingAtrasados.length > 0 || fueraDeCpm.length > 0;
    const trayectoria: CalidadTrayectoria =
      atrasado ? "atrasado" : doneLate > 0 ? "recuperado" : "sin-atrasos";
    result.push({
      boardId: g.boardId, boardName: g.boardName, grupo: g.grupo, pm: g.pm,
      doneTotal, doneLate, pendingTotal: pending.length, pendingAtrasados, fueraDeCpm, trayectoria,
    });
  }
  return result;
}

/** Nota de Calidad de un item de Proyecto (0/50/100): 50% si el responsable
 *  asignado es ≠ "PM" (mismo criterio que lateExcused — SIEMPRE hace falta
 *  asignarlo explícitamente; no hay bypass automático por haber salido a
 *  tiempo), + 50% si se recuperó (ver calcItemCalidad/hitosFueraDeCpm). Con
 *  esto se calcula el % de Calidad que alimenta el KPI del PM (ver
 *  calcReprocesoStats). Los REQ no usan esta función — su nota sigue siendo
 *  binaria (100/0), ver calcReprocesoStats. */
export function calcItemNota(id: string, recuperado: boolean, reproceso: DelayMap): number {
  return (lateExcused(id, reproceso) ? 50 : 0) + (recuperado ? 50 : 0);
}

/** Nota de Calidad de un CKU (Players), para PML, Iniciativas y Proyectos por igual: BINARIA. 100 si
 *  se asignó un responsable distinto del CKU, 0 si el responsable es el CKU o todavía no hay nadie
 *  asignado. Recibe el mapa con PM ↔ CKU ya intercambiado (ver swapPmCku), así que "≠ PM" aquí
 *  significa "≠ CKU". No usa la recuperación ni el 0/50/100 de calcItemNota, que es el de los PM. */
export const notaCalidadCku = (id: string, reproceso: DelayMap): number => (lateExcused(id, reproceso) ? 100 : 0);

/** Por qué una actividad de Proyecto vale lo que vale en la Calidad de un CKU. */
export type MotivoCalidadActividad = "nueva-fecha" | "a-tiempo" | "tarde" | "ajuste";

/** Calidad de una ACTIVIDAD (subitem) de un CKU en Proyectos, por sus fechas — no por un responsable
 *  asignado a mano. Vale 100 (calidad 1) o 0, en este orden:
 *   · si el PMO pidió dejarla a tiempo (ver ckuAjustes) → 100, sin importar sus fechas;
 *   · con «New Limit Date» llena (se le movió la fecha límite) → 0, sin importar su estado;
 *   · con «Actual End» y «Limit Date»: cerró en o antes del límite → 100, después → 0;
 *   · cualquier otra (en «Working on it», Future Steps, Stuck, cerrada sin fechas…) → null: todavía no
 *     se mide. Solo cuenta lo ya completado: una actividad en curso no suma ni resta. */
export function calidadActividadCku(s: ProjSubitem): { nota: 0 | 100; motivo: MotivoCalidadActividad } | null {
  if (esActividadATiempo(s.id)) return { nota: 100, motivo: "ajuste" };
  if (s.newLimitDate) return { nota: 0, motivo: "nueva-fecha" };
  if (s.actualEnd && s.deadline) {
    return s.actualEnd.getTime() <= s.deadline.getTime() ? { nota: 100, motivo: "a-tiempo" } : { nota: 0, motivo: "tarde" };
  }
  return null;
}

export interface ReprocesoStats { total: number; limpias: number; conReproceso: number; pct: number | null; }

/** Unidades de Calidad de INICIATIVAS: las ya aprobadas (PM Aprobado / PML Aprobado,
 *  estado "APROBADA"). Como un REQ cerrado, su nota es binaria: 100 si el Admin la
 *  excusa con un responsable ≠ "PM" (o "Sin reproceso"), 0 si no (sin asignar
 *  penaliza). Se atribuyen por el id de la iniciativa (ini.id). Las demás etapas del
 *  embudo (New, Meeting 1/2, En Espera, Plan Futuro…) todavía no miden Calidad. */
export const iniUnidadesCalidad = (ini: IniItem[]): IniItem[] =>
  ini.filter((i) => i.estado === "APROBADA" && i.id);

/** Desglose de "Calidad de Entregas" (nota promedio de las unidades en scope). Las
 *  unidades en scope son los REQ CERRADOS + las unidades de Calidad de la FASE 3 de
 *  Proyecto (ver calidadUnits) — las demás fases del proyecto no entran (ver isFase3).
 *  REQ: nota binaria — 100 si se excusa con un responsable ≠ "PM", 0 si no (sin
 *  asignar penaliza). Proyecto: nota graduada 0/50/100, ver calcItemNota — el
 *  responsable SIEMPRE debe asignarse explícitamente (sin bypass automático por
 *  CPM), y el otro 50% depende de si se recuperó (ningún hito con Limit Date
 *  después del fin de su propio CPM, ver hitosFueraDeCpm).
 *  `pct` es el PROMEDIO de las notas (no la fracción de unidades 100% limpias);
 *  `limpias`/`conReproceso` siguen siendo conteos, para las tarjetas de resumen. */
export function calcReprocesoStats(reqs: ReqItem[], projs: ProjItem[], reproceso: DelayMap, ini: IniItem[] = []): ReprocesoStats {
  const n = notasReprocesoPorFuente(reqs, projs, reproceso, ini);
  const notas = [...n.req, ...n.proj, ...n.ini];
  const total = notas.length;
  const limpias = notas.filter((x) => x === 100).length;
  const conReproceso = total - limpias;
  const pct = total ? Math.round(notas.reduce((a, b) => a + b, 0) / total) : null;
  return { total, limpias, conReproceso, pct };
}

/** Notas (0/50/100) de Calidad de cada unidad en scope, separadas por fuente:
 *  PML cerrados, Fase 3 de Proyectos e Iniciativas aprobadas. Base común de
 *  calcReprocesoStats (todo junto) y calcReprocesoStatsPonderado (una nota por fuente). */
function notasReprocesoPorFuente(
  reqs: ReqItem[], projs: ProjItem[], reproceso: DelayMap, ini: IniItem[], cku?: string,
): { req: number[]; proj: number[]; ini: number[] } {
  return {
    req: reqs.filter((r) => r.estado === "CERRADO").map((r) => (lateExcused(r.id, reproceso) ? 100 : 0)),
    // CKU: cada actividad a cargo suya, de sus entregables de la Fase 3 (plantilla nueva), vale 0 o 100
    // por sus fechas (ver calidadActividadCku); las que aún no se miden no entran.
    proj: cku !== undefined
      ? entregablesDelCku(projs, cku).flatMap((p) => p.subitems.flatMap((s) => calidadActividadCku(s)?.nota ?? []))
      : calidadUnits(projs).map((u) => calcItemNota(u.id, u.recuperado, reproceso)),
    ini: iniUnidadesCalidad(ini).map((i) => (lateExcused(i.id, reproceso) ? 100 : 0)),
  };
}

/** Calidad de Entregas de los CKUs (Players): medida COMO EL EVM (ver weightedEvm /
 *  EVM_WEIGHTS en lib/health.ts) — la nota promedio de cada fuente por separado
 *  (Iniciativas, PML, Proyectos), combinadas 10% · 20% · 70%. Una fuente sin unidades no
 *  cuenta y su peso se reparte entre las demás. A diferencia de los PM, TODAS las unidades valen
 *  0 o 100: PML e Iniciativas según su responsable (ver notaCalidadCku) y Proyectos por las FECHAS
 *  de cada actividad a cargo del CKU, de sus entregables de la Fase 3 de plantilla nueva (ver
 *  entregablesDelCku y calidadActividadCku). Los conteos (`total`/`limpias`/`conReproceso`) son los
 *  de todas las unidades juntas. */
export function calcReprocesoStatsPonderado(cku: string, reqs: ReqItem[], projs: ProjItem[], reproceso: DelayMap, ini: IniItem[] = []): ReprocesoStats {
  const n = notasReprocesoPorFuente(reqs, projs, reproceso, ini, cku);
  const notas = [...n.req, ...n.proj, ...n.ini];
  const total = notas.length;
  const limpias = notas.filter((x) => x === 100).length;
  const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length / 100 : null);
  const ponderado = weightedEvm({ ini: media(n.ini), req: media(n.req), proj: media(n.proj) });
  return { total, limpias, conReproceso: total - limpias, pct: ponderado === null ? null : redondearPct(ponderado) };
}

/** % de unidades "limpias" de reproceso (ideal 100%). null si no hay unidades en scope
 *  (→ componente pendiente). Ver calcReprocesoStats para el desglose completo. */
export function calcReprocesoPct(reqs: ReqItem[], projs: ProjItem[], reproceso: DelayMap, ini: IniItem[] = []): number | null {
  return calcReprocesoStats(reqs, projs, reproceso, ini).pct;
}

/** Variante "real, sin filtros" de Calidad de Entregas — SOLO para la tarjeta
 *  principal del Control Tower (Players/KPI usan calcReprocesoStats). Únicamente
 *  cuenta unidades (REQ CERRADO / step Done) que YA tienen responsable asignado:
 *  "Sin reproceso" → limpia; otros (incluido "PM") → con reproceso. Sin selección
 *  se ignoran — ignora el veredicto automático por fechas. */
export function calcReprocesoStatsRaw(reqs: ReqItem[], projs: ProjItem[], reproceso: DelayMap, ini: IniItem[] = []): ReprocesoStats {
  const units = [
    ...reqs.filter((r) => r.estado === "CERRADO").map((r) => r.id),
    ...calidadUnits(projs).map((u) => u.id),
    ...iniUnidadesCalidad(ini).map((i) => i.id),
  ];
  const assigned = units.filter((id) => reproceso[id]?.responsible != null);
  const total = assigned.length;
  const limpias = assigned.filter((id) => reproceso[id]?.responsible === "Sin reproceso").length;
  const conReproceso = total - limpias;
  const pct = total ? Math.round((limpias / total) * 100) : null;
  return { total, limpias, conReproceso, pct };
}

// ── Filas de auditoría (página Calidad & Cumplimiento) ───────────────────
// Un mismo itemId se usa para leer/escribir la atribución (delay o reproceso)
// vía ResponsibleSelect — el mismo esquema de ids que REQ y Proyectos.
const boardPmMap = (projBoards: ProjBoard[]) => new Map(projBoards.map((b) => [b.id, b.pm]));

/** Interfaz para desglose de fases del REQ en el acordeón. */
export interface ReqPhaseDetail {
  name: string;          // Valuación | Aprobación | Desarrollo | Operación | Cierre ROI
  target: Date | null;   // deadline planeado de la fase
  actual: Date | null;   // fecha real de cierre
  late: boolean;         // si la fase se atrasó
  slipDays: number;      // días hábiles de atraso
}

export interface EntregaRow {
  id: string;                        // r.id (REQ) / projPhaseKey (fase de Proyecto) / ini.id (Iniciativa) — atribución "delay"
  source: "REQ" | "Proyecto" | "Iniciativa";
  tipo: "PM" | "PML" | "INI";         // Proyecto → "PM"; REQ → "PML"; Iniciativa → "INI"
  name: string;                      // REQ: r.name. Proyecto: "<projName> · <fase>"
  context: string;                   // REQ: grupo. Proyecto: "board · grupo".
  projCode: string;                  // "PM-003" del board; "" en REQ/Iniciativa (no cuelgan de un proyecto)
  projName: string;                  // "DUCAfast 2.0 GT"; "" en REQ/Iniciativa
  fase: string;                      // REQ/Proyecto/Iniciativa: grupo (fase)
  pm: string;
  deadline: Date | null;             // REQ: su deadline. Proyecto/Iniciativa: null (sin una sola fecha).
  verdict: "on-time" | "late";       // Proyecto: "late" si ≥1 step/hito de la fase quedó atrasado.
  /** Solo REQ: desglose de deadlines por fase (para acordeón). */
  phaseDetails?: ReqPhaseDetail[];
  /** Solo Proyecto: steps/hitos de la fase con veredicto "late" — para el acordeón de detalle. */
  itemsAtrasados: FaseEntregaItem[];
  /** Solo Proyecto: steps/hitos de la fase YA evaluados (Done). */
  totalEvaluados: number;
  /** Solo Proyecto: cuántos de los evaluados están atrasados. */
  totalAtrasados: number;
}

/** Filas de "Cumplimiento de Entrega": una por cada REQ + una por cada FASE de
 *  Proyecto con al menos un step/hito YA evaluado (mismo universo/agrupación que
 *  calcEntregaStats: REQ por r.id, fases por projPhaseKey) + una por cada
 *  Iniciativa APROBADA evaluable (ver iniEntregaVerdict — "n/a" no entra, igual
 *  que un REQ sin R Done). El responsable se asigna a la FASE/Iniciativa
 *  completa, no a cada step/hito — el detalle de cuáles quedaron atrasados va en
 *  `itemsAtrasados`, solo informativo. El tipo distingue Proyecto ("PM") de REQ
 *  ("PML") de Iniciativa ("INI"). */
export function buildEntregaRows(reqs: ReqItem[], projs: ProjItem[], projBoards: ProjBoard[], ini: IniItem[] = []): EntregaRow[] {
  const bpm = boardPmMap(projBoards);
  const rows: EntregaRow[] = [];
  for (const r of reqs) {
    if (r.onTime.verdict !== "on-time" && r.onTime.verdict !== "late") continue;
    rows.push({
      id: r.id, source: "REQ", tipo: "PML", name: r.name, context: r.grupo,
      projCode: "", projName: "", fase: r.grupo, pm: r.pm, deadline: r.deadline,
      verdict: r.onTime.verdict, phaseDetails: r.onTime.phases,
      itemsAtrasados: [], totalEvaluados: 0, totalAtrasados: 0,
    });
  }
  for (const g of groupFaseEntrega(projs).values()) {
    if (g.items.length === 0) continue;
    const pm = bpm.get(g.boardId) ?? g.pm;
    const { code: projCode, name: projName } = splitBoardName(g.boardName);
    const itemsAtrasados = g.items.filter((it) => it.verdict === "late");
    rows.push({
      id: g.key, source: "Proyecto", tipo: "PM", name: `${projName} · ${g.fase}`,
      context: `${g.boardName} · ${g.fase}`, projCode, projName, fase: g.fase, pm, deadline: null,
      verdict: itemsAtrasados.length > 0 ? "late" : "on-time",
      itemsAtrasados, totalEvaluados: g.items.length, totalAtrasados: itemsAtrasados.length,
    });
  }
  for (const i of ini) {
    const v = iniEntregaVerdict(i);
    if (v === "n/a") continue;
    rows.push({
      id: i.id, source: "Iniciativa", tipo: "INI", name: i.name, context: i.grupo,
      projCode: "", projName: "", fase: i.grupo, pm: i.pm, deadline: null,
      verdict: v, itemsAtrasados: [], totalEvaluados: 0, totalAtrasados: 0,
    });
  }
  return rows;
}

export interface LateResponsibleRow {
  id: string;                        // r.id (REQ) / projPhaseKey (fase de Proyecto) / ini.id (Iniciativa)
  source: "REQ" | "Proyecto" | "Iniciativa";
  name: string;
  pm: string;
  responsible: DelayResponsible | null; // null = sin asignar
  onTime?: number;                   // fase: steps/hitos a tiempo entre los ya evaluados
  doneTotal?: number;                // fase: total de steps/hitos ya evaluados (Done)
}

/** Filas de atraso para el detalle de "Cumplimiento de Entrega": REQ (1 fila c/u)
 *  + FASES de Proyecto (1 fila c/u — mismo universo/agrupación que calcEntregaStats)
 *  + Iniciativas APROBADAS atrasadas (ver iniEntregaVerdict). Solo aparecen las
 *  fases/iniciativas con atraso SIN excusar; el responsable mostrado es el de la
 *  fase completa (un solo responsable decide la excusa de todos sus atrasos).
 *  Solo "PM" o sin asignar penaliza el % (ver lateExcused); el resto excusa el
 *  atraso. */
export function buildLateResponsibleRows(reqs: ReqItem[], projs: ProjItem[], projBoards: ProjBoard[], delays: DelayMap, ini: IniItem[] = []): LateResponsibleRow[] {
  const bpm = boardPmMap(projBoards);
  const rows: LateResponsibleRow[] = [];
  for (const r of reqs) {
    if (r.onTime.verdict !== "late") continue;
    rows.push({ id: r.id, source: "REQ", name: r.name, pm: r.pm, responsible: delays[r.id]?.responsible ?? null });
  }

  for (const g of groupFaseEntrega(projs).values()) {
    if (g.items.length === 0) continue;
    if (!faseTieneAtrasoSinExcusar(g, delays)) continue; // sin atraso sin excusar → no aparece en el detalle
    const pm = bpm.get(g.boardId) ?? g.pm;
    const { name: projName } = splitBoardName(g.boardName);
    const onTime = g.items.filter((it) => it.verdict === "on-time").length;
    rows.push({
      id: g.key, source: "Proyecto", name: `${projName} · ${g.fase}`, pm,
      responsible: delays[g.key]?.responsible ?? null, onTime, doneTotal: g.items.length,
    });
  }

  for (const i of ini) {
    if (iniEntregaVerdict(i) !== "late" || lateExcused(i.id, delays)) continue;
    rows.push({ id: i.id, source: "Iniciativa", name: i.name, pm: i.pm, responsible: delays[i.id]?.responsible ?? null });
  }
  return rows;
}

/** Variante "todos los atrasados" de buildLateResponsibleRows — SOLO para el
 *  detalle de la tarjeta principal del Control Tower (Players/KPI siguen
 *  excusando por responsable, ver buildLateResponsibleRows). Lista TODA fase con
 *  al menos un atraso, sin importar el responsable asignado (se muestra igual,
 *  es solo informativo aquí). */
export function buildLateResponsibleRowsRaw(reqs: ReqItem[], projs: ProjItem[], projBoards: ProjBoard[], delays: DelayMap, ini: IniItem[] = []): LateResponsibleRow[] {
  const bpm = boardPmMap(projBoards);
  const rows: LateResponsibleRow[] = [];
  for (const r of reqs) {
    if (r.onTime.verdict !== "late") continue;
    rows.push({ id: r.id, source: "REQ", name: r.name, pm: r.pm, responsible: delays[r.id]?.responsible ?? null });
  }

  for (const g of groupFaseEntrega(projs).values()) {
    if (g.items.length === 0) continue;
    if (!g.items.some((it) => it.verdict === "late")) continue;
    const pm = bpm.get(g.boardId) ?? g.pm;
    const { name: projName } = splitBoardName(g.boardName);
    const onTime = g.items.filter((it) => it.verdict === "on-time").length;
    rows.push({
      id: g.key, source: "Proyecto", name: `${projName} · ${g.fase}`, pm,
      responsible: delays[g.key]?.responsible ?? null, onTime, doneTotal: g.items.length,
    });
  }

  for (const i of ini) {
    if (iniEntregaVerdict(i) !== "late") continue;
    rows.push({ id: i.id, source: "Iniciativa", name: i.name, pm: i.pm, responsible: delays[i.id]?.responsible ?? null });
  }
  return rows;
}

export interface ReprocesoRow {
  id: string;                        // r.id (REQ) / CalidadUnit.id (item de Proyecto) / ini.id (Iniciativa) — atribución "reproceso"
  source: "REQ" | "Proyecto" | "Iniciativa";
  unitKind: "req" | "step" | "ini";
  tipo: "PM" | "PML" | "INI";        // Proyecto → "PM"; REQ → "PML"; Iniciativa → "INI"
  name: string;                      // REQ: r.name. Proyecto: nombre del item (el entregable)
  context: string;                   // REQ: grupo. Proyecto: "board · grupo"
  projCode: string;                  // "PM-003" del board; "" en REQ
  projName: string;                  // proyecto; "" en REQ
  fase: string;                      // REQ/Proyecto: grupo (fase)
  pm: string;
  /** REQ: r.estado (EN PROCESO / CERRADO / ...). Proyecto: status de Monday del item
   *  (Done / Working on it / Future Steps / ...). */
  status: string;
  deadline: Date | null;             // REQ: su deadline. Proyecto: deadline/CPM propio de la unidad.
  /** Fecha real de inicio. REQ: inicio del trámite. Proyecto: startDate propio del item. */
  startDate: Date | null;
  /** Fecha real de cierre. REQ: fin de la última fase evaluada. Proyecto: End Date del
   *  item. null si aún no cerró. */
  actualEnd: Date | null;
  verdict: "clean" | "reproceso";
  /** Nota de Calidad (0/50/100). REQ: binaria (100/0). Proyecto: ver calcItemNota. */
  nota: number;
  /** Solo REQ: desglose de deadlines por fase (para acordeón). */
  phaseDetails?: ReqPhaseDetail[];
  /** Solo unitKind "step": hitos Done de ese item (informativo en acordeón). Vacío en "req". */
  itemsDone: ReprocesoHito[];
  /** Solo unitKind "step": total de hitos Done del item. 0 en "req". */
  totalDone: number;
  /** true = ningún hito tiene Limit Date después del fin del CPM del item (recuperado).
   *  false = alguno quedó después, o no se pudo verificar. null = unitKind "req" (no aplica). */
  recuperado: boolean | null;
  /** Solo unitKind "step": desglose histórico de entrega por hito (para el acordeón de detalle). */
  cascade: ReprocesoCascade | null;
  /** Solo unitKind "step": hitos aún no Done que ya vencieron su propio CPM — por qué un
   *  item en curso puede aparecer marcado antes de cerrar. Vacío en "req". */
  pendingAtrasados: PendingCalidadItem[];
  /** Solo unitKind "step": hitos cuyo Limit Date cae después del fin del CPM del item —
   *  por qué no se recuperó. Vacío en "req". */
  fueraDeCpm: PendingCalidadItem[];
  /** ¿Se puede calificar el responsable (el otro 50% de la nota) ahora mismo? REQ:
   *  siempre true (ya está CERRADO, ver el filtro de buildReprocesoRows). Proyecto:
   *  ver CalidadUnit.allDone — solo cuando el item ya cerró del todo, porque antes
   *  "recuperado" todavía puede cambiar. La UI debe deshabilitar el dropdown de
   *  responsable cuando esto es false. */
  allDone: boolean;
}

/** Un hito (subitem) de un step de Proyecto, con su propio veredicto de entrega —
 *  ya NO es una unidad de Reproceso; es el insumo del diagnóstico de recuperación. */
export interface ReprocesoHito {
  id: string;
  name: string;
  /** Status de Monday del hito (Done / Working on it / Future Steps / ...). */
  status: string;
  deadline: Date | null;
  entrega: "on-time" | "late" | null;
}

/** Diagnóstico de recuperación de un step: si tuvo al menos un hito marcado "late"
 *  en algún momento, pero el STEP EN SÍ terminó a tiempo según su propio CPM/deadline
 *  (`p.entrega === "on-time"`), el PM "se recuperó" del atraso puntual — el hito que
 *  se atrasó no le costó el cumplimiento del entregable. Si el step también terminó
 *  atrasado (o sin fechas para verificar), no hubo recuperación. */
export interface ReprocesoCascade {
  hitos: ReprocesoHito[];
  /** Índice (en `hitos`) del primer hito con entrega "late"; null si ninguno se atrasó. */
  primerAtrasoIdx: number | null;
  /** true = hubo un hito atrasado pero el step cerró a tiempo (PM se recuperó).
   *  false = hubo un hito atrasado y el step también terminó atrasado (no se recuperó).
   *  null = ningún hito estuvo atrasado — no hay nada que diagnosticar. */
  recuperado: boolean | null;
}

/** Calcula el diagnóstico de recuperación de un step a partir de sus hitos + su
 *  propio veredicto de entrega (CPM). Ver ReprocesoCascade para la semántica. */
export function calcReprocesoCascade(p: ProjItem): ReprocesoCascade {
  const hitos: ReprocesoHito[] = p.subitems.map((s) => ({ id: s.id, name: s.name, status: s.status, deadline: s.deadline, entrega: s.entrega }));
  const primerAtrasoIdx = hitos.findIndex((h) => h.entrega === "late");
  if (primerAtrasoIdx === -1) return { hitos, primerAtrasoIdx: null, recuperado: null };
  const recuperado = p.entrega === "on-time";
  return { hitos, primerAtrasoIdx, recuperado };
}

/** Filas de "Calidad de Entregas": una por cada REQ CERRADO y una por cada unidad de
 *  Calidad de Fase 3 (ver calidadUnits: siempre un item, con veredicto progresivo). */
export function buildReprocesoRows(reqs: ReqItem[], projs: ProjItem[], projBoards: ProjBoard[], reproceso: DelayMap, ini: IniItem[] = []): ReprocesoRow[] {
  const bpm = boardPmMap(projBoards);
  const rows: ReprocesoRow[] = [];
  for (const r of reqs) {
    if (r.estado !== "CERRADO") continue;
    const ultimaFase = r.onTime.phases[r.onTime.phases.length - 1];
    const reqNota = lateExcused(r.id, reproceso) ? 100 : 0;
    rows.push({
      id: r.id, source: "REQ", unitKind: "req", tipo: "PML", name: r.name, context: r.grupo,
      projCode: "", projName: "", fase: r.grupo, pm: r.pm, status: r.estado, deadline: r.deadline,
      startDate: r.inicioReq ?? r.inicio, actualEnd: ultimaFase?.actual ?? null,
      verdict: reqNota === 100 ? "clean" : "reproceso", nota: reqNota, phaseDetails: r.onTime.phases,
      itemsDone: [], totalDone: 0, recuperado: null, cascade: null, pendingAtrasados: [], fueraDeCpm: [], allDone: true,
    });
  }
  for (const u of calidadUnits(projs)) {
    const pm = bpm.get(u.boardId) ?? u.pm;
    const { code: projCode, name: projName } = splitBoardName(u.boardName);
    const nota = calcItemNota(u.id, u.recuperado, reproceso);
    rows.push({
      id: u.id, source: "Proyecto", unitKind: u.kind, tipo: "PM", name: u.name,
      context: `${u.boardName} · ${u.grupo}`, projCode, projName, fase: u.grupo, pm, status: u.status, deadline: u.deadline,
      startDate: u.startDate, actualEnd: u.actualEnd,
      verdict: nota === 100 ? "clean" : "reproceso", nota,
      itemsDone: u.cascade?.hitos.filter((h) => h.entrega != null) ?? [],
      totalDone: u.cascade?.hitos.filter((h) => h.entrega != null).length ?? 0,
      recuperado: u.recuperado, cascade: u.cascade, pendingAtrasados: u.pendingAtrasados, fueraDeCpm: u.fueraDeCpm,
      allDone: u.allDone,
    });
  }
  // Iniciativas aprobadas: nota binaria como un REQ cerrado. No tienen CPM ni fecha de
  // aprobación, así que fechas y detalle quedan vacíos; ya están aprobadas (allDone).
  for (const i of iniUnidadesCalidad(ini)) {
    const nota = lateExcused(i.id, reproceso) ? 100 : 0;
    rows.push({
      id: i.id, source: "Iniciativa", unitKind: "ini", tipo: "INI", name: i.name, context: i.grupo,
      projCode: "", projName: "", fase: i.grupo, pm: i.pm, status: i.status, deadline: null,
      startDate: null, actualEnd: null,
      verdict: nota === 100 ? "clean" : "reproceso", nota,
      itemsDone: [], totalDone: 0, recuperado: null, cascade: null, pendingAtrasados: [], fueraDeCpm: [], allDone: true,
    });
  }
  return rows;
}

export interface ReprocesoRawRow {
  id: string;                        // r.id / projPhaseKey(boardId, grupo) / ini.id — atribución "reproceso"
  source: "REQ" | "Proyecto" | "Iniciativa";
  name: string;
  pm: string;
  responsible: DelayResponsible;     // opción elegida en el dropdown (incluye "Sin reproceso")
  /** Solo "Proyecto": código "PM-003" tomado del nombre del board (splitBoardName). "" en REQ. */
  projCode: string;
}

/** Filas RAW de "Calidad de Entregas" — solo unidades con responsable YA seleccionado,
 *  con la opción elegida tal cual (incluye "Sin reproceso"). Para detalle de tarjeta
 *  principal del Control Tower. */
export function buildReprocesoRowsRaw(reqs: ReqItem[], projs: ProjItem[], projBoards: ProjBoard[], reproceso: DelayMap, ini: IniItem[] = []): ReprocesoRawRow[] {
  const bpm = boardPmMap(projBoards);
  const rows: ReprocesoRawRow[] = [];
  for (const r of reqs) {
    if (r.estado !== "CERRADO") continue;
    const responsible = reproceso[r.id]?.responsible;
    if (responsible == null) continue;
    rows.push({ id: r.id, source: "REQ", name: r.name, pm: r.pm, responsible, projCode: "" });
  }
  for (const u of calidadUnits(projs)) {
    const responsible = reproceso[u.id]?.responsible;
    if (responsible == null) continue;
    const pm = bpm.get(u.boardId) ?? u.pm;
    const { code: projCode } = splitBoardName(u.boardName);
    rows.push({ id: u.id, source: "Proyecto", name: u.name, pm, responsible, projCode });
  }
  for (const i of iniUnidadesCalidad(ini)) {
    const responsible = reproceso[i.id]?.responsible;
    if (responsible == null) continue;
    rows.push({ id: i.id, source: "Iniciativa", name: i.name, pm: i.pm, responsible, projCode: "" });
  }
  return rows;
}

// Métricas de resumen de un PM para el scoreboard (mismas fórmulas que la tarjeta de PM):
// EVM propio, NPS propio, % de entregas, beneficio HardSaving confirmado y KPI ponderado.
export function calcPmMetrics(
  pm: string, ini: IniItem[], req: ReqItem[], proj: ProjItem[], projBoards: ProjBoard[],
  boardHealthMap: Map<string, BoardHealthData>, calMap: CalMap, npsRecords: NpsRecord[],
  delays: DelayMap = {}, reproceso: DelayMap = {}, weights?: KpiWeights,
  /** Notas mensuales de Metodología VALOR (la vigente del PM es la del mes en curso, ver lib/metodologia.ts). */
  metodologia: MetodologiaMap = {},
  /** Confirmación vía ROI de los PMs de CONFIRMACION_ROI_PM (reemplaza la de Monday). */
  confirmacionRoiPm: Record<string, ConfirmacionRoiPm> = {},
  /** Medición de un CKU: Cumplimiento de Entrega y Calidad de Entregas como el EVM (nota por
   *  fuente ponderada 10/20/70) y, en Cumplimiento, Proyectos solo con su Fase 3 (ver
   *  calcEntregaStatsCku); el Beneficio, contra su propia meta (ver computeBenefitKpiCku).
   *  Hoy solo los Players por CKU. */
  ponderarPorFuente = false,
  /** Meta y Profit de Implementación de un mes, para el CKU que la lleva: la meta se suma a la
   *  meta de su Beneficio y el Profit a su cumplimiento (ver computeBenefitKpiCku). */
  implementacionCku?: { mes: string; meta: number; profit: number },
) {
  // Nota EVM del PM (ver calcPmEvm). Sin iniciativas ese 10% se reparte entre REQ y Proyectos.
  const evmRaw = calcPmEvm(pm, ini, req, projBoards, boardHealthMap, calMap);
  const evmPct = evmRaw !== null ? Math.round(evmRaw * 100) : null;

  const nps = calcNpsFromRecords(npsRecords, pm);

  const pmBoardIdSet = new Set(projBoards.filter((b) => b.pm === pm).map((b) => b.id));
  const entregaArgs = [
    req.filter((r) => r.pm === pm),
    proj.filter((p) => pmBoardIdSet.has(p.boardId)),
    delays,
    ini.filter((i) => i.pm === pm),
  ] as const;
  // Un CKU se mide solo con sus entregables y actividades (en `pm` viene su nombre) — ver entregablesDelCku.
  const { onTime: entOn, late: entLate, total: entTotal, pct: entPct } = ponderarPorFuente
    ? calcEntregaStatsCku(pm, ...entregaArgs)
    : calcEntregaStats(...entregaArgs);

  const pmValueAll = conConfirmacionRoi(calcPmValue(pm, req, proj, projBoards, false), confirmacionRoiPm[pm]);
  const pmValueHard = conConfirmacionRoi(calcPmValue(pm, req, proj, projBoards, true), confirmacionRoiPm[pm]);
  // Un CKU se mide contra su propia meta (ver computeBenefitKpiCku): lo aprobado de sus proyectos y PML
  // HardSaving, y su cumplimiento es lo generado (ROI).
  const beneficioCku = ponderarPorFuente
    ? computeBenefitKpiCku(pmValueHard.aprobacionBenefit, pmValueHard.confirmacionBenefit, weights, implementacionCku)
    : undefined;
  // Beneficio mostrado (scoreboard) = solo Aprobación VPB, igual que la tarjeta de PM.
  const benefit = pmValueHard.aprobacionBenefit;

  const reprocesoArgs = [
    req.filter((r) => r.pm === pm),
    proj.filter((p) => pmBoardIdSet.has(p.boardId)),
    reproceso,
    ini.filter((i) => i.pm === pm),
  ] as const;
  const reprocesoPct = (ponderarPorFuente ? calcReprocesoStatsPonderado(pm, ...reprocesoArgs) : calcReprocesoStats(...reprocesoArgs)).pct;
  const metodologiaPct = metodologiaActual(metodologia, pm);
  const kpi = computeKpi({
    evm: evmRaw, nps: nps.nps,
    benefitAprobado: pmValueHard.aprobacionBenefit, benefitConfirmado: pmValueHard.confirmacionBenefit,
    entregasPct: entPct, reprocesoPct, metodologiaPct, weights, beneficioCku,
  });
  const health = pmHealthStatus(evmRaw);

  return { pm, evmRaw, evmPct, nps, entOn, entLate, entTotal, entPct, benefit, reprocesoPct, metodologiaPct, pmValueAll, pmValueHard, beneficioCku, kpi, kpiPct: Math.round(kpi.score), health };
}
