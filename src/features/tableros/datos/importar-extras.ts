// SOLO SERVIDOR. Trae de Monday lo que la copia no tiene: la bitácora (Updates) y los archivos de
// las columnas de archivo, para un tablero ya importado. Idempotente: casa por monday_update_id y
// monday_asset_id, así que se puede correr otra vez para traer lo nuevo (y el texto de las
// actualizaciones que se editaron en Monday). Los archivos se descargan
// a Supabase Storage (los enlaces de Monday vencen).

import { randomUUID } from "node:crypto";
import { mondayFetch } from "@/lib/monday";
import { enTrozos, getSupabaseAdmin, selectAll, unwrap } from "@/lib/supabase-admin";
import { normalizarTextoComentario } from "../dominio/bitacora";
import { ErrorTablero } from "./errores";

interface UpdateMonday { id: string; text_body: string | null; created_at: string; creator: { name: string; email: string } | null }
interface AssetMonday { id: string; name: string; public_url: string | null; file_size: number | null; file_extension: string | null }
interface ItemMonday {
  id: string;
  updates: UpdateMonday[];
  assets: AssetMonday[];
  column_values: { id: string; value: string | null }[];
  subitems?: Omit<ItemMonday, "subitems">[];
}

const CAMPOS = `id updates(limit: 100) { id text_body created_at creator { name email } }
  assets { id name public_url file_size file_extension } column_values(types: [file]) { id value }`;
const PRIMERA = `query ($ids: [ID!]) { boards(ids: $ids) { items_page(limit: 25) { cursor items { ${CAMPOS} subitems { ${CAMPOS} } } } } }`;
const SIGUIENTE = `query ($cursor: String!) { next_items_page(limit: 25, cursor: $cursor) { cursor items { ${CAMPOS} subitems { ${CAMPOS} } } } }`;

async function traerItems(boardId: string): Promise<ItemMonday[]> {
  type Pagina = { cursor: string | null; items: ItemMonday[] };
  const primera = await mondayFetch<{ boards: { items_page: Pagina }[] }>(PRIMERA, { ids: [boardId] });
  let pagina = primera.boards[0]?.items_page;
  const out: ItemMonday[] = [...(pagina?.items ?? [])];
  while (pagina?.cursor) {
    pagina = (await mondayFetch<{ next_items_page: Pagina }>(SIGUIENTE, { cursor: pagina.cursor })).next_items_page;
    out.push(...pagina.items);
  }
  return out;
}

/** assetId → id de la columna de archivo de Monday donde está. */
function assetsPorColumna(cvs: { id: string; value: string | null }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const cv of cvs) {
    try {
      const files = (JSON.parse(cv.value ?? "{}") as { files?: { assetId?: number | string }[] }).files ?? [];
      for (const f of files) if (f.assetId != null) m.set(String(f.assetId), cv.id);
    } catch { /* valor vacío o raro */ }
  }
  return m;
}

const nombreSeguro = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-120) || "archivo";

export interface ResultadoExtras {
  comentarios: number;
  comentariosNuevos: number;
  /** Actualizaciones que se editaron en Monday (se trae el texto nuevo). */
  comentariosEditados: number;
  archivos: number;
  archivosNuevos: number;
  /** Archivos adjuntos en la bitácora de Monday (no en una columna): no se traen. */
  archivosSinColumna: number;
  errores: string[];
}

export async function traerBitacoraYArchivos(tableroId: string): Promise<ResultadoExtras> {
  const db = getSupabaseAdmin();
  const t = unwrap(await db.from("tableros").select("id, monday_board_id").eq("id", tableroId).maybeSingle());
  if (!t?.monday_board_id) throw new ErrorTablero(400, "Este tablero no viene de Monday");

  const [items, elementos, columnas, yaComentarios, yaArchivos] = await Promise.all([
    traerItems(t.monday_board_id),
    selectAll<{ id: string; monday_item_id: string | null; parent_id: string | null }>((d, h) =>
      db.from("elementos").select("id, monday_item_id, parent_id").eq("tablero_id", tableroId).not("monday_item_id", "is", null).order("id").range(d, h)),
    unwrap(await db.from("tablero_columnas").select("id, nivel, monday_column_id").eq("tablero_id", tableroId).eq("tipo", "archivo").is("archivada_at", null)) ?? [],
    selectAll<{ id: string; monday_update_id: string | null; texto: string }>((d, h) =>
      db.from("elemento_comentarios").select("id, monday_update_id, texto").eq("tablero_id", tableroId).not("monday_update_id", "is", null).order("id").range(d, h)),
    selectAll<{ monday_asset_id: string | null }>((d, h) =>
      db.from("elemento_archivos").select("monday_asset_id").eq("tablero_id", tableroId).not("monday_asset_id", "is", null).is("borrado_at", null).order("id").range(d, h)),
  ]);
  const elementoDe = new Map(elementos.map((e) => [e.monday_item_id!, e]));
  const columnaDe = (nivel: string, mondayCol: string) => columnas.find((c) => c.nivel === nivel && c.monday_column_id === mondayCol)?.id;
  const comentariosPrevios = new Map(yaComentarios.map((c) => [c.monday_update_id, c]));
  const archivosPrevios = new Set(yaArchivos.map((a) => a.monday_asset_id));

  const res: ResultadoExtras = { comentarios: 0, comentariosNuevos: 0, comentariosEditados: 0, archivos: 0, archivosNuevos: 0, archivosSinColumna: 0, errores: [] };
  const comentarios: { tablero_id: string; elemento_id: string; autor_nombre: string; autor_email: string | null; texto: string; creado_at: string; monday_update_id: string }[] = [];
  const pendientes: { asset: AssetMonday; elementoId: string; columnaId: string }[] = [];
  const editados: { id: string; texto: string }[] = [];

  const procesar = (it: Omit<ItemMonday, "subitems">, nivel: "item" | "sub") => {
    const e = elementoDe.get(it.id);
    if (!e) return;
    for (const u of it.updates) {
      const texto = normalizarTextoComentario(u.text_body);
      if (!texto) continue;
      res.comentarios++;
      const previo = comentariosPrevios.get(u.id);
      if (previo) {
        if (previo.texto !== texto) editados.push({ id: previo.id, texto }); // se editó en Monday
        continue;
      }
      comentarios.push({
        tablero_id: tableroId, elemento_id: e.id, autor_nombre: u.creator?.name ?? "Monday", autor_email: u.creator?.email ?? null,
        texto, creado_at: u.created_at, monday_update_id: u.id,
      });
    }
    const enColumna = assetsPorColumna(it.column_values);
    for (const a of it.assets) {
      const mondayCol = enColumna.get(String(a.id));
      const columnaId = mondayCol ? columnaDe(nivel, mondayCol) : undefined;
      if (!columnaId) { res.archivosSinColumna++; continue; }
      res.archivos++;
      if (!archivosPrevios.has(String(a.id))) pendientes.push({ asset: a, elementoId: e.id, columnaId });
    }
  };
  for (const it of items) {
    procesar(it, "item");
    for (const s of it.subitems ?? []) procesar(s, "sub");
  }

  for (const lote of enTrozos(comentarios, 500)) {
    unwrap(await db.from("elemento_comentarios").upsert(lote, { onConflict: "monday_update_id", ignoreDuplicates: true }));
  }
  res.comentariosNuevos = comentarios.length;
  for (const c of editados) unwrap(await db.from("elemento_comentarios").update({ texto: c.texto, editado_at: new Date().toISOString() }).eq("id", c.id));
  res.comentariosEditados = editados.length;

  for (const p of pendientes) {
    try {
      if (!p.asset.public_url) throw new Error("Monday no dio enlace de descarga");
      const r = await fetch(p.asset.public_url);
      if (!r.ok) throw new Error(`descarga ${r.status}`);
      const contenido = Buffer.from(await r.arrayBuffer());
      const tipo = r.headers.get("content-type") ?? "application/octet-stream";
      const ruta = `${tableroId}/${p.elementoId}/${randomUUID()}/${nombreSeguro(p.asset.name)}`;
      const subida = await db.storage.from("tableros").upload(ruta, contenido, { contentType: tipo });
      if (subida.error) throw new Error(subida.error.message);
      unwrap(await db.from("elemento_archivos").insert({
        tablero_id: tableroId, elemento_id: p.elementoId, columna_id: p.columnaId, ruta, nombre: p.asset.name,
        tamano: contenido.length, tipo_mime: tipo, estado: "listo", monday_asset_id: String(p.asset.id),
      }));
      res.archivosNuevos++;
    } catch (e) {
      res.errores.push(`${p.asset.name}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return res;
}
