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
    case "pending-approval":
      return NextResponse.json({ error: "Tu cuenta está pendiente de aprobación por un administrador" }, { status: 403 });
    case "weak-password":
      return NextResponse.json({ error: "La contraseña no cumple los requisitos (mínimo 8 caracteres, con letras y números)" }, { status: 400 });
    case "already-answered":
      return NextResponse.json({ error: "Esta encuesta ya fue contestada" }, { status: 409 });
    case "cku-already-answered":
      return NextResponse.json({ error: "Ya contestaste esta encuesta con ese correo." }, { status: 409 });
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
    case "reunion-ya-agendada":
      return NextResponse.json({ error: "Esta iniciativa ya tiene esa reunión agendada" }, { status: 409 });
    case "reunion-no-encontrada":
      return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
    case "reunion-iniciativa-no-encontrada":
      return NextResponse.json({ error: "Iniciativa no encontrada" }, { status: 404 });
    case "reunion-etapa-invalida":
      return NextResponse.json({ error: "Esta iniciativa ya no tiene una reunión por agendar" }, { status: 409 });
    case "reunion-no-es-tuya":
      return NextResponse.json({ error: "Esta reunión está en el calendario de otra persona: solo quien la agendó puede cambiarla o cancelarla" }, { status: 403 });
    case "google-evento-cambiado":
      return NextResponse.json({ error: "Alguien cambió este evento directo en Google Calendar. Ya se actualizó con lo que hay allá; revisa los datos y vuelve a intentar", codigo: "google-evento-cambiado" }, { status: 409 });
    case "reunion-datos-invalidos":
      return NextResponse.json({ error: "Los datos de la reunión no son válidos" }, { status: 400 });
    case "google-no-configurado":
      return NextResponse.json({ error: "La conexión con Google no está configurada en el servidor" }, { status: 503 });
    case "google-no-conectado":
      return NextResponse.json({ error: "Primero conecta tu cuenta de Google", codigo: "google-no-conectado" }, { status: 409 });
    case "google-reconnect-required":
      return NextResponse.json({ error: "Tu conexión con Google venció: vuelve a conectarla", codigo: "google-reconnect-required" }, { status: 409 });
    case "google-calendar-prohibido":
      return NextResponse.json({ error: "Google no permitió esta operación en tu calendario" }, { status: 403 });
    case "google-evento-no-existe":
      return NextResponse.json({ error: "El evento ya no existe en Google Calendar" }, { status: 404 });
    case "google-calendar-saturado":
      return NextResponse.json({ error: "Google Calendar está limitando las solicitudes; intenta en un momento" }, { status: 429 });
    case "google-calendar-error":
      return NextResponse.json({ error: "No se pudo hablar con Google Calendar" }, { status: 502 });
    default:
      return NextResponse.json({ error: code }, { status: 500 });
  }
}
