// SOLO SERVIDOR. Errores de Tableros → respuesta HTTP.

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";

/** Error con un mensaje para el usuario y su código HTTP. */
export class ErrorTablero extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ErrorTablero";
  }
}

/** Códigos que lanzan las funciones de la base (raise exception '…'). */
const DE_LA_BASE: Record<string, [number, string]> = {
  "elemento-no-encontrado": [404, "El elemento ya no existe"],
  "columna-no-encontrada": [404, "La columna ya no existe"],
  "tablero-sin-nombre": [400, "El tablero necesita un nombre"],
};

export function respuestaDeError(err: unknown): NextResponse {
  if (err instanceof ErrorTablero) return NextResponse.json({ error: err.message }, { status: err.status });
  const conocido = err instanceof Error ? DE_LA_BASE[err.message] : undefined;
  if (conocido) return NextResponse.json({ error: conocido[1] }, { status: conocido[0] });
  return apiError(err);
}
