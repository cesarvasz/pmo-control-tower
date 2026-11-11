// src/app/api/surveys-cku/route.ts
// Encuestas NPS de un CKU (lib/surveyCku.ts). Un solo enlace por encuesta, que varias personas contestan.
// GET: las encuestas — un Admin ve todas; un CKU, solo las suyas; los demás, 403.
// POST { entregableId, nombre, cku? }: crea la encuesta de un entregable completado (el nombre es el del entregable; lo manda
//   la pantalla, ya no se escribe a mano). Si ese entregable ya tiene una, devuelve la existente (200) en vez de crear otra.
//   Un CKU la crea para sí mismo (se toma su nombre y correo del Directorio RH); un Admin indica el CKU en `cku` (uno de
//   PLAYER_CKUS) y se usa el correo de ese CKU del Directorio.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/users";
import { createCkuSurvey, listCkuSurveys } from "@/lib/surveysCku";
import { actorCku } from "@/lib/surveyCkuAuth";
import { fetchHrItems } from "@/lib/monday";
import { PLAYER_CKUS, emailDeCkuPorNombre, nombreCkuCanonico, sameCku } from "@/lib/players";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const MAX_NOMBRE = 120;
const MAX_ID = 100;

export async function GET(request: Request) {
  try {
    const me = await requireSession(request.headers.get("authorization"));
    const a = await actorCku(me);
    if (a.admin) return NextResponse.json(await listCkuSurveys());
    if (a.cku) return NextResponse.json(await listCkuSurveys(a.cku));
    throw new Error("forbidden");
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const me = await requireSession(request.headers.get("authorization"));
    const body = (await request.json().catch(() => null)) as { nombre?: unknown; cku?: unknown; entregableId?: unknown } | null;
    const entregableId = typeof body?.entregableId === "string" ? body.entregableId.trim() : "";
    if (!entregableId || entregableId.length > MAX_ID) return NextResponse.json({ error: "Falta el entregable de la encuesta" }, { status: 400 });
    // Se corta en vez de rechazar: el nombre lo pone el entregable, no una persona, y no debe impedir mandar la encuesta.
    const nombre = (typeof body?.nombre === "string" ? body.nombre.trim() : "").slice(0, MAX_NOMBRE);
    if (!nombre) return NextResponse.json({ error: "Falta el nombre del entregable" }, { status: 400 });

    const a = await actorCku(me);

    // Un Admin crea para el CKU de la tarjeta donde dio clic (aunque él mismo sea CKU); un CKU que no es Admin, solo la suya.
    const pedido = typeof body?.cku === "string" ? PLAYER_CKUS.find((c) => sameCku(body.cku as string, c)) : undefined;
    let cku: string;
    let ckuEmail: string;
    if (a.admin && pedido) {
      cku = nombreCkuCanonico(pedido);
      ckuEmail = a.cku === cku ? me.email : emailDeCkuPorNombre(await fetchHrItems(), cku);
    } else if (a.cku) {
      cku = a.cku;
      ckuEmail = me.email;
    } else if (a.admin) {
      return NextResponse.json({ error: "Indica a qué CKU pertenece la encuesta" }, { status: 400 });
    } else {
      throw new Error("forbidden");
    }

    const { survey, creada } = await createCkuSurvey({ cku, ckuEmail, nombre, entregableId, createdByEmail: me.email });
    return NextResponse.json(survey, { status: creada ? 201 : 200 });
  } catch (err) {
    return apiError(err);
  }
}
