// Flujo «Status Card»: los códigos firmados y sus constantes. Lógica PURA.
//  · Hoja interna (/status-card-imagen/<código>): «status-card:<boardId>», vive 2 min (lo justo para que Chrome la abra).
//  · Foto en el chat (/api/google-chat/foto/<código>): «foto:<boardId>:<emitido>», vive 7 días. `emitido` (ms) identifica
//    la foto: la primera vez que se pide se toma y se guarda, y después se entrega la misma (no cambia en esos 7 días).

export const PREFIJO_CODIGO = "status-card:";
/** Vida del código de la hoja: lo justo para que Chrome la abra. */
export const VIDA_CODIGO_SEG = 120;
/** Cuánto se sigue viendo la imagen en el chat. Decisión del usuario: 7 días. */
export const VIGENCIA_IMAGEN_DIAS = 7;
export const VIDA_FOTO_SEG = VIGENCIA_IMAGEN_DIAS * 24 * 3600;

const PREFIJO_FOTO = "foto:";

export const datoFoto = (boardId: string, emitido: number) => `${PREFIJO_FOTO}${boardId}:${emitido}`;

/** El proyecto y el momento de una foto, o null si el dato no es de una foto. */
export function leerDatoFoto(dato: string | null): { boardId: string; emitido: number } | null {
  const m = dato ? /^foto:([A-Za-z0-9_-]+):(\d+)$/.exec(dato) : null;
  return m ? { boardId: m[1], emitido: Number(m[2]) } : null;
}

/** Dónde se guarda la foto en el bucket. */
export const rutaFoto = (boardId: string, emitido: number) => `status-card/${boardId}/${emitido}.png`;

/** Medidas de la hoja A4 horizontal a 96 dpi: las mismas SHEET_W / SHEET_H de components/StatusReport.tsx (ese archivo es
 *  de cliente: sus exportaciones no se pueden leer como números en el servidor). */
export const HOJA_W = (297 * 96) / 25.4;
export const HOJA_H = (210 * 96) / 25.4;
