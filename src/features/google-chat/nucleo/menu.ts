// Bot de Google Chat · núcleo: el menú del saludo y a qué flujo va cada evento. Lógica PURA (recibe la lista de flujos).

import type { FlujoChat } from "./flujo";
import { botonBot, mensaje, type RespuestaChat } from "./respuestas";

type FlujoMenu = Pick<FlujoChat, "clave" | "comando" | "titulo" | "descripcion">;

/** El mensaje de bienvenida: qué puede hacer ESTE usuario, con un botón por flujo. */
export function menuDe(flujos: FlujoMenu[], url: string): RespuestaChat {
  if (!flujos.length) return mensaje("Hola 👋 Por ahora tu rol no tiene nada disponible en este bot. Si necesitas algo, pídele acceso al PMO.");
  const lineas = flujos.map((f) => `• *${f.titulo}* (${f.comando}): ${f.descripcion}`);
  return mensaje(
    `Hola 👋 Esto puedo hacer por ti en PMO Control Tower:\n${lineas.join("\n")}\n\nToca un botón o escribe el comando.`,
    flujos.map((f) => botonBot({ url, flujo: f.clave, accion: "abrir", texto: f.titulo, dialogo: true })),
  );
}

/** El flujo de un botón. Los botones de antes del menú (bot de una sola función) no traían «flujo»: eran de Iniciativas. */
export function flujoDeBoton<T extends Pick<FlujoChat, "clave">>(flujos: T[], clave: string | null): T | undefined {
  return flujos.find((f) => f.clave === (clave ?? FLUJO_SIN_CLAVE));
}

export const FLUJO_SIN_CLAVE = "iniciativa";
