// src/app/api/roi/clonacion/route.ts
// GET: bitácora de Clonación de Files (Google Sheets vía Apps Script, fuente
// independiente de 003). Requiere el permiso de la página "roi" — es la
// misma página ROI, otra pestaña.

import { NextResponse } from "next/server";
import { requirePage } from "@/lib/users";
import { fetchClonacionRows } from "@/lib/clonacion";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePage(request.headers.get("authorization"), "roi");
    const { rows, generado } = await fetchClonacionRows();
    return NextResponse.json({ rows, generado });
  } catch (err) {
    return apiError(err);
  }
}
