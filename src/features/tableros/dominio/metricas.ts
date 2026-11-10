// ADAPTADOR de métricas: tablero de la app → la MISMA forma que hoy entrega Monday (MondayItem[]),
// para pasarla por el mismo projProcess que usan Control Tower, Players, Portafolio, EVM y los
// reportes. Así las métricas no se reescriben: un proyecto mide igual esté en Monday o en la app.
//
// Se lee por ROL, nunca por el título que el usuario le puso a la columna: cada rol se emite con el
// título que espera projProcess ("Limit Date", "Cost $"…). Las columnas sin rol salen con su
// propio título (así "Start Date", "Resp", "PMS ID"… de los tableros importados siguen igual).
// Lógica PURA.

import type { MondayColumnValue, MondayItem, ProjItem } from "@/types";
import { projProcess } from "@/lib/proj";
import { tipoColumna } from "./tipos-columna";
import { etiquetaStatus, type ConfigStatus } from "./tipos-columna/status";
import { porOrden, type Columna, type Elemento, type Nivel, type TableroCompleto } from "./tablero";

/** Título que projProcess espera para cada rol (por nivel cuando difiere). */
const TITULO_POR_ROL: Record<string, string | Record<Nivel, string>> = {
  status: "Status",
  responsable: "Responsible",
  plan: { item: "CPM", sub: "Timeline" },
  fecha_limite: "Limit Date",
  nueva_fecha_limite: "New Limit Date",
  fin_real: { item: "End Date", sub: "Actual End" },
  costo: "Cost $",
  beneficio: "Benefit $",
  esfuerzo_plan: "Effort Planned",
  esfuerzo_real: "Effort Spent",
  tipo_elemento: "Type",
  fase_valor: "Fase VALOR",
};

export function tituloParaMetricas(c: Pick<Columna, "rol" | "nivel" | "titulo">): string {
  const t = c.rol ? TITULO_POR_ROL[c.rol] : undefined;
  if (!t) return c.titulo;
  return typeof t === "string" ? t : t[c.nivel];
}

/** Textos de status que projProcess ya entiende (los de Monday). Una etiqueta propia de la app
 *  ("Listo", "Bloqueado"…) se traduce por su categoría. */
const STATUS_CONOCIDOS = new Set([
  "done", "working on it", "stuck", "stuck interno", "stuck externo", "future steps", "on hold", "out of scope", "no viable",
]);
const STATUS_POR_CATEGORIA: Record<string, string> = {
  hecho: "Done", en_curso: "Working on it", atascado: "Stuck", pausa: "On Hold", fuera: "No Viable", sin_iniciar: "Future Steps",
};

export function textoStatusParaMetricas(texto: string, categoria: string): string {
  return STATUS_CONOCIDOS.has(texto.trim().toLowerCase()) ? texto : STATUS_POR_CATEGORIA[categoria] ?? texto;
}

export interface PersonaMetricas { nombre: string; tld: string | null }

/** Texto de una celda tal como Monday lo daría en `text` (fechas AAAA-MM-DD, rango "a - b"…). */
function textoMonday(c: Columna, valor: unknown, personas: Map<string, PersonaMetricas>): string | null {
  const tipo = tipoColumna(c.tipo);
  if (!tipo || valor === undefined || valor === null) return null;
  const config = tipo.config.validar(c.config);
  const v = tipo.valor.validar(valor, config);
  if (v === null) return null;
  switch (c.tipo) {
    case "status": {
      const e = etiquetaStatus(config as ConfigStatus, v as string);
      return e ? textoStatusParaMetricas(e.texto, e.categoria) : null;
    }
    case "persona": return (v as string[]).map((id) => personas.get(id)?.nombre ?? "").filter(Boolean).join(", ") || null;
    case "numero": return String(v);
    case "fecha": return v as string;
    case "timeline": { const r = v as { desde: string; hasta: string }; return `${r.desde} - ${r.hasta}`; }
    case "checkbox": return "v";
    default: return tipo.valor.texto(v, config);
  }
}

/** settings_str de la columna Status como Monday ({labels:{"0":"Done",…}}), para statusOptions. */
function settingsStatus(c: Columna): string {
  const config = tipoColumna("status")!.config.validar(c.config) as ConfigStatus;
  const labels = Object.fromEntries(config.etiquetas.map((e, i) => [String(i), textoStatusParaMetricas(e.texto, e.categoria)]));
  return JSON.stringify({ labels });
}

function valoresMonday(e: Elemento, cols: Columna[], personas: Map<string, PersonaMetricas>): MondayColumnValue[] {
  // Una columna sin rol no puede tapar el título que usa un rol.
  const titulosDeRol = new Set(cols.filter((c) => c.rol).map(tituloParaMetricas));
  const out: MondayColumnValue[] = [];
  for (const c of cols) {
    const title = tituloParaMetricas(c);
    if (!c.rol && titulosDeRol.has(title)) continue;
    const text = textoMonday(c, e.valores[c.id], personas);
    const cv: MondayColumnValue = { id: c.id, text, column: { title, settings_str: c.tipo === "status" ? settingsStatus(c) : "{}" } };
    if (c.tipo === "persona") cv.display_value = text; // como una relación al Directorio RH
    out.push(cv);
  }
  // TLD: en Monday es un espejo del TLD de la persona Responsable. Si el tablero no tiene una
  // columna "TLD", se calcula del directorio.
  const resp = cols.find((c) => c.rol === "responsable");
  if (resp && !cols.some((c) => c.titulo.trim().toLowerCase() === "tld")) {
    const ids = Array.isArray(e.valores[resp.id]) ? (e.valores[resp.id] as string[]) : [];
    const tld = ids.map((id) => personas.get(id)?.tld ?? "").filter(Boolean).join(", ");
    out.push({ id: "tld", text: null, display_value: tld, column: { title: "TLD", settings_str: "{}" } });
  }
  return out;
}

export function nombreBoard(t: TableroCompleto["tablero"]): string {
  return t.codigo ? `${t.codigo} | ${t.nombre}` : t.nombre;
}

/** Tablero → items con la forma de Monday. Los ids de Monday se conservan en lo importado (las
 *  bases del EVM, las atribuciones de atraso, etc. están guardadas por ese id). */
export function tableroAMondayItems(t: TableroCompleto, personas: Map<string, PersonaMetricas>): MondayItem[] {
  const cols = (nivel: Nivel) => t.columnas.filter((c) => c.nivel === nivel).sort(porOrden);
  const colsItem = cols("item");
  const colsSub = cols("sub");
  const grupos = [...t.grupos].sort(porOrden);
  const ordenGrupo = new Map(grupos.map((g, i) => [g.id, i]));
  const titulo = new Map(grupos.map((g) => [g.id, g.titulo]));
  const items = t.elementos.filter((e) => !e.parentId)
    .sort((a, b) => (ordenGrupo.get(a.grupoId ?? "") ?? 0) - (ordenGrupo.get(b.grupoId ?? "") ?? 0) || porOrden(a, b));
  const subs = t.elementos.filter((e) => e.parentId).sort(porOrden);
  const boardId = t.tablero.mondayBoardId ?? t.tablero.id;

  return items.map((e) => ({
    id: e.mondayItemId ?? e.id,
    name: e.nombre,
    email: null,
    group: { title: titulo.get(e.grupoId ?? "") ?? "" },
    column_values: valoresMonday(e, colsItem, personas),
    subitems: subs.filter((s) => s.parentId === e.id).map((s) => ({
      id: s.mondayItemId ?? s.id,
      name: s.nombre,
      email: null,
      board: { id: boardId },
      column_values: valoresMonday(s, colsSub, personas),
    })),
  }));
}

/** Tablero → ProjItem[] con el mismo projProcess de siempre. */
export function tableroAProjItems(t: TableroCompleto, personas: Map<string, PersonaMetricas>): ProjItem[] {
  return projProcess(nombreBoard(t.tablero), t.tablero.mondayBoardId ?? t.tablero.id, tableroAMondayItems(t, personas));
}
