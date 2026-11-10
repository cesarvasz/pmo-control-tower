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
import { calcularTablero, valorDeCelda, type Calculados, type ContextoCalculo, type PersonaCalc } from "./calculos";

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

export type PersonaMetricas = PersonaCalc;

/** Texto de una celda tal como Monday lo daría en `text` (fechas AAAA-MM-DD, rango "a - b"…). */
function textoMonday(c: Columna, valor: unknown, personas: Map<string, PersonaMetricas>, ctx: ContextoCalculo): string | null {
  const tipo = tipoColumna(c.tipo);
  if (!tipo || valor === undefined || valor === null) return null;
  const config = tipo.config.validar(c.config);
  const v = tipo.valor.validar(valor, config);
  if (v === null) return null;
  switch (c.tipo) {
    case "status": {
      const e = etiquetaStatus(config as ConfigStatus, v as string);
      return e ? textoStatus(c, e) : null;
    }
    case "persona": return (v as string[]).map((id) => personas.get(id)?.nombre ?? "").filter(Boolean).join(", ") || null;
    case "numero": return String(v);
    case "fecha": return v as string;
    case "timeline": { const r = v as { desde: string; hasta: string }; return `${r.desde} - ${r.hasta}`; }
    case "checkbox": return "v";
    case "autonumero": case "creacion": return String(v); // tal cual (Iniciativas y PML leen el ID y el Creation log)
    // Una fórmula sale como Monday daría su valor: fecha AAAA-MM-DD, número sin formato.
    case "formula": return String(v);
    case "espejo": return String(v);
    case "relacion": {
      const ligado = ctx.ligados?.[(config as { tableroId?: string }).tableroId ?? ""];
      return (v as string[]).map((id) => ligado?.elementos.find((x) => x.id === id)?.nombre ?? "").filter(Boolean).join(", ") || null;
    }
    case "archivo": return (v as string[]).map((id) => ctx.archivos?.find((a) => a.id === id)?.nombre ?? "").filter(Boolean).join(", ") || null;
    default: return tipo.valor.texto(v, config);
  }
}

/** settings_str de la columna Status como Monday ({labels:{"0":"Done",…}}), para statusOptions. */
/** Una columna de status importada de Monday conserva sus textos (Iniciativas y PML usan los suyos:
 *  "Meeting 1", "Go Live"…); las etiquetas propias de la app se traducen por su categoría. */
function textoStatus(c: Columna, e: { texto: string; categoria: string }): string {
  return c.mondayColumnId ? e.texto : textoStatusParaMetricas(e.texto, e.categoria);
}

function settingsStatus(c: Columna): string {
  const config = tipoColumna("status")!.config.validar(c.config) as ConfigStatus;
  const labels = Object.fromEntries(config.etiquetas.map((e, i) => [String(i), textoStatus(c, e)]));
  return JSON.stringify({ labels });
}

function valoresMonday(e: Elemento, cols: Columna[], personas: Map<string, PersonaMetricas>, ctx: ContextoCalculo, calc: Calculados): MondayColumnValue[] {
  // Una columna sin rol no puede tapar el título que usa un rol.
  const titulosDeRol = new Set(cols.filter((c) => c.rol).map(tituloParaMetricas));
  const out: MondayColumnValue[] = [];
  for (const c of cols) {
    const title = tituloParaMetricas(c);
    if (!c.rol && titulosDeRol.has(title)) continue;
    const text = textoMonday(c, valorDeCelda(calc, e, c), personas, ctx);
    // Lo importado conserva el id de columna de Monday: Iniciativas y PML se procesan leyendo por id.
    const cv: MondayColumnValue = { id: c.mondayColumnId ?? c.id, text, column: { title, settings_str: c.tipo === "status" ? settingsStatus(c) : "{}" } };
    // Como una relación o un espejo de Monday: el valor también va en display_value.
    if (["persona", "relacion", "espejo"].includes(c.tipo)) cv.display_value = text;
    out.push(cv);
  }
  return out;
}

export function nombreBoard(t: TableroCompleto["tablero"]): string {
  return t.codigo ? `${t.codigo} | ${t.nombre}` : t.nombre;
}

/** Tablero → items con la forma de Monday. Los ids de Monday se conservan en lo importado (las
 *  bases del EVM, las atribuciones de atraso, etc. están guardadas por ese id). */
export function tableroAMondayItems(
  t: TableroCompleto, personas: Map<string, PersonaMetricas>, extra: Omit<ContextoCalculo, "personas"> = {},
): MondayItem[] {
  const ctx: ContextoCalculo = { ...extra, personas };
  const calc = calcularTablero(t, ctx);
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
    column_values: valoresMonday(e, colsItem, personas, ctx, calc),
    subitems: subs.filter((s) => s.parentId === e.id).map((s) => ({
      id: s.mondayItemId ?? s.id,
      name: s.nombre,
      email: null,
      board: { id: boardId },
      column_values: valoresMonday(s, colsSub, personas, ctx, calc),
    })),
  }));
}

/** Tablero → ProjItem[] con el mismo projProcess de siempre. */
export function tableroAProjItems(
  t: TableroCompleto, personas: Map<string, PersonaMetricas>, extra: Omit<ContextoCalculo, "personas"> = {},
): ProjItem[] {
  return projProcess(nombreBoard(t.tablero), t.tablero.mondayBoardId ?? t.tablero.id, tableroAMondayItems(t, personas, extra));
}
