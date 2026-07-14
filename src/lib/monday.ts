// src/lib/monday.ts
// SOLO SERVIDOR. Usa MONDAY_API_KEY (sin NEXT_PUBLIC_) → nunca llega al cliente.
// Este módulo solo debe importarse desde Route Handlers / código de servidor.

import type {
  CalMeetingRaw,
  DashboardRaw,
  MondayItem,
  ProjBoardRaw,
  SheetRow,
} from "@/types";

const MONDAY_URL = "https://api.monday.com/v2";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name} en .env.local`);
  return v;
}

interface MondayResponse<T> {
  data: T;
  errors?: { message: string }[];
}

async function mondayFetch<T>(query: string): Promise<T> {
  const res = await fetch(MONDAY_URL, {
    method: "POST",
    headers: {
      Authorization: env("MONDAY_API_KEY"),
      "Content-Type": "application/json",
      "API-Version": "2024-01",
    },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Monday HTTP ${res.status}`);
  const json = (await res.json()) as MondayResponse<T>;
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

/** Web App de Google: ahora devuelve calendario + hoja en un solo objeto.
 *  Retrocompatible: si la respuesta es un array (formato viejo) = solo calendario. */
async function fetchWebApp(): Promise<{ calData: CalMeetingRaw[]; sheetRows: SheetRow[] }> {
  try {
    const res = await fetch(env("CALENDAR_WEBAPP_URL"), {
      redirect: "follow",
      cache: "no-store",
    });
    const json = await res.json();
    if (Array.isArray(json)) {
      return { calData: json as CalMeetingRaw[], sheetRows: [] };
    }
    return {
      calData: (json.calendar ?? []) as CalMeetingRaw[],
      sheetRows: (json.sheet ?? []) as SheetRow[],
    };
  } catch (e) {
    console.warn("WebApp fetch failed:", e);
    return { calData: [], sheetRows: [] };
  }
}

// ── Queries ────────────────────────────────────────────────────────────
const boardItemsQuery = (boardId: string) =>
  `{ boards(ids:[${boardId}]) { items_page(limit:500) { items { id name group { title } column_values { id text } } } } }`;

// Query "rica": además del texto y el título de columna (para match por nombre, ej. CKU),
// trae display_value de columnas mirror/board_relation (Estrategia, Sponsor).
// Se usa para Iniciativas y REQ (ambos con relación a "Estrategia 🔝").
const richBoardQuery = (boardId: string) =>
  `{ boards(ids:[${boardId}]) { items_page(limit:500) { items { id name group { title } column_values { id text column { title } ... on MirrorValue { display_value } ... on BoardRelationValue { display_value } } } } } }`;

// Board "Estrategia 🔝": nombre + U Neg + País + Sponsor (people; suele venir como email).
const estBoardQuery = (boardId: string) =>
  `{ boards(ids:[${boardId}]) { items_page(limit:500) { items { id name column_values(ids:["text_mkx5ehzc","text_mkx5fa5a","multiple_person_mkz54zk0"]) { id text } } } } }`;

const projBoardsQuery = (ids: string) =>
  `{ boards(ids:[${ids}]) { id name items_page(limit:500) { items { id name group { title } column_values { id text column { title } } subitems { id name column_values { id text column { title } ... on BoardRelationValue { display_value } ... on MirrorValue { display_value } } } } } } }`;

async function discoverProjBoards(): Promise<{ id: string; name: string }[]> {
  const data = await mondayFetch<{
    folders: { children: { id: string; name: string }[] }[];
  }>(`{ folders(ids:[${env("MONDAY_PROJ_FOLDER_ID")}]) { children { id name } } }`);
  return data.folders?.[0]?.children ?? [];
}

/** Single Fetch: trae TODO en paralelo y devuelve datos crudos serializables. */
export async function fetchDashboardRaw(): Promise<DashboardRaw> {
  const iniId = env("MONDAY_INI_BOARD_ID");
  const reqId = env("MONDAY_REQ_BOARD_ID");
  // Board "Directorio RH": el nombre del item es el nombre del recurso; email en email_mkz5qg4v.
  const rhId  = env("MONDAY_RH_BOARD_ID");
  // Board "Estrategia 🔝": fuente de U Neg/País. Configurable; default al id descubierto.
  const estId = process.env.MONDAY_EST_BOARD_ID || "18291587533";

  // 1ª tanda en paralelo: ini, req, RH, Estrategia, web app (calendario + hoja) y descubrir boards.
  const [iniData, reqData, rhData, estData, webApp, projBoards] = await Promise.all([
    mondayFetch<{ boards: { items_page: { items: MondayItem[] } }[] }>(richBoardQuery(iniId)),
    mondayFetch<{ boards: { items_page: { items: MondayItem[] } }[] }>(richBoardQuery(reqId)),
    mondayFetch<{ boards: { items_page: { items: MondayItem[] } }[] }>(boardItemsQuery(rhId)),
    mondayFetch<{ boards: { items_page: { items: MondayItem[] } }[] }>(estBoardQuery(estId)),
    fetchWebApp(),
    discoverProjBoards(),
  ]);

  // 2ª tanda: items de todos los boards de proyectos (depende del descubrimiento).
  let projRaw: ProjBoardRaw[] = [];
  if (projBoards.length) {
    const ids = projBoards.map((b) => b.id).join(",");
    const data = await mondayFetch<{ boards: ProjBoardRaw[] }>(projBoardsQuery(ids));
    projRaw = data.boards ?? [];
  }

  return {
    iniItems: iniData.boards[0]?.items_page.items ?? [],
    reqItems: reqData.boards[0]?.items_page.items ?? [],
    hrItems: rhData.boards[0]?.items_page.items ?? [],
    estrategiaItems: estData.boards[0]?.items_page.items ?? [],
    projBoards,
    projRaw,
    calData: webApp.calData,
    sheetRows: webApp.sheetRows,
    baselines: {},          // el route handler inyecta los baselines de REQ desde Firestore
    projItemBaselines: {}, // el route handler inyecta los baselines de Proyectos desde Firestore
    npsRecords: [],        // el route handler inyecta las respuestas de encuestas desde Firestore
    fetchedAt: new Date().toISOString(),
  };
}
