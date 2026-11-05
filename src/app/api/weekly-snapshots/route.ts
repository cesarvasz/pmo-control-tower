// src/app/api/weekly-snapshots/route.ts
// Lista el histórico semanal del portafolio (ver lib/weeklySnapshot.ts y el
// cron en api/cron/weekly-snapshot). Solo lectura, requiere sesión — mismo
// nivel de acceso que /api/dashboard (sin acción extra: es un agregado del
// portafolio, no un dato sensible por proyecto/persona).

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/users";
import { listWeeklySnapshots } from "@/lib/store";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSession(request.headers.get("authorization"));
    return NextResponse.json(await listWeeklySnapshots());
  } catch (err) {
    return apiError(err);
  }
}
