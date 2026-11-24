// SOLO SERVIDOR. Flujo «Status Card»: los MISMOS datos que la Status Card de /resumen-ejecutivo y del reporte de
// /proyectos (buildStatusReportDataForBoard), armados en el servidor como el cron semanal: Single Fetch
// (fetchDashboardRaw, con su caché de 60 s) + lo guardado en Supabase + buildDashboardData + On Hold fuera.
// Solo lee: no sincroniza baselines (eso lo sigue haciendo /api/dashboard cuando alguien abre la app).

import { fetchDashboardRaw } from "@/lib/monday";
import { getAtrasoDetalles, getBoardAlcances, getOnHold, getProjItemBaselines } from "@/lib/store";
import { buildDashboardData } from "@/lib/dashboardData";
import { aplicarOnHold } from "@/lib/onHold";
import { buildStatusReportDataForBoard, type StatusReportData } from "@/lib/statusReportData";
import { esRolCku, type AppUser } from "@/lib/permissions";
import { ckuDeEmail, sameCku } from "@/lib/players";
import { splitBoardName } from "@/lib/proj";
import type { DashboardData, ProjBoard } from "@/types";
import { AvisoChat, cuentaDe, type UsuarioChat } from "../../nucleo/flujo";

/** Páginas de la app que muestran la Status Card: quien tiene alguna, puede pedirla al bot. */
const PAGINAS = ["resumen-ejecutivo", "proyectos"] as const;

export const puedeVerStatusCard = (me: AppUser) => PAGINAS.some((p) => !!me.permissions.pages?.[p]);

async function armarDashboard(): Promise<DashboardData> {
  const [raw, projItemBaselines, atrasoDetalles, boardAlcance, onHold] = await Promise.all([
    fetchDashboardRaw(), getProjItemBaselines(), getAtrasoDetalles(), getBoardAlcances(), getOnHold(),
  ]);
  return aplicarOnHold(buildDashboardData({ ...raw, projItemBaselines, atrasoDetalles, boardAlcance, onHold }));
}

// Caché del bot: Google Chat corta la espera a los pocos segundos y armar el portafolio desde cero tarda 5–7 s.
// Hasta 60 s se entrega tal cual; hasta 5 min se entrega al instante y se refresca en segundo plano; más viejo, se rearma.
const FRESCO_MS = 60_000;
const MAXIMO_MS = 5 * 60_000;
let cache: { data: DashboardData; at: number } | null = null;
let enVuelo: Promise<DashboardData> | null = null;

function refrescar(): Promise<DashboardData> {
  enVuelo ??= armarDashboard()
    .then((data) => { cache = { data, at: Date.now() }; return data; })
    .finally(() => { enVuelo = null; });
  return enVuelo;
}

async function cargarDashboard(): Promise<DashboardData> {
  const edad = cache ? Date.now() - cache.at : Infinity;
  if (cache && edad < FRESCO_MS) return cache.data;
  if (cache && edad < MAXIMO_MS) {
    refrescar().catch((e) => console.warn("[google-chat] no se pudo refrescar el portafolio", e));
    return cache.data;
  }
  return refrescar();
}

/** Empieza a armar el portafolio sin esperarlo (p. ej. cuando el bot muestra el menú). */
export function precalentar(): void {
  cargarDashboard().catch((e) => console.warn("[google-chat] no se pudo precargar el portafolio", e));
}

/** Espera el portafolio a lo más `ms`; si tarda más, AvisoChat (se sigue armando para el siguiente intento). */
async function conLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => { t = setTimeout(() => rechazar(new SinDatosAun()), ms); });
  try {
    return await Promise.race([p, limite]);
  } finally {
    clearTimeout(t);
  }
}

/** El portafolio todavía se está armando (pasó el tiempo que Google Chat tolera). */
export class SinDatosAun extends Error {}

/** Lo más que se espera el portafolio dentro de una respuesta a Google Chat. */
export const ESPERA_DATOS_MS = 4_000;

/** Los proyectos que este usuario puede ver, por código (PM-001, PM-002…). Un CKU solo ve los suyos, igual que en
 *  /resumen-ejecutivo. Los que están en On Hold no salen. */
export function proyectosVisibles(data: DashboardData, u: UsuarioChat): ProjBoard[] {
  let boards = data.projBoards;
  if (esRolCku(cuentaDe(u).roleName)) {
    const miCku = ckuDeEmail(data.directorio, u.email);
    boards = miCku ? boards.filter((b) => sameCku(b.cku, miCku)) : [];
  }
  return [...boards].sort((a, b) => splitBoardName(a.name).code.localeCompare(splitBoardName(b.name).code, "es", { numeric: true }));
}

/** Los proyectos del usuario. Espera los datos a lo más ESPERA_DATOS_MS (si no, SinDatosAun). */
export async function proyectosDe(u: UsuarioChat): Promise<ProjBoard[]> {
  const boards = proyectosVisibles(await conLimite(cargarDashboard(), ESPERA_DATOS_MS), u);
  if (!boards.length) throw new AvisoChat("No tienes proyectos asignados para ver su Status Card.");
  return boards;
}

/** La Status Card de un proyecto (solo si este usuario lo puede ver). Espera los datos a lo más ESPERA_DATOS_MS. */
export async function statusCardDe(u: UsuarioChat, boardId: string): Promise<StatusReportData> {
  const data = await conLimite(cargarDashboard(), ESPERA_DATOS_MS);
  const board = proyectosVisibles(data, u).find((b) => b.id === boardId);
  if (!board) throw new AvisoChat("Ese proyecto ya no está disponible (puede estar en On Hold). Vuelve a pedir la Status Card.");
  return armar(data, board);
}

/** La Status Card de un proyecto SIN revisar usuario: solo para la hoja que fotografía Chrome, a la que se entra con un
 *  código firmado que el bot emite después de revisar los permisos (statusCardDe). null = no existe o está en On Hold. */
export async function statusCardDeProyecto(boardId: string): Promise<StatusReportData | null> {
  const data = await cargarDashboard();
  const board = data.projBoards.find((b) => b.id === boardId);
  return board ? armar(data, board) : null;
}

function armar(data: DashboardData, board: ProjBoard): StatusReportData {
  return buildStatusReportDataForBoard({
    board,
    items: data.proj.filter((p) => p.boardId === board.id),
    baselines: data.projItemBaselines,
    atrasoDetalles: data.atrasoDetalles,
    alcance: data.boardAlcance[board.id]?.alcance ?? "",
    now: Date.now(),
  });
}
