// src/lib/mondayMirrorSync.ts
// SOLO SERVIDOR. Copia los boards de Monday a Supabase (monday_boards / monday_items).
// Monday sigue siendo donde se edita: esto solo lee Monday y escribe la copia.
//  - sincronizarTodo: copia completa (Iniciativas, REQ, RH, Estrategia y la carpeta de
//    Proyectos). La dispara el cron de reconciliación; es idempotente.
//  - sincronizarBoard: un solo board (la usarán los webhooks y el botón de refresh).
// La transformación es pura (lib/mondayMirror.ts); aquí solo hay red y base de datos.

import { discoverProjBoards, mondayFetch } from "@/lib/monday";
import { aFilas, type BoardApi, type ColumnaApi, type ItemApi, type TipoBoard } from "@/lib/mondayMirror";
import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { Json } from "@/types/supabase";

// Items por página. Los de Proyectos traen subitems anidados (más "complejidad" en Monday).
const PAGINA = { conSubitems: 100, sinSubitems: 250 } as const;

const VALORES = `column_values { id text ... on MirrorValue { display_value } ... on BoardRelationValue { display_value } }`;
const ITEM_BASE = `id name email group { title } ${VALORES}`;
const ITEM_CON_SUBS = `${ITEM_BASE} subitems { id name email board { id } ${VALORES} }`;

const primeraPagina = (campos: string) => `query ($id: [ID!], $limit: Int!) {
  boards(ids: $id) { id name columns { id title settings_str } items_page(limit: $limit) { cursor items { ${campos} } } }
}`;
const siguientePagina = (campos: string) => `query ($cursor: String!, $limit: Int!) {
  next_items_page(cursor: $cursor, limit: $limit) { cursor items { ${campos} } }
}`;
const columnasDeBoards = `query ($ids: [ID!]) { boards(ids: $ids) { id name columns { id title settings_str } } }`;

type PaginaResp = { cursor: string | null; items: ItemApi[] };

/** Trae un board COMPLETO (todas las páginas — sin el tope de 500 de las consultas viejas). */
export async function traerBoard(boardId: string, conSubitems: boolean): Promise<BoardApi> {
  const campos = conSubitems ? ITEM_CON_SUBS : ITEM_BASE;
  const limit = conSubitems ? PAGINA.conSubitems : PAGINA.sinSubitems;
  const primera = await mondayFetch<{
    boards: { id: string; name: string; columns: ColumnaApi[]; items_page: PaginaResp }[];
  }>(primeraPagina(campos), { id: [boardId], limit });
  const b = primera.boards?.[0];
  if (!b) throw new Error(`Board ${boardId} no encontrado en Monday`);

  const items = [...b.items_page.items];
  let cursor = b.items_page.cursor;
  while (cursor) {
    const sig = await mondayFetch<{ next_items_page: PaginaResp }>(siguientePagina(campos), { cursor, limit });
    items.push(...sig.next_items_page.items);
    cursor = sig.next_items_page.cursor;
  }
  return { id: b.id, name: b.name, columns: b.columns, items };
}

/** Columnas de los boards OCULTOS de subitems (distintas de las del board padre). */
async function traerSubBoards(board: BoardApi) {
  const ids = [...new Set(board.items.flatMap((i) => (i.subitems ?? []).map((s) => s.board?.id)).filter((x): x is string => !!x))];
  if (!ids.length) return [];
  const r = await mondayFetch<{ boards: { id: string; name: string; columns: ColumnaApi[] }[] }>(columnasDeBoards, { ids });
  return r.boards ?? [];
}

export interface ResultadoBoard {
  board_id: string;
  items: number;
  cambiados: number;
  borrados: number;
  board_cambio: boolean;
}

/** Copia un board (con sus subitems si es de Proyectos) en una sola transacción. */
export async function sincronizarBoard(boardId: string, tipo: TipoBoard): Promise<ResultadoBoard> {
  const conSubitems = tipo === "proj";
  const api = await traerBoard(boardId, conSubitems);
  const subBoards = conSubitems ? await traerSubBoards(api) : [];
  const { board, items } = aFilas(api, tipo, subBoards);
  const res = unwrap(await getSupabaseAdmin().rpc("mirror_guardar_board", {
    p_board: board as unknown as Json,
    p_items: items as unknown as Json,
  }));
  return res as unknown as ResultadoBoard;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

/** Los boards que copia la app — los mismos que lee hoy fetchDashboardRaw. */
export async function boardsACopiar(): Promise<{ id: string; tipo: TipoBoard; nombre?: string }[]> {
  const proj = await discoverProjBoards();
  return [
    { id: env("MONDAY_INI_BOARD_ID"), tipo: "ini" },
    { id: env("MONDAY_REQ_BOARD_ID"), tipo: "req" },
    { id: env("MONDAY_RH_BOARD_ID"), tipo: "rh" },
    { id: process.env.MONDAY_EST_BOARD_ID || "18291587533", tipo: "est" },
    ...proj.map((b) => ({ id: b.id, tipo: "proj" as const, nombre: b.name })),
  ];
}

/** Corre `fn` sobre la lista con a lo sumo `n` en paralelo (cuida el rate limit de Monday). */
async function enParalelo<T, R>(lista: T[], n: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(lista.length);
  let sig = 0;
  const trabajador = async () => {
    while (sig < lista.length) {
      const i = sig++;
      try { out[i] = { status: "fulfilled", value: await fn(lista[i]) }; }
      catch (e) { out[i] = { status: "rejected", reason: e }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, trabajador));
  return out;
}

/** El orden de los boards de Proyectos en la carpeta de Monday (la app los muestra así). Solo
 *  escribe los que cambiaron de lugar. */
async function guardarOrdenDeLaCarpeta(projIds: string[]): Promise<void> {
  if (!projIds.length) return;
  const db = getSupabaseAdmin();
  const actuales = unwrap(await db.from("monday_boards").select("id, orden").in("id", projIds)) ?? [];
  const antes = new Map(actuales.map((b) => [b.id, b.orden]));
  for (const [orden, id] of projIds.entries()) {
    if (antes.has(id) && antes.get(id) !== orden) unwrap(await db.from("monday_boards").update({ orden }).eq("id", id));
  }
}

export interface ResultadoCompleto {
  runId: number;
  ok: boolean;
  boards: (ResultadoBoard & { tipo: TipoBoard })[];
  errores: { board_id: string; tipo: TipoBoard; error: string }[];
  desactivados: number;
}

/** Abre el registro de una copia completa en monday_sync_runs. */
export async function abrirCopia(origen: string): Promise<number> {
  const run = unwrap(await getSupabaseAdmin().from("monday_sync_runs").insert({ tipo: "completa", origen }).select("id").single()) as { id: number };
  return run.id;
}

/** Copia esos boards (de a 3 en paralelo). Un board que falle no frena a los demás. */
export async function copiarBoards(objetivos: { id: string; tipo: TipoBoard }[]): Promise<Pick<ResultadoCompleto, "boards" | "errores">> {
  const resultados = await enParalelo(objetivos, 3, (b) => sincronizarBoard(b.id, b.tipo));
  const boards: ResultadoCompleto["boards"] = [];
  const errores: ResultadoCompleto["errores"] = [];
  resultados.forEach((r, i) => {
    const { id, tipo } = objetivos[i];
    if (r.status === "fulfilled") boards.push({ ...r.value, tipo });
    else errores.push({ board_id: id, tipo, error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  });
  return { boards, errores };
}

/** Cierra la copia: apaga los boards que salieron de la carpeta, guarda su orden y deja el registro.
 *  Devuelve cuántos boards se desactivaron. */
export async function cerrarCopia(runId: number, projIds: string[], resultado: { detalle: unknown; errores: string[] }): Promise<number> {
  const db = getSupabaseAdmin();
  // Solo se apagan boards si se pudo descubrir la carpeta (si no, la lista vendría vacía).
  const desactivados = projIds.length
    ? (unwrap(await db.rpc("mirror_desactivar_boards", { p_tipo: "proj", p_vigentes: projIds })) as number)
    : 0;
  await guardarOrdenDeLaCarpeta(projIds);
  const ok = resultado.errores.length === 0;
  await db.from("monday_sync_runs").update({
    finished_at: new Date().toISOString(),
    ok,
    detalle: { boards: resultado.detalle, desactivados } as unknown as Json,
    error: ok ? null : resultado.errores.join(" | "),
  }).eq("id", runId);
  return desactivados;
}

/** Deja el registro de una copia que falló entera. */
export async function fallarCopia(runId: number, error: string): Promise<void> {
  await getSupabaseAdmin().from("monday_sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error }).eq("id", runId);
}

/** Copia completa de todos los boards. Un board que falle no frena a los demás; queda en
 *  `errores` y en monday_sync_runs. Los boards que salieron de la carpeta se desactivan. */
export async function sincronizarTodo(origen: string): Promise<ResultadoCompleto> {
  const runId = await abrirCopia(origen);
  try {
    const objetivos = await boardsACopiar();
    const { boards, errores } = await copiarBoards(objetivos);
    const desactivados = await cerrarCopia(runId, objetivos.filter((o) => o.tipo === "proj").map((o) => o.id), {
      detalle: boards, errores: errores.map((e) => `${e.tipo} ${e.board_id}: ${e.error}`),
    });
    return { runId, ok: errores.length === 0, boards, errores, desactivados };
  } catch (e) {
    await fallarCopia(runId, e instanceof Error ? e.message : String(e));
    throw e;
  }
}
