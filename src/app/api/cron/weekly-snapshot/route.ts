// src/app/api/cron/weekly-snapshot/route.ts
// Disparado por Vercel Cron cada lunes 8am hora de Guatemala (vercel.json:
// "0 14 * * 1" — Vercel programa en UTC y Guatemala es UTC-6 todo el año,
// sin horario de verano). Recalcula EVM/Beneficio $ Confirmado/Calidad de
// Entregas/Cumplimiento de Entrega/NPS del portafolio COMPLETO (mismos
// números que las tarjetas de Control Tower, ver lib/weeklySnapshot.ts) y
// los guarda como un snapshot semanal en Firestore para el histórico.
//
// Protegido con CRON_SECRET (convención de Vercel Cron: si la variable de
// entorno existe, Vercel manda "Authorization: Bearer $CRON_SECRET" en cada
// disparo — cualquier otra llamada sin ese header se rechaza). Si la variable
// no está configurada, se deja pasar (para poder probarlo en local sin
// secretos) — hay que configurarla en Vercel antes de ir a producción.

import { NextResponse } from "next/server";
import { fetchDashboardRaw } from "@/lib/monday";
import { listNpsRecords } from "@/lib/surveys";
import { getReqBaselines, getProjItemBaselines, getAttributions, getAtrasoDetalles, getBoardAlcances, saveWeeklySnapshot } from "@/lib/firebase-admin";
import { buildDashboardData } from "@/lib/dashboardData";
import { computeWeeklySnapshotMetrics } from "@/lib/weeklySnapshot";
import { mondayOfWeek, ymd } from "@/lib/business";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
  }

  try {
    const [raw, baselines, projItemBaselines, npsRecords, delayAttributions, reprocesoAttributions, atrasoDetalles, boardAlcance] = await Promise.all([
      fetchDashboardRaw(),
      getReqBaselines(),
      getProjItemBaselines(),
      listNpsRecords(),
      getAttributions("delay"),
      getAttributions("reproceso"),
      getAtrasoDetalles(),
      getBoardAlcances(),
    ]);

    const data = buildDashboardData({
      ...raw, baselines, projItemBaselines, npsRecords,
      delayAttributions, reprocesoAttributions, atrasoDetalles, boardAlcance,
    });

    const metrics = computeWeeklySnapshotMetrics(data);
    const weekOf = ymd(mondayOfWeek(new Date()));
    await saveWeeklySnapshot(weekOf, metrics);

    return NextResponse.json({ ok: true, weekOf, ...metrics });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
