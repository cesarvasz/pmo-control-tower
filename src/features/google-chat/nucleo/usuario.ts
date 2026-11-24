// SOLO SERVIDOR. Bot de Google Chat · núcleo: quién escribe. Correo de Google → cuenta de la app (sin crearla) → rol.
// Lo común a todos los flujos; los permisos de cada flujo los decide su `puedeUsar`.
// El saludo es más abierto (quienSaluda): contesta a cualquiera del dominio, con su nombre y rol del Directorio RH.

import { appUserPorEmail } from "@/lib/users";
import { BOOTSTRAP_ADMIN_ROLE_ID } from "@/lib/registry";
import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import { verificarIdTokenGoogle } from "./token";
import { AvisoChat, type UsuarioChat } from "./flujo";
import type { EventoChat } from "./eventos";
import { rolDeSaludo, type RolSaludo } from "./menu";

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

/** El correo, solo si es de la empresa. Lanza AvisoChat si no se sabe quién es o es de otro dominio. */
async function correoDeLaEmpresa(e: EventoChat): Promise<string> {
  const email = await correoDe(e);
  if (!email) throw new AvisoChat("No pude saber quién eres en Google Chat. Avísale al PMO.");
  const dominio = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN?.toLowerCase();
  if (dominio && !email.endsWith(`@${dominio}`)) throw new AvisoChat("Este bot solo es para cuentas de la empresa.");
  return email;
}

/** null si la cuenta sirve; si no, por qué (sin cuenta o en espera). */
function problemaDeCuenta(me: AppUser | null): string | null {
  if (!me) return "Todavía no tienes cuenta en PMO Control Tower. Entra una vez a la app con tu correo y pide acceso al PMO.";
  if (!me.roleId) return "Tu cuenta de PMO Control Tower está en espera: un Admin tiene que asignarte un rol.";
  return null;
}

/** Lanza AvisoChat si no se le puede atender (sin correo, otro dominio, sin cuenta o en espera). */
export async function usuarioDeEvento(e: EventoChat): Promise<UsuarioChat> {
  const email = await correoDeLaEmpresa(e);
  const me = await appUserPorEmail(email);
  const problema = problemaDeCuenta(me);
  if (problema || !me) throw new AvisoChat(problema ?? "");
  return { email, me };
}

export interface QuienSaluda {
  /** Del Directorio RH; si no está, el nombre que muestra Google Chat. */
  nombre: string | null;
  /** Admin (rol de la app) o CKU / Sponsor / PM (Directorio RH); null = recibe el mensaje de apoyo. */
  rol: RolSaludo | null;
  /** Para el menú: el usuario de la app, si su cuenta sirve. */
  usuario: UsuarioChat | null;
  /** Por qué no puede usar nada aunque tenga rol (sin cuenta o en espera). */
  aviso: string | null;
}

/** Quién saluda: nombre y rol del Directorio RH (personas, por correo; las inactivas no cuentan) y su cuenta de la app.
 *  Solo lanza AvisoChat si no se sabe quién es o es de otro dominio. */
export async function quienSaluda(e: EventoChat): Promise<QuienSaluda> {
  const email = await correoDeLaEmpresa(e);
  const [persona, me] = await Promise.all([
    getSupabaseAdmin().from("personas").select("nombre, rol").eq("email", email).eq("activo", true).maybeSingle().then(unwrap),
    appUserPorEmail(email),
  ]);
  const aviso = problemaDeCuenta(me);
  const nombre = persona?.nombre?.trim() || e.chat?.user?.displayName?.trim() || null;
  return {
    nombre,
    rol: rolDeSaludo(!aviso && me?.roleId === BOOTSTRAP_ADMIN_ROLE_ID, persona?.rol),
    usuario: !aviso && me ? { email, me } : null,
    aviso,
  };
}
