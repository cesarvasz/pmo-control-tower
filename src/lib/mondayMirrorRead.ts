// src/lib/mondayMirrorRead.ts
// SOLO SERVIDOR. Lee la copia de Monday guardada en Supabase y la devuelve con la MISMA
// forma que la API de Monday (MondayItem / ProjBoardRaw), para que el resto de la app no
// cambie. Todavía no lo usa la app: hoy solo lo usa la prueba de paridad (fase 4 del plan).

import { reconstruirItems, type ItemFila, type MapaColumnas, type TipoBoard } from "@/lib/mondayMirror";
import { enTrozos, getSupabaseAdmin, selectAll, unwrap } from "@/lib/supabase-admin";
import type { MondayItem, ProjBoardRaw } from "@/types";

interface BoardLeido {
  id: string;
  nombre: string;
  tipo: TipoBoard;
  items: MondayItem[];
}

/** Lee boards de la copia (vigentes, con sus subitems y columnas) por id. */
export async function leerBoardsEspejo(ids: string[]): Promise<BoardLeido[]> {
  if (!ids.length) return [];
  const db = getSupabaseAdmin();

  const boards = unwrap(await db.from("monday_boards")
    .select("id, nombre, tipo, columnas, padre_board_id")
    .or(`id.in.(${ids.join(",")}),padre_board_id.in.(${ids.join(",")})`)) as {
      id: string; nombre: string; tipo: string; columnas: MapaColumnas; padre_board_id: string | null;
    }[];

  const filas: (ItemFila & { board_id: string })[] = [];
  for (const trozo of enTrozos(ids, 50)) {
    filas.push(...await selectAll<ItemFila & { board_id: string }>((desde, hasta) => db.from("monday_items")
      .select("id, board_id, parent_id, sub_board_id, orden, nombre, email, grupo, column_values")
      .in("board_id", trozo)
      .is("deleted_at", null)
      .order("id")
      .range(desde, hasta) as unknown as PromiseLike<{ data: (ItemFila & { board_id: string })[] | null; error: null }>));
  }

  const columnasSub: Record<string, MapaColumnas> = {};
  for (const b of boards) if (b.tipo === "sub") columnasSub[b.id] = b.columnas;

  const porBoard = new Map<string, ItemFila[]>();
  for (const f of filas) {
    const l = porBoard.get(f.board_id);
    if (l) l.push(f); else porBoard.set(f.board_id, [f]);
  }

  return ids.flatMap((id) => {
    const b = boards.find((x) => x.id === id);
    if (!b) return [];
    const tipo = b.tipo as TipoBoard;
    return [{
      id: b.id,
      nombre: b.nombre,
      tipo,
      items: reconstruirItems(porBoard.get(id) ?? [], b.columnas, columnasSub, tipo === "proj"),
    }];
  });
}

/** Boards de Proyectos activos en la copia (equivalente a discoverProjBoards). */
export async function leerProjBoardsEspejo(): Promise<{ id: string; name: string }[]> {
  // En el orden de la carpeta de Monday, como discoverProjBoards.
  const filas = unwrap(await getSupabaseAdmin().from("monday_boards")
    .select("id, nombre").eq("tipo", "proj").eq("activo", true)
    .order("orden", { nullsFirst: false }).order("nombre")) as { id: string; nombre: string }[];
  return filas.map((f) => ({ id: f.id, name: f.nombre }));
}

export function aProjBoardRaw(b: BoardLeido): ProjBoardRaw {
  return { id: b.id, name: b.nombre, items_page: { items: b.items } };
}
