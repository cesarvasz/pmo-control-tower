// SOLO SERVIDOR. Trae de Monday lo que la copia no tiene, para un tablero ya importado:
//   · la bitácora: las actualizaciones (Updates) y sus RESPUESTAS, con sus adjuntos
//   · los archivos de las columnas de archivo
// Idempotente: casa por monday_update_id y monday_asset_id, así que se puede correr otra vez para
// traer lo nuevo (y el texto de lo que se editó en Monday). Los archivos se descargan a Supabase
// Storage (los enlaces de Monday vencen).
//
// Monday no da los adjuntos de una RESPUESTA (el tipo Reply no tiene `assets`), pero sí el HTML de
// la respuesta: las imágenes traen su `data-asset_id`, que se pide aparte (`assets(ids:)`).

import { randomUUID } from "node:crypto";
import { mondayFetch } from "@/lib/monday";
import { enTrozos, getSupabaseAdmin, selectAll, unwrap } from "@/lib/supabase-admin";
import { assetsDelHtml, normalizarTextoComentario } from "../dominio/bitacora";
import { ErrorTablero } from "./errores";

interface CreadorMonday { name: string; email: string }
interface AssetMonday { id: string; name: string; public_url: string | null; file_size: number | null; file_extension: string | null }
interface ReplyMonday { id: string; text_body: string | null; body: string | null; created_at: string; creator: CreadorMonday | null }
interface UpdateMonday { id: string; text_body: string | null; created_at: string; creator: CreadorMonday | null; assets: AssetMonday[]; replies: ReplyMonday[] }
interface ItemMonday {
  id: string;
  updates: UpdateMonday[];
  assets: AssetMonday[];
  column_values: { id: string; value: string | null }[];
  subitems?: Omit<ItemMonday, "subitems">[];
}

const ASSET = `id name public_url file_size file_extension`;
const CAMPOS = `id updates(limit: 100) { id text_body created_at creator { name email } assets { ${ASSET} } replies { id text_body body created_at creator { name email } } }
  assets { ${ASSET} } column_values(types: [file]) { id value }`;
const PRIMERA = `query ($ids: [ID!]) { boards(ids: $ids) { items_page(limit: 25) { cursor items { ${CAMPOS} subitems { ${CAMPOS} } } } } }`;
const SIGUIENTE = `query ($cursor: String!) { next_items_page(limit: 25, cursor: $cursor) { cursor items { ${CAMPOS} subitems { ${CAMPOS} } } } }`;
const POR_ID = `query ($ids: [ID!]!) { assets(ids: $ids) { ${ASSET} } }`;

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

/** Monday no entrega el archivo (su enlace público responde 403, 404 o 410). */
class NoDisponible extends Error {}

/** Corre `fn` sobre la lista con a lo sumo `n` a la vez. */
async function enParalelo<T>(lista: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => { while (i < lista.length) await fn(lista[i++]); }));
}

export interface ResultadoExtras {
  /** Actualizaciones y respuestas de Monday (con texto o adjuntos). */
  comentarios: number;
  comentariosNuevos: number;
  /** Actualizaciones que se editaron en Monday (se trae el texto nuevo). */
  comentariosEditados: number;
  /** Respuestas nuevas (ya incluidas en comentariosNuevos). */
  respuestasNuevas: number;
  archivos: number;
  archivosNuevos: number;
  /** Archivos de Monday que no están en una columna ni en una actualización: no se traen. */
  archivosSinColumna: number;
  /** Archivos que Monday ya no entrega (su enlace público da 403, 404 o 410, o la imagen de una respuesta no aparece). No cuentan como error. */
  adjuntosSinTraer: number;
  errores: string[];
}

interface FilaComentario {
  id: string; tablero_id: string; elemento_id: string; autor_nombre: string; autor_email: string | null; texto: string;
  creado_at: string; monday_update_id: string; respuesta_a: string | null;
}
interface Pendiente {
  asset: AssetMonday; elementoId: string;
  /** Va a una columna de archivo… */
  columnaId?: string;
  /** …o a un comentario (id de la actualización o respuesta en Monday). */
  comentarioMondayId?: string;
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
  const comentariosPrevios = new Map(yaComentarios.map((c) => [c.monday_update_id!, c]));
  /** id de Monday de cada actualización o respuesta → su id en la base (los previos y los nuevos). */
  const idDeComentario = new Map(yaComentarios.map((c) => [c.monday_update_id!, c.id]));
  const archivosPrevios = new Set(yaArchivos.map((a) => a.monday_asset_id));
  const vistos = new Set<string>(); // un archivo se trae una sola vez aunque aparezca en varios lados

  const res: ResultadoExtras = {
    comentarios: 0, comentariosNuevos: 0, comentariosEditados: 0, respuestasNuevas: 0,
    archivos: 0, archivosNuevos: 0, archivosSinColumna: 0, adjuntosSinTraer: 0, errores: [],
  };
  const comentarios: FilaComentario[] = [];
  const pendientes: Pendiente[] = [];
  const editados: { id: string; texto: string }[] = [];
  /** Imágenes dentro del HTML de una respuesta: se piden aparte. */
  const deRespuestas: { assetId: string; elementoId: string; comentarioMondayId: string }[] = [];

  const procesar = (it: Omit<ItemMonday, "subitems">, nivel: "item" | "sub") => {
    const e = elementoDe.get(it.id);
    if (!e) return;
    const enColumna = assetsPorColumna(it.column_values);
    const reconocidos = new Set<string>();

    /** Un comentario (actualización o respuesta): lo crea, o detecta que se editó en Monday. */
    const guardarComentario = (
      m: { id: string; text_body: string | null; created_at: string; creator: CreadorMonday | null }, respuestaA: string | null, tieneAdjuntos: boolean,
    ) => {
      const texto = normalizarTextoComentario(m.text_body) ?? "";
      if (!texto && !tieneAdjuntos) return false;
      res.comentarios++;
      const previo = comentariosPrevios.get(m.id);
      if (previo) {
        if (previo.texto !== texto) editados.push({ id: previo.id, texto }); // se editó en Monday
        return true;
      }
      const id = randomUUID();
      idDeComentario.set(m.id, id);
      comentarios.push({
        id, tablero_id: tableroId, elemento_id: e.id, autor_nombre: m.creator?.name ?? "Monday", autor_email: m.creator?.email ?? null,
        texto, creado_at: m.created_at, monday_update_id: m.id, respuesta_a: respuestaA,
      });
      if (respuestaA) res.respuestasNuevas++;
      return true;
    };

    for (const u of it.updates) {
      // Los adjuntos de la actualización (los que además están en una columna de archivo van por la columna).
      const adjuntos = u.assets.filter((a) => !enColumna.has(String(a.id)));
      const hayReplies = u.replies.some((r) => normalizarTextoComentario(r.text_body) || assetsDelHtml(r.body).length);
      if (!guardarComentario(u, null, adjuntos.length > 0 || hayReplies)) continue;
      for (const a of adjuntos) {
        reconocidos.add(String(a.id));
        res.archivos++;
        if (!archivosPrevios.has(String(a.id)) && !vistos.has(String(a.id))) { vistos.add(String(a.id)); pendientes.push({ asset: a, elementoId: e.id, comentarioMondayId: u.id }); }
      }
      for (const r of u.replies) {
        const ids = assetsDelHtml(r.body);
        if (!guardarComentario(r, idDeComentario.get(u.id) ?? null, ids.length > 0)) continue;
        for (const assetId of ids) deRespuestas.push({ assetId, elementoId: e.id, comentarioMondayId: r.id });
      }
    }

    for (const a of it.assets) {
      const mondayCol = enColumna.get(String(a.id));
      const columnaId = mondayCol ? columnaDe(nivel, mondayCol) : undefined;
      if (!columnaId) { if (!reconocidos.has(String(a.id)) && !mondayCol) res.archivosSinColumna++; continue; }
      reconocidos.add(String(a.id));
      res.archivos++;
      if (!archivosPrevios.has(String(a.id)) && !vistos.has(String(a.id))) { vistos.add(String(a.id)); pendientes.push({ asset: a, elementoId: e.id, columnaId }); }
    }
  };
  for (const it of items) {
    procesar(it, "item");
    for (const s of it.subitems ?? []) procesar(s, "sub");
  }

  // Imágenes de las respuestas: no vienen en la respuesta, se piden por su id.
  const nuevasDeRespuestas = deRespuestas.filter((d) => !archivosPrevios.has(d.assetId) && !vistos.has(d.assetId));
  for (const lote of enTrozos([...new Set(nuevasDeRespuestas.map((d) => d.assetId))], 50)) {
    try {
      const r = await mondayFetch<{ assets: AssetMonday[] }>(POR_ID, { ids: lote });
      const porId = new Map(r.assets.map((a) => [String(a.id), a]));
      for (const id of lote) {
        const d = nuevasDeRespuestas.find((x) => x.assetId === id)!;
        const a = porId.get(id);
        vistos.add(id);
        if (!a?.public_url) { res.adjuntosSinTraer++; continue; }
        res.archivos++;
        pendientes.push({ asset: a, elementoId: d.elementoId, comentarioMondayId: d.comentarioMondayId });
      }
    } catch { res.adjuntosSinTraer += lote.length; }
  }
  res.archivos += deRespuestas.filter((d) => archivosPrevios.has(d.assetId)).length;

  // Comentarios primero: los archivos y las respuestas apuntan a ellos.
  for (const lote of enTrozos(comentarios, 500)) {
    unwrap(await db.from("elemento_comentarios").upsert(lote, { onConflict: "monday_update_id", ignoreDuplicates: true }));
  }
  res.comentariosNuevos = comentarios.length;
  for (const c of editados) unwrap(await db.from("elemento_comentarios").update({ texto: c.texto, editado_at: new Date().toISOString() }).eq("id", c.id));
  res.comentariosEditados = editados.length;

  await enParalelo(pendientes, 4, async (p) => {
    try {
      if (!p.asset.public_url) throw new Error("Monday no dio enlace de descarga");
      const comentarioId = p.comentarioMondayId ? idDeComentario.get(p.comentarioMondayId) : undefined;
      if (p.comentarioMondayId && !comentarioId) throw new Error("su comentario no se guardó");
      const r = await fetch(p.asset.public_url);
      if ([403, 404, 410].includes(r.status)) throw new NoDisponible();
      if (!r.ok) throw new Error(`descarga ${r.status}`);
      const contenido = Buffer.from(await r.arrayBuffer());
      const tipo = r.headers.get("content-type") ?? "application/octet-stream";
      const ruta = `${tableroId}/${p.elementoId}/${randomUUID()}/${nombreSeguro(p.asset.name)}`;
      const subida = await db.storage.from("tableros").upload(ruta, contenido, { contentType: tipo });
      if (subida.error) throw new Error(subida.error.message);
      const fila = await db.from("elemento_archivos").insert({
        tablero_id: tableroId, elemento_id: p.elementoId, columna_id: p.columnaId ?? null, comentario_id: comentarioId ?? null, ruta,
        nombre: p.asset.name, tamano: contenido.length, tipo_mime: tipo, estado: "listo", monday_asset_id: String(p.asset.id),
      });
      if (fila.error) { await db.storage.from("tableros").remove([ruta]); throw new Error(fila.error.message); }
      res.archivosNuevos++;
    } catch (e) {
      // Monday mismo dice que ese archivo no está: no hay nada que reintentar ni que reportar como falla.
      if (e instanceof NoDisponible) res.adjuntosSinTraer++;
      else res.errores.push(`${p.asset.name}: ${e instanceof Error ? e.message : "error"}`);
    }
  });
  return res;
}
