// src/app/api/atraso-detalle/route.ts
// POST /api/atraso-detalle — guarda (o borra) el Responsable/Motivo de un
// atraso, para la tabla "Atrasos" del Resumen Ejecutivo.
// Autorización: cualquier usuario con acceso a la página "resumen-ejecutivo"
// (a diferencia de /api/attribution, que requiere Admin) — cada PM puede
// documentar sus propios atrasos.
// Body: { itemId, responsable, motivo }. Ambos vacíos → borra el documento.

import { NextResponse } from "next/server";
import { requirePage } from "@/lib/users";
import { saveAtrasoDetalle, deleteAtrasoDetalle } from "@/lib/firebase-admin";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const MAX_LEN = 500;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const me = await requirePage(authHeader, "resumen-ejecutivo");

    const body = (await request.json().catch(() => null)) as
      | { itemId?: unknown; responsable?: unknown; motivo?: unknown }
      | null;

    const itemId = body?.itemId;
    if (typeof itemId !== "string" || !itemId)
      return NextResponse.json({ error: "itemId requerido" }, { status: 400 });

    const responsable = typeof body?.responsable === "string" ? body.responsable.trim().slice(0, MAX_LEN) : "";
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim().slice(0, MAX_LEN) : "";

    if (!responsable && !motivo) {
      await deleteAtrasoDetalle(itemId);
      return NextResponse.json({ ok: true, itemId, responsable: null, motivo: null });
    }

    await saveAtrasoDetalle(itemId, responsable, motivo, me.email);
    return NextResponse.json({ ok: true, itemId, responsable, motivo });
  } catch (err) {
    return apiError(err);
  }
}
