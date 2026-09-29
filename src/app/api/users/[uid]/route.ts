// src/app/api/users/[uid]/route.ts
// Asigna rol y/o página principal a un usuario. Requiere acción manage_users.

import { NextResponse } from "next/server";
import { requireAction, updateUser } from "@/lib/users";
import { getRole } from "@/lib/roles";
import { pageByKey } from "@/lib/registry";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "manage_users");
    const { uid } = await params;
    const body = (await request.json()) as { roleId?: string; defaultPage?: string | null };
    if (body.roleId === undefined && body.defaultPage === undefined) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    // Evita que un admin se asigne a sí mismo un rol sin manage_users (auto-bloqueo).
    if (me.uid === uid && body.roleId !== undefined) {
      const target = await getRole(body.roleId);
      if (!target?.permissions.actions["manage_users"]) {
        return NextResponse.json(
          { error: "No puedes asignarte a ti mismo un rol sin permiso de gestionar usuarios." },
          { status: 400 }
        );
      }
    }

    // defaultPage debe ser una página de contenido real (no una de administración).
    if (body.defaultPage) {
      const page = pageByKey(body.defaultPage);
      if (!page || page.requiredAction) {
        return NextResponse.json({ error: "Página principal inválida" }, { status: 400 });
      }
    }

    return NextResponse.json(await updateUser(uid, { roleId: body.roleId, defaultPage: body.defaultPage }));
  } catch (err) {
    return apiError(err);
  }
}
