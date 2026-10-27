// src/app/api/roi/implementacion/metas/route.ts
// Metas por cliente (Vol y CM1) de la pestaña Implementación de ROI.
//  GET: las metas guardadas. Requiere el permiso de la página "roi".
//  PUT: reemplaza TODAS las metas. Requiere la acción "edit_implementacion_metas"
//       (Admin siempre; otros roles se la otorgan en /roles).
//       Body: { metas: [{ cliente, vol, cm1 }] } — ver normalizarMetas.

import { NextResponse } from "next/server";
import { requireAction, requirePage } from "@/lib/users";
import { getMetasImplementacion, saveMetasImplementacion } from "@/lib/firebase-admin";
import { normalizarMetas } from "@/lib/implementaciones";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePage(request.headers.get("authorization"), "roi");
    return NextResponse.json(await getMetasImplementacion());
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "edit_implementacion_metas");

    const body = (await request.json().catch(() => null)) as { metas?: unknown } | null;
    const r = normalizarMetas(body?.metas);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

    return NextResponse.json(await saveMetasImplementacion(r.metas, me.email));
  } catch (err) {
    return apiError(err);
  }
}
