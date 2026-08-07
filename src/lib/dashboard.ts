// src/lib/dashboard.ts
// Agregados del Control Tower: salud por board y métricas por PM (EVM propio,
// NPS, % de entregas, costo/beneficio y KPI ponderado). Funciones PURAS sobre
// datos ya procesados (ini/req/proj), reutilizables y testeables.

import { calcIniPMHealth } from "@/lib/ini";
import { healthStatusFromIndex, type HealthStatus } from "@/lib/health";
import { calcBoardMetrics, deriveBoardHealth, type BoardHealthData } from "@/lib/proj";
import { REQ_ACTIVE_GRUPOS } from "@/lib/req";
import { calcNpsFromRecords } from "@/lib/nps";
import { computeKpi } from "@/lib/kpi";
import { lateExcused, type DelayMap, type DelayResponsible } from "@/lib/delay";
import type {
  CalMap, IniItem, NpsRecord, ProjBoard, ProjItem, ProjItemBaseline, ProjSubitem, ReqItem,
} from "@/types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Value Gate (BC) firmado: en Monday el nombre varía por board — "Firmado y aprobado"
 *  en la fase Aprobación, "Actualizado y firmado" (sin "aprobado") en Launch. Se acepta
 *  cualquier variante que diga "firmado". */
const isVgSigned = (name: string) => {
  const n = norm(name);
  return n.includes("value gate") && n.includes("firmado");
};

/** El Business Case (Benefit $ / Cost $) se redacta una sola vez, en el primer ítem
 *  de la fase Valuación — los steps de aprobación/gates no traen su propio monto. */
const findBusinessCase = (items: ProjItem[]) =>
  items.find((it) => norm(it.grupo).includes("valuacion") && norm(it.name).includes("kick off project meeting"));

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

/** Validación VPA (Proyecto): step "VPA valida Business Case (Entregable Business Case
 *  validado por VPA)" Done, en la fase "Valuación | Formulación del proyecto".
 *  Beneficio/Costo = los del Business Case (Kick Off Project Meeting). */
function evalValidacion(items: ProjItem[]): { cost: number; benefit: number } | null {
  const step = items.find((it) => norm(it.grupo).includes("valuacion") && norm(it.name).includes("vpa valida business case"));
  if (step?.status !== "Done") return null;
  const bc = findBusinessCase(items);
  return { cost: bc?.cost ?? 0, benefit: bc?.benefit ?? 0 };
}

/** Aprobación VPB (Proyecto): "Plan de beneficios acordados con CFO" Y el Value Gate (BC)
 *  Done en la fase "Aprobación | Value Gate", Y el Value Gate Done también en la fase
 *  "Launch | Desarrollo". Beneficio/Costo = los del Business Case (Kick Off Project Meeting). */
function evalAprobacion(items: ProjItem[]): { cost: number; benefit: number } | null {
  const cfo = items.find((it) => norm(it.grupo).includes("aprobacion") && norm(it.name).includes("plan de beneficios acordados con cfo"));
  const vgAprob = items.find((it) => norm(it.grupo).includes("aprobacion") && isVgSigned(it.name));
  const vgLaunch = items.find((it) => norm(it.grupo).includes("launch") && isVgSigned(it.name));
  if (cfo?.status !== "Done" || vgAprob?.status !== "Done" || vgLaunch?.status !== "Done") return null;
  const bc = findBusinessCase(items);
  return { cost: bc?.cost ?? 0, benefit: bc?.benefit ?? 0 };
}

/** Confirmación VPC (Proyecto): los 3 steps "VPA Recopila datos a 30/60/90 días
 *  (Compara Valor real contra BC)", en la fase "Revisión | Cierre ROI". Cascada:
 *  si un step está en "Working on it" (medición en curso) se usa ESE beneficio;
 *  si ya no hay ninguno en curso (todos los que existen están Done) se usa el más
 *  reciente (90 > 60 > 30). null si no hay ningún step en Working on it ni Done. */
function evalConfirmacion(items: ProjItem[]): { cost: number; benefit: number } | null {
  const step = (needle: string) =>
    items.find((it) => norm(it.grupo).includes("cierre roi") && norm(it.name).includes(needle));
  const d30 = step("recopila datos a 30 dias");
  const d60 = step("recopila datos a 60 dias");
  const d90 = step("recopila datos a 90 dias");
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

/** Estado general de un PM = peor estado entre Iniciativas, REQ y Proyectos. */
export function pmWorstStatus(
  pm: string,
  ini: IniItem[],
  req: ReqItem[],
  projBoards: ProjBoard[],
  boardHealthMap: Map<string, BoardHealthData>,
  calMap: CalMap,
): HealthStatus {
  const iniHealth = calcIniPMHealth(pm, ini, calMap);
  const iniStatus: HealthStatus | null = iniHealth.total > 0
    ? (iniHealth.offTrack > 0 ? "off-track" : iniHealth.inRisk > 0 ? "in-risk" : "on-track")
    : null;

  const reqVemItems = req.filter(
    (r) => r.pm === pm && r.estado !== "CERRADO" && REQ_ACTIVE_GRUPOS.has(r.grupo) && r.vem != null,
  );
  const reqSts = reqVemItems.map((r) => healthStatusFromIndex(r.vem as number));
  const reqStatus: HealthStatus | null = reqSts.includes("off-track") ? "off-track"
    : reqSts.includes("in-risk") ? "in-risk" : reqSts.length ? "on-track" : null;

  const pmBoards = projBoards.filter((b) => b.pm === pm && boardHealthMap.get(b.id)?.healthStatus != null);
  const projStatus: HealthStatus | null = pmBoards.length
    ? (pmBoards.some((b) => boardHealthMap.get(b.id)?.healthStatus === "off-track") ? "off-track"
      : pmBoards.some((b) => boardHealthMap.get(b.id)?.healthStatus === "in-risk") ? "in-risk"
      : "on-track")
    : null;

  const all = [iniStatus, reqStatus, projStatus];
  return all.includes("off-track") ? "off-track" : all.includes("in-risk") ? "in-risk" : "on-track";
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

/** Agrupa los subitems (hitos) de Proyectos por board + PMS ID: el mismo hito se
 *  repite como subitem en varios steps/fases del ciclo de vida (mismo PMS ID en
 *  cada uno). Sin PMS ID no hay con qué deduplicar: el subitem cuenta como su
 *  propio hito de una sola ocurrencia. */
function groupHitos(projs: ProjItem[]): Map<string, ProjSubitem[]> {
  const map = new Map<string, ProjSubitem[]>();
  for (const p of projs) {
    for (const s of p.subitems) {
      const key = s.pmsId ? `${p.boardId}::${s.pmsId}` : `id::${s.id}`;
      const arr = map.get(key);
      if (arr) arr.push(s); else map.set(key, [s]);
    }
  }
  return map;
}

/** Cumplimiento de Entrega: REQ cerrados (1 unidad c/u, on-time o atraso) + hitos
 *  de Proyectos ÚNICOS por PMS ID (1 unidad c/u — pesan igual sin importar cuántos
 *  steps recorrió cada uno). El % de un hito es el de sus propias ocurrencias YA
 *  Done (a tiempo / atrasadas); si aún no tiene ninguna Done evaluable, no cuenta
 *  todavía. Los steps/items de Proyecto que NO son hitos (sin subitems) ya NO
 *  cuentan para esta métrica. Un atraso (de REQ o de una ocurrencia del hito) solo
 *  penaliza si su responsable es "PM"; si se excusa (responsable ≠ PM), esa
 *  ocurrencia se excluye (no cuenta ni a favor ni en contra). */
export function calcEntregaStats(reqs: ReqItem[], projs: ProjItem[], delays: DelayMap): EntregaStats {
  let total = 0;
  let onTimeSum = 0;

  for (const r of reqs) {
    const v = r.onTime.verdict;
    if (v === "on-time") { total++; onTimeSum++; }
    else if (v === "late" && !lateExcused(r.id, delays)) { total++; }
  }

  for (const occurrences of groupHitos(projs).values()) {
    let on = 0, late = 0;
    for (const s of occurrences) {
      if (s.entrega === "on-time") on++;
      else if (s.entrega === "late" && !lateExcused(s.id, delays)) late++;
    }
    const evalTotal = on + late;
    if (evalTotal === 0) continue; // sin ocurrencias evaluables aún (nada Done, o todo excusado)
    total++;
    onTimeSum += on / evalTotal;
  }

  const onTime = Math.round(onTimeSum);
  const late = total - onTime;
  const pct = total ? Math.round((onTimeSum / total) * 100) : null;
  return { total, onTime, late, pct };
}

/** Variante "todos los atrasados" de Cumplimiento de Entrega — SOLO para la
 *  tarjeta principal del Control Tower (Players/KPI siguen excusando por
 *  responsable, ver calcEntregaStats). Cuenta TODO atraso (de REQ o de una
 *  ocurrencia de un hito), sin importar el responsable asignado ni si es "PM". */
export function calcEntregaStatsRaw(reqs: ReqItem[], projs: ProjItem[]): EntregaStats {
  let total = 0;
  let onTimeSum = 0;

  for (const r of reqs) {
    const v = r.onTime.verdict;
    if (v === "on-time") { total++; onTimeSum++; }
    else if (v === "late") { total++; }
  }

  for (const occurrences of groupHitos(projs).values()) {
    let on = 0, late = 0;
    for (const s of occurrences) {
      if (s.entrega === "on-time") on++;
      else if (s.entrega === "late") late++;
    }
    const evalTotal = on + late;
    if (evalTotal === 0) continue;
    total++;
    onTimeSum += on / evalTotal;
  }

  const onTime = Math.round(onTimeSum);
  const late = total - onTime;
  const pct = total ? Math.round((onTimeSum / total) * 100) : null;
  return { total, onTime, late, pct };
}

// ── Reproceso (componente del KPI, peso 20) ──────────────────────────────
/** Clave sintética de atribución de una fase (grupo) de un proyecto.
 *  Debe coincidir con la usada en la UI de Proyectos (cabecera de cada fase). */
export const projPhaseKey = (boardId: string, grupo: string) => `${boardId}::${grupo}`;

/** Fases (board+grupo) COMPLETADAS: todos sus items en status "Done".
 *  Devuelve la clave de atribución de cada fase completada (unidad de reproceso). */
export function completedProjectPhases(projs: ProjItem[]): string[] {
  const groups = new Map<string, ProjItem[]>();
  for (const r of projs) {
    const key = projPhaseKey(r.boardId, r.grupo);
    const arr = groups.get(key);
    if (arr) arr.push(r); else groups.set(key, [r]);
  }
  const done: string[] = [];
  for (const [key, items] of groups) {
    if (items.every((r) => r.status === "Done")) done.push(key);
  }
  return done;
}

export interface ReprocesoStats { total: number; limpias: number; conReproceso: number; pct: number | null; }

/** Desglose de "Calidad de Entregas" (unidades limpias vs. con reproceso). Las unidades
 *  en scope son los REQ CERRADOS + las fases de proyecto COMPLETADAS (todos sus items Done).
 *  Misma regla que entregas: cada unidad penaliza (cuenta como reproceso) por
 *  defecto —incluso sin responsable asignado— y también si es "PM"; solo se
 *  EXCUSA si se le asignó un responsable distinto de PM (incluida "Sin reproceso"). */
export function calcReprocesoStats(reqs: ReqItem[], projs: ProjItem[], reproceso: DelayMap): ReprocesoStats {
  const units = [
    ...reqs.filter((r) => r.estado === "CERRADO").map((r) => r.id),
    ...completedProjectPhases(projs),
  ];
  const total = units.length;
  const conReproceso = units.filter((id) => !lateExcused(id, reproceso)).length;
  const limpias = total - conReproceso;
  const pct = total ? Math.round((limpias / total) * 100) : null;
  return { total, limpias, conReproceso, pct };
}

/** % de unidades "limpias" de reproceso (ideal 100%). null si no hay unidades en scope
 *  (→ componente pendiente). Ver calcReprocesoStats para el desglose completo. */
export function calcReprocesoPct(reqs: ReqItem[], projs: ProjItem[], reproceso: DelayMap): number | null {
  return calcReprocesoStats(reqs, projs, reproceso).pct;
}

/** Variante "real, sin filtros" de Calidad de Entregas — SOLO para la tarjeta
 *  principal del Control Tower (no para Players/KPI, que siguen usando
 *  calcReprocesoStats). Únicamente cuenta unidades que YA tienen un responsable
 *  seleccionado en el dropdown de Reproceso: "Sin reproceso" → limpia; cualquier
 *  otra selección (incluido "PM") → con reproceso. Las unidades sin selección se
 *  ignoran por completo (no cuentan ni como limpias ni como con reproceso). */
export function calcReprocesoStatsRaw(reqs: ReqItem[], projs: ProjItem[], reproceso: DelayMap): ReprocesoStats {
  const units = [
    ...reqs.filter((r) => r.estado === "CERRADO").map((r) => r.id),
    ...completedProjectPhases(projs),
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

export interface EntregaRow {
  id: string;                        // r.id / p.id / s.id — atribución "delay"
  source: "REQ" | "Proyecto";
  tipo: "PM" | "PML";                // Proyecto → "PM"; REQ → "PML"
  name: string;                      // nombre completo (retrocompat / búsqueda)
  context: string;                   // REQ: grupo. Proyecto: "board · grupo".
  fase: string;                      // REQ/Proyecto: grupo (fase)
  stepPadre: string;                 // item padre de un subitem de proyecto; "" si no aplica
  hito: string;                      // nombre del hito / step / REQ
  pm: string;
  deadline: Date | null;
  verdict: "on-time" | "late";
}

/** Filas de "Cumplimiento de Entrega": una por cada REQ y cada SUBITEM (hito) de
 *  Proyecto con veredicto on-time/late (se excluyen los "n/a"/sin evaluar). Mismo
 *  universo e IDs que puntúa el KPI (calcEntregaStats: REQ por r.id + subitems por
 *  s.id, agrupados por PMS ID solo para el denominador). Los ITEMS padre de Proyecto
 *  NO se incluyen: el KPI de Entrega solo puntúa REQ + hitos, nunca el item padre,
 *  así que una fila de item sería "fantasma" (asignarle responsable no afecta nada).
 *  El tipo distingue Proyecto ("PM") de REQ ("PML"); para los subitems, el step
 *  padre es el item del proyecto y el hito es el subitem. */
export function buildEntregaRows(reqs: ReqItem[], projs: ProjItem[], projBoards: ProjBoard[]): EntregaRow[] {
  const bpm = boardPmMap(projBoards);
  const rows: EntregaRow[] = [];
  for (const r of reqs) {
    if (r.onTime.verdict !== "on-time" && r.onTime.verdict !== "late") continue;
    rows.push({ id: r.id, source: "REQ", tipo: "PML", name: r.name, context: r.grupo, fase: r.grupo, stepPadre: "", hito: r.name, pm: r.pm, deadline: r.deadline, verdict: r.onTime.verdict });
  }
  for (const p of projs) {
    const pm = bpm.get(p.boardId) ?? p.pm;
    const context = `${p.boardName} · ${p.grupo}`;
    for (const s of p.subitems) {
      if (s.entrega !== "on-time" && s.entrega !== "late") continue;
      rows.push({ id: s.id, source: "Proyecto", tipo: "PM", name: `${p.name} · ${s.name}`, context, fase: p.grupo, stepPadre: p.name, hito: s.name, pm, deadline: s.deadline, verdict: s.entrega });
    }
  }
  return rows;
}

export interface LateResponsibleRow {
  id: string;                        // r.id (REQ) / boardId::pmsId (hito de Proyecto)
  source: "REQ" | "Proyecto";
  name: string;
  pm: string;
  responsible: DelayResponsible | null; // null = sin asignar (de la ocurrencia atrasada más reciente, si es hito)
  onTime?: number;                   // hito: ocurrencias a tiempo entre las ya Done
  doneTotal?: number;                // hito: total de ocurrencias ya Done (on-time + atrasadas sin excusar)
}

/** Filas de atraso para el detalle de "Cumplimiento de Entrega": REQ (1 fila c/u,
 *  igual que antes) + hitos de Proyectos ÚNICOS por PMS ID (1 fila c/u — mismo
 *  universo/agrupación que calcEntregaStats, no una fila por cada ocurrencia
 *  repetida). Solo aparecen los hitos con al menos una ocurrencia atrasada SIN
 *  excusar; el responsable mostrado es el de esa ocurrencia (la más reciente, si
 *  hay varias). Solo "PM" o sin asignar penaliza el % (ver lateExcused); el resto
 *  excusa el atraso. */
export function buildLateResponsibleRows(reqs: ReqItem[], projs: ProjItem[], projBoards: ProjBoard[], delays: DelayMap): LateResponsibleRow[] {
  const bpm = boardPmMap(projBoards);
  const rows: LateResponsibleRow[] = [];
  for (const r of reqs) {
    if (r.onTime.verdict !== "late") continue;
    rows.push({ id: r.id, source: "REQ", name: r.name, pm: r.pm, responsible: delays[r.id]?.responsible ?? null });
  }

  const hitos = new Map<string, { pm: string; subs: ProjSubitem[] }>();
  for (const p of projs) {
    const pm = bpm.get(p.boardId) ?? p.pm;
    for (const s of p.subitems) {
      const key = s.pmsId ? `${p.boardId}::${s.pmsId}` : `id::${s.id}`;
      const g = hitos.get(key);
      if (g) g.subs.push(s); else hitos.set(key, { pm, subs: [s] });
    }
  }
  for (const [key, { pm, subs }] of hitos) {
    let onTime = 0, late = 0;
    let responsible: DelayResponsible | null = null;
    for (const s of subs) {
      if (s.entrega === "on-time") onTime++;
      else if (s.entrega === "late" && !lateExcused(s.id, delays)) { late++; responsible = delays[s.id]?.responsible ?? null; }
    }
    if (late === 0) continue; // sin ocurrencias atrasadas sin excusar → no aparece en el detalle
    rows.push({ id: key, source: "Proyecto", name: subs[0].name, pm, responsible, onTime, doneTotal: onTime + late });
  }
  return rows;
}

/** Variante "todos los atrasados" de buildLateResponsibleRows — SOLO para el
 *  detalle de la tarjeta principal del Control Tower (Players/KPI siguen
 *  excusando por responsable, ver buildLateResponsibleRows). Lista TODO
 *  REQ/hito con al menos una ocurrencia atrasada, sin importar el responsable
 *  asignado (se muestra igual, es solo informativo aquí). */
export function buildLateResponsibleRowsRaw(reqs: ReqItem[], projs: ProjItem[], projBoards: ProjBoard[], delays: DelayMap): LateResponsibleRow[] {
  const bpm = boardPmMap(projBoards);
  const rows: LateResponsibleRow[] = [];
  for (const r of reqs) {
    if (r.onTime.verdict !== "late") continue;
    rows.push({ id: r.id, source: "REQ", name: r.name, pm: r.pm, responsible: delays[r.id]?.responsible ?? null });
  }

  const hitos = new Map<string, { pm: string; subs: ProjSubitem[] }>();
  for (const p of projs) {
    const pm = bpm.get(p.boardId) ?? p.pm;
    for (const s of p.subitems) {
      const key = s.pmsId ? `${p.boardId}::${s.pmsId}` : `id::${s.id}`;
      const g = hitos.get(key);
      if (g) g.subs.push(s); else hitos.set(key, { pm, subs: [s] });
    }
  }
  for (const [key, { pm, subs }] of hitos) {
    let onTime = 0, late = 0;
    let responsible: DelayResponsible | null = null;
    for (const s of subs) {
      if (s.entrega === "on-time") onTime++;
      else if (s.entrega === "late") { late++; responsible = delays[s.id]?.responsible ?? responsible; }
    }
    if (late === 0) continue;
    rows.push({ id: key, source: "Proyecto", name: subs[0].name, pm, responsible, onTime, doneTotal: onTime + late });
  }
  return rows;
}

export interface ReprocesoRow {
  id: string;                        // r.id / projPhaseKey(boardId, grupo) — atribución "reproceso"
  source: "REQ" | "Proyecto";
  name: string;
  pm: string;
  verdict: "clean" | "reproceso";
}

/** Filas de "Calidad de Entregas": una por cada REQ CERRADO y cada fase de
 *  Proyecto COMPLETADA (misma unidad de reproceso que calcReprocesoStats). */
export function buildReprocesoRows(reqs: ReqItem[], projs: ProjItem[], projBoards: ProjBoard[], reproceso: DelayMap): ReprocesoRow[] {
  const bpm = boardPmMap(projBoards);
  const rows: ReprocesoRow[] = [];
  for (const r of reqs) {
    if (r.estado !== "CERRADO") continue;
    rows.push({ id: r.id, source: "REQ", name: r.name, pm: r.pm, verdict: lateExcused(r.id, reproceso) ? "clean" : "reproceso" });
  }
  const groups = new Map<string, ProjItem[]>();
  for (const p of projs) {
    const key = projPhaseKey(p.boardId, p.grupo);
    const arr = groups.get(key);
    if (arr) arr.push(p); else groups.set(key, [p]);
  }
  for (const [key, items] of groups) {
    if (!items.every((it) => it.status === "Done")) continue;
    const first = items[0];
    const pm = bpm.get(first.boardId) ?? first.pm;
    rows.push({ id: key, source: "Proyecto", name: `${first.boardName} · ${first.grupo}`, pm, verdict: lateExcused(key, reproceso) ? "clean" : "reproceso" });
  }
  return rows;
}

export interface ReprocesoRawRow {
  id: string;                        // r.id / projPhaseKey(boardId, grupo) — atribución "reproceso"
  source: "REQ" | "Proyecto";
  name: string;
  pm: string;
  responsible: DelayResponsible;     // opción elegida en el dropdown (incluye "Sin reproceso")
}

/** Filas RAW de "Calidad de Entregas" — mismo universo que calcReprocesoStatsRaw:
 *  solo unidades con responsable YA seleccionado en el dropdown de Reproceso, con
 *  la opción elegida tal cual (incluye "Sin reproceso"). Usada para el detalle de
 *  la tarjeta principal del Control Tower (desglose por opción + nombre/id). */
export function buildReprocesoRowsRaw(reqs: ReqItem[], projs: ProjItem[], projBoards: ProjBoard[], reproceso: DelayMap): ReprocesoRawRow[] {
  const bpm = boardPmMap(projBoards);
  const rows: ReprocesoRawRow[] = [];
  for (const r of reqs) {
    if (r.estado !== "CERRADO") continue;
    const responsible = reproceso[r.id]?.responsible;
    if (responsible == null) continue;
    rows.push({ id: r.id, source: "REQ", name: r.name, pm: r.pm, responsible });
  }
  const groups = new Map<string, ProjItem[]>();
  for (const p of projs) {
    const key = projPhaseKey(p.boardId, p.grupo);
    const arr = groups.get(key);
    if (arr) arr.push(p); else groups.set(key, [p]);
  }
  for (const [key, items] of groups) {
    if (!items.every((it) => it.status === "Done")) continue;
    const responsible = reproceso[key]?.responsible;
    if (responsible == null) continue;
    const first = items[0];
    const pm = bpm.get(first.boardId) ?? first.pm;
    rows.push({ id: key, source: "Proyecto", name: `${first.boardName} · ${first.grupo}`, pm, responsible });
  }
  return rows;
}

// Métricas de resumen de un PM para el scoreboard (mismas fórmulas que la tarjeta de PM):
// EVM propio, NPS propio, % de entregas, beneficio HardSaving confirmado y KPI ponderado.
export function calcPmMetrics(
  pm: string, ini: IniItem[], req: ReqItem[], proj: ProjItem[], projBoards: ProjBoard[],
  boardHealthMap: Map<string, BoardHealthData>, calMap: CalMap, npsRecords: NpsRecord[],
  delays: DelayMap = {}, reproceso: DelayMap = {},
) {
  const iniHealth = calcIniPMHealth(pm, ini, calMap);

  const reqVemItems = req.filter((r) => r.pm === pm && r.estado !== "CERRADO" && REQ_ACTIVE_GRUPOS.has(r.grupo) && r.vem != null);
  const reqAvgVem = reqVemItems.length ? reqVemItems.reduce((s, r) => s + (r.vem as number), 0) / reqVemItems.length : null;

  const pmProjBoards = projBoards.filter((b) => b.pm === pm && boardHealthMap.get(b.id)?.healthStatus !== null);
  const pmProjHIs = pmProjBoards.map((b) => boardHealthMap.get(b.id)?.healthIndex).filter((v): v is number => v != null);
  const pmProjAvgHI = pmProjHIs.length > 0 ? pmProjHIs.reduce((a, b) => a + b, 0) / pmProjHIs.length : null;

  const evmParts = ([iniHealth.index, reqAvgVem, pmProjAvgHI] as (number | null)[]).filter((v): v is number => v != null);
  const evmRaw = evmParts.length > 0 ? evmParts.reduce((a, b) => a + b, 0) / evmParts.length : null;
  const evmPct = evmRaw !== null ? Math.round(evmRaw * 100) : null;

  const nps = calcNpsFromRecords(npsRecords, pm);

  const pmBoardIdSet = new Set(projBoards.filter((b) => b.pm === pm).map((b) => b.id));
  const { onTime: entOn, late: entLate, total: entTotal, pct: entPct } = calcEntregaStats(
    req.filter((r) => r.pm === pm),
    proj.filter((p) => pmBoardIdSet.has(p.boardId)),
    delays,
  );

  const pmValueAll = calcPmValue(pm, req, proj, projBoards, false);
  const pmValueHard = calcPmValue(pm, req, proj, projBoards, true);
  // Beneficio mostrado (scoreboard) = solo Aprobación VPB, igual que la tarjeta de PM.
  const benefit = pmValueHard.aprobacionBenefit;

  const reprocesoPct = calcReprocesoPct(
    req.filter((r) => r.pm === pm),
    proj.filter((p) => pmBoardIdSet.has(p.boardId)),
    reproceso,
  );
  const kpi = computeKpi({
    evm: evmRaw, nps: nps.nps,
    benefitAprobado: pmValueHard.aprobacionBenefit, benefitConfirmado: pmValueHard.confirmacionBenefit,
    entregasPct: entPct, reprocesoPct,
  });
  const health = pmWorstStatus(pm, ini, req, projBoards, boardHealthMap, calMap);

  return { pm, evmRaw, evmPct, nps, entOn, entLate, entTotal, entPct, benefit, reprocesoPct, pmValueAll, pmValueHard, kpi, kpiPct: Math.round(kpi.score), health };
}
