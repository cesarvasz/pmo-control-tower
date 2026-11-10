// Board de Monday (tal como está en la copia monday_boards / monday_items) → definición de tablero.
// "Tal cual": mismas columnas, grupos y elementos; solo se les asignan roles. Lo que todavía no
// tiene tipo propio en la app (fórmula, espejo, archivo, relación a otros tableros…) no se importa
// y se avisa. Lógica PURA.

import { tipoColumna } from "./tipos-columna";
import { rolesParaTipo, ROLES_COLUMNA } from "./roles";
import { claveNombre } from "./personas";
import { COLORES_GRUPO, type FaseValor, type Nivel } from "./tablero";
import type { ColumnaDef, DefinicionTablero, ElementoDef, GrupoDef } from "./definicion";
import { parseJson } from "./tipos-columna/tipo";
import { prefijoDe } from "./tipos-columna/autonumero";

/** Tipo de columna de Monday según el prefijo de su id (Monday arma el id con el tipo). */
const PREFIJOS: [string, string][] = [
  ["board_relation", "relacion"], ["connect_boards", "relacion"], ["multiple_person", "personas"], ["person", "personas"],
  ["people", "personas"], ["status", "status"], ["color", "status"], ["dropdown", "dropdown"], ["timerange", "timeline"],
  ["timeline", "timeline"], ["date", "fecha"], ["numeric", "numero"], ["numbers", "numero"], ["boolean", "checkbox"],
  ["checkbox", "checkbox"], ["check", "checkbox"], ["long_text", "texto_largo"], ["text", "texto"], ["email", "email"],
  ["formula", "formula"], ["lookup", "espejo"], ["mirror", "espejo"], ["file", "archivo"], ["pulse_log", "creacion"],
  ["pulse_id", "autonumero"], ["item_id", "autonumero"], ["dependent_on", "dependencia"], ["dependency", "dependencia"],
  ["labor_budget", "numero"], ["hour", "texto"],
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
  /** Elementos ligados (relación a otro tablero) que no se encontraron por nombre. */
  ligadosNoEncontrados: string[];
}

/** Un board de Monday que YA se importó: a él apuntan las relaciones del board que se importa. */
export interface RelacionImportada {
  tableroId: string;
  elementoPorNombre(nombre: string): string | undefined;
  /** id de columna de Monday → id de la columna importada (para los espejos). */
  columnaPorMondayId(id: string): string | undefined;
}

function unidadDeNumero(settings: string | undefined): { unidad: string; unidadAntes: boolean } {
  const o = parseJson(settings) as { unit?: { symbol?: string; custom_unit?: string; direction?: string } } | undefined;
  const u = o?.unit;
  if (!u) return { unidad: "", unidadAntes: false };
  const unidad = (u.symbol === "custom" ? u.custom_unit ?? "" : u.symbol ?? "").trim();
  return { unidad, unidadAntes: u.direction === "left" };
}

/** Campo del directorio por el TÍTULO de la columna del Directorio RH (para los espejos). */
const CAMPO_RH: Record<string, string> = { email: "email", "hrs mes": "hrsMes", role: "rol", tld: "tld", name: "nombre", status: "" };

/** Fórmula de Monday → fórmula de la app: {colId} pasa a la clave de la columna importada. */
export function traducirFormula(expr: string, nivel: Nivel, importables: Set<string>): { expresion: string; formato: "numero" | "fecha" | "texto" } {
  const expresion = expr.replace(/\{([^}#]+)(#[^}]*)?\}/g, (_m, id: string, parte = "") => {
    const ref = id.trim();
    if (ref === "name") return `{nombre${parte}}`;
    return importables.has(ref) ? `{${nivel}:${ref}${parte}}` : `{?${ref}${parte}}`;
  });
  const formato = /FORMAT_DATE\s*\(/i.test(expr) ? "fecha" : /"/.test(expr) ? "texto" : "numero";
  return { expresion, formato };
}

/** Pasa las columnas de un nivel. Devuelve las importables (con su tipo de la app) y las omitidas. */
function columnasDeNivel(
  mapa: Record<string, ColumnaMonday>, nivel: Nivel, rhBoardId: string | null, rhColumnas: Record<string, ColumnaMonday>,
  relaciones: Record<string, RelacionImportada>,
): { columnas: (ColumnaDef & { tipoMonday: string })[]; omitidas: ResultadoImportacionMonday["omitidas"]; relacionDe: Map<string, RelacionImportada> } {
  const columnas: (ColumnaDef & { tipoMonday: string })[] = [];
  const omitidas: ResultadoImportacionMonday["omitidas"] = [];
  const relacionDe = new Map<string, RelacionImportada>();
  const destinos = (id: string) => ((parseJson(mapa[id]?.settings_str) as { boardIds?: (string | number)[] } | undefined)?.boardIds ?? []).map(String);
  const esRelacionRh = (id: string) => tipoMonday(id) === "relacion" && !!rhBoardId && destinos(id).includes(rhBoardId);
  /** Board ya importado al que apunta una relación (el primero que lo esté). */
  const destinoImportado = (id: string) => (tipoMonday(id) === "relacion" ? destinos(id).find((b) => relaciones[b]) : undefined);
  // Columnas que sí se importan (para traducir las referencias de las fórmulas).
  const importables = new Set(Object.keys(mapa).filter((id) => {
    const tm = tipoMonday(id);
    return !["nombre", "subelementos", "dependencia", "boton", "enlace", "desconocido"].includes(tm)
      && (tm !== "relacion" || esRelacionRh(id) || !!destinoImportado(id));
  }));
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
      const destino = destinoImportado(id);
      if (esRelacionRh(id)) tipo = "persona"; // relación al Directorio RH = persona
      else if (destino) {
        tipo = "relacion";
        config = { tableroId: relaciones[destino].tableroId, multiple: true };
        relacionDe.set(`${nivel}:${id}`, relaciones[destino]);
      }
    }
    else if (tm === "archivo") tipo = "archivo"; // los archivos se traen aparte (datos/importar.ts)
    else if (tm === "autonumero") tipo = "autonumero"; // el prefijo se toma de los valores (abajo)
    else if (tm === "creacion") tipo = "creacion";
    else if (tm === "formula") {
      const expr = (parseJson(c.settings_str) as { formula?: string } | undefined)?.formula;
      if (expr) {
        tipo = "formula";
        const dinero = c.title.includes("$");
        config = { ...traducirFormula(expr, nivel, importables), decimales: 2, unidad: dinero ? "$" : "", unidadAntes: dinero };
      }
    } else if (tm === "espejo") {
      // Espejo de una relación al Directorio RH → espejo de la columna Persona sobre el directorio.
      const s = parseJson(c.settings_str) as { relation_column?: Record<string, boolean>; displayed_linked_columns?: Record<string, string[]> } | undefined;
      const relacionRh = Object.keys(s?.relation_column ?? {}).find(esRelacionRh);
      const linkedRh = rhBoardId ? s?.displayed_linked_columns?.[rhBoardId]?.[0] : undefined;
      const campoRh = linkedRh ? CAMPO_RH[(rhColumnas[linkedRh]?.title ?? "").trim().toLowerCase()] : undefined;
      // …o de una relación a un tablero ya importado (p. ej. el Sponsor o la U Neg de la Estrategia).
      const relacionOtra = Object.keys(s?.relation_column ?? {}).find((r) => !!destinoImportado(r));
      const destino = relacionOtra ? destinoImportado(relacionOtra)! : undefined;
      const linkedOtra = destino ? s?.displayed_linked_columns?.[destino]?.[0] : undefined;
      const campoOtra = linkedOtra === "name" ? "nombre" : linkedOtra && destino ? relaciones[destino].columnaPorMondayId(linkedOtra) : undefined;
      if (relacionRh && campoRh) { tipo = "espejo"; config = { columna: `${nivel}:${relacionRh}`, campo: campoRh }; }
      else if (relacionOtra && campoOtra) { tipo = "espejo"; config = { columna: `${nivel}:${relacionOtra}`, campo: campoOtra }; }
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
    if (rol && rolesParaTipo(c.tipo, c.config).some((r) => r.clave === rol) && !columnas.some((x) => x.rol === rol)) c.rol = rol;
  }

  // Orden: primero las que tienen rol (en el orden del registro de roles), luego el resto por título.
  const ordenRol = (r: string | null) => (r ? ROLES_COLUMNA.findIndex((x) => x.clave === r) : 99);
  columnas.sort((a, b) => ordenRol(a.rol) - ordenRol(b.rol) || a.titulo.localeCompare(b.titulo, "es"));
  return { columnas, omitidas, relacionDe };
}

export function mondayADefinicion(entrada: {
  columnas: Record<string, ColumnaMonday>;
  columnasSub: Record<string, ColumnaMonday>;
  filas: FilaMonday[];
  rhBoardId: string | null;
  /** Columnas del Directorio RH (para traducir sus espejos: TLD, Role…). */
  rhColumnas?: Record<string, ColumnaMonday>;
  personaPorNombre: (nombre: string) => string | undefined;
  /** Boards ya importados, por id de board de Monday (Estrategia antes que Iniciativas, PML…). */
  relaciones?: Record<string, RelacionImportada>;
}): ResultadoImportacionMonday {
  const item = columnasDeNivel(entrada.columnas, "item", entrada.rhBoardId, entrada.rhColumnas ?? {}, entrada.relaciones ?? {});
  const sub = columnasDeNivel(entrada.columnasSub, "sub", entrada.rhBoardId, entrada.rhColumnas ?? {}, entrada.relaciones ?? {});
  const relacionDe = new Map([...item.relacionDe, ...sub.relacionDe]);
  const ligadosNoEncontrados = new Set<string>();
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
      const rel = relacionDe.get(c.clave);
      const ctxCol = rel ? {
        ...ctx,
        elementoPorNombre: (n: string) => { const id = rel.elementoPorNombre(n); if (!id) ligadosNoEncontrados.add(n); return id; },
      } : ctx;
      const valor = tipo.valor.desdeMonday?.(texto || null, tipo.config.validar(c.config), ctxCol) ?? null;
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

  // ID automático: el prefijo sale de los valores que ya tiene ("IN-127" → "IN-").
  for (const c of [...item.columnas, ...sub.columnas]) {
    if (c.tipo !== "autonumero") continue;
    const ejemplo = elementos.map((e) => e.valores[c.clave]).find((v): v is string => typeof v === "string");
    c.config = { prefijo: ejemplo ? prefijoDe(ejemplo) : "" };
  }

  const limpiar = ({ tipoMonday: _t, ...c }: ColumnaDef & { tipoMonday: string }): ColumnaDef => { void _t; return c; };
  return {
    definicion: { version: 1, grupos, columnas: [...item.columnas, ...sub.columnas].map(limpiar), elementos },
    omitidas: [...item.omitidas, ...sub.omitidas],
    personasNoEncontradas: [...noEncontradas].sort(),
    ligadosNoEncontrados: [...ligadosNoEncontrados].sort(),
  };
}
