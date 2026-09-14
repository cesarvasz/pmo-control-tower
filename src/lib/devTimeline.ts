// src/lib/devTimeline.ts
// Ciclo de vida de DESARROLLO por hito, para el Gantt "Desarrollo Timelines".
// Los MISMOS 5 puntos (incluido el nombre) aplican a las dos plantillas, aunque
// cada una los saca de un lugar distinto del board:
//
//   · Inicio            · Req Terminado      · Analisis tecnico
//   · Entrega Desarrollo (deadline)          · Salida en vivo (fin real)
//
// PLANTILLA VIEJA (item = step, subitem = hito): cada hito se identifica por su
// PMS ID dentro de su board; los 5 puntos vienen de 4 items distintos (mismo
// PMS ID en cada uno = mismo hito):
//   · Inicio: INICIO del rango de la columna "CPM" DEL ITEM "Sponsor/CKU Valida
//             Hitos (Entregable Hitos Docs Firmados)" (fase Valuación) — un solo
//             valor de CPM por item, compartido por TODOS sus hitos (a
//             diferencia de los otros 4 puntos, que sí son por-hito)
//   · Req Terminado: Actual End del hito en ESE MISMO item (antes se llamaba
//             "Hitos firmados" — mismo dato, nuevo nombre)
//   · Analisis tecnico: Actual End del hito en "Análisis técnico / Fechas
//             estimadas de desarrollo (Costo DEV)"                (Launch)
//   · Entrega Desarrollo: Limit Date del hito en "Desarrollo por iteraciones
//             (Hitos) / Entregas CKU"                              (Launch)
//   · Salida en vivo: Limit Date del hito en "Go live en producción"
//             (fase Operación | Implementación) — YA NO es el Actual End del
//             step de iteraciones
//
// PLANTILLA NUEVA (PM-010/011/012/013…, item = hito, subitem = step): el hito ES
// el item de "Launch | Lanzamiento"; una fila por ITEM (no por subitem). Todas
// las fechas de subitem vienen de su Limit Date, con fallback al fin del rango
// Timeline cuando Limit Date viene vacío (ver resolveDeadline en proj.ts; es lo
// que ya trae `ProjSubitem.deadline`):
//   · Inicio: INICIO del rango de la columna "CPM" DEL ITEM (el hito) —
//             `ProjItem.cpmStart`, NUNCA la columna "Start Date" (son campos
//             independientes, pueden divergir mucho)
//   · Req Terminado: subitem cuyo nombre matchea "%Req Terminado%" (o
//             "%Requerimiento terminado%", variante de nombre de algunos boards)
//   · Analisis tecnico: subitem "%Analisis tecnico%"
//   · Entrega Desarrollo: subitem "%por iteraciones%"
//   · Salida en vivo: subitem "%Salida en vivo%"
// Un item puede repetir alguno de estos steps (varios "Req Terminado"/"Desarrollo
// por iteraciones" para distintos requerimientos dentro del mismo hito): se toma,
// de cada categoría, el subitem con el Limit Date MÁS TARDÍO (el cierre más
// reciente de esa etapa). Solo entran los hitos con ALGÚN subitem (no
// necesariamente el de iteraciones — varios vienen sin Responsible propio, solo
// "Analisis tecnico" suele traerlo) con un Responsible del Equipo Desarrollo
// Interno/Externo (board Directorio RH) — así se filtra el trabajo real del
// equipo de desarrollo sin depender de nombres de item (ver buildDevTeamRoster).
//
// El scope (ambas plantillas) se decide por el status del step "Entrega
// Desarrollo" ("Desarrollo por iteraciones…"):
//   · working → "Working on it" (u otro activo) = en Desarrollo AHORA
//   · done    → "Done" = ya entregado
//   · future  → "Future Steps"/"Not Started"/sin status = aún no inicia
// Solo los hitos que YA tienen ese step entran; la vista filtra por fase. El nombre
// y el Developer "oficiales" del hito se toman de ese step.

import type { MondayItem, ProjBoard, ProjItem, ProjSubitem } from "@/types";

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

/** Un hito con las fechas de su ciclo de vida de desarrollo (ver cabecera). Los
 *  5 puntos tienen el MISMO nombre/significado en las dos plantillas — solo
 *  cambia de dónde se leen (`plantilla` sigue distinguiendo eso, y además
 *  decide el criterio de "A futuro" en page.tsx, exclusivo de la nueva):
 *  firmado=Inicio · reqTerminado=Req Terminado · analisis=Analisis tecnico ·
 *  limit=Entrega Desarrollo (deadline) · entrega=Salida en vivo (fin real) */
export interface DevTimelineRow {
  key: string;           // boardId::pmsId (o boardId::id::subId si no hay PMS ID)
  boardId: string;
  proyecto: string;      // nombre del board
  pm: string;            // PM del board
  hito: string;          // nombre del hito (del step de iteraciones)
  developer: string;
  plantilla: "vieja" | "nueva";
  firmado: Date | null;      // "Inicio"
  reqTerminado: Date | null; // "Req Terminado"
  analisis: Date | null;     // "Analisis tecnico"
  limit: Date | null;        // "Entrega Desarrollo" (deadline)
  entrega: Date | null;      // "Salida en vivo" (fin real)
  devStatus: string;     // status del subitem en "Desarrollo por iteraciones"
  devPhase: DevPhase;    // working (en curso) | done (entregado) | future (no iniciado)
  enDesarrollo: boolean; // devPhase === "working" (activo AHORA)
}

// Identificación de los 4 steps de la plantilla VIEJA (por fase + nombre de ITEM).
const isValidaHitos = (g: string, n: string) => g.includes("valuacion") && n.includes("valida hitos");
const isAnalisisDev = (g: string, n: string) => g.includes("launch") && n.includes("fechas estimadas de desarrollo");
const isDevIteraciones = (g: string, n: string) => g.includes("launch") && n.includes("desarrollo por iteraciones");
const isGoLiveStep = (g: string, n: string) => g.includes("operacion") && n.includes("go live");

// Identificación de los steps de la plantilla NUEVA (por nombre de SUBITEM,
// "%contiene%" como pidió el usuario). "por iteraciones" (sin el prefijo
// "desarrollo/desarollo") tolera el typo que trae PM-012 ("Desarollo por
// iteraciones + QA").
// "Req Terminado…" (la mayoría de boards) o "Requerimiento terminado…" (variante
// de nombre usada en algunos boards, ej. PM-013) — mismo step, dos redacciones.
const isReqTerminadoSub = (n: string) => n.includes("req terminado") || n.includes("requerimiento terminado");
const isAnalisisDevSub = (n: string) => n.includes("analisis tecnico");
const isDevIteracionesSub = (n: string) => n.includes("por iteraciones");
const isSalidaEnVivoSub = (n: string) => n.includes("salida en vivo");

/** De los subitems que matchean `pred`, el de Limit Date (`s.deadline`) más
 *  tardío — cuando un item repite un step para varios requerimientos, es el
 *  cierre más reciente de esa etapa. `undefined` si ninguno matchea. */
function latestMatch(subitems: ProjSubitem[], pred: (nameNorm: string) => boolean): ProjSubitem | undefined {
  let best: ProjSubitem | undefined;
  for (const s of subitems) {
    if (!pred(norm(s.name))) continue;
    if (!best || (s.deadline && (!best.deadline || s.deadline.getTime() > best.deadline.getTime()))) best = s;
  }
  return best;
}

// Grupos del board "Directorio RH" que forman el Equipo de Desarrollo.
const DEV_TEAM_GROUPS = ["equipo desarrollo interno", "equipo desarrollo externo"];

/** Roster (nombres normalizados) del Equipo de Desarrollo Interno + Externo,
 *  leído de los grupos homónimos del board "Directorio RH". Se usa para filtrar
 *  los hitos de la plantilla nueva por el Responsible de su step de iteraciones. */
export function buildDevTeamRoster(hrItems: MondayItem[]): Set<string> {
  const roster = new Set<string>();
  for (const it of hrItems) {
    if (DEV_TEAM_GROUPS.includes(norm(it.group?.title || ""))) roster.add(norm(it.name));
  }
  return roster;
}

/** Arma una fila por hito con su ciclo de vida (plantilla vieja: por PMS ID del
 *  subitem; plantilla nueva: por PMS ID/id del step de iteraciones dentro del
 *  item-hito). Solo se devuelven los hitos que tienen step "Desarrollo por
 *  iteraciones" (los que están en la etapa de desarrollo); en la plantilla nueva,
 *  además, con Responsible en `devTeamRoster` (ver buildDevTeamRoster). */
export function buildDevTimelines(
  projs: ProjItem[],
  projBoards: ProjBoard[],
  devTeamRoster: Set<string> = new Set(),
): DevTimelineRow[] {
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
        hito: s.name, developer: s.developer || "", plantilla: "vieja",
        firmado: null, reqTerminado: null, analisis: null, limit: null, entrega: null,
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
    const goLive = isGoLiveStep(g, n);
    if (!valida && !analisis && !devIter && !goLive) continue;

    for (const s of p.subitems) {
      const row = ensure(p.boardId, s);
      if (valida) {
        row.reqTerminado = s.actualEnd;          // "Req Terminado": Actual End del hito (antes era "Hitos firmados")
        row.firmado = p.cpmStart;                // "Inicio": CPM del ITEM Valida Hitos — un valor por item, no por hito
      }
      if (analisis) row.analisis = s.actualEnd;
      if (devIter) {
        row.limit = s.deadline;                  // "Entrega Desarrollo"
        row.devStatus = s.status;
        row.hito = s.name;                       // nombre "oficial" del hito
        if (s.developer) row.developer = s.developer;
        hasDev.add(row.key);
      }
      if (goLive) row.entrega = s.deadline;       // "Salida en vivo": Limit Date del hito en "Go live en producción"
    }
  }

  const rows: DevTimelineRow[] = [];
  for (const row of map.values()) {
    if (!hasDev.has(row.key)) continue;          // sin step de iteraciones → no está en desarrollo
    row.devPhase = classifyDev(row.devStatus);
    row.enDesarrollo = row.devPhase === "working";
    rows.push(row);
  }

  // Plantilla NUEVA: el hito es el item de "Launch | Lanzamiento" — una fila
  // por ITEM (no por subitem). No usa `map`/`ensure` (esos son de la vieja).
  for (const p of projs) {
    const g = norm(p.grupo);
    if (!g.includes("launch")) continue;

    const devIterSub = latestMatch(p.subitems, isDevIteracionesSub);
    if (!devIterSub) continue;                              // sin step de iteraciones → no está en desarrollo
    // El Responsible que decide si el hito es del Equipo de Desarrollo puede estar
    // en CUALQUIER subitem del item (varios steps de iteraciones vienen sin
    // Responsible propio — solo "Analisis tecnico" suele traerlo) — no solo en el
    // step de iteraciones elegido para las fechas.
    if (!p.subitems.some((s) => devTeamRoster.has(norm(s.responsible)))) continue;

    const reqTerminadoSub = latestMatch(p.subitems, isReqTerminadoSub);
    const analisisSub = latestMatch(p.subitems, isAnalisisDevSub);
    const salidaSub = latestMatch(p.subitems, isSalidaEnVivoSub);

    const devPhase = classifyDev(devIterSub.status);
    rows.push({
      key: `${p.boardId}::new::${p.id}`,
      boardId: p.boardId, proyecto: bname.get(p.boardId) ?? "", pm: bpm.get(p.boardId) ?? "",
      hito: p.name, developer: devIterSub.responsible || analisisSub?.responsible || devIterSub.developer || "", plantilla: "nueva",
      firmado: p.cpmStart,                     // Inicio: START del rango "CPM" del item (nunca "Start Date")
      reqTerminado: reqTerminadoSub?.deadline ?? null,
      analisis: analisisSub?.deadline ?? null,
      limit: devIterSub.deadline,
      entrega: salidaSub?.deadline ?? null,
      devStatus: devIterSub.status, devPhase, enDesarrollo: devPhase === "working",
    });
  }

  return rows;
}
