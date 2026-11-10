// src/lib/surveyCkuAuth.ts
// SOLO SERVIDOR. Quién puede crear y ver las encuestas NPS de un CKU: un Admin (manage_roles) las de cualquier CKU, y un
// CKU solo las suyas (su CKU sale de su correo en el Directorio RH). Lo decide el servidor, no el cliente.

import { fetchHrItems } from "@/lib/monday";
import { ckuNameForEmail, nombreCkuCanonico } from "@/lib/players";
import type { AppUser } from "@/lib/permissions";

export interface ActorCku {
  admin: boolean;
  /** El CKU que es esta persona (nombre canónico), o null si no es CKU. */
  cku: string | null;
}

export async function actorCku(me: AppUser): Promise<ActorCku> {
  const admin = !!me.permissions.actions["manage_roles"];
  const nombre = ckuNameForEmail(await fetchHrItems(), me.email);
  return { admin, cku: nombre ? nombreCkuCanonico(nombre) : null };
}

/** ¿Puede esta persona ver/gestionar las encuestas del CKU dado? */
export const puedeVerCku = (a: ActorCku, cku: string) => a.admin || (a.cku !== null && a.cku === cku);
