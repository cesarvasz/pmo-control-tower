// src/app/api/iniciativas/recordatorios/route.ts
// GET → { iniciativas: [...] } para el Apps Script de recordatorios «Sin Valor Def» (apps-script/sin-valor-def-reminders.gs):
// status, Ini ID, En Espera, PKU, CKU (nombre y correo) y PM (nombre y correos), leídos del tablero de Iniciativas de la app.
// Así el script deja de leer el board de Monday (que se congela en el corte). El script filtra y decide a quién escribir.
//
// Sin sesión de usuario: lo llama Google. Exige "Authorization: Bearer $RECORDATORIOS_SECRET"; si la variable no existe,
// responde 503 (lleva correos de personas: nunca queda abierto).

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { iniciativasParaRecordatorios } from "@/features/tableros/datos/iniciativas-app";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(request: Request, secreto: string): boolean {
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secreto = process.env.RECORDATORIOS_SECRET?.trim();
  if (!secreto) return NextResponse.json({ error: "RECORDATORIOS_SECRET no está configurado" }, { status: 503 });
  if (!autorizado(request, secreto)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json({ iniciativas: await iniciativasParaRecordatorios() });
  } catch (err) {
    console.error("recordatorios: no se pudieron leer las iniciativas", err);
    return NextResponse.json({ error: "No se pudieron leer las iniciativas" }, { status: 500 });
  }
}
