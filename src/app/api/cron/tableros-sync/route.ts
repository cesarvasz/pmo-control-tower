// src/app/api/cron/tableros-sync/route.ts
// Sincronización Monday → tableros EN LA NUBE (camino a producción). La llama pg_cron (Supabase,
// con pg_net) CADA MINUTO; cada llamada:
//   - si hay una corrida a medias, la avanza unos ~35 s (un paso tarda ≤ 20 s: cabe en los 60 s de Vercel);
//   - si no, abre una nueva cuando la última empezó hace 60 min o más;
//   - si no toca nada, responde al momento.
// La corrida completa (~4 min de trabajo) queda lista en unas 6–7 llamadas. Ver
// docs/tableros/diseno.md §11.
//
// Protegido con CRON_SECRET (misma convención que /api/cron/weekly-snapshot): si la variable existe
// se exige "Authorization: Bearer $CRON_SECRET"; sin ella se deja pasar para probarlo en local.

import { NextResponse } from "next/server";
import { tickSincronizacion } from "@/features/tableros/datos/sincronizar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Tiempo de trabajo por llamada: no empieza pasos después de esto (un paso tarda pocos segundos). */
const PRESUPUESTO_MS = 35_000;
/** Cada cuánto se abre una corrida nueva. */
const CADA_MIN = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const r = await tickSincronizacion({ origen: process.env.VERCEL ? "nube" : "programada", cadaMin: CADA_MIN, presupuestoMs: PRESUPUESTO_MS });
    return NextResponse.json(r);
  } catch (err) {
    console.error("tableros-sync falló:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
