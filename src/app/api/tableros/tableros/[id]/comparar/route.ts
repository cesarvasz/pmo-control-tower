// src/app/api/tableros/tableros/[id]/comparar/route.ts
//  GET → compara las métricas del tablero (importado de Monday) con su board de Monday:
//        { diferencias, monday, app, copiaDel }. Requiere poder administrar el tablero.

import { NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { accesoDe, leerTablero } from "@/features/tableros/datos/tableros";
import { compararConMonday } from "@/features/tableros/datos/importar";
import { ErrorTablero, respuestaDeError } from "@/features/tableros/datos/errores";
import { puede } from "@/features/tableros/dominio/permisos";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await exigirAccion(request, "tableros_ver");
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ErrorTablero(404, "Tablero no encontrado");
    const acceso = await accesoDe(me);
    const t = await leerTablero(id, acceso);
    if (!t) throw new ErrorTablero(404, "Tablero no encontrado");
    // Con "solo lo mío" la comparación saldría incompleta: se pide el nivel de administrar.
    if (!puede(acceso.usuario, "administrar", t.tablero, acceso.reglas)) throw new ErrorTablero(403, "Necesitas administrar el tablero para compararlo");
    return NextResponse.json(await compararConMonday(t));
  } catch (err) {
    return respuestaDeError(err);
  }
}
