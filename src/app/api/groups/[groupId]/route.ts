// src/app/api/groups/[groupId]/route.ts
// PATCH: edita nombre/icono/páginas de un grupo. DELETE: elimina el grupo.
// Ambos requieren manage_roles.

import { NextResponse } from "next/server";
import { deleteGroup, updateGroup } from "@/lib/groups";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    await requireAction(request.headers.get("authorization"), "manage_roles");
    const { groupId } = await params;
    const body = (await request.json()) as { name?: string; icon?: string; pageKeys?: unknown };
    return NextResponse.json(
      await updateGroup(groupId, { name: body.name, icon: body.icon, pageKeys: body.pageKeys })
    );
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    await requireAction(request.headers.get("authorization"), "manage_roles");
    const { groupId } = await params;
    await deleteGroup(groupId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
