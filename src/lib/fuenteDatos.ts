// src/lib/fuenteDatos.ts
// Fase 6 de «Tableros propios»: de dónde lee la app los datos de Monday (Iniciativas, PML,
// Proyectos, Estrategia y Directorio RH).
//   FUENTE_DATOS=monday   (o sin definir) → la API de Monday, como siempre.
//   FUENTE_DATOS=tableros                 → los tableros de Supabase, que la sincronización de
//                                            cada hora mantiene al día con Monday.
// Lo que la app escribe (status, bitácora) sigue yendo a Monday en los dos casos mientras dure la
// convivencia. Calendario, hoja, recordatorios y ROI no dependen de esto.

export type FuenteDatos = "monday" | "tableros";

/** Lee el valor de la variable; cualquier otra cosa que no sea «tableros» es Monday. */
export function leerFuenteDatos(valor: string | undefined): FuenteDatos {
  const v = (valor ?? "").trim().toLowerCase();
  if (v === "tableros") return "tableros";
  if (v && v !== "monday") console.warn(`FUENTE_DATOS="${valor}" no se reconoce; se lee de Monday.`);
  return "monday";
}

/** La fuente configurada en este servidor (FUENTE_DATOS). */
export const fuenteDatos = (): FuenteDatos => leerFuenteDatos(process.env.FUENTE_DATOS);

// ── Respaldo automático ──────────────────────────────────────────────────────
// Con FUENTE_DATOS=tableros, si la última sincronización correcta es vieja (la nube dejó de
// sincronizar, Supabase no responde…), la app vuelve a leer de Monday sola hasta que se ponga al
// día: un fallo de la sincronización nunca deja a los usuarios con datos viejos.

/** Horas sin una sincronización correcta antes de volver a Monday (corre cada hora: deja pasar una fallida). */
export const HORAS_MAX_SIN_SINCRONIZAR = 2;

export interface FuenteEfectiva {
  /** La configurada en este servidor (FUENTE_DATOS). */
  configurada: FuenteDatos;
  /** De dónde se lee de verdad ahora. */
  fuente: FuenteDatos;
  /** Inicio de la última sincronización correcta (con tableros). */
  actualizadoAl: string | null;
  /** Por qué se lee de Monday aunque la configurada sea tableros. */
  motivo?: string;
}

/** Decide de dónde leer: tableros solo si la última sincronización correcta tiene menos de `maxHoras`. */
export function decidirFuente(
  configurada: FuenteDatos, actualizadoAl: string | null, ahora: Date = new Date(), maxHoras = HORAS_MAX_SIN_SINCRONIZAR,
): FuenteEfectiva {
  if (configurada === "monday") return { configurada, fuente: "monday", actualizadoAl };
  if (!actualizadoAl) return { configurada, fuente: "monday", actualizadoAl, motivo: "Todavía no hay una sincronización correcta." };
  const horas = (ahora.getTime() - new Date(actualizadoAl).getTime()) / 3600_000;
  if (horas > maxHoras) {
    const hace = horas < 48 ? `${Math.floor(horas)} h` : `${Math.floor(horas / 24)} días`;
    return { configurada, fuente: "monday", actualizadoAl, motivo: `La última sincronización correcta empezó hace ${hace} (más de ${maxHoras} h).` };
  }
  return { configurada, fuente: "tableros", actualizadoAl };
}
