// src/app/api/reuniones/disponibilidad/route.ts
// Sugiere huecos para una reunión: cruza el libre/ocupado del propio usuario y de las personas invitadas (solo las del Directorio RH,
// activas y con correo; las de otro dominio salen como «sin datos»). Lunes a viernes, sin asuetos, de 8:00 a 18:00 (Guatemala).
// También devuelve lo ocupado de cada persona por separado (solo bloques ocupados, sin títulos ni detalles de los eventos).
// Body: { desde: "yyyy-mm-dd", hasta: "yyyy-mm-dd", duracionMin, invitados: ["correo", …] }. Requiere «schedule_meetings».

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";
import { HOLIDAY_SET } from "@/lib/holidays";
import { añosSinAsuetos, diasLaborales, huecosLibres } from "@/lib/disponibilidad";
import { accessTokenDe, consultarOcupacion, MAX_CALENDARIOS } from "@/lib/googleCalendar";
import { listarPersonas } from "@/features/tableros/datos/personas";

export const dynamic = "force-dynamic";
const MAX_DIAS = 14;

export async function POST(request: Request) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "schedule_meetings");
    const b = (await request.json().catch(() => null)) as { desde?: string; hasta?: string; duracionMin?: number; invitados?: unknown } | null;
    const { desde, hasta, duracionMin } = b ?? {};
    const correos = Array.isArray(b?.invitados) ? b.invitados.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()) : null;
    if (!desde || !hasta || !correos || !Number.isInteger(duracionMin) || duracionMin! < 15 || duracionMin! > 480 || correos.length > MAX_CALENDARIOS - 1) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }
    const dias = diasLaborales(desde, hasta, HOLIDAY_SET);
    if (!dias.length || Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`) > MAX_DIAS * 86_400_000) {
      return NextResponse.json({ error: `Elige un rango válido de máximo ${MAX_DIAS} días con algún día laboral` }, { status: 400 });
    }

    // Solo personas del Directorio: no se puede usar esta ruta para espiar el calendario de cualquiera
    const directorio = new Set((await listarPersonas()).filter((p) => p.activo && p.email).map((p) => p.email!.trim().toLowerCase()));
    if (correos.some((c) => !directorio.has(c))) return NextResponse.json({ error: "Solo se puede invitar a personas del Directorio RH" }, { status: 400 });

    const token = await accessTokenDe(me.uid);
    // Un día de margen a cada lado: la ventana de Guatemala (UTC-6) cruza el día UTC
    const ocupacion = await consultarOcupacion(token, `${desde}T00:00:00-06:00`, `${hasta}T23:59:59-06:00`, correos);
    const huecos = huecosLibres({ desde, hasta, duracionMin: duracionMin!, ocupados: ocupacion.ocupados, asuetos: HOLIDAY_SET });
    const sinAsuetos = añosSinAsuetos(desde, hasta, HOLIDAY_SET);
    return NextResponse.json({
      // porCalendario: lo ocupado de cada quien (el organizador = «primary»), para pintarlo por persona en el panel
      huecos, sinDatos: ocupacion.sinDatos, porCalendario: ocupacion.porCalendario,
      ...(sinAsuetos.length ? { aviso: `No hay asuetos cargados para ${sinAsuetos.join(", ")}: puede sugerir un día feriado` } : {}),
    });
  } catch (err) {
    return apiError(err);
  }
}
