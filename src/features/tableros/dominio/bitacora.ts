// Bitácora de un elemento (los "Updates" de Monday): comentarios con autor y fecha. PURA.

export const MAX_COMENTARIO = 10_000;

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
}

/** Texto listo para guardar: sin espacios de más a los lados, con saltos de línea normalizados. */
export function normalizarTextoComentario(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_COMENTARIO);
  return s || null;
}
