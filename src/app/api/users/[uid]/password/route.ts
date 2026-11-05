// src/app/api/users/[uid]/password/route.ts
// POST: le pone a un usuario una contraseña temporal nueva (generada aquí) y lo obliga a
// cambiarla al entrar. Requiere manage_users. La contraseña se devuelve UNA sola vez para
// que el Admin se la pase al usuario; no se guarda en ningún lado.
// No hay correo configurado: así se da acceso a los usuarios migrados y se resuelve el
// «olvidé mi contraseña».

import { NextResponse } from "next/server";
import { requireAction, setTemporaryPassword } from "@/lib/users";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "manage_users");
    const { uid } = await params;
    if (me.uid === uid) {
      return NextResponse.json(
        { error: "Para tu propia cuenta usa «Cambiar contraseña» (menú de arriba)." },
        { status: 400 },
      );
    }
    const password = await setTemporaryPassword(uid);
    return NextResponse.json({ password }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError(err);
  }
}
