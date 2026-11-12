// src/lib/mondayMirror.ts
// Lógica PURA de la copia de Monday en Supabase (sin red ni base de datos):
//  - aFilas:              board tal cual lo da la API de Monday → filas para guardar.
//  - reconstruirItems:    filas guardadas → MondayItem[] con la MISMA forma que la API,
//                         para que projProcess / buildDashboardData no cambien.
//  - diferenciasItems:    compara la API contra la copia (prueba de paridad).
// Las columnas (título + settings_str) se guardan una vez por board, no en cada valor.

import type { MondayColumnValue, MondayItem, MondaySubitem } from "@/types";

export type TipoBoard = "ini" | "req" | "rh" | "est" | "proj";

/** Definición de una columna de board, como la da `boards { columns { … } }`. */
export interface ColumnaApi {
  id: string;
  title: string;
  settings_str?: string | null;
}

/** Valor de columna tal cual la API (con display_value solo en mirror / board_relation). */
export interface ValorApi {
  id: string;
  text: string | null;
  display_value?: string | null;
}

export interface SubitemApi {
  id: string;
  name: string;
  email?: string | null;
  board?: { id: string } | null;
  column_values: ValorApi[];
}

export interface ItemApi {
  id: string;
  name: string;
  email?: string | null;
  group?: { title: string } | null;
  column_values: ValorApi[];
  subitems?: SubitemApi[] | null;
}

export interface BoardApi {
  id: string;
  name: string;
  columns: ColumnaApi[];
  items: ItemApi[]; // TODOS los items (ya paginados)
}

/** { column_id: { title, settings_str } } */
export type MapaColumnas = Record<string, { title: string; settings_str?: string }>;

/** Lo que recibe la función mirror_guardar_board (p_board). */
export interface BoardFila {
  id: string;
  nombre: string;
  tipo: TipoBoard;
  columnas: MapaColumnas;
  sub_boards: { id: string; nombre: string; columnas: MapaColumnas }[];
}

/** Una fila de monday_items (p_items y lo que se lee de vuelta). */
export interface ItemFila {
  id: string;
  parent_id: string | null;
  sub_board_id: string | null;
  orden: number;
  nombre: string;
  email: string | null;
  grupo: string | null;
  column_values: ValorApi[];
}

export function mapaColumnas(cols: ColumnaApi[]): MapaColumnas {
  const out: MapaColumnas = {};
  for (const c of cols) {
    out[c.id] = c.settings_str != null ? { title: c.title, settings_str: c.settings_str } : { title: c.title };
  }
  return out;
}

/** Solo id/text (+display_value si la API lo mandó): el resto se reconstruye del board. */
function valoresCompactos(vals: ValorApi[]): ValorApi[] {
  return vals.map((v) => (v.display_value !== undefined
    ? { id: v.id, text: v.text ?? null, display_value: v.display_value }
    : { id: v.id, text: v.text ?? null }));
}

/** Board de la API → filas. `subBoards` son los boards OCULTOS de subitems (con columnas). */
export function aFilas(
  board: BoardApi,
  tipo: TipoBoard,
  subBoards: { id: string; name: string; columns: ColumnaApi[] }[] = [],
): { board: BoardFila; items: ItemFila[] } {
  const items: ItemFila[] = [];
  board.items.forEach((it, i) => {
    items.push({
      id: it.id,
      parent_id: null,
      sub_board_id: null,
      orden: i,
      nombre: it.name,
      email: it.email ?? null,
      grupo: it.group?.title ?? null,
      column_values: valoresCompactos(it.column_values),
    });
    (it.subitems ?? []).forEach((s, j) => {
      items.push({
        id: s.id,
        parent_id: it.id,
        sub_board_id: s.board?.id ?? null,
        orden: j,
        nombre: s.name,
        email: s.email ?? null,
        grupo: null,
        column_values: valoresCompactos(s.column_values),
      });
    });
  });
  return {
    board: {
      id: board.id,
      nombre: board.name,
      tipo,
      columnas: mapaColumnas(board.columns),
      sub_boards: subBoards.map((b) => ({ id: b.id, nombre: b.name, columnas: mapaColumnas(b.columns) })),
    },
    items,
  };
}

function valoresCompletos(vals: ValorApi[], cols: MapaColumnas): MondayColumnValue[] {
  return vals.map((v) => {
    const out: MondayColumnValue = { id: v.id, text: v.text ?? null, column: cols[v.id] ?? null };
    if (v.display_value !== undefined) out.display_value = v.display_value;
    return out;
  });
}

/**
 * Filas guardadas → MondayItem[] en el orden de Monday. `conSubitems` replica la API: los
 * boards de Proyectos traen `subitems` (vacío si no hay); Iniciativas/REQ/RH/Estrategia no.
 * Recibe solo filas vigentes (deleted_at null).
 */
export function reconstruirItems(
  filas: ItemFila[],
  columnas: MapaColumnas,
  columnasSub: Record<string, MapaColumnas>,
  conSubitems: boolean,
): MondayItem[] {
  const porOrden = (a: ItemFila, b: ItemFila) => a.orden - b.orden || a.id.localeCompare(b.id);
  const subsPorPadre = new Map<string, ItemFila[]>();
  for (const f of filas) {
    if (!f.parent_id) continue;
    const l = subsPorPadre.get(f.parent_id);
    if (l) l.push(f); else subsPorPadre.set(f.parent_id, [f]);
  }

  return filas
    .filter((f) => !f.parent_id)
    .sort(porOrden)
    .map((f) => {
      const item: MondayItem = {
        id: f.id,
        name: f.nombre,
        email: f.email,
        group: { title: f.grupo ?? "" },
        column_values: valoresCompletos(f.column_values, columnas),
      };
      if (conSubitems) {
        item.subitems = (subsPorPadre.get(f.id) ?? []).sort(porOrden).map((s): MondaySubitem => ({
          id: s.id,
          name: s.nombre,
          email: s.email,
          board: s.sub_board_id ? { id: s.sub_board_id } : null,
          column_values: valoresCompletos(s.column_values, s.sub_board_id ? columnasSub[s.sub_board_id] ?? {} : {}),
        }));
      }
      return item;
    });
}

// ── Prueba de paridad ──────────────────────────────────────────────────────

type ConValores = { id: string; name: string; email?: string | null; column_values: MondayColumnValue[] };

/** Compara un valor de columna de la API contra la copia. Solo revisa los campos que la API
 *  trajo (cada consulta de la app pide campos distintos: la de RH no pide `column`, etc.). */
function difValor(dondeEs: string, api: MondayColumnValue, esp: MondayColumnValue | undefined): string[] {
  if (!esp) return [`${dondeEs}: falta la columna ${api.id}`];
  const out: string[] = [];
  if ((api.text ?? null) !== (esp.text ?? null)) out.push(`${dondeEs}.${api.id}.text: ${JSON.stringify(api.text)} ≠ ${JSON.stringify(esp.text)}`);
  if (api.display_value !== undefined && (api.display_value ?? null) !== (esp.display_value ?? null)) {
    out.push(`${dondeEs}.${api.id}.display_value: ${JSON.stringify(api.display_value)} ≠ ${JSON.stringify(esp.display_value)}`);
  }
  if (api.column) {
    if (api.column.title !== esp.column?.title) out.push(`${dondeEs}.${api.id}.title: ${api.column.title} ≠ ${esp.column?.title}`);
    if (api.column.settings_str !== undefined && api.column.settings_str !== esp.column?.settings_str) {
      out.push(`${dondeEs}.${api.id}.settings_str distinto`);
    }
  }
  return out;
}

function difConValores(dondeEs: string, api: ConValores, esp: ConValores): string[] {
  const out: string[] = [];
  if (api.name !== esp.name) out.push(`${dondeEs}.name: ${api.name} ≠ ${esp.name}`);
  if (api.email !== undefined && (api.email ?? null) !== (esp.email ?? null)) out.push(`${dondeEs}.email`);
  const espPorId = new Map(esp.column_values.map((c) => [c.id, c]));
  for (const c of api.column_values) out.push(...difValor(dondeEs, c, espPorId.get(c.id)));
  return out;
}

/** Diferencias entre lo que devuelve la API y la copia reconstruida (vacío = paridad). */
export function diferenciasItems(etiqueta: string, api: MondayItem[], espejo: MondayItem[]): string[] {
  const out: string[] = [];
  if (api.length !== espejo.length) out.push(`${etiqueta}: ${api.length} items en Monday vs ${espejo.length} en la copia`);
  const espPorId = new Map(espejo.map((i) => [i.id, i]));
  api.forEach((a, idx) => {
    const e = espPorId.get(a.id);
    const dondeEs = `${etiqueta}/${a.id}`;
    if (!e) { out.push(`${dondeEs}: falta en la copia`); return; }
    if (espejo[idx]?.id !== a.id) out.push(`${dondeEs}: orden distinto`);
    if (a.group && a.group.title !== e.group?.title) out.push(`${dondeEs}.group: ${a.group?.title} ≠ ${e.group?.title}`);
    out.push(...difConValores(dondeEs, a, e));
    if (a.subitems) {
      const subs = e.subitems ?? [];
      if (a.subitems.length !== subs.length) out.push(`${dondeEs}: ${a.subitems.length} subitems vs ${subs.length}`);
      const subPorId = new Map(subs.map((s) => [s.id, s]));
      for (const s of a.subitems) {
        const es = subPorId.get(s.id);
        if (!es) { out.push(`${dondeEs}/sub ${s.id}: falta en la copia`); continue; }
        if ((s.board?.id ?? null) !== (es.board?.id ?? null)) out.push(`${dondeEs}/sub ${s.id}.board`);
        out.push(...difConValores(`${dondeEs}/sub ${s.id}`, s, es));
      }
    }
  });
  return out;
}
