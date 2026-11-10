// SOLO SERVIDOR. Importar un board de Proyectos de Monday como tablero de la app (tal cual, con
// roles asignados) desde la copia monday_boards / monday_items, y compararlo con Monday.

import { enTrozos, getSupabaseAdmin, selectAll, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import { leerBoardsEspejo } from "@/lib/mondayMirrorRead";
import { sincronizarBoard } from "@/lib/mondayMirrorSync";
import { projProcess, splitBoardName } from "@/lib/proj";
import type { ProjItemBaseline } from "@/types";
import { claveNombre } from "../dominio/personas";
import { mondayADefinicion, type ColumnaMonday, type FilaMonday } from "../dominio/importar-monday";
import { tableroAProjItems, type PersonaMetricas } from "../dominio/metricas";
import { diferenciasProjItems, resumenMetricas, type ResumenMetricas } from "../dominio/paridad";
import type { TableroCompleto } from "../dominio/tablero";
import { crearDesdeDefinicion } from "./materializar";
import { listarPersonasCorto } from "./tableros";
import { ErrorTablero } from "./errores";

export interface BoardImportable {
  id: string;
  nombre: string;
  /** Tablero de la app que ya lo importó (vigente). */
  tableroId: string | null;
}

export async function listarBoardsImportables(): Promise<BoardImportable[]> {
  const db = getSupabaseAdmin();
  const [boards, tableros] = await Promise.all([
    unwrap(await db.from("monday_boards").select("id, nombre").eq("tipo", "proj").eq("activo", true).order("nombre")) ?? [],
    unwrap(await db.from("tableros").select("id, monday_board_id").not("monday_board_id", "is", null).is("archivado_at", null)) ?? [],
  ]);
  const importado = new Map(tableros.map((t) => [t.monday_board_id!, t.id]));
  return boards.map((b) => ({ id: b.id, nombre: b.nombre, tableroId: importado.get(b.id) ?? null }));
}

/** Personas del directorio, para ligar nombres (sin acentos ni mayúsculas) y para las métricas. */
async function directorio() {
  const filas = await listarPersonasCorto();
  const porNombre = new Map<string, string>();
  // Las activas ganan si hay dos con el mismo nombre.
  for (const p of [...filas].sort((a, b) => Number(a.activo) - Number(b.activo))) porNombre.set(claveNombre(p.nombre), p.id);
  const metricas = new Map<string, PersonaMetricas>(filas.map((p) => [p.id, p]));
  return { porNombre, metricas };
}

export interface ResultadoImportarBoard {
  tableroId: string;
  elementos: number;
  subelementos: number;
  omitidas: { nivel: string; titulo: string; tipo: string }[];
  personasNoEncontradas: string[];
  aviso: string | null;
}

export async function importarBoard(
  mondayBoardId: string, opciones: { refrescar: boolean; reemplazar: boolean }, me: AppUser,
): Promise<ResultadoImportarBoard> {
  const db = getSupabaseAdmin();
  const board = unwrap(await db.from("monday_boards").select("id, nombre, tipo, columnas").eq("id", mondayBoardId).eq("tipo", "proj").maybeSingle());
  if (!board) throw new ErrorTablero(404, "Ese board de Proyectos no está en la copia de Monday");

  const previo = unwrap(await db.from("tableros").select("id").eq("monday_board_id", mondayBoardId).maybeSingle());
  if (previo && !opciones.reemplazar) throw new ErrorTablero(409, "Ese board ya está importado. Usa «Volver a importar» para reemplazarlo.");

  let aviso: string | null = null;
  if (opciones.refrescar) {
    try { await sincronizarBoard(mondayBoardId, "proj"); } catch (e) {
      aviso = `No se pudo refrescar desde Monday (${e instanceof Error ? e.message : "error"}); se usó la última copia.`;
    }
  }

  const [subBoard, rhBoard, filas, dir] = await Promise.all([
    unwrap(await db.from("monday_boards").select("columnas").eq("padre_board_id", mondayBoardId).limit(1).maybeSingle()),
    unwrap(await db.from("monday_boards").select("columnas").eq("tipo", "rh").eq("activo", true).limit(1).maybeSingle()),
    selectAll<FilaMonday>((d, h) => db.from("monday_items")
      .select("id, parent_id, orden, nombre, grupo, column_values").eq("board_id", mondayBoardId).is("deleted_at", null)
      .order("id").range(d, h) as unknown as PromiseLike<{ data: FilaMonday[] | null; error: null }>),
    directorio(),
  ]);

  const { definicion, omitidas, personasNoEncontradas } = mondayADefinicion({
    columnas: board.columnas as unknown as Record<string, ColumnaMonday>,
    columnasSub: (subBoard?.columnas ?? {}) as unknown as Record<string, ColumnaMonday>,
    filas,
    rhBoardId: process.env.MONDAY_RH_BOARD_ID ?? null,
    rhColumnas: (rhBoard?.columnas ?? {}) as unknown as Record<string, ColumnaMonday>,
    personaPorNombre: (n) => dir.porNombre.get(claveNombre(n)),
  });

  // Reemplazar: el tablero anterior se borra (el monday_board_id es único).
  if (previo) {
    // Sus archivos en Storage no se borran en cascada: se quitan antes.
    const rutas = (unwrap(await db.from("elemento_archivos").select("ruta").eq("tablero_id", previo.id)) ?? []).map((a) => a.ruta);
    for (const lote of enTrozos(rutas, 100)) await db.storage.from("tableros").remove(lote);
    unwrap(await db.from("tableros").delete().eq("id", previo.id));
  }
  const { code, name } = splitBoardName(board.nombre);
  const tableroId = await crearDesdeDefinicion(definicion, {
    nombre: name || board.nombre, codigo: code || null, categoria: "proyecto", mondayBoardId,
  }, me);

  return {
    tableroId,
    elementos: definicion.elementos.filter((e) => !e.padre).length,
    subelementos: definicion.elementos.filter((e) => e.padre).length,
    omitidas, personasNoEncontradas, aviso,
  };
}

export interface Comparacion {
  diferencias: string[];
  monday: ResumenMetricas;
  app: ResumenMetricas;
  copiaDel: string | null;
}

/** Mide el tablero importado y su board de Monday con la MISMA lógica y lista las diferencias. */
export async function compararConMonday(t: TableroCompleto): Promise<Comparacion> {
  const mondayId = t.tablero.mondayBoardId;
  if (!mondayId) throw new ErrorTablero(400, "Este tablero no viene de Monday");
  const db = getSupabaseAdmin();
  const [[board], dir, baselinesFilas, sync] = await Promise.all([
    leerBoardsEspejo([mondayId]),
    directorio(),
    selectAll<{ item_id: string; board_id: string; cost: number; saved_at: string }>((d, h) =>
      db.from("proj_item_baselines").select("item_id, board_id, cost, saved_at").eq("board_id", mondayId).order("item_id").range(d, h)),
    db.from("monday_boards").select("synced_at").eq("id", mondayId).maybeSingle(),
  ]);
  if (!board) throw new ErrorTablero(404, "El board ya no está en la copia de Monday");
  const baselines: Record<string, ProjItemBaseline> = Object.fromEntries(
    baselinesFilas.map((b) => [b.item_id, { boardId: b.board_id, cost: Number(b.cost), savedAt: b.saved_at }]));

  const deMonday = projProcess(board.nombre, board.id, board.items);
  const deApp = tableroAProjItems(t, dir.metricas);
  return {
    diferencias: diferenciasProjItems(deMonday, deApp),
    monday: resumenMetricas(deMonday, baselines),
    app: resumenMetricas(deApp, baselines),
    copiaDel: sync.data?.synced_at ?? null,
  };
}
