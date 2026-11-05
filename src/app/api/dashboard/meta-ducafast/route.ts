// src/app/api/dashboard/meta-ducafast/route.ts
// GET: meta mensual del ROI 003 (Mesa 2) para el Beneficio de Victoria en /players — ver
// metaDucafastPorMes en lib/ducafastMesa2.ts. Devuelve un número agregado por mes, no las
// filas crudas, así que (igual que /api/dashboard/confirmacion-roi) basta una sesión válida,
// sin el permiso de página "roi". Fetch aparte: ROI es una fuente externa lenta.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/users";
import { fetchRoiRows } from "@/lib/roi";
import { construirExpedientes } from "@/lib/tramites";
import { metaDucafastPorMes } from "@/lib/ducafastMesa2";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSession(request.headers.get("authorization"));
    const { rows } = await fetchRoiRows();
    return NextResponse.json({ meses: metaDucafastPorMes(construirExpedientes(rows)) });
  } catch (err) {
    return apiError(err);
  }
}
