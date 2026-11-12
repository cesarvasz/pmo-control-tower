// src/app/api/proj-status/route.ts
// Escribe un nuevo status directo en Monday para un item/hito de Proyectos
// (dropdown StatusSelect en /proyectos). Requiere la acción "edit_proj_status"
// (Admin la tiene siempre por ser rol de sistema; otros roles como PM se la
// otorgan manualmente desde /roles).

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";
import { changeProjStatus, reflejarEscrituraEnTableros } from "@/lib/monday";

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

    // Con FUENTE_DATOS=tableros, un elemento creado en la app (id no numérico) no existe en Monday.
    if (!/^\d+$/.test(itemId)) {
      return NextResponse.json({ error: "Este elemento se creó en la app: su status se cambia en /tableros" }, { status: 409 });
    }

    // Mientras dure la convivencia con Monday, el status se escribe en Monday; con
    // FUENTE_DATOS=tableros además se trae ese board a su tablero para que el refresh ya lo vea.
    await changeProjStatus(boardId, itemId, columnId, label);
    const { reflejado, aviso } = await reflejarEscrituraEnTableros(itemId);
    return NextResponse.json({ ok: true, reflejado, ...(aviso ? { aviso } : {}) });
  } catch (err) {
    return apiError(err);
  }
}
