// src/app/api/dashboard/implementacion-cku/route.ts
// GET: Implementación resumida para el Beneficio del CKU que la lleva en /players (ver
// resumenImplementacionCku en lib/implementaciones.ts): la meta mensual, el % a alcanzar de
// cada mes y el Profit por mes. Mismo esquema de auth que /api/dashboard/confirmacion-roi
// (solo sesión válida, sin el permiso de página "roi"): expone números agregados, no las
// filas crudas, que sí lo requieren en /api/roi/implementacion.

import { NextResponse } from "next/server";
import { getMetasImplementacion, verifyRequest } from "@/lib/firebase-admin";
import { fetchImplementacionRows } from "@/lib/implementacion";
import { resumenImplementacionCku } from "@/lib/implementaciones";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await verifyRequest(request.headers.get("authorization"));
    const [{ rows }, { metas, objetivos }] = await Promise.all([fetchImplementacionRows(), getMetasImplementacion()]);
    return NextResponse.json(resumenImplementacionCku(rows, metas, objetivos));
  } catch (err) {
    return apiError(err);
  }
}
