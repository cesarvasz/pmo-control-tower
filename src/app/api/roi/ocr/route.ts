// src/app/api/roi/ocr/route.ts
// GET: pestaña "009" del archivo de Google Sheets de 003 (digitalización OCR),
// vía Apps Script propio — fuente independiente de 003 y de Clonación. Requiere
// el permiso de la página "roi" — es la misma página ROI, otra pestaña.

import { NextResponse } from "next/server";
import { requirePage } from "@/lib/users";
import { fetchOcrRows } from "@/lib/ocr";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePage(request.headers.get("authorization"), "roi");
    const { rows, generado } = await fetchOcrRows();
    return NextResponse.json({ rows, generado });
  } catch (err) {
    return apiError(err);
  }
}
