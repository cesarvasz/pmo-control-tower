// src/app/api/attribution/route.ts
// POST /api/attribution — asigna (o borra) el responsable de una atribución.
// Autorización: ambas atribuciones (delay y reproceso) requieren Admin ("manage_users").
// Body: { kind, itemId, responsible|null }. responsible null/"" → borra la asignación.

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { saveAttribution, deleteAttribution } from "@/lib/firebase-admin";
import { isDelayResponsible } from "@/lib/delay";
import { apiError } from "@/lib/api-errors";
import type { AttributionKind } from "@/types";

export const dynamic = "force-dynamic";

const KINDS = new Set<AttributionKind>(["delay", "reproceso"]);
const isKind = (v: unknown): v is AttributionKind => typeof v === "string" && KINDS.has(v as AttributionKind);

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    const body = (await request.json().catch(() => null)) as
      | { kind?: unknown; itemId?: unknown; responsible?: unknown }
      | null;

    if (!isKind(body?.kind))
      return NextResponse.json({ error: "kind inválido" }, { status: 400 });
    const kind = body.kind;

    // Ambas atribuciones (delay y reproceso) requieren Admin.
    const me = await requireAction(authHeader, "manage_users");

    const itemId = body?.itemId;
    if (typeof itemId !== "string" || !itemId)
      return NextResponse.json({ error: "itemId requerido" }, { status: 400 });

    const responsible = body?.responsible;
    if (responsible == null || responsible === "") {
      await deleteAttribution(kind, itemId);
      return NextResponse.json({ ok: true, kind, itemId, responsible: null });
    }
    if (!isDelayResponsible(responsible))
      return NextResponse.json({ error: "responsable inválido" }, { status: 400 });

    await saveAttribution(kind, itemId, responsible, me.email);
    return NextResponse.json({ ok: true, kind, itemId, responsible });
  } catch (err) {
    return apiError(err);
  }
}
