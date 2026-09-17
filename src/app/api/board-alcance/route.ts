// src/app/api/board-alcance/route.ts
// POST /api/board-alcance — guarda (o borra) el texto de "Alcance" de un
// proyecto, para el Status Card del Resumen Ejecutivo.
// Autorización: cualquier usuario con acceso a la página "resumen-ejecutivo"
// (mismo criterio que /api/atraso-detalle) — cada PM puede documentar el
// alcance de sus propios proyectos.
// Body: { boardId, alcance }. alcance vacío → borra el documento.

import { NextResponse } from "next/server";
import { requirePage } from "@/lib/users";
import { saveBoardAlcance, deleteBoardAlcance } from "@/lib/firebase-admin";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const MAX_LEN = 600;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const me = await requirePage(authHeader, "resumen-ejecutivo");

    const body = (await request.json().catch(() => null)) as { boardId?: unknown; alcance?: unknown } | null;

    const boardId = body?.boardId;
    if (typeof boardId !== "string" || !boardId)
      return NextResponse.json({ error: "boardId requerido" }, { status: 400 });

    const alcance = typeof body?.alcance === "string" ? body.alcance.trim().slice(0, MAX_LEN) : "";

    if (!alcance) {
      await deleteBoardAlcance(boardId);
      return NextResponse.json({ ok: true, boardId, alcance: null });
    }

    await saveBoardAlcance(boardId, alcance, me.email);
    return NextResponse.json({ ok: true, boardId, alcance });
  } catch (err) {
    return apiError(err);
  }
}
