// src/app/api/roi/implementacion/route.ts
// GET: pestaña "implementacion" del archivo "Clonacion files" (Google Sheets vía
// Apps Script, fuente independiente de Clonación y de 003). Requiere el permiso
// de la página "roi" — es la misma página ROI, otra pestaña.

import { NextResponse } from "next/server";
import { requirePage } from "@/lib/users";
import { fetchImplementacionRows } from "@/lib/implementacion";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePage(request.headers.get("authorization"), "roi");
    const { rows, generado } = await fetchImplementacionRows();
    return NextResponse.json({ rows, generado });
  } catch (err) {
    return apiError(err);
  }
}
