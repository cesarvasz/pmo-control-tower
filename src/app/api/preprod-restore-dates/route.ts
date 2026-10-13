// src/app/api/preprod-restore-dates/route.ts
// Fechas de restauración de Pre-producción (banner del Control Tower).
// El calendario se auto-completa en cada request vía ensurePreprodSchedule:
// siempre quedan PREPROD_FUTURE_COUNT fechas a futuro (encadenando cada
// PREPROD_INTERVAL_DAYS días CALENDARIO desde la última conocida — en la
// práctica, "sábado sí, sábado no") y el histórico se recorta a las
// PREPROD_HISTORY_COUNT más recientes — ver lib/preprodSchedule.ts. Si el
// cálculo cambia la lista guardada, se persiste de una vez (así la ventana
// se desliza sola con el tiempo).
// GET: cualquier usuario autenticado (solo lee, igual que /api/dashboard/confirmacion-roi).
// DELETE: requiere acceso a la página "overview" (Control Tower) — cualquiera con
// esa página puede cancelar una fecha puntual, no solo Admin (mismo criterio que
// /api/board-alcance); el ciclo que sigue se vuelve a generar solo. No hay POST:
// el calendario no se agrega a mano, solo se calcula. Body: { date: "YYYY-MM-DD" }.

import { NextResponse } from "next/server";
import { requirePage } from "@/lib/users";
import { verifyRequest, getPreprodRestoreDates, savePreprodRestoreDates } from "@/lib/firebase-admin";
import { ensurePreprodSchedule } from "@/lib/preprodSchedule";
import { today } from "@/lib/business";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Lee las fechas guardadas, aplica ensurePreprodSchedule y persiste el
 *  resultado si cambió. `by` identifica quién disparó el guardado (la
 *  extensión automática se le atribuye a quien hizo el request). */
async function syncSchedule(by: string): Promise<string[]> {
  const stored = await getPreprodRestoreDates();
  const synced = ensurePreprodSchedule(stored, today());
  const changed = synced.length !== stored.length || synced.some((d, i) => d !== [...stored].sort()[i]);
  return changed ? await savePreprodRestoreDates(synced, by) : stored;
}

export async function GET(request: Request) {
  try {
    const me = await verifyRequest(request.headers.get("authorization"));
    const dates = await syncSchedule(me.email);
    return NextResponse.json({ dates });
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
    const withoutDate = current.filter((d) => d !== date);
    const dates = await savePreprodRestoreDates(ensurePreprodSchedule(withoutDate, today()), me.email);
    return NextResponse.json({ ok: true, dates });
  } catch (err) {
    return apiError(err);
  }
}
