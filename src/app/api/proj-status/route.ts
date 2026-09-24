// src/app/api/proj-status/route.ts
// Escribe un nuevo status directo en Monday para un item/hito de Proyectos
// (dropdown StatusSelect en /proyectos). Requiere la acción "edit_proj_status"
// (Admin la tiene siempre por ser rol de sistema; otros roles como PM se la
// otorgan manualmente desde /roles).

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";
import { changeProjStatus } from "@/lib/monday";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireAction(request.headers.get("authorization"), "edit_proj_status");

    const body = (await request.json().catch(() => null)) as
      | { boardId?: string; itemId?: string; columnId?: string; label?: string }
      | null;
    const { boardId, itemId, columnId, label } = body ?? {};
    if (!boardId || !itemId || !columnId || !label) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }

    await changeProjStatus(boardId, itemId, columnId, label);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
