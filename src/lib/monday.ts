// src/lib/monday.ts
// SOLO SERVIDOR. Usa MONDAY_API_KEY (sin NEXT_PUBLIC_) → nunca llega al cliente.
// Este módulo solo debe importarse desde Route Handlers / código de servidor.

import type {
  CalMeetingRaw,
  DashboardRaw,
  MondayItem,
  ProjBoardRaw,
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

async function fetchCalendar(): Promise<CalMeetingRaw[]> {
  try {
    const res = await fetch(env("CALENDAR_WEBAPP_URL"), {
      redirect: "follow",
      cache: "no-store",
    });
    return (await res.json()) as CalMeetingRaw[];
  } catch (e) {
    console.warn("Calendar fetch failed:", e);
    return [];
  }
}

// ── Queries ────────────────────────────────────────────────────────────
const boardItemsQuery = (boardId: string) =>
  `{ boards(ids:[${boardId}]) { items_page(limit:500) { items { id name group { title } column_values { id text } } } } }`;

const projBoardsQuery = (ids: string) =>
  `{ boards(ids:[${ids}]) { id name items_page(limit:500) { items { id name group { title } column_values { id text column { title } } subitems { id name column_values { id text column { title } } } } } } }`;

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

  // 1ª tanda en paralelo: ini, req, calendario y descubrir boards de proyectos.
  const [iniData, reqData, calData, projBoards] = await Promise.all([
    mondayFetch<{ boards: { items_page: { items: MondayItem[] } }[] }>(boardItemsQuery(iniId)),
    mondayFetch<{ boards: { items_page: { items: MondayItem[] } }[] }>(boardItemsQuery(reqId)),
    fetchCalendar(),
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
    projBoards,
    projRaw,
    calData,
    fetchedAt: new Date().toISOString(),
  };
}
