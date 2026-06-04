// src/app/api/roles/[roleId]/route.ts
// PATCH: edita nombre/permisos de un rol. DELETE: elimina un rol. Solo manage_roles.

import { NextResponse } from "next/server";
import { deleteRole, updateRole } from "@/lib/roles";
import { requireAction } from "@/lib/users";
import { normalizePermissions } from "@/lib/permissions";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "manage_roles");
    const { roleId } = await params;
    const body = (await request.json()) as { name?: string; permissions?: unknown };
    const permissions = body.permissions ? normalizePermissions(body.permissions as never) : undefined;

    // Evita que un admin se quite a sí mismo manage_roles editando su propio rol.
    if (me.roleId === roleId && permissions && !permissions.actions["manage_roles"]) {
      return NextResponse.json(
        { error: "No puedes quitar 'gestionar roles' de tu propio rol (quedarías bloqueado)." },
        { status: 400 }
      );
    }

    return NextResponse.json(await updateRole(roleId, { name: body.name, permissions }));
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    await requireAction(request.headers.get("authorization"), "manage_roles");
    const { roleId } = await params;
    await deleteRole(roleId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
