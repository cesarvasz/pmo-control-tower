// SOLO SERVIDOR. Flujo «Nueva iniciativa» · el BORRADOR de archivos del formulario (reglas en subida.ts).
// La página /archivos-iniciativa/<código> sube cada archivo directo a Storage (URL firmada: no pasa por Vercel, que limita
// el tamaño) al bucket «tableros», carpeta chat-borradores/<borrador>/, y lo anota en google_chat_borrador_archivos
// (migración 20261125120000). Al crear la iniciativa, los archivos se MUEVEN a su bitácora y las filas se borran.

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import { limpiarTexto } from "@/features/tableros/dominio/tablero";
import { firmar, verificarFirma } from "../../nucleo/firma";
import {
  datoSubida, leerDatoSubida, MAX_ARCHIVOS_BORRADOR, MAX_BYTES_ARCHIVO, RUTA_PAGINA_SUBIDA, rutaBorrador, VIDA_BORRADOR_MS,
  VIDA_SUBIDA_SEG,
} from "./subida";

const BUCKET = "tableros";
const TABLA = "google_chat_borrador_archivos";
const db = () => getSupabaseAdmin();

/** Un formulario nuevo, un borrador nuevo. */
export const nuevoBorrador = () => randomUUID();

/** El enlace de la página de subida para este correo y este borrador (lo abre la persona desde el formulario). */
export function enlaceSubida(origen: string, email: string, borrador: string): string {
  return `${origen}${RUTA_PAGINA_SUBIDA}/${firmar(datoSubida(email, borrador), VIDA_SUBIDA_SEG)}`;
}

/** Algo que la página de subida le tiene que decir a la persona (con su código HTTP). */
export class ErrorSubida extends Error {
  constructor(readonly status: number, mensaje: string) { super(mensaje); }
}

/** De quién y de qué borrador es el código de la página. Lanza ErrorSubida (410) si venció o no es válido. */
export function quienSube(codigo: unknown): { email: string; borrador: string } {
  const q = leerDatoSubida(typeof codigo === "string" ? verificarFirma(codigo) : null);
  if (!q) throw new ErrorSubida(410, "El enlace venció o no es válido. Vuelve a abrir el formulario en Google Chat (/iniciativa).");
  return q;
}

export interface ArchivoBorrador { id: string; nombre: string; tamano: number | null; tipoMime: string | null; ruta: string }

/** Los archivos del borrador (por defecto, solo los que terminaron de subirse), del más viejo al más nuevo. */
export async function archivosDelBorrador(email: string, borrador: string, o: { conPendientes?: boolean } = {}): Promise<ArchivoBorrador[]> {
  let q = db().from(TABLA).select("id, nombre, tamano, tipo_mime, ruta, estado").eq("borrador", borrador).eq("email", email.toLowerCase());
  if (!o.conPendientes) q = q.eq("estado", "listo");
  const filas = unwrap(await q.order("creado_at")) ?? [];
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, tamano: f.tamano, tipoMime: f.tipo_mime, ruta: f.ruta }));
}

async function archivoDe(email: string, borrador: string, archivoId: unknown) {
  if (typeof archivoId !== "string") throw new ErrorSubida(400, "Falta el archivo");
  const a = (await archivosDelBorrador(email, borrador, { conPendientes: true })).find((x) => x.id === archivoId);
  if (!a) throw new ErrorSubida(404, "Ese archivo ya no está");
  return a;
}

/** Paso 1 de la subida: valida y devuelve la URL firmada (ruta + token) para que el navegador suba directo a Storage. */
export async function prepararSubida(codigo: unknown, d: { nombre?: unknown; tamano?: unknown; tipoMime?: unknown }) {
  const { email, borrador } = quienSube(codigo);
  const nombre = limpiarTexto(d.nombre, 255);
  if (!nombre) throw new ErrorSubida(400, "Falta el nombre del archivo");
  const tamano = typeof d.tamano === "number" && Number.isFinite(d.tamano) && d.tamano >= 0 ? Math.round(d.tamano) : null;
  if ((tamano ?? 0) > MAX_BYTES_ARCHIVO) throw new ErrorSubida(400, `«${nombre}» pasa de 50 MB`);
  const ya = await archivosDelBorrador(email, borrador, { conPendientes: true });
  if (ya.length >= MAX_ARCHIVOS_BORRADOR) throw new ErrorSubida(400, `Se pueden subir hasta ${MAX_ARCHIVOS_BORRADOR} archivos por iniciativa`);
  const archivoId = randomUUID();
  const ruta = rutaBorrador(borrador, archivoId);
  const firmada = await db().storage.from(BUCKET).createSignedUploadUrl(ruta);
  if (firmada.error) throw new Error(firmada.error.message);
  unwrap(await db().from(TABLA).insert({
    id: archivoId, borrador, email, ruta, nombre, tamano, tipo_mime: typeof d.tipoMime === "string" ? d.tipoMime.slice(0, 120) || null : null,
  }));
  return { archivoId, ruta, token: firmada.data.token };
}

/** Paso 2: el navegador avisa que terminó; se revisa que el archivo de verdad esté en Storage (y se toma su tamaño real). */
export async function confirmarSubida(codigo: unknown, archivoId: unknown): Promise<void> {
  const { email, borrador } = quienSube(codigo);
  const a = await archivoDe(email, borrador, archivoId);
  const corte = a.ruta.lastIndexOf("/");
  const nombreObjeto = a.ruta.slice(corte + 1);
  const lista = await db().storage.from(BUCKET).list(a.ruta.slice(0, corte), { search: nombreObjeto });
  const objeto = lista.data?.find((o) => o.name === nombreObjeto);
  if (lista.error || !objeto) throw new ErrorSubida(400, "El archivo no llegó a guardarse; vuelve a intentarlo");
  const tamano = typeof objeto.metadata?.size === "number" ? objeto.metadata.size : a.tamano;
  if ((tamano ?? 0) > MAX_BYTES_ARCHIVO) {
    await quitar(a);
    throw new ErrorSubida(400, `«${a.nombre}» pasa de 50 MB`);
  }
  unwrap(await db().from(TABLA).update({ estado: "listo", tamano }).eq("id", a.id));
}

async function quitar(a: Pick<ArchivoBorrador, "id" | "ruta">) {
  await db().storage.from(BUCKET).remove([a.ruta]);
  unwrap(await db().from(TABLA).delete().eq("id", a.id));
}

/** Quitar un archivo del borrador (la persona se equivocó, o la subida falló a medias). */
export async function quitarDelBorrador(codigo: unknown, archivoId: unknown): Promise<void> {
  const { email, borrador } = quienSube(codigo);
  await quitar(await archivoDe(email, borrador, archivoId));
}

/** Ya se pegaron a la bitácora (los archivos se movieron): las filas sobran. */
export async function olvidarArchivos(ids: string[]): Promise<void> {
  if (ids.length) unwrap(await db().from(TABLA).delete().in("id", ids));
}

/** Borra los borradores que nunca se usaron (más de 2 días), con sus archivos. Se llama de vez en cuando (al abrir el
 *  formulario, después de responder), de a poco. */
export async function limpiarBorradoresViejos(ahora = Date.now()): Promise<void> {
  const limite = new Date(ahora - VIDA_BORRADOR_MS).toISOString();
  const viejos = unwrap(await db().from(TABLA).select("id, ruta").lt("creado_at", limite).limit(100)) ?? [];
  if (!viejos.length) return;
  await db().storage.from(BUCKET).remove(viejos.map((v) => v.ruta));
  await olvidarArchivos(viejos.map((v) => v.id));
}
