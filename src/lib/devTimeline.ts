// src/lib/devTimeline.ts
// Ciclo de vida de DESARROLLO por hito (subitem), para el Gantt "Desarrollo Timelines".
//
// Cada hito se identifica por su PMS ID dentro de su board y toma 4 fechas de 3
// steps distintos del board (las columnas Actual End / Limit Date de cada subitem):
//   · firmado  (A): Actual End de "Sponsor/CKU Valida Hitos"            (fase Valuación)
//   · analisis (B): Actual End de "Análisis técnico / Fechas estimadas
//                   de desarrollo (Costo DEV)"                          (Launch | Desarrollo)
//   · limit    (C): Limit Date de "Desarrollo por iteraciones (Hitos)
//                   / Entregas CKU"                                     (Launch | Desarrollo)
//   · entrega  (D): Actual End de ese mismo step "Desarrollo por iteraciones"
//
// El scope se decide por el status del step "Desarrollo por iteraciones":
//   · working → "Working on it" (u otro activo) = en Desarrollo AHORA
//   · done    → "Done" = ya entregado
//   · future  → "Future Steps"/"Not Started"/sin status = aún no inicia
// Solo los hitos que YA tienen ese step entran; la vista filtra por fase. El nombre
// y el Developer "oficiales" del hito se toman de ese step de iteraciones.

import type { ProjBoard, ProjItem, ProjSubitem } from "@/types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Fase del hito según el status de su step "Desarrollo por iteraciones". */
export type DevPhase = "working" | "done" | "future";

/** Clasifica el status del step de iteraciones. "Done" → done; los estados de
 *  "no iniciado" (Future Steps / Not Started / vacío) → future; cualquier otro
 *  estado activo (Working on it, Stuck, …) → working (en desarrollo ahora). */
export function classifyDev(status: string): DevPhase {
  const s = norm(status);
  if (s === "done") return "done";
  if (s === "" || s.includes("future") || s.includes("not started") || s.includes("no iniciad")) return "future";
  return "working";
}

/** Un hito con las 4 fechas de su ciclo de vida de desarrollo (ver cabecera). */
export interface DevTimelineRow {
  key: string;           // boardId::pmsId (o boardId::id::subId si no hay PMS ID)
  boardId: string;
  proyecto: string;      // nombre del board
  pm: string;            // PM del board
  hito: string;          // nombre del hito (del step de iteraciones)
  developer: string;
  firmado: Date | null;  // A
  analisis: Date | null; // B
  limit: Date | null;    // C (deadline)
  entrega: Date | null;  // D (fin real)
  devStatus: string;     // status del subitem en "Desarrollo por iteraciones"
  devPhase: DevPhase;    // working (en curso) | done (entregado) | future (no iniciado)
  enDesarrollo: boolean; // devPhase === "working" (activo AHORA)
}

// Identificación de los 3 steps (por fase + nombre normalizados).
const isValidaHitos = (g: string, n: string) => g.includes("valuacion") && n.includes("valida hitos");
const isAnalisisDev = (g: string, n: string) => g.includes("launch") && n.includes("fechas estimadas de desarrollo");
const isDevIteraciones = (g: string, n: string) => g.includes("launch") && n.includes("desarrollo por iteraciones");

/** Arma una fila por hito (por PMS ID dentro del board) con su ciclo de vida.
 *  Solo se devuelven los hitos que tienen step "Desarrollo por iteraciones"
 *  (los que están en la etapa de desarrollo). */
export function buildDevTimelines(projs: ProjItem[], projBoards: ProjBoard[]): DevTimelineRow[] {
  const bpm = new Map(projBoards.map((b) => [b.id, b.pm]));
  const bname = new Map(projBoards.map((b) => [b.id, b.name]));
  const map = new Map<string, DevTimelineRow>();
  const hasDev = new Set<string>();

  const keyOf = (boardId: string, s: ProjSubitem) =>
    s.pmsId ? `${boardId}::${s.pmsId}` : `${boardId}::id::${s.id}`;

  const ensure = (boardId: string, s: ProjSubitem): DevTimelineRow => {
    const key = keyOf(boardId, s);
    let row = map.get(key);
    if (!row) {
      row = {
        key, boardId, proyecto: bname.get(boardId) ?? "", pm: bpm.get(boardId) ?? "",
        hito: s.name, developer: s.developer || "",
        firmado: null, analisis: null, limit: null, entrega: null,
        devStatus: "", devPhase: "future", enDesarrollo: false,
      };
      map.set(key, row);
    }
    if (s.developer && !row.developer) row.developer = s.developer;
    return row;
  };

  for (const p of projs) {
    const g = norm(p.grupo), n = norm(p.name);
    const valida = isValidaHitos(g, n);
    const analisis = isAnalisisDev(g, n);
    const devIter = isDevIteraciones(g, n);
    if (!valida && !analisis && !devIter) continue;

    for (const s of p.subitems) {
      const row = ensure(p.boardId, s);
      if (valida) row.firmado = s.actualEnd;
      if (analisis) row.analisis = s.actualEnd;
      if (devIter) {
        row.limit = s.deadline;
        row.entrega = s.actualEnd;
        row.devStatus = s.status;
        row.hito = s.name;                       // nombre "oficial" del hito
        if (s.developer) row.developer = s.developer;
        hasDev.add(row.key);
      }
    }
  }

  const rows: DevTimelineRow[] = [];
  for (const row of map.values()) {
    if (!hasDev.has(row.key)) continue;          // sin step de iteraciones → no está en desarrollo
    row.devPhase = classifyDev(row.devStatus);
    row.enDesarrollo = row.devPhase === "working";
    rows.push(row);
  }
  return rows;
}
