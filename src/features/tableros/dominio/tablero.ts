// Un tablero: sus grupos, columnas y elementos. Lógica PURA compartida por el servidor (validar
// antes de guardar) y la UI (mostrar). Nada aquí sabe de React, red ni base de datos.

import { tipoColumna, type ContextoValor } from "./tipos-columna";
import { categoriaTablero, CATEGORIA_DEFECTO, CATEGORIAS_TABLERO } from "./categorias";
import { rolColumna } from "./roles";
import { puede, type ReglaPermiso, type TableroRef, type UsuarioTableros } from "./permisos";

export type Nivel = "item" | "sub";
export const FASES_VALOR = ["V", "A", "L", "O", "R"] as const;
export type FaseValor = (typeof FASES_VALOR)[number];

export interface Tablero {
  id: string;
  nombre: string;
  codigo: string | null;
  categoria: string;
  descripcion: string | null;
  plantillaId: string | null;
  /** Board de Monday del que se importó (null si nació en la app). */
  mondayBoardId: string | null;
  actualizadoAt: string;
}

export interface Grupo {
  id: string;
  titulo: string;
  color: string | null;
  orden: number;
  fase: FaseValor | null;
}

export interface Columna {
  id: string;
  nivel: Nivel;
  titulo: string;
  tipo: string;
  rol: string | null;
  config: unknown;
  orden: number;
  ancho: number | null;
  oculta: boolean;
}

export interface Elemento {
  id: string;
  grupoId: string | null;
  parentId: string | null;
  nombre: string;
  orden: number;
  valores: Record<string, unknown>;
  responsables: string[];
  /** Item de Monday del que se importó (null si nació en la app). */
  mondayItemId: string | null;
  actualizadoAt: string;
}

export interface TableroCompleto {
  tablero: Tablero;
  grupos: Grupo[];
  columnas: Columna[];
  elementos: Elemento[];
}

// ── Límites y textos ─────────────────────────────────────────────────────────

export const MAX_NOMBRE = 255;
export const MAX_TITULO = 80;
export const COLORES_GRUPO = ["#579bfc", "#a25ddc", "#00c875", "#fdab3d", "#e2445c", "#037f4c", "#ff642e", "#66ccff"];

export function limpiarTexto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

// ── Orden ────────────────────────────────────────────────────────────────────

export function porOrden<T extends { orden: number; id: string }>(a: T, b: T): number {
  return a.orden - b.orden || a.id.localeCompare(b.id);
}

export function siguienteOrden(lista: { orden: number }[]): number {
  return lista.reduce((m, x) => Math.max(m, x.orden), -1) + 1;
}

/** Para mover uno hacia arriba (-1) o abajo (+1): con quién intercambia el orden. null = ya está en la orilla. */
export function vecino<T extends { orden: number; id: string }>(lista: T[], id: string, direccion: -1 | 1): T | null {
  const orden = [...lista].sort(porOrden);
  const i = orden.findIndex((x) => x.id === id);
  if (i < 0) return null;
  return orden[i + direccion] ?? null;
}

// ── Columnas ─────────────────────────────────────────────────────────────────

export function columnasDe(columnas: Columna[], nivel: Nivel, conOcultas = false): Columna[] {
  return columnas.filter((c) => c.nivel === nivel && (conOcultas || !c.oculta)).sort(porOrden);
}

export function columnaConRol(columnas: Columna[], nivel: Nivel, rol: string): Columna | undefined {
  return columnas.find((c) => c.nivel === nivel && c.rol === rol);
}

export interface ColumnaNueva { nivel: Nivel; titulo: string; tipo: string; rol: string | null; config: unknown }

/** Valida una columna nueva (o los cambios a una existente). Devuelve el error, o null si está bien. */
export function errorColumna(c: { tipo: string; rol: string | null; nivel: Nivel; id?: string }, existentes: Columna[]): string | null {
  const tipo = tipoColumna(c.tipo);
  if (!tipo) return "Tipo de columna desconocido.";
  if (c.rol) {
    const rol = rolColumna(c.rol);
    if (!rol) return "Rol desconocido.";
    if (!rol.tipos.includes(c.tipo)) return `El rol «${rol.etiqueta}» no se puede poner en una columna de tipo ${tipo.etiqueta}.`;
    const otra = existentes.find((x) => x.nivel === c.nivel && x.rol === c.rol && x.id !== c.id);
    if (otra) return `Ya hay una columna con el rol «${rol.etiqueta}» (${otra.titulo}).`;
  }
  return null;
}

export function normalizarColumnaNueva(v: unknown): ColumnaNueva | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const titulo = limpiarTexto(o.titulo, MAX_TITULO);
  const tipo = typeof o.tipo === "string" ? tipoColumna(o.tipo) : undefined;
  const nivel: Nivel = o.nivel === "sub" ? "sub" : "item";
  if (!titulo || !tipo) return null;
  const rol = typeof o.rol === "string" && o.rol ? o.rol : null;
  return { nivel, titulo, tipo: tipo.clave, rol, config: tipo.config.validar(o.config ?? tipo.config.defecto) };
}

/** Columnas con que nace un tablero (las de su categoría). */
export function columnasPorDefecto(categoria: string): ColumnaNueva[] {
  return (categoriaTablero(categoria)?.columnasIniciales ?? []).flatMap((clave) => {
    const rol = rolColumna(clave);
    const tipo = rol ? tipoColumna(rol.tipos[0]) : undefined;
    return rol && tipo ? [{ nivel: "item" as const, titulo: rol.etiqueta, tipo: tipo.clave, rol: rol.clave, config: tipo.config.defecto }] : [];
  });
}

export function categoriaValida(v: unknown): string {
  return typeof v === "string" && CATEGORIAS_TABLERO.some((c) => c.clave === v) ? v : CATEGORIA_DEFECTO;
}

// ── Valores ──────────────────────────────────────────────────────────────────

/** Valor listo para guardar en una celda (null = vaciarla). `undefined` si el tipo no existe. */
export function validarValor(columna: Columna, valor: unknown): unknown {
  const tipo = tipoColumna(columna.tipo);
  if (!tipo) return undefined;
  return tipo.valor.validar(valor, tipo.config.validar(columna.config));
}

/** Texto de una celda tal como se muestra (vacío si no hay valor). */
export function textoCelda(columna: Columna, valor: unknown, ctx?: ContextoValor): string {
  if (valor === undefined || valor === null) return "";
  const tipo = tipoColumna(columna.tipo);
  if (!tipo) return "";
  const config = tipo.config.validar(columna.config);
  const v = tipo.valor.validar(valor, config);
  return v === null ? "" : tipo.valor.texto(v, config, ctx);
}

// ── "Solo lo mío" con familia ────────────────────────────────────────────────

/**
 * Elementos que el usuario puede ver. Con "solo lo mío", un elemento se ve si la persona es
 * responsable de él, de su item padre o de alguno de sus subitems (así ve el contexto de su
 * trabajo, sin ver el resto del tablero).
 */
export function elementosVisibles(u: UsuarioTableros, t: TableroRef, reglas: ReglaPermiso[], elementos: Elemento[]): Elemento[] {
  if (!puede(u, "ver", t, reglas)) return [];
  const propios = new Set(elementos.filter((e) => puede(u, "ver", t, reglas, { elemento: e })).map((e) => e.id));
  if (propios.size === elementos.length) return elementos;
  const visibles = new Set(propios);
  for (const e of elementos) {
    if (!propios.has(e.id)) continue;
    if (e.parentId) visibles.add(e.parentId);               // su item padre
    else for (const s of elementos) if (s.parentId === e.id) visibles.add(s.id); // sus subitems
  }
  return elementos.filter((e) => visibles.has(e.id));
}

/** Para "solo lo mío": al crear un elemento, la persona queda como responsable para no perderlo de vista. */
export function valoresIniciales(columnas: Columna[], nivel: Nivel, personaId: string | null): Record<string, unknown> {
  const col = personaId ? columnaConRol(columnas, nivel, "responsable") : undefined;
  return col ? { [col.id]: [personaId] } : {};
}
