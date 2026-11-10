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

/** El usuario como lo ve el motor de permisos: su rol, si es Admin y su persona del directorio. */
export async function usuarioTableros(me: AppUser): Promise<UsuarioTableros> {
  const persona = unwrap(await getSupabaseAdmin().from("personas").select("id").eq("app_user_id", me.uid).maybeSingle());
  return { rolId: me.roleId, esAdmin: !!me.permissions.actions[ACCION_PUENTE], personaId: persona?.id ?? null };
}
