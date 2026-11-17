// src/app/api/reuniones/importar/route.ts
// Pasa el histórico del calendario del Apps Script a la tabla `reuniones` (origen «apps-script»). Solo Admin.
// POST {}                 → ensayo: cuenta qué se importaría, sin escribir nada.
// POST { aplicar: true }  → importa lo nuevo. Es idempotente: repetirlo no duplica (la llave es iniciativa + tipo + hora de inicio).
// El Apps Script solo ve de mayo de 2026 a 120 días adelante y no trae organizador: lo importado se ve en el dashboard, no se edita en la app.

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";
import { fetchWebAppCrudo } from "@/lib/monday";
import { insertarImportadas, llavesReunionesGuardadas } from "@/lib/reuniones";
import { planImportacion } from "@/lib/reunionesImportacion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requireAction(request.headers.get("authorization"), "manage_roles");
    const b = (await request.json().catch(() => null)) as { aplicar?: unknown } | null;
    const aplicar = b?.aplicar === true;

    let calData;
    try { calData = (await fetchWebAppCrudo()).calData; }
    catch { return NextResponse.json({ error: "No se pudo leer el calendario del Apps Script" }, { status: 502 }); }

    const plan = planImportacion(calData, await llavesReunionesGuardadas());
    const importadas = aplicar ? await insertarImportadas(plan.nuevas) : 0;
    return NextResponse.json({
      aplicado: aplicar, leidas: calData.length, nuevas: plan.nuevas.length, yaEstaban: plan.yaEstaban, repetidas: plan.repetidas, invalidas: plan.invalidas, importadas,
      ejemplos: plan.nuevas.slice(0, 5),
    });
  } catch (err) {
    return apiError(err);
  }
}
