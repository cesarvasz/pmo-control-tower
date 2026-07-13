// src/lib/api-errors.ts  (servidor)
import { NextResponse } from "next/server";

/** Traduce los códigos de error de auth/users a una respuesta HTTP. */
export function apiError(err: unknown): NextResponse {
  const code = err instanceof Error ? err.message : "error";
  switch (code) {
    case "no-token":
    case "invalid-token":
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    case "domain-not-allowed":
      return NextResponse.json({ error: "Dominio no autorizado" }, { status: 403 });
    case "forbidden":
      return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
    case "already-answered":
      return NextResponse.json({ error: "Esta encuesta ya fue contestada" }, { status: 409 });
    case "survey-answered":
      return NextResponse.json({ error: "No se puede cancelar una encuesta ya contestada; usa Invalidar." }, { status: 409 });
    case "survey-not-found":
      return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });
    case "user-not-found":
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    case "role-not-found":
      return NextResponse.json({ error: "Rol no encontrado" }, { status: 404 });
    case "group-not-found":
      return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
    case "group-is-system":
      return NextResponse.json({ error: "No se puede eliminar un grupo del sistema" }, { status: 400 });
    case "role-is-system":
      return NextResponse.json({ error: "No se puede eliminar un rol del sistema" }, { status: 400 });
    case "role-in-use":
      return NextResponse.json({ error: "El rol está asignado a usuarios. Reasígnalos antes de eliminarlo." }, { status: 400 });
    default:
      return NextResponse.json({ error: code }, { status: 500 });
  }
}
