// src/app/api/vpa/route.ts
// Calificación mensual del VPA (pestaña «VPA» de /calidad-cumplimiento, ver lib/vpa.ts).
//  GET:  las calificaciones guardadas de todos los meses. Requiere el permiso de la página
//        "calidad-cumplimiento".
//  POST: pone (o quita) la nota de UN indicador en un mes. Solo Admin ("manage_users", igual
//        que la pestaña Metodología). Body: { mes: "YYYY-MM", indicador, score|null }.
//        score = número 0-100 (se redondea a 2 decimales); null/"" borra la nota.

import { NextResponse } from "next/server";
import { requireAction, requirePage } from "@/lib/users";
import { getVpaCalifs, saveVpaNota } from "@/lib/firebase-admin";
import { esIndicadorVpa, normalizarNotaVpa } from "@/lib/vpa";
import { esMesValido } from "@/lib/metodologia";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePage(request.headers.get("authorization"), "calidad-cumplimiento");
    return NextResponse.json({ califs: await getVpaCalifs() });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "manage_users");
    const body = (await request.json().catch(() => null)) as { mes?: unknown; indicador?: unknown; score?: unknown } | null;

    if (!esMesValido(body?.mes))
      return NextResponse.json({ error: "mes inválido (YYYY-MM)" }, { status: 400 });
    if (!esIndicadorVpa(body?.indicador))
      return NextResponse.json({ error: "indicador inválido" }, { status: 400 });

    const score = body?.score;
    if (score == null || score === "") {
      await saveVpaNota(body.mes, body.indicador, null, me.email);
      return NextResponse.json({ ok: true, mes: body.mes, indicador: body.indicador, score: null });
    }
    const nota = normalizarNotaVpa(score);
    if (nota == null)
      return NextResponse.json({ error: "score debe ser un número entre 0 y 100" }, { status: 400 });

    await saveVpaNota(body.mes, body.indicador, nota, me.email);
    return NextResponse.json({ ok: true, mes: body.mes, indicador: body.indicador, score: nota });
  } catch (err) {
    return apiError(err);
  }
}
