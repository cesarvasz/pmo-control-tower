// Board de Monday (tal como está en la copia monday_boards / monday_items) → definición de tablero.
// "Tal cual": mismas columnas, grupos y elementos; solo se les asignan roles. Lo que todavía no
// tiene tipo propio en la app (fórmula, espejo, archivo, relación a otros tableros…) no se importa
// y se avisa. Lógica PURA.

import { tipoColumna } from "./tipos-columna";
import { rolColumna, ROLES_COLUMNA } from "./roles";
import { claveNombre } from "./personas";
import { COLORES_GRUPO, type FaseValor, type Nivel } from "./tablero";
import type { ColumnaDef, DefinicionTablero, ElementoDef, GrupoDef } from "./definicion";
import { parseJson } from "./tipos-columna/tipo";

/** Tipo de columna de Monday según el prefijo de su id (Monday arma el id con el tipo). */
const PREFIJOS: [string, string][] = [
  ["board_relation", "relacion"], ["connect_boards", "relacion"], ["multiple_person", "personas"], ["person", "personas"],
  ["people", "personas"], ["status", "status"], ["color", "status"], ["dropdown", "dropdown"], ["timerange", "timeline"],
  ["timeline", "timeline"], ["date", "fecha"], ["numeric", "numero"], ["numbers", "numero"], ["boolean", "checkbox"],
  ["checkbox", "checkbox"], ["check", "checkbox"], ["long_text", "texto_largo"], ["text", "texto"], ["email", "email"],
  ["formula", "formula"], ["lookup", "espejo"], ["mirror", "espejo"], ["file", "archivo"], ["pulse_log", "registro"],
  ["pulse_id", "id"], ["item_id", "id"], ["dependent_on", "dependencia"], ["dependency", "dependencia"],
  ["subtasks", "subelementos"], ["name", "nombre"], ["button", "boton"], ["link", "enlace"],
];

export function tipoMonday(columnaId: string): string {
  return PREFIJOS.find(([p]) => columnaId === p || columnaId.startsWith(p))?.[1] ?? "desconocido";
}

/** Rol por título de columna (las 5 generaciones de la plantilla VALOR usan estos títulos). */
const ROL_POR_TITULO: Record<string, string> = {
  "status": "status", "responsible": "responsable", "cpm": "plan", "timeline": "plan",
  "end date": "fin_real", "actual end": "fin_real", "new limit date": "nueva_fecha_limite", "limit date": "fecha_limite",
  "cost $": "costo", "benefit $": "beneficio", "effort planned": "esfuerzo_plan", "effort spent": "esfuerzo_real",
  "type": "tipo_elemento", "fase valor": "fase_valor",
};

/** Letra VALOR de un grupo por su título ("L | Launch", "Launch | Desarrollo", "3 | Operación"…). */
export function faseDeGrupo(titulo: string): FaseValor | null {
  const t = claveNombre(titulo);
  const letra = t.match(/^([valor])\s*\|/);
  if (letra) return letra[1].toUpperCase() as FaseValor;
  if (t.includes("valuacion")) return "V";
  if (t.includes("aprobacion")) return "A";
  if (t.includes("launch") || t.includes("lanzamiento") || t.includes("desarrollo")) return "L";
  if (t.includes("operacion")) return "O";
  if (t.includes("revision")) return "R";
  return null;
}

export interface ColumnaMonday { title: string; settings_str?: string }
export interface FilaMonday {
  id: string;
  parent_id: string | null;
  orden: number;
  nombre: string;
  grupo: string | null;
  column_values: { id: string; text: string | null; display_value?: string | null }[];
}

export interface ResultadoImportacionMonday {
  definicion: DefinicionTablero;
  /** Columnas que no se importan (con su tipo de Monday). */
  omitidas: { nivel: Nivel; titulo: string; tipo: string }[];
  /** Nombres que no se encontraron en el directorio (y quedaron vacíos). */
  personasNoEncontradas: string[];
}

function unidadDeNumero(settings: string | undefined): { unidad: string; unidadAntes: boolean } {
  const o = parseJson(settings) as { unit?: { symbol?: string; custom_unit?: string; direction?: string } } | undefined;
  const u = o?.unit;
  if (!u) return { unidad: "", unidadAntes: false };
  const unidad = (u.symbol === "custom" ? u.custom_unit ?? "" : u.symbol ?? "").trim();
  return { unidad, unidadAntes: u.direction === "left" };
}

/** Pasa las columnas de un nivel. Devuelve las importables (con su tipo de la app) y las omitidas. */
function columnasDeNivel(
  mapa: Record<string, ColumnaMonday>, nivel: Nivel, rhBoardId: string | null,
): { columnas: (ColumnaDef & { tipoMonday: string })[]; omitidas: ResultadoImportacionMonday["omitidas"] } {
  const columnas: (ColumnaDef & { tipoMonday: string })[] = [];
  const omitidas: ResultadoImportacionMonday["omitidas"] = [];
  for (const [id, c] of Object.entries(mapa)) {
    const tm = tipoMonday(id);
    if (tm === "nombre" || tm === "subelementos") continue; // el nombre es del elemento; los subitems ya vienen aparte
    let tipo: string | null = null;
    let config: unknown;
    if (tm === "status") { tipo = "status"; config = tipoColumna("status")!.config.desdeMonday!(c.settings_str); }
    else if (tm === "dropdown") { tipo = "dropdown"; config = tipoColumna("dropdown")!.config.desdeMonday!(c.settings_str); }
    else if (tm === "numero") { tipo = "numero"; config = { decimales: 2, ...unidadDeNumero(c.settings_str) }; }
    else if (tm === "fecha") tipo = "fecha";
    else if (tm === "timeline") tipo = "timeline";
    else if (tm === "checkbox") tipo = "checkbox";
    else if (tm === "texto" || tm === "email") tipo = "texto";
    else if (tm === "texto_largo") { tipo = "texto"; config = { multilinea: true }; }
    else if (tm === "personas") tipo = "persona";
    else if (tm === "relacion") {
      const destino = (parseJson(c.settings_str) as { boardIds?: (string | number)[] } | undefined)?.boardIds ?? [];
      if (rhBoardId && destino.map(String).includes(rhBoardId)) tipo = "persona"; // relación al Directorio RH = persona
    }
    if (!tipo) { omitidas.push({ nivel, titulo: c.title, tipo: tm === "relacion" ? "relación a otro tablero" : tm }); continue; }
    const def = tipoColumna(tipo)!;
    columnas.push({
      clave: `${nivel}:${id}`, nivel, titulo: c.title.trim() || def.etiqueta, tipo, rol: null,
      config: def.config.validar(config ?? def.config.defecto), oculta: false, ancho: null, mondayColumnId: id, tipoMonday: tm,
    });
  }

  // Roles por título, sin repetir rol en el nivel; si dos columnas lo piden, gana la relación al
  // Directorio RH (Responsible) sobre el people de Monday (Resp).
  const prioridad = (c: { tipoMonday: string }) => (c.tipoMonday === "relacion" ? 0 : 1);
  for (const c of [...columnas].sort((a, b) => prioridad(a) - prioridad(b))) {
    const rol = ROL_POR_TITULO[c.titulo.trim().toLowerCase()];
    if (rol && rolColumna(rol)?.tipos.includes(c.tipo) && !columnas.some((x) => x.rol === rol)) c.rol = rol;
  }

  // Orden: primero las que tienen rol (en el orden del registro de roles), luego el resto por título.
  const ordenRol = (r: string | null) => (r ? ROLES_COLUMNA.findIndex((x) => x.clave === r) : 99);
  columnas.sort((a, b) => ordenRol(a.rol) - ordenRol(b.rol) || a.titulo.localeCompare(b.titulo, "es"));
  return { columnas, omitidas };
}

export function mondayADefinicion(entrada: {
  columnas: Record<string, ColumnaMonday>;
  columnasSub: Record<string, ColumnaMonday>;
  filas: FilaMonday[];
  rhBoardId: string | null;
  personaPorNombre: (nombre: string) => string | undefined;
}): ResultadoImportacionMonday {
  const item = columnasDeNivel(entrada.columnas, "item", entrada.rhBoardId);
  const sub = columnasDeNivel(entrada.columnasSub, "sub", entrada.rhBoardId);
  const noEncontradas = new Set<string>();
  const ctx = {
    personaPorNombre: (n: string) => {
      const id = entrada.personaPorNombre(n);
      if (!id) noEncontradas.add(n);
      return id;
    },
  };

  const porOrden = (a: FilaMonday, b: FilaMonday) => a.orden - b.orden || a.id.localeCompare(b.id);
  const items = entrada.filas.filter((f) => !f.parent_id).sort(porOrden);
  const ids = new Set(items.map((f) => f.id));
  const subs = entrada.filas.filter((f) => f.parent_id && ids.has(f.parent_id)).sort(porOrden);

  // Grupos en el orden en que aparecen los items.
  const grupos: GrupoDef[] = [];
  for (const f of items) {
    const titulo = f.grupo?.trim() || "Sin grupo";
    if (!grupos.some((g) => g.titulo === titulo)) {
      grupos.push({ clave: `g${grupos.length + 1}`, titulo, color: COLORES_GRUPO[grupos.length % COLORES_GRUPO.length], fase: faseDeGrupo(titulo) });
    }
  }

  const valores = (f: FilaMonday, cols: ColumnaDef[]) => {
    const out: Record<string, unknown> = {};
    for (const c of cols) {
      const v = f.column_values.find((x) => x.id === c.mondayColumnId);
      if (!v) continue;
      // Relaciones y espejos traen el valor en display_value; el resto en text.
      const texto = (v.display_value ?? "") || (v.text ?? "");
      const tipo = tipoColumna(c.tipo)!;
      const valor = tipo.valor.desdeMonday?.(texto || null, tipo.config.validar(c.config), ctx) ?? null;
      if (valor !== null) out[c.clave] = valor;
    }
    return out;
  };

  const elementos: ElementoDef[] = [
    ...items.map((f) => ({
      clave: f.id, grupo: grupos.find((g) => g.titulo === (f.grupo?.trim() || "Sin grupo"))!.clave, padre: null,
      nombre: f.nombre, valores: valores(f, item.columnas), mondayItemId: f.id,
    })),
    ...subs.map((f) => ({ clave: f.id, grupo: null, padre: f.parent_id, nombre: f.nombre, valores: valores(f, sub.columnas), mondayItemId: f.id })),
  ];

  const limpiar = ({ tipoMonday: _t, ...c }: ColumnaDef & { tipoMonday: string }): ColumnaDef => { void _t; return c; };
  return {
    definicion: { version: 1, grupos, columnas: [...item.columnas, ...sub.columnas].map(limpiar), elementos },
    omitidas: [...item.omitidas, ...sub.omitidas],
    personasNoEncontradas: [...noEncontradas].sort(),
  };
}
