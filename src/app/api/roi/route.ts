// src/app/api/roi/route.ts
// GET: bitácora ROI (Google Sheets vía Apps Script, fuente independiente del
// resto del dashboard). Requiere el permiso de la página "roi".

import { NextResponse } from "next/server";
import { requirePage } from "@/lib/users";
import { fetchRoiRows } from "@/lib/roi";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePage(request.headers.get("authorization"), "roi");
    const rows = await fetchRoiRows();
    return NextResponse.json({ rows });
  } catch (err) {
    return apiError(err);
  }
}
