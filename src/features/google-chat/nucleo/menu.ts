// Bot de Google Chat · núcleo: el saludo (con el menú) y a qué flujo va cada evento. Lógica PURA (recibe la lista de flujos).

import type { FlujoChat } from "./flujo";
import { botonBot, mensaje, type RespuestaChat } from "./respuestas";

type FlujoMenu = Pick<FlujoChat, "clave" | "comando" | "titulo" | "descripcion">;

/** Los roles que el saludo reconoce. Quien no tiene uno de estos recibe el mensaje de apoyo. */
export type RolSaludo = "Admin" | "CKU" | "Sponsor" | "PM";

const ROLES_DIRECTORIO: Record<string, RolSaludo> = { CKU: "CKU", SPONSOR: "Sponsor", PM: "PM" };

/** El rol del saludo: Admin si lo es en la app (gana); si no, el rol del Directorio RH (CKU, Sponsor o PM). */
export function rolDeSaludo(esAdminApp: boolean, rolDirectorio: string | null | undefined): RolSaludo | null {
  if (esAdminApp) return "Admin";
  return ROLES_DIRECTORIO[(rolDirectorio ?? "").trim().toUpperCase()] ?? null;
}

export const MENSAJE_APOYO = "Si necesitas apoyo con el equipo de PMO contacta a tu CKU asignado.";

/** El saludo: «¡Hola (nombre)! Rol (rol)» + lo que ESTE usuario puede hacer (un botón por flujo); sin rol reconocido,
 *  solo el mensaje de apoyo. `aviso` = por qué no puede usar nada aunque tenga rol (sin cuenta en la app, en espera). */
export function saludoDe(
  o: { nombre: string | null; rol: RolSaludo | null; flujos: FlujoMenu[]; aviso?: string | null },
  url: string,
): RespuestaChat {
  const hola = o.nombre ? `¡Hola ${o.nombre}!` : "¡Hola!";
  if (!o.rol) return mensaje(`${hola} ${MENSAJE_APOYO}`);
  const encabezado = `${hola} Rol ${o.rol}`;
  if (o.aviso) return mensaje(`${encabezado}\n\n${o.aviso}`);
  if (!o.flujos.length) return mensaje(`${encabezado}\n\nPor ahora tu rol no tiene nada disponible en este bot. Si necesitas algo, pídele acceso al PMO.`);
  const lineas = o.flujos.map((f) => `• *${f.titulo}* (${f.comando}): ${f.descripcion}`);
  return mensaje(
    `${encabezado}\n\nEsto puedo hacer por ti en PMO Control Tower:\n${lineas.join("\n")}\n\nToca un botón o escribe el comando.`,
    o.flujos.map((f) => botonBot({ url, flujo: f.clave, accion: "abrir", texto: f.titulo, dialogo: true })),
  );
}

/** El flujo de un botón. Los botones de antes del menú (bot de una sola función) no traían «flujo»: eran de Iniciativas. */
export function flujoDeBoton<T extends Pick<FlujoChat, "clave">>(flujos: T[], clave: string | null): T | undefined {
  return flujos.find((f) => f.clave === (clave ?? FLUJO_SIN_CLAVE));
}

export const FLUJO_SIN_CLAVE = "iniciativa";
