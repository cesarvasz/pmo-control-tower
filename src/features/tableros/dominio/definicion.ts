// La DEFINICIÓN de un tablero: su estructura (y opcionalmente sus elementos) con claves locales en
// vez de ids de base de datos. Es la forma común de tres cosas:
//   · una plantilla guardada (plantillas.definicion)
//   · un tablero a punto de crearse desde una plantilla
//   · un board de Monday a punto de importarse
// El servidor la "materializa" (datos/materializar.ts) asignando ids nuevos. Lógica PURA.

import { tipoColumna } from "./tipos-columna";
import { FASES_VALOR, porOrden, type FaseValor, type Nivel, type TableroCompleto } from "./tablero";

export interface GrupoDef {
  clave: string; titulo: string; color: string | null; fase: FaseValor | null;
  /** Grupo de Monday (su título allá), solo al importar. */
  mondayGrupo?: string | null;
}

export interface ColumnaDef {
  clave: string;
  nivel: Nivel;
  titulo: string;
  tipo: string;
  rol: string | null;
  config: unknown;
  oculta: boolean;
  ancho: number | null;
  mondayColumnId?: string | null;
}

export interface ElementoDef {
  clave: string;
  /** Clave del grupo (items) — null en subelementos. */
  grupo: string | null;
  /** Clave del item padre (subelementos) — null en items. */
  padre: string | null;
  nombre: string;
  /** { claveColumna: valor } */
  valores: Record<string, unknown>;
  mondayItemId?: string | null;
}

export interface DefinicionTablero {
  version: 1;
  grupos: GrupoDef[];
  columnas: ColumnaDef[];
  elementos: ElementoDef[];
}

/** Tipos cuyos valores tiene sentido copiar a una plantilla (no personas, fechas ni avances). */
const TIPOS_QUE_VAN_EN_PLANTILLA = new Set(["texto", "dropdown", "numero"]);

/**
 * Tablero → definición, para guardarlo como plantilla. Con `conElementos`, se llevan los nombres
 * de sus elementos y subelementos y solo los valores "de estructura" (texto, lista, número): no
 * personas, fechas, status ni casillas, que son de cada proyecto.
 */
export function tableroADefinicion(t: TableroCompleto, conElementos: boolean): DefinicionTablero {
  const grupos = [...t.grupos].sort(porOrden);
  const columnas = [...t.columnas].sort((a, b) => (a.nivel === b.nivel ? porOrden(a, b) : a.nivel === "item" ? -1 : 1));
  const copiables = new Set(columnas.filter((c) => TIPOS_QUE_VAN_EN_PLANTILLA.has(c.tipo)).map((c) => c.id));
  const items = t.elementos.filter((e) => !e.parentId).sort(porOrden);
  const subs = t.elementos.filter((e) => e.parentId).sort(porOrden);
  const valores = (v: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(v).filter(([k, x]) => copiables.has(k) && x !== null && x !== undefined));

  return {
    version: 1,
    grupos: grupos.map((g) => ({ clave: g.id, titulo: g.titulo, color: g.color, fase: g.fase })),
    columnas: columnas.map((c) => ({ clave: c.id, nivel: c.nivel, titulo: c.titulo, tipo: c.tipo, rol: c.rol, config: c.config, oculta: c.oculta, ancho: c.ancho })),
    elementos: !conElementos ? [] : [
      ...items.map((e) => ({ clave: e.id, grupo: e.grupoId, padre: null, nombre: e.nombre, valores: valores(e.valores) })),
      ...subs.filter((s) => items.some((i) => i.id === s.parentId))
        .map((s) => ({ clave: s.id, grupo: null, padre: s.parentId, nombre: s.nombre, valores: valores(s.valores) })),
    ],
  };
}

/**
 * Normaliza una definición que viene de la base (jsonb) o de afuera: descarta lo inválido
 * (tipos desconocidos, grupos o padres que no existen) en vez de fallar.
 */
export function validarDefinicion(v: unknown): DefinicionTablero {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const lista = (x: unknown) => (Array.isArray(x) ? x.filter((y) => typeof y === "object" && y !== null) as Record<string, unknown>[] : []);
  const texto = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

  const grupos: GrupoDef[] = [];
  for (const g of lista(o.grupos)) {
    const clave = texto(g.clave, 64);
    if (!clave || grupos.some((x) => x.clave === clave)) continue;
    grupos.push({
      clave, titulo: texto(g.titulo, 80) || "Grupo", color: typeof g.color === "string" ? g.color : null,
      fase: (FASES_VALOR as readonly unknown[]).includes(g.fase) ? (g.fase as FaseValor) : null,
    });
  }
  if (!grupos.length) grupos.push({ clave: "g1", titulo: "Grupo 1", color: null, fase: null });

  const columnas: ColumnaDef[] = [];
  for (const c of lista(o.columnas)) {
    const clave = texto(c.clave, 64);
    const tipo = typeof c.tipo === "string" ? tipoColumna(c.tipo) : undefined;
    if (!clave || !tipo || columnas.some((x) => x.clave === clave)) continue;
    const nivel: Nivel = c.nivel === "sub" ? "sub" : "item";
    const rol = typeof c.rol === "string" && c.rol && !columnas.some((x) => x.nivel === nivel && x.rol === c.rol) ? c.rol : null;
    columnas.push({
      clave, nivel, titulo: texto(c.titulo, 80) || tipo.etiqueta, tipo: tipo.clave, rol,
      config: tipo.config.validar(c.config), oculta: c.oculta === true, ancho: typeof c.ancho === "number" ? c.ancho : null,
      mondayColumnId: typeof c.mondayColumnId === "string" ? c.mondayColumnId : null,
    });
  }

  const elementos: ElementoDef[] = [];
  const items = new Set<string>();
  for (const e of lista(o.elementos)) {
    const clave = texto(e.clave, 64);
    if (!clave || items.has(clave) || elementos.some((x) => x.clave === clave)) continue;
    const padre = typeof e.padre === "string" ? e.padre : null;
    const grupo = typeof e.grupo === "string" ? e.grupo : null;
    if (padre ? !items.has(padre) : !grupos.some((g) => g.clave === grupo)) continue; // padre antes que hijo
    const valores = typeof e.valores === "object" && e.valores !== null ? e.valores as Record<string, unknown> : {};
    if (!padre) items.add(clave);
    elementos.push({
      clave, grupo: padre ? null : grupo, padre, nombre: texto(e.nombre, 255), valores,
      mondayItemId: typeof e.mondayItemId === "string" ? e.mondayItemId : null,
    });
  }
  return { version: 1, grupos, columnas, elementos };
}

/** Resumen corto de una definición (para listar plantillas). */
export function resumenDefinicion(d: DefinicionTablero) {
  return {
    grupos: d.grupos.length,
    columnas: d.columnas.filter((c) => c.nivel === "item").length,
    columnasSub: d.columnas.filter((c) => c.nivel === "sub").length,
    elementos: d.elementos.filter((e) => !e.padre).length,
    subelementos: d.elementos.filter((e) => e.padre).length,
  };
}
