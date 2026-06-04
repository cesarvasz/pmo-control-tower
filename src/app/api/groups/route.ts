// src/app/api/groups/route.ts
// GET: lista grupos (cualquier usuario autenticado — el sidebar los necesita).
// POST: crea un grupo (solo manage_roles).

import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { createGroup, listGroups } from "@/lib/groups";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await verifyRequest(request.headers.get("authorization"));
    return NextResponse.json(await listGroups());
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireAction(request.headers.get("authorization"), "manage_roles");
    const body = (await request.json()) as { name?: string; icon?: string; pageKeys?: unknown };
    if (!body.name || !body.name.trim())
      return NextResponse.json({ error: "El grupo necesita un nombre" }, { status: 400 });
    const group = await createGroup(body.name, body.icon ?? "🗂", body.pageKeys);
    return NextResponse.json(group, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
