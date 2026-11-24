// SOLO SERVIDOR. Bot de Google Chat · núcleo: quién escribe. Correo de Google → persona del Directorio RH + cuenta de la
// app (sin crearla). Solo se rechaza a quien no es de la empresa; lo demás lo decide cada flujo en su `puedeUsar`
// (p. ej. /iniciativa basta con ser CKU en el Directorio; /status-card pide cuenta con permiso).

import { appUserPorEmail } from "@/lib/users";
import { BOOTSTRAP_ADMIN_ROLE_ID } from "@/lib/registry";
import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
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

/** null si la cuenta sirve; si no, por qué (sin cuenta o en espera). */
function problemaDeCuenta(me: AppUser | null): string | null {
  if (!me) return "Todavía no tienes cuenta en PMO Control Tower. Entra una vez a la app con tu correo y pide acceso al PMO.";
  if (!me.roleId) return "Tu cuenta de PMO Control Tower está en espera: un Admin tiene que asignarte un rol.";
  return null;
}

/** Lanza AvisoChat solo si no se sabe quién es o no es de la empresa. */
export async function usuarioDeEvento(e: EventoChat): Promise<UsuarioChat> {
  const email = await correoDe(e);
  if (!email) throw new AvisoChat("No pude saber quién eres en Google Chat. Avísale al PMO.");
  const dominio = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN?.toLowerCase();
  if (dominio && !email.endsWith(`@${dominio}`)) throw new AvisoChat("Este bot solo es para cuentas de la empresa.");

  const [persona, cuenta] = await Promise.all([
    getSupabaseAdmin().from("personas").select("id, nombre, rol").eq("email", email).eq("activo", true).maybeSingle().then(unwrap),
    appUserPorEmail(email),
  ]);
  const avisoCuenta = problemaDeCuenta(cuenta);
  const me = avisoCuenta ? null : cuenta;
  return {
    email,
    nombre: persona?.nombre?.trim() || e.chat?.user?.displayName?.trim() || email,
    persona: persona ? { id: persona.id, nombre: persona.nombre, rol: persona.rol } : null,
    me,
    avisoCuenta,
    esAdmin: me?.roleId === BOOTSTRAP_ADMIN_ROLE_ID,
  };
}
