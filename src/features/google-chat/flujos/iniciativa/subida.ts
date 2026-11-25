// Flujo «Nueva iniciativa» · los archivos del formulario y la regla de la descripción. Lógica PURA (la usan el servidor,
// la página de subida y los tests).
//
// Google Chat no tiene un control para subir archivos dentro de un formulario (decisión del PMO, 2026-11-25):
//  · La descripción pide al menos MIN_DESCRIPCION caracteres, salvo que marque «Adjuntaré un archivo».
//  · Al marcarla aparece «📎 Subir archivo»: abre una página de la app (RUTA_PAGINA_SUBIDA) con un enlace firmado (su correo
//    + el BORRADOR, el id que el bot le dio a ese formulario). Lo que sube queda en el borrador.
//  · Si la marcó, el archivo es OBLIGATORIO: «Crear iniciativa» no avanza sin al menos uno subido. Al crearla, los archivos
//    del borrador pasan a la bitácora, pegados a la entrada de la descripción.

import { MAX_ADJUNTOS_COMENTARIO } from "@/features/tableros/dominio/bitacora";

export const MIN_DESCRIPCION = 200;

/** La casilla «Adjuntaré un archivo» del formulario (quita el mínimo de la descripción y pide el archivo). */
export const CAMPO_ADJUNTARE = "adjuntare";

/** La página donde se suben los archivos y su API (sin sesión: las protege el enlace firmado). */
export const RUTA_PAGINA_SUBIDA = "/archivos-iniciativa";
export const API_SUBIDA = "/api/google-chat/archivos";

/** Cuánto dura el enlace de la página (el formulario puede quedarse abierto un rato). */
export const VIDA_SUBIDA_SEG = 12 * 3600;
/** Los borradores que nunca se usan se borran (con sus archivos) a los 2 días. */
export const VIDA_BORRADOR_MS = 2 * 24 * 3600 * 1000;
/** Igual que la bitácora: hasta 10 archivos por entrada y 50 MB cada uno. */
export const MAX_ARCHIVOS_BORRADOR = MAX_ADJUNTOS_COMENTARIO;
export const MAX_BYTES_ARCHIVO = 50 * 1024 * 1024;
/** Carpeta del bucket «tableros» donde esperan los archivos hasta que se crea la iniciativa. */
export const CARPETA_BORRADORES = "chat-borradores";

const PREFIJO_SUBIDA = "subir:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Es un id de borrador válido? (los genera el servidor con randomUUID) */
export const esBorrador = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Lo que va firmado en el enlace de la página: quién sube y a qué borrador. */
export const datoSubida = (email: string, borrador: string) => `${PREFIJO_SUBIDA}${email.toLowerCase()}|${borrador}`;

/** El correo y el borrador de un dato firmado; null si no es de una subida. */
export function leerDatoSubida(dato: string | null): { email: string; borrador: string } | null {
  if (!dato?.startsWith(PREFIJO_SUBIDA)) return null;
  const partes = dato.slice(PREFIJO_SUBIDA.length).split("|");
  if (partes.length !== 2) return null;
  const [email, borrador] = partes;
  if (!email.includes("@") || !esBorrador(borrador)) return null;
  return { email, borrador };
}

/** Dónde espera un archivo del borrador (el nombre real vive en la tabla; la ruta solo tiene que ser única). */
export const rutaBorrador = (borrador: string, archivoId: string) => `${CARPETA_BORRADORES}/${borrador}/${archivoId}`;

/** Cuántos caracteres cuenta la regla: sin espacios repetidos ni al principio o al final; un emoji cuenta 1. */
export const largoDescripcion = (s: string) => [...s.replace(/\s+/g, " ").trim()].length;

/** Lo que impide crear la iniciativa por la regla de la descripción y los archivos (vacío = se puede). La descripción vacía
 *  ya la reporta el formulario («Falta Descripción»). */
export function erroresDeDescripcion(o: { descripcion: string; adjuntare: boolean; archivos: number }): string[] {
  if (o.adjuntare) {
    return o.archivos > 0 ? []
      : ["Marcaste «Adjuntaré un archivo» pero todavía no has subido ninguno: toca «📎 Subir archivo», súbelo y vuelve a tocar «Crear iniciativa»."];
  }
  const n = largoDescripcion(o.descripcion);
  if (n === 0 || n >= MIN_DESCRIPCION) return [];
  return [`La descripción necesita al menos ${MIN_DESCRIPCION} caracteres (lleva ${n}). Si el detalle va en un archivo, marca «Adjuntaré un archivo» y súbelo.`];
}
