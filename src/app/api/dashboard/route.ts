// src/app/api/dashboard/route.ts
// Route Handler: hace el Single Fetch seguro a Monday/Calendar en el servidor.
// Protegido: exige un ID token de Firebase válido y correo del dominio permitido.

import { NextResponse } from "next/server";
import { fetchDashboardRaw } from "@/lib/monday";
import { verifyRequest, getReqBaselines, saveReqBaseline } from "@/lib/firebase-admin";
import type { MondayItem } from "@/types";

// IDs de columnas REQ necesarios para baseline (mismo valor que REQ_COLS en process.ts).
const BL_COLS = { costRH: "labor_budget_spent", costSft: "numeric_mm3gbavc", tld: "dropdown_mm3gpacy" };

function parseNum(v: string | null | undefined): number {
  const n = parseFloat((v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function getCol(item: MondayItem, id: string): string {
  return item.column_values.find((c) => c.id === id)?.text ?? "";
}

async function syncBaselines(reqItems: MondayItem[]) {
  const baselines = await getReqBaselines();
  const toSave = reqItems.filter((item) => {
    if (baselines[item.id]) return false; // ya existe, nunca sobreescribir
    const costSft = parseNum(getCol(item, BL_COLS.costSft));
    const tld = getCol(item, BL_COLS.tld);
    return costSft > 0 || tld === "S/dev";
  });
  await Promise.all(
    toSave.map((item) =>
      saveReqBaseline(item.id, {
        costRH: parseNum(getCol(item, BL_COLS.costRH)),
        costSft: parseNum(getCol(item, BL_COLS.costSft)),
      })
    )
  );
  // Agregar los recién guardados al mapa para devolverlos en la misma respuesta.
  const savedAt = new Date().toISOString();
  for (const item of toSave) {
    baselines[item.id] = {
      costRH: parseNum(getCol(item, BL_COLS.costRH)),
      costSft: parseNum(getCol(item, BL_COLS.costSft)),
      savedAt,
    };
  }
  return baselines;
}

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

  // 2. Single Fetch a Monday + sync baselines en Firestore.
  try {
    const data = await fetchDashboardRaw();
    const baselines = await syncBaselines(data.reqItems);
    return NextResponse.json({ ...data, baselines });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
