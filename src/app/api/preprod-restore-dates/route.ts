// src/app/api/preprod-restore-dates/route.ts
// Fechas de restauración de Pre-producción (banner del Control Tower).
// GET: cualquier usuario autenticado (solo lee, igual que /api/dashboard/confirmacion-roi).
// POST/DELETE: requiere acceso a la página "overview" (Control Tower) — cualquiera
// con esa página puede administrar la lista, no solo Admin (mismo criterio que
// /api/board-alcance). Body: { date: "YYYY-MM-DD" }.

import { NextResponse } from "next/server";
import { requirePage } from "@/lib/users";
import { verifyRequest, getPreprodRestoreDates, savePreprodRestoreDates } from "@/lib/firebase-admin";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    await verifyRequest(request.headers.get("authorization"));
    const dates = await getPreprodRestoreDates();
    return NextResponse.json({ dates });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const me = await requirePage(request.headers.get("authorization"), "overview");
    const body = (await request.json().catch(() => null)) as { date?: unknown } | null;
    const date = body?.date;
    if (typeof date !== "string" || !DATE_RE.test(date))
      return NextResponse.json({ error: "date requerida en formato YYYY-MM-DD" }, { status: 400 });

    const current = await getPreprodRestoreDates();
    const dates = await savePreprodRestoreDates([...current, date], me.email);
    return NextResponse.json({ ok: true, dates });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const me = await requirePage(request.headers.get("authorization"), "overview");
    const body = (await request.json().catch(() => null)) as { date?: unknown } | null;
    const date = body?.date;
    if (typeof date !== "string" || !DATE_RE.test(date))
      return NextResponse.json({ error: "date requerida en formato YYYY-MM-DD" }, { status: 400 });

    const current = await getPreprodRestoreDates();
    const dates = await savePreprodRestoreDates(current.filter((d) => d !== date), me.email);
    return NextResponse.json({ ok: true, dates });
  } catch (err) {
    return apiError(err);
  }
}
