// src/app/api/gcp-usage/route.ts
// GET: lecturas/escrituras/eliminaciones de Firestore consumidas hoy (Cloud
// Monitoring). Solo Admin (manage_roles, misma acción que Roles/Grupos).

import { NextResponse } from "next/server";
import { getFirestoreUsageToday, FIRESTORE_SPARK_LIMITS } from "@/lib/gcp-usage";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAction(request.headers.get("authorization"), "manage_roles");
    const usage = await getFirestoreUsageToday();
    return NextResponse.json({ ...usage, sparkLimits: FIRESTORE_SPARK_LIMITS });
  } catch (err) {
    return apiError(err);
  }
}
