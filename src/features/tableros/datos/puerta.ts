// SOLO SERVIDOR. La puerta única de Tableros: toda ruta de /api/tableros pasa por aquí antes de
// leer o escribir. Capa 1 (acciones globales) ahora; las capas 2 y 3 (por tablero, columna y
// elemento) usan dominio/permisos.ts con el usuario que devuelve `usuarioTableros`.

import { requireSession } from "@/lib/users";
import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import { ACCION_PUENTE, tieneAccionTableros } from "../dominio/acciones";
import type { UsuarioTableros } from "../dominio/permisos";

/** Verifica la sesión y que tenga la acción de Tableros. Lanza "forbidden" si no. */
export async function exigirAccion(request: Request, accion: string): Promise<AppUser> {
  const me = await requireSession(request.headers.get("authorization"));
  if (!tieneAccionTableros(me.permissions, accion)) throw new Error("forbidden");
  return me;
}

/** Página del menú desde la que se gestionan las Iniciativas (registry.ts). Abre SOLO los tableros de categoría Iniciativas. */
export const PAGINA_GESTION_INICIATIVAS = "gestion-iniciativas";

/**
 * Puerta de UN tablero: quien tiene Tableros completo (tableros_ver) entra a cualquiera; quien tiene la página «Gestión de
 * Iniciativas» entra solo a los de categoría Iniciativas. Qué ve y qué edita adentro lo sigue decidiendo el motor de permisos
 * (reglas por rol del tablero, «solo lo mío»). Lanza "forbidden" si no.
 */
export async function exigirAccesoTablero(request: Request, tableroId: string): Promise<AppUser> {
  const me = await requireSession(request.headers.get("authorization"));
  if (tieneAccionTableros(me.permissions, "tableros_ver")) return me;
  if (me.permissions.pages?.[PAGINA_GESTION_INICIATIVAS]) {
    const t = unwrap(await getSupabaseAdmin().from("tableros").select("categoria").eq("id", tableroId).is("archivado_at", null).maybeSingle());
    if (t?.categoria === "iniciativas") return me;
  }
  throw new Error("forbidden");
}

/** Página del menú del Directorio de personas (registry.ts). */
export const PAGINA_DIRECTORIO = "directorio";

/** Ver el directorio: Tableros completo o la página «Directorio». (Cambiarlo sigue pidiendo directorio_administrar.) */
export async function exigirVerDirectorio(request: Request): Promise<AppUser> {
  const me = await requireSession(request.headers.get("authorization"));
  if (tieneAccionTableros(me.permissions, "tableros_ver") || me.permissions.pages?.[PAGINA_DIRECTORIO]) return me;
  throw new Error("forbidden");
}

/** El usuario como lo ve el motor de permisos: su rol, si es Admin y su persona del directorio. */
export async function usuarioTableros(me: AppUser): Promise<UsuarioTableros> {
  const persona = unwrap(await getSupabaseAdmin().from("personas").select("id").eq("app_user_id", me.uid).maybeSingle());
  return { rolId: me.roleId, esAdmin: !!me.permissions.actions[ACCION_PUENTE], personaId: persona?.id ?? null };
}
