// src/app/api/atraso-detalle/route.ts
// POST /api/atraso-detalle — guarda (o borra) el reparto de días / motivo de un
// atraso, para la tabla "Atrasos" del Resumen Ejecutivo.
// Autorización: cualquier usuario con acceso a la página "resumen-ejecutivo"
// (a diferencia de /api/attribution, que requiere Admin) — cada PM puede
// documentar sus propios atrasos.
// Body: { itemId, reparto: [{dias, resp}], motivo }. reparto vacío + motivo
// vacío → borra el documento.

import { NextResponse } from "next/server";
import { requirePage } from "@/lib/users";
import { saveAtrasoDetalle, deleteAtrasoDetalle } from "@/lib/firebase-admin";
import { isAtrasoResp } from "@/lib/delay";
import { apiError } from "@/lib/api-errors";
import type { AtrasoReparto } from "@/types";

export const dynamic = "force-dynamic";

const MAX_LEN = 500;
const MAX_TRAMOS = 12;

/** Sanea el `reparto` del body: tramos con `dias` entero ≥ 0 y `resp` en el
 *  catálogo ATRASO_RESPONSABLES. Descarta lo inválido, tope MAX_TRAMOS. */
function parseReparto(v: unknown): AtrasoReparto[] {
  if (!Array.isArray(v)) return [];
  const out: AtrasoReparto[] = [];
  for (const el of v) {
    if (!el || typeof el !== "object") continue;
    const dias = Math.floor(Number((el as { dias?: unknown }).dias));
    const resp = (el as { resp?: unknown }).resp;
    if (!Number.isFinite(dias) || dias < 0 || dias > 9999) continue;
    if (!isAtrasoResp(resp)) continue;
    out.push({ dias, resp });
    if (out.length >= MAX_TRAMOS) break;
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const me = await requirePage(authHeader, "resumen-ejecutivo");

    const body = (await request.json().catch(() => null)) as
      | { itemId?: unknown; reparto?: unknown; motivo?: unknown }
      | null;

    const itemId = body?.itemId;
    if (typeof itemId !== "string" || !itemId)
      return NextResponse.json({ error: "itemId requerido" }, { status: 400 });

    const reparto = parseReparto(body?.reparto);
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim().slice(0, MAX_LEN) : "";

    if (reparto.length === 0 && !motivo) {
      await deleteAtrasoDetalle(itemId);
      return NextResponse.json({ ok: true, itemId, reparto: [], motivo: null });
    }

    await saveAtrasoDetalle(itemId, reparto, motivo, me.email);
    return NextResponse.json({ ok: true, itemId, reparto, motivo });
  } catch (err) {
    return apiError(err);
  }
}
