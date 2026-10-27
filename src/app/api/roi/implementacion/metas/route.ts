// src/app/api/roi/implementacion/metas/route.ts
// Metas de la pestaña Implementación de ROI: la meta de cada cliente (Vol y CM1, igual
// para todos los meses) y el % a alcanzar de cada mes.
//  GET: las metas guardadas. Requiere el permiso de la página "roi".
//  PUT: reemplaza TODAS las metas. Requiere la acción "edit_implementacion_metas"
//       (Admin siempre; otros roles se la otorgan en /roles).
//       Body: { metas: [{ cliente, vol, cm1 }], objetivos: [{ mes, objetivo }] } — ver
//       normalizarMetas / normalizarObjetivos. `objetivos` puede faltar (todo a 100 %).

import { NextResponse } from "next/server";
import { requireAction, requirePage } from "@/lib/users";
import { getMetasImplementacion, saveMetasImplementacion } from "@/lib/firebase-admin";
import { normalizarMetas, normalizarObjetivos } from "@/lib/implementaciones";
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

    const body = (await request.json().catch(() => null)) as { metas?: unknown; objetivos?: unknown } | null;
    const m = normalizarMetas(body?.metas);
    if (!m.ok) return NextResponse.json({ error: m.error }, { status: 400 });
    const o = normalizarObjetivos(body?.objetivos);
    if (!o.ok) return NextResponse.json({ error: o.error }, { status: 400 });

    return NextResponse.json(await saveMetasImplementacion(m.metas, o.objetivos, me.email));
  } catch (err) {
    return apiError(err);
  }
}
