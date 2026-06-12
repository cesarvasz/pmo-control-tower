// src/app/api/dashboard/route.ts
// Route Handler: hace el Single Fetch seguro a Monday/Calendar en el servidor.
// Protegido: exige un ID token de Firebase válido y correo del dominio permitido.

import { NextResponse } from "next/server";
import { fetchDashboardRaw } from "@/lib/monday";
import { verifyRequest, getReqBaselines, saveReqBaseline, getProjItemBaselines, saveProjItemBaseline } from "@/lib/firebase-admin";
import type { MondayColumnValue, MondayItem, ProjBoardRaw } from "@/types";

// IDs de columnas REQ necesarios para baseline (mismo valor que REQ_COLS en process.ts).
const BL_COLS = { costRH: "labor_budget_spent", costSft: "numeric_mm3gbavc" };

function parseNum(v: string | null | undefined): number {
  const n = parseFloat((v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function getCol(item: MondayItem, id: string): string {
  return item.column_values.find((c) => c.id === id)?.text ?? "";
}

function getColByTitle(cvs: MondayColumnValue[], title: string): string {
  return cvs.find((c) => (c.column?.title ?? "") === title)?.text ?? "";
}

async function syncBaselines(reqItems: MondayItem[]) {
  const baselines = await getReqBaselines();

  // Items a guardar/actualizar:
  // - Sin baseline → siempre guardar (costRH + costSft, aunque costSft sea 0).
  // - Baseline existe con costSft = 0 y ahora costSft > 0 → actualizar con nueva suma.
  // - Baseline existe con costSft > 0 → nunca sobreescribir.
  const toSave: { id: string; costRH: number; costSft: number }[] = [];

  for (const item of reqItems) {
    const costRH = parseNum(getCol(item, BL_COLS.costRH));
    const costSft = parseNum(getCol(item, BL_COLS.costSft));
    const existing = baselines[item.id];

    if (!existing) {
      toSave.push({ id: item.id, costRH, costSft });
    } else if (existing.costSft === 0 && costSft > 0) {
      toSave.push({ id: item.id, costRH, costSft });
    }
  }

  await Promise.all(
    toSave.map(({ id, costRH, costSft }) => saveReqBaseline(id, { costRH, costSft }))
  );

  // Reflejar los cambios en el mapa en memoria para la respuesta actual.
  const savedAt = new Date().toISOString();
  for (const { id, costRH, costSft } of toSave) {
    baselines[id] = { costRH, costSft, savedAt };
  }
  return baselines;
}

async function syncProjItemBaselines(projRaw: ProjBoardRaw[]) {
  const baselines = await getProjItemBaselines();
  const toSave: { id: string; boardId: string; cost: number }[] = [];

  for (const board of projRaw) {
    for (const item of board.items_page.items) {
      const cost = parseNum(getColByTitle(item.column_values, "Cost $"));
      const existing = baselines[item.id];

      if (!existing) {
        toSave.push({ id: item.id, boardId: board.id, cost });
      } else if (existing.cost === 0 && cost > 0) {
        // Costo era 0 (ej. Software pendiente) y ya tiene valor → actualizar.
        toSave.push({ id: item.id, boardId: board.id, cost });
      }
      // Subitems no se guardan — EV/PV solo usan items de nivel superior.
    }
  }

  await Promise.all(
    toSave.map(({ id, boardId, cost }) => saveProjItemBaseline(id, { boardId, cost }))
  );

  const savedAt = new Date().toISOString();
  for (const { id, boardId, cost } of toSave) {
    baselines[id] = { boardId, cost, savedAt };
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
    const [baselines, projItemBaselines] = await Promise.all([
      syncBaselines(data.reqItems),
      syncProjItemBaselines(data.projRaw),
    ]);
    return NextResponse.json({ ...data, baselines, projItemBaselines });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
