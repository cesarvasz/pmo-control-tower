// Bitácora de un elemento (los "Updates" de Monday): comentarios con autor y fecha, respuestas y
// archivos adjuntos. PURA.

export const MAX_COMENTARIO = 10_000;
/** Archivos por comentario (para que un comentario no se vuelva un cajón). */
export const MAX_ADJUNTOS_COMENTARIO = 10;

export interface AdjuntoComentario {
  id: string;
  nombre: string;
  tamano: number | null;
  tipoMime: string | null;
  /** Vino de Monday (no se borra mientras el tablero se sincroniza). */
  deMonday: boolean;
  /** Quién lo subió (null si vino de Monday). */
  subidoPor: string | null;
}

export interface Comentario {
  id: string;
  autorId: string | null;
  autorNombre: string;
  autorEmail: string | null;
  texto: string;
  creadoAt: string;
  editadoAt: string | null;
  /** Vino de Monday (Updates). */
  deMonday: boolean;
  /** Si es una respuesta, la actualización a la que responde (Monday solo anida un nivel). */
  respuestaA: string | null;
  archivos: AdjuntoComentario[];
}

/** Texto listo para guardar: sin espacios de más a los lados, con saltos de línea normalizados. */
export function normalizarTextoComentario(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_COMENTARIO);
  return s || null;
}

/** Ids de los adjuntos que trae el HTML de una respuesta de Monday (imágenes con data-asset_id). */
export function assetsDelHtml(html: string | null): string[] {
  return [...new Set([...(html ?? "").matchAll(/data-asset_id="(\d+)"/g)].map((m) => m[1]))];
}

export interface HiloBitacora { comentario: Comentario; respuestas: Comentario[] }

/**
 * Ordena la bitácora en hilos: las actualizaciones, la más nueva primero, y debajo de cada una sus
 * respuestas, la más antigua primero (como se lee una conversación). Una respuesta cuya
 * actualización ya no existe se muestra como actualización suelta, para no perderla.
 */
export function armarHilos(lista: Comentario[]): HiloBitacora[] {
  const ids = new Set(lista.map((c) => c.id));
  const raices = lista.filter((c) => !c.respuestaA || !ids.has(c.respuestaA));
  const respuestasDe = (id: string) => lista.filter((c) => c.respuestaA === id).sort((a, b) => a.creadoAt.localeCompare(b.creadoAt));
  return raices.sort((a, b) => b.creadoAt.localeCompare(a.creadoAt)).map((c) => ({ comentario: c, respuestas: respuestasDe(c.id) }));
}

export function tamanoLegible(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
