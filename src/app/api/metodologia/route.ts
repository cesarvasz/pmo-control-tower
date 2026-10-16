// src/app/api/metodologia/route.ts
// POST /api/metodologia — cambia (o restablece) la nota de Metodología VALOR de una
// persona en un mes. Solo Admin ("manage_users").
// Body: { persona, mes: "YYYY-MM", score|null }. score = entero 0-100;
// null/"" → borra la nota guardada (vuelve al 100% por defecto de ese mes).

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { saveMetodologiaCalif, deleteMetodologiaCalif } from "@/lib/firebase-admin";
import { esMesValido, metodologiaKey } from "@/lib/metodologia";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const body = (await request.json().catch(() => null)) as { persona?: unknown; mes?: unknown; score?: unknown } | null;

    const me = await requireAction(authHeader, "manage_users");

    const persona = typeof body?.persona === "string" ? body.persona.trim() : "";
    if (!persona || persona.length > 100 || persona.includes("/"))
      return NextResponse.json({ error: "persona inválida" }, { status: 400 });
    if (!esMesValido(body?.mes))
      return NextResponse.json({ error: "mes inválido (YYYY-MM)" }, { status: 400 });

    const key = metodologiaKey(body.mes, persona);
    const score = body?.score;
    if (score == null || score === "") {
      await deleteMetodologiaCalif(key);
      return NextResponse.json({ ok: true, persona, mes: body.mes, score: null });
    }
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100)
      return NextResponse.json({ error: "score debe estar entre 0 y 100" }, { status: 400 });

    const rounded = Math.round(score);
    await saveMetodologiaCalif(key, rounded, me.email);
    return NextResponse.json({ ok: true, persona, mes: body.mes, score: rounded });
  } catch (err) {
    return apiError(err);
  }
}
