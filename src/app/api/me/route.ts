// src/app/api/me/route.ts
// Perfil del usuario actual (rol + permisos efectivos). Crea el doc si no existe.

import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { getMe } from "@/lib/users";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const v = await verifyRequest(request.headers.get("authorization"));
    return NextResponse.json(await getMe(v));
  } catch (err) {
    return apiError(err);
  }
}
