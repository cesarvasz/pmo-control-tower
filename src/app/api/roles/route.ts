// src/app/api/roles/route.ts
// GET: lista roles (manage_roles O manage_users, p.ej. para el selector de Usuarios).
// POST: crea un rol (solo manage_roles).

import { NextResponse } from "next/server";
import { createRole, listRoles } from "@/lib/roles";
import { requireAction, requireAnyAction } from "@/lib/users";
import { normalizePermissions } from "@/lib/permissions";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAnyAction(request.headers.get("authorization"), ["manage_roles", "manage_users"]);
    return NextResponse.json(await listRoles());
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireAction(request.headers.get("authorization"), "manage_roles");
    const body = (await request.json()) as { name?: string; permissions?: unknown };
    if (!body.name || !body.name.trim())
      return NextResponse.json({ error: "El rol necesita un nombre" }, { status: 400 });
    const role = await createRole(body.name, normalizePermissions(body.permissions as never));
    return NextResponse.json(role, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
