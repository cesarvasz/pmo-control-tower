// src/app/api/on-hold/route.ts
// Pone o quita un Proyecto (board) o un PML (item) de On Hold. Mientras está en On Hold no
// cuenta en ninguna métrica (ver lib/onHold.ts). Requiere la acción "edit_on_hold" (Admin
// siempre; otros roles se la otorgan en /roles).
//  POST body: { tipo: "proyecto" | "pml", id: string, activo: boolean }

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { setOnHold } from "@/lib/firebase-admin";
import { esTipoOnHold, normalizarIdOnHold } from "@/lib/onHold";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "edit_on_hold");

    const body = (await request.json().catch(() => null)) as { tipo?: unknown; id?: unknown; activo?: unknown } | null;
    const id = normalizarIdOnHold(body?.id);
    if (!esTipoOnHold(body?.tipo) || !id || typeof body?.activo !== "boolean") {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }

    await setOnHold(body.tipo, id, body.activo, me.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
