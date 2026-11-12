// src/app/api/tableros/tableros/[id]/traer-de-monday/route.ts
//  POST → trae de Monday la bitácora (Updates) y los archivos de un tablero importado.
//         Requiere poder administrar el tablero. Se puede repetir: solo agrega lo nuevo.

import { NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { accesoDe, leerTableroFila } from "@/features/tableros/datos/tableros";
import { traerBitacoraYArchivos } from "@/features/tableros/datos/importar-extras";
import { ErrorTablero, respuestaDeError } from "@/features/tableros/datos/errores";
import { puede } from "@/features/tableros/dominio/permisos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await exigirAccion(request, "tableros_crear");
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ErrorTablero(404, "Tablero no encontrado");
    const acceso = await accesoDe(me);
    const t = await leerTableroFila(id);
    if (!t || !puede(acceso.usuario, "administrar", t, acceso.reglas)) throw new ErrorTablero(404, "Tablero no encontrado");
    return NextResponse.json(await traerBitacoraYArchivos(id));
  } catch (err) {
    return respuestaDeError(err);
  }
}
