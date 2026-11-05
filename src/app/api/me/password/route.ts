// src/app/api/me/password/route.ts
// POST: el usuario cambia SU contraseña ({ password }). Quita la obligación de cambiarla
// que deja una contraseña temporal. Sirve también a cuentas en espera (no exige rol).

import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth-server";
import { changeOwnPassword, getMe } from "@/lib/users";
import { errorDePassword } from "@/lib/password";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const v = await verifyRequest(request.headers.get("authorization"));
    const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
    const motivo = errorDePassword(body?.password);
    if (motivo) return NextResponse.json({ error: motivo }, { status: 400 });

    await changeOwnPassword(v.uid, body!.password as string);
    return NextResponse.json(await getMe(v));
  } catch (err) {
    return apiError(err);
  }
}
