// src/app/api/analytics/track/route.ts
// Registra una visita de página. Cualquier usuario autenticado puede llamarlo.

import { NextResponse } from "next/server";
import { getAdminDb, verifyRequest } from "@/lib/firebase-admin";
import { apiError } from "@/lib/api-errors";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await verifyRequest(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const page: string = body.page ?? "/";
    const pageLabel: string = body.pageLabel ?? page;
    const sessionId: string = body.sessionId ?? "";

    const db = getAdminDb();
    await db.collection("page_views").add({
      userId: user.uid,
      userEmail: user.email,
      page,
      pageLabel,
      sessionId,
      timestamp: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
