// src/app/api/cron/monday-sync/route.ts
// Copia completa de Monday → Supabase (reconciliación de la copia de los boards).
// La disparará pg_cron + pg_net cada 15–30 min cuando esté en producción; también se
// puede llamar a mano (en local: GET http://localhost:3000/api/cron/monday-sync).
//   ?board=<id>&tipo=<ini|req|rh|est|proj>  → copia solo ese board.
//
// Protegido con CRON_SECRET (misma convención que /api/cron/weekly-snapshot): si la
// variable existe se exige "Authorization: Bearer $CRON_SECRET"; sin ella se deja pasar
// para poder probarlo en local.

import { NextResponse } from "next/server";
import { sincronizarBoard, sincronizarTodo } from "@/lib/mondayMirrorSync";
import type { TipoBoard } from "@/lib/mondayMirror";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIPOS: TipoBoard[] = ["ini", "req", "rh", "est", "proj"];

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const board = url.searchParams.get("board");
  const tipo = url.searchParams.get("tipo") as TipoBoard | null;

  try {
    if (board) {
      if (!/^\d+$/.test(board) || !tipo || !TIPOS.includes(tipo)) {
        return NextResponse.json({ error: "board numérico y tipo ini|req|rh|est|proj" }, { status: 400 });
      }
      return NextResponse.json(await sincronizarBoard(board, tipo));
    }
    const r = await sincronizarTodo(request.headers.get("x-origen") ?? "cron");
    return NextResponse.json(r, { status: r.ok ? 200 : 207 });
  } catch (err) {
    console.error("monday-sync falló:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
