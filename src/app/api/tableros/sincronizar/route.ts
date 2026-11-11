// src/app/api/tableros/sincronizar/route.ts
// Sincronización con Monday (Fase 5, convivencia). Por ahora corre SOLO en local: la dispara el
// botón «Sincronizar ahora» de la pestaña Migración o el script programado cada hora
// (scripts/tableros-sincronizar.mjs, que no pasa por aquí).
//  GET  → { corridas } las últimas corridas (la primera es la más reciente)
//  POST → abre una corrida y la corre en segundo plano → 202 { corridaId } (409 si ya hay una)

import { after, NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { correrSincronizacion, iniciarCorrida, listarCorridas } from "@/features/tableros/datos/sincronizar";
import { ErrorTablero, respuestaDeError } from "@/features/tableros/datos/errores";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await exigirAccion(request, "tableros_crear");
    return NextResponse.json({ corridas: await listarCorridas(10) });
  } catch (err) {
    return respuestaDeError(err);
  }
}

export async function POST(request: Request) {
  try {
    await exigirAccion(request, "tableros_crear");
    // En Vercel la función se corta a los pocos minutos y una corrida completa tarda más.
    if (process.env.VERCEL) throw new ErrorTablero(400, "Por ahora la sincronización con Monday corre solo en local.");
    const corridaId = await iniciarCorrida("manual");
    after(() => correrSincronizacion(corridaId).then(() => undefined, (e) => console.error("sincronización falló:", e)));
    return NextResponse.json({ corridaId }, { status: 202 });
  } catch (err) {
    return respuestaDeError(err);
  }
}
