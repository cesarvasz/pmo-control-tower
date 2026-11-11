// src/app/api/tableros/paridad-dashboard/route.ts
// Fase 6 (preparación): el dashboard COMPLETO armado con la copia de Monday y con los tableros de
// Supabase, comparados sección por sección, con los indicadores del Control Tower lado a lado.
//  GET → ComparacionDashboard (solo lectura; no escribe nada)

import { NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { compararDashboardCompleto } from "@/features/tableros/datos/fuente-dashboard";
import { respuestaDeError } from "@/features/tableros/datos/errores";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    await exigirAccion(request, "tableros_crear");
    return NextResponse.json(await compararDashboardCompleto());
  } catch (err) {
    return respuestaDeError(err);
  }
}
