// src/app/api/dashboard/confirmacion-roi/route.ts
// GET: Confirmación del portafolio vía ROI (ver lib/dashboard.ts →
// calcConfirmacionRoi) — Ahorro real con Ducafast (003) + Ahorro $ de
// Clonación de Files, sin filtros. Reemplaza a la Confirmación calculada por
// Monday SOLO en las tarjetas de portafolio (Costo & Beneficio, Pipeline,
// histórico semanal) — ver el comentario de calcConfirmacionRoi. También
// devuelve `porPm`: la Confirmación de Luis (T0 + T4→T5) y David (T1→T3) para
// sus Players — ver CONFIRMACION_ROI_PM.
//
// Fetch APARTE del dashboard principal (/api/dashboard): son fuentes externas
// más lentas (Google Sheets vía Apps Script, con reintentos) y no todos los
// usuarios necesitan este número — así el resto del Control Tower no espera
// por esto. Mismo esquema de auth que /api/dashboard (solo sesión válida, sin
// exigir el permiso de página "roi" — expone un número agregado, no las filas
// crudas que sí requieren ese permiso en /api/roi).

import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { fetchRoiRows } from "@/lib/roi";
import { fetchClonacionRows } from "@/lib/clonacion";
import { calcConfirmacionRoiDetalle, confirmacionRoiPorPm } from "@/lib/dashboard";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await verifyRequest(request.headers.get("authorization"));
    const [{ rows: roiRows }, { rows: clonacionRows }] = await Promise.all([
      fetchRoiRows(),
      fetchClonacionRows(),
    ]);
    // Un solo cálculo: el total del portafolio y su reparto por PM salen del
    // mismo detalle por tramos (T0 + T1→T3 + T4→T5 = total).
    const detalle = calcConfirmacionRoiDetalle(roiRows, clonacionRows);
    return NextResponse.json({ confirmacionBenefit: detalle.total, porPm: confirmacionRoiPorPm(detalle) });
  } catch (err) {
    return apiError(err);
  }
}
