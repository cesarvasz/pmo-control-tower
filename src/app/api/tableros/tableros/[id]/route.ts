// src/app/api/tableros/tableros/[id]/route.ts
// Un tablero. Pasa por la puerta de Tableros; cada operación revisa además su permiso con el
// motor (por tablero, columna y elemento).
//  GET                  → { tablero, grupos, columnas, elementos, personas, acceso }
//  POST { op, ...datos } → ejecuta una operación del registro (features/tableros/datos/operaciones.ts)

import { NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { accesoDe, leerExtras, leerTablero, leerTableroFila, listarPersonasCorto } from "@/features/tableros/datos/tableros";
import { ejecutarOperacion } from "@/features/tableros/datos/operaciones";
import { ErrorTablero, respuestaDeError } from "@/features/tableros/datos/errores";
import { puede } from "@/features/tableros/dominio/permisos";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function idDe(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  if (!UUID_RE.test(id)) throw new ErrorTablero(404, "Tablero no encontrado");
  return id;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await exigirAccion(request, "tableros_ver");
    const acceso = await accesoDe(me);
    const [completo, personas] = await Promise.all([leerTablero(await idDe(params), acceso), listarPersonasCorto()]);
    if (!completo) throw new ErrorTablero(404, "Tablero no encontrado");
    return NextResponse.json({ ...completo, ...(await leerExtras(completo, acceso)), personas, acceso });
  } catch (err) {
    return respuestaDeError(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await exigirAccion(request, "tableros_ver");
    const acceso = await accesoDe(me);
    const tablero = await leerTableroFila(await idDe(params));
    if (!tablero || !puede(acceso.usuario, "ver", tablero, acceso.reglas)) throw new ErrorTablero(404, "Tablero no encontrado");
    const datos = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!datos || typeof datos !== "object") throw new ErrorTablero(400, "Datos inválidos");
    const res = await ejecutarOperacion(me, acceso, tablero, datos);
    return NextResponse.json(res ?? { ok: true });
  } catch (err) {
    return respuestaDeError(err);
  }
}
