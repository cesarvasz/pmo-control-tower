// src/lib/projectMetrics.ts
// ─────────────────────────────────────────────────────────────────────
// MEDICIÓN ÚNICA DE UN PROYECTO — fuente de verdad de TODOS los reportes.
//
// Un board = una medición. Todo lo que muestre cualquier pantalla sobre un
// proyecto (Status Card, /proyectos, Resumen Ejecutivo, Control Tower,
// Desarrollo Timeliness, el reporte explicativo) debe salir de acá y NO
// recalcularse por su cuenta. Ese es el punto del módulo: antes el SPI se
// calculaba distinto en proj.ts y en statusReportData.ts, y el CPI tenía tres
// fórmulas distintas según la escala. Acá hay una sola de cada una.
//
// Módulo PURO (cliente + servidor): sin React, sin red, sin Firestore.
//
// ── CONTRATO (definido por negocio, 2026-09-23) ──────────────────────
//
// UNIDAD DE MEDICIÓN
//   Fases 1,2,4,5 ........ el ITEM
//   Fase 3, plantilla vieja ... los SUBITEMS del step "Desarrollo por
//                               iteraciones (Hitos) / Entrega CKU"
//   Fase 3, plantilla nueva ... los ITEMS de la fase; su atraso lo derivan de
//                               SUS SUBITEMS (ver unidadAtrasada)
//
// ATRASO DE UNA UNIDAD
//   entregada (Done) ..... atrasada ⟺ Actual End > Limit Date
//   no entregada ......... atrasada ⟺ Status = Stuck
//                                   O (hoy > Limit Date y Status ≠ Done)
//
// EVM
//   SPI   = avance real / avance plan        (CONTEO de unidades, sin dinero)
//   CPI   = EV / PV                          (DINERO, baseline de los items)
//   Scope = 0 si hay algún atraso · 1 si no
//   EVM   = (SPI + CPI + Scope) / 3
//
// CALIDAD DE ENTREGAS (solo fase 3) — nota por unidad:
//   salió a tiempo ......................................... 100
//   sin entregar y aún dentro del Limit Date del item ....... 50  (recuperable)
//   tarde / vencida, responsable ≠ PM ....................... 50
//   tarde / vencida, responsable = PM o sin asignar .......... 0
//   pct = PROMEDIO de las notas
//
// CUMPLIMIENTO DE ENTREGA
//   Fases 1,2,4,5 ... la unidad es la FASE (tarde si ≥1 item atrasado sin excusar)
//   Fase 3 .......... la unidad es el ENTREGABLE
// ─────────────────────────────────────────────────────────────────────

import { addBusinessDays, businessDays, unionBusinessDays, today } from "@/lib/business";
import {
  isFase3, isFase4, isCierreVmoStep, isDesarrolloPorIteracionesStep, projStageAmounts,
} from "@/lib/dashboard";
import { valorStageOf } from "@/lib/valorStepper";
import { splitBoardName, type BoardHealthData } from "@/lib/proj";
import { healthStatusFromIndex, type HealthStatus } from "@/lib/health";
import { lateExcused, atrasoReparto, type DelayMap } from "@/lib/delay";
import { calcNpsFromRecords } from "@/lib/nps";
import { buildDevTimelines, type DevTimelineRow } from "@/lib/devTimeline";
import type {
  AtrasoDetalle, AtrasoReparto, NpsData, NpsRecord, ProjBoard, ProjItem, ProjItemBaseline,
} from "@/types";

export type Plantilla = "vieja" | "nueva";

const isStuck = (status: string) => (status ?? "").trim().toLowerCase() === "stuck";
const isDone = (status: string) => status === "Done";

/** Step del board desde el que se lanza la encuesta de NPS. */
const NPS_STEP_RE = /encuesta para nps/i;

// ─────────────────────────────────────────────────────────────────────
// PLANTILLA
// ─────────────────────────────────────────────────────────────────────
/** Plantilla del board: VIEJA si su fase 3 tiene el step "Desarrollo por
 *  iteraciones…" (sus hitos son los entregables reales); NUEVA si no (cada
 *  item de la fase 3 es un entregable). Único punto de la app que lo decide
 *  para la medición. */
export function detectPlantilla(items: ProjItem[]): Plantilla {
  return items.some((it) => isFase3(it.grupo) && isDesarrolloPorIteracionesStep(it.name))
    ? "vieja"
    : "nueva";
}

// ─────────────────────────────────────────────────────────────────────
// UNIDADES
// ─────────────────────────────────────────────────────────────────────
/** Una unidad de medición ya resuelta, con su veredicto de atraso. */
export interface MetricUnit {
  id: string;                 // id de Monday — clave de atribución (delay / reproceso)
  name: string;
  kind: "item" | "hito";
  fase: string;               // grupo de Monday
  band: number;               // 0..4 (V A L O R); -1 si el grupo es atípico
  esFase3: boolean;
  status: string;
  limitDate: Date | null;
  actualEnd: Date | null;
  entregada: boolean;         // status === "Done"
  atrasada: boolean;
  stuck: boolean;
  /** Días hábiles de atraso: vencidos hasta hoy si sigue abierta, o de retraso
   *  en la entrega si ya cerró tarde. 0 si no está atrasada. */
  diasAtraso: number;
  /** Item que gobierna la ventana de recuperación de Calidad. Para un hito de
   *  plantilla vieja es su step padre; para un item es él mismo. */
  ownerId: string;
  ownerName: string;
  ownerLimitDate: Date | null;
  /** Dueño operativo (columna "Responsible"), NO el responsable atribuido. */
  responsible: string;
  /** Costo del item al que pertenece la unidad (0 en hitos: el dinero vive en el item). */
  cost: number;
}

/** ¿Está atrasada una unidad suelta? Regla única del contrato. */
function unidadAtrasada(
  status: string, limitDate: Date | null, actualEnd: Date | null, hoy: Date,
): boolean {
  if (isDone(status)) {
    return actualEnd !== null && limitDate !== null && actualEnd.getTime() > limitDate.getTime();
  }
  if (isStuck(status)) return true;
  return limitDate !== null && hoy.getTime() > limitDate.getTime();
}

function diasDeAtraso(
  status: string, limitDate: Date | null, actualEnd: Date | null, hoy: Date,
): number {
  if (!limitDate) return 0;
  if (isDone(status)) {
    return actualEnd && actualEnd > limitDate ? businessDays(limitDate, actualEnd, true) : 0;
  }
  return hoy > limitDate ? businessDays(limitDate, hoy, true) : 0;
}

/** Resuelve las unidades de medición del board según su plantilla. */
export function buildUnits(items: ProjItem[], plantilla: Plantilla, hoy: Date): MetricUnit[] {
  const units: MetricUnit[] = [];

  const pushItem = (it: ProjItem, atrasadaOverride?: boolean, diasOverride?: number) => {
    const atrasada = atrasadaOverride ?? unidadAtrasada(it.status, it.deadline, it.endDate, hoy);
    units.push({
      id: it.id, name: it.name, kind: "item", fase: it.grupo, band: valorStageOf(it.grupo),
      esFase3: isFase3(it.grupo), status: it.status,
      limitDate: it.deadline, actualEnd: it.endDate,
      entregada: isDone(it.status), atrasada,
      stuck: isStuck(it.status) || (diasOverride !== undefined && it.subitems.some((s) => isStuck(s.status))),
      diasAtraso: diasOverride ?? diasDeAtraso(it.status, it.deadline, it.endDate, hoy),
      ownerId: it.id, ownerName: it.name, ownerLimitDate: it.deadline,
      responsible: it.responsible, cost: it.cost,
    });
  };

  for (const it of items) {
    if (!isFase3(it.grupo)) {
      // Fases 1, 2, 4 y 5 → la unidad es el item.
      pushItem(it);
      continue;
    }

    if (plantilla === "vieja") {
      // Solo los hitos del step "Desarrollo por iteraciones…" son entregables;
      // los otros checkpoints de la fase son controles redundantes sobre ESOS
      // mismos hitos y no se miden por separado.
      if (!isDesarrolloPorIteracionesStep(it.name)) continue;
      for (const s of it.subitems) {
        units.push({
          id: s.id, name: s.name, kind: "hito", fase: it.grupo, band: valorStageOf(it.grupo),
          esFase3: true, status: s.status,
          limitDate: s.deadline, actualEnd: s.actualEnd,
          entregada: isDone(s.status),
          atrasada: unidadAtrasada(s.status, s.deadline, s.actualEnd, hoy),
          stuck: isStuck(s.status),
          diasAtraso: diasDeAtraso(s.status, s.deadline, s.actualEnd, hoy),
          ownerId: it.id, ownerName: it.name, ownerLimitDate: it.deadline,
          responsible: s.responsible || it.responsible, cost: 0,
        });
      }
      continue;
    }

    // Plantilla nueva → la unidad es el item, pero su atraso lo deciden SUS
    // SUBITEMS (el item es el entregable; los subitems son su pipeline).
    if (it.subitems.length === 0) { pushItem(it); continue; }
    const subsAtrasados = it.subitems.filter((s) => unidadAtrasada(s.status, s.deadline, s.actualEnd, hoy));
    const dias = subsAtrasados.reduce(
      (max, s) => Math.max(max, diasDeAtraso(s.status, s.deadline, s.actualEnd, hoy)), 0,
    );
    pushItem(it, subsAtrasados.length > 0, dias);
  }

  return units;
}

// ─────────────────────────────────────────────────────────────────────
// EVM
// ─────────────────────────────────────────────────────────────────────
/** Un ITEM que participó (o no) en el cálculo de EV/PV del CPI — para poder
 *  mostrar en el reporte exactamente qué items componen esos dos montos. */
export interface EvmCostRow {
  id: string;
  name: string;
  fase: string;
  status: string;
  limitDate: Date | null;
  baseCost: number;   // baseline usado (o el Cost $ actual si aún no hay baseline)
  enEv: boolean;       // entró en EV (está Done)
  enPv: boolean;       // entró en PV (Done o vencido)
}

export interface EvmResult {
  /** avance real / avance plan — CONTEO de unidades. */
  spi: number | null;
  /** EV / PV — DINERO (baseline de los items). */
  cpi: number | null;
  /** 0 si hay algún atraso, 1 si no. */
  scope: number | null;
  evm: number | null;
  estado: HealthStatus | null;
  ev: number;
  pv: number;
  avanceReal: number;   // 0..1
  avancePlan: number;   // 0..1
  unidadesTotal: number;
  unidadesEntregadas: number;
  unidadesQueDeberian: number;
  /** Todos los items del board con su costo baseline y si entraron en EV/PV — detalle del CPI. */
  costItems: EvmCostRow[];
}

export function calcEvm(
  units: MetricUnit[], items: ProjItem[], baselines: Record<string, ProjItemBaseline>, hoy: Date,
): EvmResult {
  // ── SPI: conteo de unidades ──
  const total = units.length;
  const entregadas = units.filter((u) => u.entregada).length;
  // "lo que debería llevar": entregadas + las que ya vencieron su Limit Date.
  const deberian = units.filter(
    (u) => u.entregada || (u.limitDate !== null && hoy.getTime() > u.limitDate.getTime()),
  ).length;
  const avanceReal = total > 0 ? entregadas / total : 0;
  const avancePlan = total > 0 ? deberian / total : 0;
  const spi = avancePlan > 0 ? Math.min(1, avanceReal / avancePlan) : null;

  // ── CPI: dinero, solo ITEMS (el costo vive en el item, nunca en el hito) ──
  // EV = baseline de lo entregado · PV = baseline de lo que ya debería estarlo.
  // Un item entregado cuenta SIEMPRE en PV (si no, terminar antes daría CPI > 1).
  let ev = 0, pv = 0;
  const costItems: EvmCostRow[] = [];
  for (const it of items) {
    const baseCost = baselines[it.id]?.cost ?? it.cost;
    const done = isDone(it.status);
    const vencido = it.deadline !== null && hoy.getTime() > it.deadline.getTime();
    const enEv = done;
    const enPv = done || vencido;
    if (enEv) ev += baseCost;
    if (enPv) pv += baseCost;
    costItems.push({ id: it.id, name: it.name, fase: it.grupo, status: it.status, limitDate: it.deadline, baseCost, enEv, enPv });
  }
  const cpi = pv > 0 ? ev / pv : null;

  // ── Scope ──
  const scope = total > 0 ? (units.some((u) => u.atrasada) ? 0 : 1) : null;

  const evm = spi !== null && cpi !== null && scope !== null ? (spi + cpi + scope) / 3 : null;

  return {
    spi, cpi, scope, evm, estado: healthStatusFromIndex(evm),
    ev, pv, avanceReal, avancePlan,
    unidadesTotal: total, unidadesEntregadas: entregadas, unidadesQueDeberian: deberian,
    costItems,
  };
}

// ─────────────────────────────────────────────────────────────────────
// CALIDAD DE ENTREGAS (solo fase 3)
// ─────────────────────────────────────────────────────────────────────
export interface CalidadRow {
  id: string;
  name: string;
  nota: 0 | 50 | 100;
  motivo: string;              // por qué esa nota, en texto legible
  entregada: boolean;
  atrasada: boolean;
  recuperable: boolean;        // aún dentro del Limit Date del item
  responsable: string | null;  // atribución de reproceso (propia o heredada)
  /** true = el responsable no es de esta unidad, se heredó del step padre.
   *  Pasa en plantilla vieja: las atribuciones existentes se hicieron cuando la
   *  unidad de Calidad era el STEP "Desarrollo por iteraciones", no sus hitos. */
  heredada: boolean;
}

export interface CalidadResult { unidades: CalidadRow[]; pct: number | null; total: number }

/** Responsable de reproceso de una unidad: el suyo, o —si no tiene— el del step
 *  padre. La herencia recupera las calificaciones hechas con el modelo anterior
 *  (una por step) para los hitos que hoy son la unidad de medición. */
function responsableDeReproceso(u: MetricUnit, reproceso: DelayMap): { responsable: string | null; heredada: boolean } {
  const propio = reproceso[u.id]?.responsible;
  if (propio != null) return { responsable: propio, heredada: false };
  if (u.ownerId !== u.id) {
    const padre = reproceso[u.ownerId]?.responsible;
    if (padre != null) return { responsable: padre, heredada: true };
  }
  return { responsable: null, heredada: false };
}

export function calcCalidad(units: MetricUnit[], reproceso: DelayMap, hoy: Date): CalidadResult {
  const scope = units.filter((u) => u.esFase3);
  const unidades: CalidadRow[] = scope.map((u) => {
    const { responsable, heredada } = responsableDeReproceso(u, reproceso);
    const suf = heredada ? " · heredado del step" : "";
    // 1) Salió a tiempo → 100.
    if (u.entregada && !u.atrasada) {
      return { id: u.id, name: u.name, nota: 100, motivo: "Entregada a tiempo", entregada: true, atrasada: false, recuperable: false, responsable, heredada };
    }
    // 2) Sin entregar y aún dentro del Limit Date del item → 50 provisional.
    const recuperable = !u.entregada
      && u.ownerLimitDate !== null
      && hoy.getTime() <= u.ownerLimitDate.getTime();
    if (recuperable) {
      return { id: u.id, name: u.name, nota: 50, motivo: "Aún dentro del plazo del item — puede recuperarse", entregada: false, atrasada: u.atrasada, recuperable: true, responsable, heredada };
    }
    // 3) Tarde o vencida → depende del responsable del reproceso (propio o heredado).
    const excusada = responsable != null && responsable !== "PM";
    return {
      id: u.id, name: u.name, nota: excusada ? 50 : 0,
      motivo: excusada
        ? `Atraso atribuido a ${responsable} (no PM)${suf}`
        : responsable === "PM" ? `Atraso atribuido al PM${suf}` : "Atraso sin responsable asignado",
      entregada: u.entregada, atrasada: u.atrasada, recuperable: false, responsable, heredada,
    };
  });

  const pct = unidades.length
    ? Math.round(unidades.reduce((s, r) => s + r.nota, 0) / unidades.length)
    : null;
  return { unidades, pct, total: unidades.length };
}

// ─────────────────────────────────────────────────────────────────────
// CUMPLIMIENTO DE ENTREGA
// ─────────────────────────────────────────────────────────────────────
export interface CumplimientoRow {
  id: string;            // clave de atribución: fase (boardId::grupo) o id del entregable
  label: string;
  tipo: "fase" | "entregable";
  onTime: boolean;
  atrasados: { id: string; name: string }[];
  responsable: string | null;
}

export interface CumplimientoResult {
  filas: CumplimientoRow[];
  onTime: number; late: number; total: number; pct: number | null;
}

/** Clave de atribución de una fase — misma forma que usa hoy `projPhaseKey`. */
export const faseKey = (boardId: string, grupo: string) => `${boardId}::${grupo}`;

export function calcCumplimiento(
  units: MetricUnit[], boardId: string, delays: DelayMap,
): CumplimientoResult {
  const filas: CumplimientoRow[] = [];

  // Fases 1, 2, 4 y 5 → una unidad por FASE.
  const porFase = new Map<string, MetricUnit[]>();
  for (const u of units) {
    if (u.esFase3) continue;
    const arr = porFase.get(u.fase);
    if (arr) arr.push(u); else porFase.set(u.fase, [u]);
  }
  for (const [fase, list] of porFase) {
    const key = faseKey(boardId, fase);
    const atrasados = list.filter((u) => u.atrasada);
    const onTime = atrasados.length === 0 || lateExcused(key, delays);
    filas.push({
      id: key, label: fase, tipo: "fase", onTime,
      atrasados: atrasados.map((u) => ({ id: u.id, name: u.name })),
      responsable: delays[key]?.responsible ?? null,
    });
  }

  // Fase 3 → una unidad por ENTREGABLE.
  for (const u of units) {
    if (!u.esFase3) continue;
    const onTime = !u.atrasada || lateExcused(u.id, delays);
    filas.push({
      id: u.id, label: u.name, tipo: "entregable", onTime,
      atrasados: u.atrasada ? [{ id: u.id, name: u.name }] : [],
      responsable: delays[u.id]?.responsible ?? null,
    });
  }

  const onTime = filas.filter((f) => f.onTime).length;
  const total = filas.length;
  return { filas, onTime, late: total - onTime, total, pct: total ? Math.round((onTime / total) * 100) : null };
}

// ─────────────────────────────────────────────────────────────────────
// ATRASOS (tabla del Status Card)
// ─────────────────────────────────────────────────────────────────────
export interface AtrasoRow {
  id: string;
  name: string;
  fase: string;
  limitDate: Date | null;
  diasAtraso: number;
  stuck: boolean;
  acargo: string;                 // dueño operativo
  reparto: AtrasoReparto[];       // reparto de días por rol
  responsableDominante: string;   // el rol con más días
  motivo: string;
}

export function calcAtrasos(
  units: MetricUnit[], atrasoDetalles: Record<string, AtrasoDetalle> | undefined,
): AtrasoRow[] {
  return units
    .filter((u) => u.atrasada)
    .map((u) => {
      const det = atrasoDetalles?.[u.id];
      const reparto = atrasoReparto(det, u.diasAtraso);
      const dom = reparto.reduce((best, r) => (r.dias > best.dias ? r : best), reparto[0]);
      return {
        id: u.id, name: u.name, fase: u.fase, limitDate: u.limitDate,
        diasAtraso: u.diasAtraso, stuck: u.stuck,
        acargo: u.responsible || "—",
        reparto, responsableDominante: dom?.resp ?? "Sin asignar",
        motivo: det?.motivo || "",
      };
    })
    .sort((a, b) => b.diasAtraso - a.diasAtraso);
}

/** % de los días de atraso atribuibles a cada rol (ponderado por días). */
export function calcResponsabilidad(atrasos: AtrasoRow[]): { label: string; pct: number }[] {
  const dias: Record<string, number> = {};
  let totalDias = 0;
  for (const a of atrasos) {
    for (const r of a.reparto) { dias[r.resp] = (dias[r.resp] ?? 0) + r.dias; totalDias += r.dias; }
  }
  if (totalDias === 0) return [];
  return Object.entries(dias)
    .map(([label, d]) => ({ label, pct: Math.round((d / totalDias) * 100) }))
    .sort((a, b) => b.pct - a.pct || a.label.localeCompare(b.label));
}

// ─────────────────────────────────────────────────────────────────────
// FECHAS DE CIERRE
// ─────────────────────────────────────────────────────────────────────
export interface FechasResult {
  cierrePlan: Date | null;
  cierreEstimado: Date | null;
  /** Días hábiles de atraso ACTIVO hoy: unión de los períodos [Limit Date, hoy]
   *  de las unidades abiertas y vencidas (no la suma — dos atrasos en paralelo
   *  comparten días). */
  atrasoActualDias: number;
  slipVsPlan: number;
}

export function calcFechas(units: MetricUnit[], items: ProjItem[], hoy: Date): FechasResult {
  const abiertosVencidos = units.filter((u) => !u.entregada && u.atrasada && u.limitDate !== null);
  const atrasoActualDias = unionBusinessDays(
    abiertosVencidos.map((u) => ({ start: u.limitDate as Date, end: hoy })), true,
  );

  // Cierre plan: el item "Cierre VMO (OP)" si existe (plantilla vieja); si no,
  // el Limit Date más tardío de la fase 4 (Operación). Fase 5 es papeleo.
  const cierreVmo = items.find((it) => isCierreVmoStep(it.name))?.deadline ?? null;
  let cierrePlan = cierreVmo;
  if (!cierrePlan) {
    const f4 = items.filter((it) => isFase4(it.grupo)).map((it) => it.deadline).filter((d): d is Date => d !== null);
    cierrePlan = f4.length ? new Date(Math.max(...f4.map((d) => d.getTime()))) : null;
  }

  if (!cierrePlan) return { cierrePlan: null, cierreEstimado: null, atrasoActualDias, slipVsPlan: 0 };

  const slipVsPlan = cierrePlan < hoy ? businessDays(cierrePlan, hoy, true) : 0;
  const peorAtraso = abiertosVencidos.reduce((max, u) => Math.max(max, u.diasAtraso), 0);
  const empuje = Math.max(slipVsPlan, peorAtraso);
  return {
    cierrePlan,
    cierreEstimado: empuje > 0 ? addBusinessDays(cierrePlan, empuje, true) : cierrePlan,
    atrasoActualDias, slipVsPlan,
  };
}

// ─────────────────────────────────────────────────────────────────────
// VALOR (costo / beneficio / ROI / payback)
// ─────────────────────────────────────────────────────────────────────
export interface ValorResult {
  costo: number;
  beneficio: number | null;
  valorGenerado: number | null;
  roi: number | null;      // %
  payback: number | null;  // meses
  etapa: "validacion" | "aprobacion" | "confirmacion" | null;
}

export function calcValor(items: ProjItem[]): ValorResult {
  // Costo: se ACUMULA item por item. Beneficio: se declara UNA vez (Business
  // Case o medición real), por eso sale de projStageAmounts y no de una suma.
  const costo = items.reduce((s, it) => s + it.cost, 0);
  const stages = projStageAmounts(items);
  const beneficio = stages?.confirmacion?.benefit ?? stages?.aprobacion?.benefit ?? stages?.validacion?.benefit ?? null;
  const etapa = stages?.confirmacion ? "confirmacion" : stages?.aprobacion ? "aprobacion" : stages?.validacion ? "validacion" : null;

  if (beneficio === null) return { costo, beneficio: null, valorGenerado: null, roi: null, payback: null, etapa };
  return {
    costo, beneficio, etapa,
    valorGenerado: beneficio - costo,
    roi: costo > 0 ? ((beneficio - costo) / costo) * 100 : null,
    payback: costo > 0 && beneficio > 0 ? costo / (beneficio / 12) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// NPS POR PROYECTO
// ─────────────────────────────────────────────────────────────────────
/** Respuestas de encuesta que pertenecen a ESTE board: las lanzadas desde los
 *  subitems del step "Encuesta para NPS" (survey.reqId = id de ese subitem). */
export function calcNpsProyecto(items: ProjItem[], npsRecords: NpsRecord[]): NpsData {
  const ids = new Set<string>();
  for (const it of items) {
    if (!NPS_STEP_RE.test(it.name)) continue;
    for (const s of it.subitems) ids.add(s.id);
    ids.add(it.id); // por si la encuesta se lanzó desde el step mismo
  }
  return calcNpsFromRecords(npsRecords.filter((r) => r.reqId && ids.has(r.reqId)));
}

// ─────────────────────────────────────────────────────────────────────
// MEDICIÓN COMPLETA
// ─────────────────────────────────────────────────────────────────────
export interface ProjectMetricsInput {
  board: ProjBoard;
  items: ProjItem[];
  baselines?: Record<string, ProjItemBaseline>;
  /** Atribución de responsable del ATRASO (Cumplimiento de Entrega). */
  delays?: DelayMap;
  /** Atribución de responsable del REPROCESO (Calidad de Entregas). */
  reproceso?: DelayMap;
  atrasoDetalles?: Record<string, AtrasoDetalle>;
  npsRecords?: NpsRecord[];
  devTeamRoster?: Set<string>;
  alcance?: string;
  /** "hoy" fijado, para que un reporte no cambie entre renders. */
  now?: Date;
}

export interface ProjectMetrics {
  boardId: string;
  code: string;
  name: string;
  pm: string;
  sponsor: string;
  cku: string;
  estrategia: string;
  alcance: string;
  plantilla: Plantilla;
  units: MetricUnit[];
  evm: EvmResult;
  calidad: CalidadResult;
  cumplimiento: CumplimientoResult;
  atrasos: AtrasoRow[];
  responsabilidad: { label: string; pct: number }[];
  fechas: FechasResult;
  valor: ValorResult;
  nps: NpsData;
  devTimeline: DevTimelineRow[];
  medidoEn: Date;
}

/** LA función. Un board entra, una medición completa sale. */
export function buildProjectMetrics(input: ProjectMetricsInput): ProjectMetrics {
  const {
    board, items, baselines = {}, delays = {}, reproceso = {},
    atrasoDetalles, npsRecords = [], devTeamRoster = new Set<string>(), alcance = "",
  } = input;
  const hoy = input.now ?? today();

  const plantilla = detectPlantilla(items);
  const units = buildUnits(items, plantilla, hoy);
  const { code, name } = splitBoardName(board.name);
  const atrasos = calcAtrasos(units, atrasoDetalles);

  return {
    boardId: board.id, code, name,
    pm: board.pm || "", sponsor: board.sponsor || "", cku: board.cku || "",
    estrategia: board.estrategia || "", alcance,
    plantilla,
    units,
    evm: calcEvm(units, items, baselines, hoy),
    calidad: calcCalidad(units, reproceso, hoy),
    cumplimiento: calcCumplimiento(units, board.id, delays),
    atrasos,
    responsabilidad: calcResponsabilidad(atrasos),
    fechas: calcFechas(units, items, hoy),
    valor: calcValor(items),
    nps: calcNpsProyecto(items, npsRecords),
    devTimeline: buildDevTimelines(items, [board], devTeamRoster),
    medidoEn: hoy,
  };
}

/** Atajo: mide TODOS los boards de una sola pasada. */
export function buildAllProjectMetrics(
  boards: ProjBoard[],
  proj: ProjItem[],
  shared: Omit<ProjectMetricsInput, "board" | "items" | "alcance"> & {
    alcances?: Record<string, { alcance: string }>;
  } = {},
): ProjectMetrics[] {
  const { alcances, ...rest } = shared;
  return boards.map((board) =>
    buildProjectMetrics({
      ...rest,
      board,
      items: proj.filter((p) => p.boardId === board.id),
      alcance: alcances?.[board.id]?.alcance ?? "",
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────
// ADAPTADOR — BoardHealthData (shape que consume el resto de la app: tarjetas
// de salud de /proyectos, /resumen-ejecutivo, portfolioSummary, Control Tower)
// ─────────────────────────────────────────────────────────────────────
/** Arma el BoardHealthData de un board desde SU ProjectMetrics — único punto
 *  donde SPI/CPI/Scope/EVM "salen" de la medición única hacia ese shape. `ac`
 *  (costo actual de Monday) NO es parte del contrato de medición (no está en
 *  el spec de negocio): el caller lo sigue calculando con calcBoardMetrics y
 *  lo pasa acá tal cual. */
export function boardHealthFromMetrics(m: ProjectMetrics, ac: number): BoardHealthData {
  const { evm } = m;
  return {
    ev: evm.ev, pv: evm.pv, ac,
    scope: evm.scope !== null ? evm.scope * 100 : null,
    spi: evm.spi, cpi: evm.cpi,
    healthIndex: evm.evm, healthStatus: evm.estado,
  };
}
