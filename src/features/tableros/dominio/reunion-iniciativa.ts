// Módulo PURO. Qué reunión toca agendar en una iniciativa y quién puede hacerlo.
//  · Status New → Meeting 1 (M1); status Meeting 1 → Meeting 2 (M2); en cualquier otra etapa no hay nada que agendar.
//  · Un Admin agenda cualquier iniciativa; un PM solo en las que él es el PM (su persona del Directorio está en la columna PM).

import { claveNombre } from "./personas";

export type TipoReunionIni = "M1" | "M2";

/** La reunión que toca según el texto del Status («New», «Meeting 1»…); null = ninguna. */
export function reunionQueToca(statusTexto: string | null | undefined): TipoReunionIni | null {
  const st = claveNombre(statusTexto ?? "");
  // Sin status se trata como New (así lo dibuja el timeline)
  return !st || st === "new" ? "M1" : st === "meeting 1" ? "M2" : null;
}

/** ¿Puede esta persona agendar la reunión de esta iniciativa? `pmIds` = personas de la columna PM de la iniciativa. */
export function puedeAgendarIniciativa(u: { esAdmin: boolean; personaId: string | null }, pmIds: unknown): boolean {
  if (u.esAdmin) return true;
  return !!u.personaId && Array.isArray(pmIds) && pmIds.includes(u.personaId);
}

/**
 * Interruptor del botón «📅 Agendar» (y de Reprogramar / Cancelar) en las iniciativas. APAGADO mientras la integración con Google
 * Calendar no esté probada con credenciales reales y configurada en Vercel (docs/google-calendar.md). El código y las rutas ya están;
 * para encenderlo: poner `true` y verificar GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_STATE_SECRET.
 */
export const AGENDAR_REUNIONES_ACTIVO = false;
