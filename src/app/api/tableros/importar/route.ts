// src/app/api/tableros/importar/route.ts
// Importar boards de Proyectos de Monday como tableros de la app (desde la copia en Supabase).
//  GET                                          → { boards } con cuál ya está importado
//  POST { mondayBoardId, reemplazar?, refrescar? } → importa (o vuelve a importar) → resultado

import { NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { importarBoard, listarBoardsImportables } from "@/features/tableros/datos/importar";
import { ErrorTablero, respuestaDeError } from "@/features/tableros/datos/errores";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    await exigirAccion(request, "tableros_crear");
    return NextResponse.json({ boards: await listarBoardsImportables() });
  } catch (err) {
    return respuestaDeError(err);
  }
}

export async function POST(request: Request) {
  try {
    const me = await exigirAccion(request, "tableros_crear");
    const body = (await request.json().catch(() => null)) as { mondayBoardId?: unknown; reemplazar?: unknown; refrescar?: unknown } | null;
    const id = typeof body?.mondayBoardId === "string" && /^\d+$/.test(body.mondayBoardId) ? body.mondayBoardId : null;
    if (!id) throw new ErrorTablero(400, "Falta el board de Monday");
    return NextResponse.json(await importarBoard(id, { reemplazar: body?.reemplazar === true, refrescar: body?.refrescar !== false }, me));
  } catch (err) {
    return respuestaDeError(err);
  }
}
