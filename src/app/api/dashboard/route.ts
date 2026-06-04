// src/app/api/dashboard/route.ts
// Route Handler: hace el Single Fetch seguro a Monday/Calendar en el servidor.
// Protegido: exige un ID token de Firebase válido y correo del dominio permitido.

import { NextResponse } from "next/server";
import { fetchDashboardRaw } from "@/lib/monday";
import { verifyRequest } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 1. Autenticación/autorización (token + dominio).
  try {
    await verifyRequest(request.headers.get("authorization"));
  } catch (err) {
    const code = err instanceof Error ? err.message : "unauthorized";
    if (code === "no-token" || code === "invalid-token")
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (code === "domain-not-allowed")
      return NextResponse.json({ error: "Dominio no autorizado" }, { status: 403 });
    // Admin SDK sin configurar u otro error de verificación.
    return NextResponse.json({ error: code }, { status: 500 });
  }

  // 2. Single Fetch a Monday.
  try {
    const data = await fetchDashboardRaw();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
