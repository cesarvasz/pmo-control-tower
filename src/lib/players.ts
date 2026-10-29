// Datos base compartidos por la tabla de Players (Control Tower y /players):
// salud por board (EVM) y lista ordenada de PMs. Una sola fuente para ambas vistas.

import { calidadActividadCku } from "@/lib/dashboard";
import { calcBoardMetrics, type BoardHealthData } from "@/lib/proj";
import type { DelayMap } from "@/lib/delay";
import { RH_EMAIL_COL, RH_ROLE_COL } from "@/lib/dashboardData";
import { buildAllProjectMetrics, boardHealthFromMetrics, npsStepIds } from "@/lib/projectMetrics";
import { buildProjectSummary } from "@/lib/projSummary";
import type { DirectorioEntry, IniItem, MondayItem, NpsRecord, ProjBoard, ProjItem, ProjItemBaseline, ProjSubitem, ReqItem } from "@/types";

/** Portafolio asignado a cada PM (orden fijo en la lista de PMs). */
export const PM_PORTFOLIO: Record<string, { prefix: string; name: string }> = {
  "Luis Aguilar": { prefix: "α", name: "Portafolio Alfa" },
  "David Guzmán": { prefix: "β", name: "Portafolio Beta" },
  "Daniela Alvarez": { prefix: "γ", name: "Portafolio Gamma" },
};

export const pmLabel = (pm: string) => {
  const p = PM_PORTFOLIO[pm];
  return p ? `${p.prefix} ${p.name}` : pm;
};

/** SPI/CPI/Scope/EVM de cada board (medición única de projectMetrics.ts) y si
 *  el proyecto ya está Completado (para ocultarlo de listados, sin tocar el KPI).
 *  `ac` (costo actual de Monday) sale de calcBoardMetrics, su única fuente. */
export function buildBoardMaps(
  proj: ProjItem[],
  projBoards: ProjBoard[],
  projItemBaselines: Record<string, ProjItemBaseline>,
  opts: { soloFase3?: boolean } = {},
) {
  const projMetricsByBoard = new Map(
    buildAllProjectMetrics(projBoards, proj, { baselines: projItemBaselines, soloFase3: opts.soloFase3 }).map((m) => [m.boardId, m]),
  );
  const boardHealthMap = new Map<string, BoardHealthData>();
  const boardCompleteMap = new Map<string, boolean>();
  projBoards.forEach((b) => {
    const m = projMetricsByBoard.get(b.id);
    if (!m) return;
    const boardItems = proj.filter((r) => r.boardId === b.id);
    const { ac } = calcBoardMetrics(boardItems, projItemBaselines);
    boardHealthMap.set(b.id, boardHealthFromMetrics(m, ac));
    boardCompleteMap.set(b.id, buildProjectSummary(boardItems).completion.isComplete);
  });
  return { boardHealthMap, boardCompleteMap };
}

/** PMs con Iniciativas o PML activos, en el orden fijo de PM_PORTFOLIO (los demás al final). */
export function listPMs(ini: IniItem[], req: ReqItem[]): string[] {
  const order = Object.keys(PM_PORTFOLIO);
  return [...new Set([
    ...ini.filter((r) => r.pm && r.estado !== "SKIP").map((r) => r.pm),
    ...req.filter((r) => r.pm && r.estado !== "CERRADO").map((r) => r.pm),
  ])].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

// ── Players por CKU ───────────────────────────────────────────────────
/** CKUs que se miden como "players" en /players. */
export const PLAYER_CKUS = ["Javier Juarez", "Victoria Escobar"];
/** El CKU que lleva Implementación (página ROI): su meta y Profit del mes entran a la Confirmación
 *  de su Beneficio (ver computeBenefitKpiCku e implementacionDelMes). */
export const CKU_CON_IMPLEMENTACION = "Victoria Escobar";

const normName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export const sameCku = (a: string | undefined, b: string) => normName(a ?? "") === normName(b);

/** CKU (de PLAYER_CKUS) al que pertenece este correo según el Directorio RH, o null si el
 *  correo no está en el Directorio o esa persona no es uno de los players. Es lo que permite
 *  que un usuario con rol CKU vea solo su propia información. */
export function ckuDeEmail(directorio: DirectorioEntry[], email: string): string | null {
  const want = email.trim().toLowerCase();
  if (!want) return null;
  const nombre = directorio.find((d) => d.email.trim().toLowerCase() === want)?.name;
  return nombre ? PLAYER_CKUS.find((c) => sameCku(nombre, c)) ?? null : null;
}

/** Las Iniciativas en "Sin Valor Def" (estado EN_ESPERA) no se toman en cuenta en Players:
 *  ni en el conteo, ni en la lista de lo que maneja cada CKU, ni en sus métricas. */
export const cuentaEnPlayers = (i: IniItem) => i.estado !== "EN_ESPERA";

export interface CkuScope {
  cku: string;
  ini: IniItem[];
  req: ReqItem[];
  proj: ProjItem[];
  projBoards: ProjBoard[];
  npsRecords: NpsRecord[];
}

/** Recorta los datos a lo vinculado a un CKU (Iniciativas y PML con ese CKU; Proyectos
 *  que lo heredan de su Iniciativa) y los re-etiqueta con `pm = cku`, para reutilizar
 *  sin cambios todas las métricas por PM (calcPmMetrics). El NPS se asigna por las
 *  encuestas lanzadas desde esos PML y desde el step "Encuesta para NPS" de esos proyectos. */
export function buildCkuScope(
  cku: string,
  data: { ini: IniItem[]; req: ReqItem[]; proj: ProjItem[]; projBoards: ProjBoard[]; npsRecords: NpsRecord[] },
): CkuScope {
  const mine = (v: string | undefined) => sameCku(v, cku);
  const ini = data.ini.filter((r) => mine(r.cku) && cuentaEnPlayers(r)).map((r) => ({ ...r, pm: cku }));
  const req = data.req.filter((r) => mine(r.cku)).map((r) => ({ ...r, pm: cku }));
  const projBoards = data.projBoards.filter((b) => mine(b.cku)).map((b) => ({ ...b, pm: cku }));
  const boardIds = new Set(projBoards.map((b) => b.id));
  const proj = data.proj.filter((p) => boardIds.has(p.boardId));

  const surveyIds = npsStepIds(proj);
  req.forEach((r) => surveyIds.add(r.id));
  // NPS propio: solo encuestas ENVIADAS POR ESTE CKU sobre sus PML/proyectos (las de los PM no cuentan).
  const npsRecords = data.npsRecords
    .filter((r) => mine(r.cku) && r.reqId && surveyIds.has(r.reqId))
    .map((r) => ({ ...r, pm: cku, cku }));

  return { cku, ini, req, proj, projBoards, npsRecords };
}

// ── Filtro por mes (Players por CKU) ─────────────────────────────────────
// Una actividad (subitem) corresponde al mes de su Limit Date: el mes en que debía entregarse, sin
// importar cuándo cerró de verdad ni si después se le movió la fecha (New Limit Date). Las que no
// tienen Limit Date no pertenecen a ningún mes.

/** "2026-10": el mes de una fecha (hora local, como las fechas de Monday ya parseadas). */
export const claveMesDe = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** "2026-10" → "Octubre 2026". */
export function etiquetaMesLargo(clave: string): string {
  const [a, m] = clave.split("-");
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES_LARGO[i]} ${a}` : clave;
}

/** Los meses (cronológicos, "YYYY-MM") con al menos una actividad que ya tenga algo que medir: un
 *  veredicto de entrega (cerró con fechas) o una calidad (ver calidadActividadCku). Los meses con
 *  actividades solo pendientes (Future Steps…) no salen: seleccionarlos no mostraría nada. */
export function mesesConActividades(actividades: ProjSubitem[]): string[] {
  const meses = new Set<string>();
  for (const s of actividades) {
    if (s.deadline && (s.entrega !== null || calidadActividadCku(s) !== null)) meses.add(claveMesDe(s.deadline));
  }
  return [...meses].sort();
}

/** Deja en cada item solo las actividades cuyo Limit Date cae en el mes (`mes` null = todas, el mismo
 *  arreglo). Los items se conservan aunque se queden sin actividades: la plantilla de un board se
 *  decide con sus items (ver esPlantillaNueva), así que no se pueden quitar. No modifica el original. */
export function proyectosDelMes(proj: ProjItem[], mes: string | null): ProjItem[] {
  if (!mes) return proj;
  return proj.map((p) => (p.subitems.length === 0 ? p : { ...p, subitems: p.subitems.filter((s) => !!s.deadline && claveMesDe(s.deadline) === mes) }));
}

/** Para un CKU, el responsable que PENALIZA es "CKU" (no "PM"). La lógica de excusa
 *  (lateExcused) está escrita para "PM", así que se intercambian PM ↔ CKU en las
 *  atribuciones: lo atribuido a "CKU" pasa a penalizar y lo atribuido a "PM" se excusa.
 *  Sin asignar sigue penalizando y el resto de responsables siguen excusando. */
export function swapPmCku(map: DelayMap): DelayMap {
  const out: DelayMap = {};
  for (const [id, a] of Object.entries(map)) {
    out[id] = a.responsible === "PM" ? { ...a, responsible: "CKU" }
      : a.responsible === "CKU" ? { ...a, responsible: "PM" }
      : a;
  }
  return out;
}

/** Nombre del CKU dueño de este correo según el Directorio RH (Role incluye "CKU"), o
 *  null si la persona no es CKU. Es lo que marca una encuesta como "enviada por un CKU". */
export function ckuNameForEmail(hrItems: MondayItem[], email: string): string | null {
  const want = email.trim().toLowerCase();
  if (!want) return null;
  for (const it of hrItems) {
    const text = (id: string) => it.column_values.find((c) => c.id === id)?.text ?? "";
    if (text(RH_EMAIL_COL).trim().toLowerCase() !== want) continue;
    const roles = text(RH_ROLE_COL).split(",").map((r) => r.trim().toUpperCase());
    if (roles.includes("CKU")) return it.name;
  }
  return null;
}
