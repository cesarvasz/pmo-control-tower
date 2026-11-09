// src/app/api/clasificacion/route.ts
// Asigna la Clase (A, B o C) de un Proyecto (id del board) o de un PML (id del item) desde la
// pestaña Clasificación de Calidad & Cumplimiento. Requiere la acción "edit_clasificacion" (Admin
// siempre; otros roles se la otorgan en /roles).
//  POST  body: { id: string, clase: "A" | "B" | "C" }

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { saveClase } from "@/lib/store";
import { esClaseAsignable } from "@/lib/claseProyecto";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const ID_MAX = 120;

export async function POST(request: Request) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "edit_clasificacion");

    const body = (await request.json().catch(() => null)) as { id?: unknown; clase?: unknown } | null;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    // Ids con forma de id de Monday (board o item): sin «.» ni «/».
    if (!id || id.length > ID_MAX || /[./]/.test(id) || !esClaseAsignable(body?.clase)) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }

    await saveClase(id, body.clase, me.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
