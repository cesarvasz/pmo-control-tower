// src/app/api/tableros/sincronizar/route.ts
// Sincronización con Monday (Fase 5, convivencia): el botón «Sincronizar ahora» de la pestaña Migración.
// La sincronización programada no pasa por aquí: en esta PC la corre scripts/tableros-sincronizar.mjs
// y en producción pg_cron → /api/cron/tableros-sync.
//  GET  → { corridas, fuente } las últimas corridas (la primera es la más reciente) y de dónde lee la
//         app los datos de Monday en este servidor: la configurada (FUENTE_DATOS) y la que de verdad
//         usa ahora (vuelve a Monday si la última sincronización es vieja)
//  POST → abre una corrida y la corre en segundo plano → 202 { corridaId } (409 si ya hay una). En
//         Vercel avanza lo que alcance en esta llamada; el cron de cada minuto la termina.

import { after, NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { avanzarCorrida, correrSincronizacion, iniciarCorrida, listarCorridas } from "@/features/tableros/datos/sincronizar";
import { respuestaDeError } from "@/features/tableros/datos/errores";
import { fuenteEfectiva } from "@/lib/monday";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    await exigirAccion(request, "tableros_crear");
    const [corridas, fuente] = await Promise.all([listarCorridas(10), fuenteEfectiva()]);
    return NextResponse.json({ corridas, fuente });
  } catch (err) {
    return respuestaDeError(err);
  }
}

export async function POST(request: Request) {
  try {
    await exigirAccion(request, "tableros_crear");
    const corridaId = await iniciarCorrida("manual");
    // En Vercel la función se corta a los 60 s: avanza ~35 s y el cron de cada minuto la sigue.
    const correr = process.env.VERCEL ? avanzarCorrida(corridaId, { hasta: Date.now() + 35_000 }) : correrSincronizacion(corridaId);
    after(() => correr.then(() => undefined, (e) => console.error("sincronización falló:", e)));
    return NextResponse.json({ corridaId }, { status: 202 });
  } catch (err) {
    return respuestaDeError(err);
  }
}
