// SOLO SERVIDOR. Bot de Google Chat · núcleo: quién escribe. Correo de Google → cuenta de la app (sin crearla) → rol.
// Lo común a todos los flujos; los permisos de cada flujo los decide su `puedeUsar`.

import { appUserPorEmail } from "@/lib/users";
import { verificarIdTokenGoogle } from "./token";
import { AvisoChat, type UsuarioChat } from "./flujo";
import type { EventoChat } from "./eventos";

/** El correo de quien escribe: lo trae chat.user (confirmado con Google real); si no, el ID token del usuario (verificado). */
async function correoDe(e: EventoChat): Promise<string | null> {
  const directo = e.chat?.user?.email?.trim().toLowerCase();
  if (directo) return directo;
  const token = e.authorizationEventObject?.userIdToken;
  if (!token) return null;
  try {
    const c = await verificarIdTokenGoogle(token);
    return c.email_verified && c.email ? c.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Lanza AvisoChat si no se le puede atender (sin correo, otro dominio, sin cuenta o en espera). */
export async function usuarioDeEvento(e: EventoChat): Promise<UsuarioChat> {
  const email = await correoDe(e);
  if (!email) throw new AvisoChat("No pude saber quién eres en Google Chat. Avísale al PMO.");
  const dominio = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN?.toLowerCase();
  if (dominio && !email.endsWith(`@${dominio}`)) throw new AvisoChat("Este bot solo es para cuentas de la empresa.");
  const me = await appUserPorEmail(email);
  if (!me) throw new AvisoChat("Todavía no tienes cuenta en PMO Control Tower. Entra una vez a la app con tu correo y pide acceso al PMO.");
  if (!me.roleId) throw new AvisoChat("Tu cuenta de PMO Control Tower está en espera: un Admin tiene que asignarte un rol.");
  return { email, me };
}
