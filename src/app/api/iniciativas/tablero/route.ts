// src/app/api/iniciativas/tablero/route.ts
// GET → { id } del tablero oficial de Iniciativas, para la página «Gestión de Iniciativas». Entra quien tiene esa página
// (o Tableros completo); lo que ve y edita adentro lo decide el motor de permisos del tablero.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/users";
import { apiError } from "@/lib/api-errors";
import { PAGINA_GESTION_INICIATIVAS } from "@/features/tableros/datos/puerta";
import { tieneAccionTableros } from "@/features/tableros/dominio/acciones";
import { tableroDeIniciativas } from "@/features/tableros/datos/iniciativas-app";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const me = await requireSession(request.headers.get("authorization"));
    if (!me.permissions.pages?.[PAGINA_GESTION_INICIATIVAS] && !tieneAccionTableros(me.permissions, "tableros_ver")) throw new Error("forbidden");
    const id = await tableroDeIniciativas();
    if (!id) return NextResponse.json({ error: "No hay un tablero de Iniciativas" }, { status: 404 });
    return NextResponse.json({ id });
  } catch (err) {
    return apiError(err);
  }
}
