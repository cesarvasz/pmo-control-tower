// src/app/api/roi/008/route.ts
// GET: hoja ROI, pestaña "008" (Ducafast SV · análisis de tiempos), vía su propio
// Apps Script — fuente independiente de 003. Requiere el permiso de la página
// "roi": es la misma página ROI, otra pestaña.

import { NextResponse } from "next/server";
import { requirePage } from "@/lib/users";
import { fetchRoi008Rows } from "@/lib/roi008";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePage(request.headers.get("authorization"), "roi");
    const { rows, columnas, generado } = await fetchRoi008Rows();
    return NextResponse.json({ rows, columnas, generado });
  } catch (err) {
    return apiError(err);
  }
}
