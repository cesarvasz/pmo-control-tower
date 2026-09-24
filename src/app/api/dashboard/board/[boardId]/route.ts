// src/app/api/dashboard/board/[boardId]/route.ts
// Refresca UN SOLO board de Proyectos — carril rápido aparte de /api/dashboard
// (que trae los 14 juntos). Trae los items de ese board + Iniciativas/RH (para
// enriquecerlo: PM/Estrategia/Sponsor/CKU/Benefit Type) y resincroniza SOLO
// los baselines de sus items. Mismo esquema de auth que /api/dashboard.

import { NextResponse } from "next/server";
import { discoverProjBoards, fetchIniAndHrRaw, fetchProjBoardRaw } from "@/lib/monday";
import { buildIniLookup, projEnrichBoards, projProcess } from "@/lib/proj";
import { syncBoardBaselines } from "@/lib/projBaselineSync";
import { verifyRequest } from "@/lib/firebase-admin";
import type { ProjBoard, ProjBoardRaw, ProjItemBaseline } from "@/types";

export const dynamic = "force-dynamic";

export interface BoardRefreshResponse {
  projBoard: ProjBoard;      // enriquecido: PM/Estrategia/Sponsor/CKU/Benefit Type
  projRaw: ProjBoardRaw;     // crudo — el cliente hace su propio projProcess (zona horaria)
  projItemBaselines: Record<string, ProjItemBaseline>;
  fetchedAt: string;
}

export async function GET(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    await verifyRequest(request.headers.get("authorization"));
  } catch (err) {
    const code = err instanceof Error ? err.message : "unauthorized";
    if (code === "no-token" || code === "invalid-token")
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (code === "domain-not-allowed")
      return NextResponse.json({ error: "Dominio no autorizado" }, { status: 403 });
    return NextResponse.json({ error: code }, { status: 500 });
  }

  const { boardId } = await params;

  try {
    // Metadata de TODOS los boards (barato, sin items) — hace falta completa
    // para que resolverIniDeBoard aplique correctamente sus excepciones (ej.
    // PM-013 hereda Estrategia/Sponsor/CKU de PM-003, ver proj.ts) aunque acá
    // solo se traigan los items de UNO.
    const [allBoardsMeta, projRaw, { iniItems, hrItems }] = await Promise.all([
      discoverProjBoards(),
      fetchProjBoardRaw(boardId),
      fetchIniAndHrRaw(),
    ]);

    if (!allBoardsMeta.some((b) => b.id === boardId)) {
      return NextResponse.json({ error: "Ese board no pertenece a la carpeta de Proyectos" }, { status: 404 });
    }

    const projItemBaselines = await syncBoardBaselines(boardId, projRaw.items_page.items);

    // Enriquecimiento: SOLO necesita los strings de PM/Resp/Responsible del
    // primer item de CADA board para resolver boardResp — pasar solo los
    // items de este board es correcto para su propia entrada; las de los
    // demás boards salen vacías y se descartan (nos quedamos con la nuestra).
    const items = projProcess(projRaw.name, projRaw.id, projRaw.items_page.items);
    const enriched = projEnrichBoards(allBoardsMeta, items, buildIniLookup(iniItems, hrItems));
    const projBoard = enriched.find((b) => b.id === boardId);
    if (!projBoard) return NextResponse.json({ error: "No se pudo enriquecer el board" }, { status: 500 });

    const body: BoardRefreshResponse = { projBoard, projRaw, projItemBaselines, fetchedAt: new Date().toISOString() };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
