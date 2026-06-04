// src/app/api/users/[uid]/route.ts
// Asigna un rol a un usuario. Requiere acción manage_users.

import { NextResponse } from "next/server";
import { assignRole, requireAction } from "@/lib/users";
import { getRole } from "@/lib/roles";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "manage_users");
    const { uid } = await params;
    const body = (await request.json()) as { roleId?: string };
    if (!body.roleId) return NextResponse.json({ error: "Falta roleId" }, { status: 400 });

    // Evita que un admin se asigne a sí mismo un rol sin manage_users (auto-bloqueo).
    if (me.uid === uid) {
      const target = await getRole(body.roleId);
      if (!target?.permissions.actions["manage_users"]) {
        return NextResponse.json(
          { error: "No puedes asignarte a ti mismo un rol sin permiso de gestionar usuarios." },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(await assignRole(uid, body.roleId));
  } catch (err) {
    return apiError(err);
  }
}
