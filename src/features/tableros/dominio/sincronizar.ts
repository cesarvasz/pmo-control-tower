// Sincronización con Monday (Fase 5, convivencia). FUSIONA lo que hay hoy en Monday (ya pasado a
// definición por importar-monday.ts) con un tablero ya importado, sin rehacerlo:
//   · Monday manda en los DATOS: elementos y subelementos (alta, nombre, grupo, padre, archivado) y
//     los valores de las columnas ligadas a Monday.
//   · La app manda en el MODELO: títulos, roles, tipos, orden y configuración de las columnas,
//     fórmulas, espejos, grupos, columnas propias y elementos creados aquí. Lo archivado aquí no vuelve.
// Devuelve un PLAN (qué crear, cambiar o archivar); quien lo aplica es datos/sincronizar.ts.
// Lógica PURA.

import { esCalculado, tipoColumna, type ContextoValor } from "./tipos-columna";
import { COLORES_GRUPO, siguienteOrden, type Columna, type Elemento, type FaseValor, type Grupo, type Nivel } from "./tablero";
import type { ColumnaDef, DefinicionTablero } from "./definicion";

export interface GrupoActual extends Pick<Grupo, "id" | "titulo" | "orden"> { mondayGrupo: string | null; archivado: boolean }
export interface ColumnaActual extends Columna { archivada: boolean }
export interface ElementoActual extends Pick<Elemento, "id" | "grupoId" | "parentId" | "nombre" | "orden" | "valores" | "mondayItemId"> {
  archivado: boolean;
}

export interface EntradaSincronizar {
  /** El tablero tal como está en la app, CON lo archivado (para no revivir lo que se archivó aquí). */
  actual: { grupos: GrupoActual[]; columnas: ColumnaActual[]; elementos: ElementoActual[] };
  /** Lo que hay hoy en Monday (mondayADefinicion): claves de columna "nivel:idMonday", de elemento = id del item. */
  monday: DefinicionTablero;
  /** Texto crudo de Monday de un item en una columna (para las columnas cuyo tipo se cambió en la app). */
  textoMonday(itemId: string, columnaMonday: string): string | null;
  /** Para convertir ese texto (persona por nombre…). */
  ctx: ContextoValor;
  nuevoId(): string;
}

export interface CambioValor { columnaId: string; antes: unknown; despues: unknown }

export interface ElementoNuevo {
  id: string; grupoId: string | null; parentId: string | null; nombre: string; orden: number;
  valores: Record<string, unknown>; mondayItemId: string;
}

export interface ElementoCambiado {
  id: string;
  nombre?: string;
  grupoId?: string | null;
  parentId?: string | null;
  orden?: number;
  /** Los valores completos ya fusionados (solo si cambió alguno). */
  valores?: Record<string, unknown>;
  cambios: CambioValor[];
  antes: { nombre: string; grupoId: string | null; parentId: string | null };
}

export interface PlanSincronizacion {
  gruposNuevos: { id: string; titulo: string; color: string | null; fase: FaseValor | null; orden: number; mondayGrupo: string }[];
  columnasNuevas: { id: string; nivel: Nivel; titulo: string; tipo: string; config: unknown; orden: number; mondayColumnId: string }[];
  /** Columnas Status / Lista a las que Monday les agregó etiquetas u opciones. */
  configs: { columnaId: string; titulo: string; config: unknown; agregadas: string[] }[];
  elementosNuevos: ElementoNuevo[];
  elementosCambiados: ElementoCambiado[];
  archivar: string[];
  restaurar: string[];
  /** Columnas ligadas que ya no están en Monday (se quedan como están, con sus valores). */
  columnasFueraDeMonday: string[];
}

// ── Igualdad de valores (jsonb reordena las llaves: se compara en forma canónica) ──

function canonico(v: unknown): unknown {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonico((v as Record<string, unknown>)[k])]));
  }
  return v;
}

export function mismoValor(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
}

// ── Etiquetas que Monday agregó (Status y Lista) ─────────────────────────────

type ConEtiquetas = { etiquetas: { id: string; texto: string }[] };
type ConOpciones = { opciones: { id: string; texto: string }[] };

/** La config de la app más las etiquetas u opciones de Monday que todavía no tiene (por id). */
function agregarEtiquetas(tipo: string, app: unknown, monday: unknown): { config: unknown; agregadas: string[] } {
  const campo = tipo === "status" ? "etiquetas" : tipo === "dropdown" ? "opciones" : null;
  if (!campo) return { config: app, agregadas: [] };
  const a = app as ConEtiquetas & ConOpciones;
  const m = monday as ConEtiquetas & ConOpciones;
  const lista = (a[campo] ?? []) as { id: string; texto: string }[];
  const nuevas = ((m[campo] ?? []) as { id: string; texto: string }[]).filter((x) => !lista.some((y) => y.id === x.id));
  if (!nuevas.length) return { config: app, agregadas: [] };
  return { config: { ...a, [campo]: [...lista, ...nuevas] }, agregadas: nuevas.map((x) => x.texto) };
}

// ── El plan ──────────────────────────────────────────────────────────────────

export function planSincronizacion(e: EntradaSincronizar): PlanSincronizacion {
  const { actual, monday } = e;
  const plan: PlanSincronizacion = {
    gruposNuevos: [], columnasNuevas: [], configs: [], elementosNuevos: [], elementosCambiados: [], archivar: [], restaurar: [], columnasFueraDeMonday: [],
  };

  // ── Columnas: cada columna de Monday → la columna de la app ligada a ella (o una nueva).
  const clave = (nivel: string, mondayId: string) => `${nivel}:${mondayId}`;
  const appPorClave = new Map<string, ColumnaActual>();
  for (const c of actual.columnas) if (c.mondayColumnId) appPorClave.set(clave(c.nivel, c.mondayColumnId), c);

  /** clave de Monday → { columna destino, config vigente, def de Monday } (solo las que reciben valores). */
  const destino = new Map<string, { id: string; tipo: string; config: unknown; def: ColumnaDef; nueva: boolean }>();
  const ordenSig = { item: siguienteOrden(actual.columnas.filter((c) => c.nivel === "item")), sub: siguienteOrden(actual.columnas.filter((c) => c.nivel === "sub")) };
  const idPorClave = new Map<string, string>(); // para traducir fórmulas y espejos de columnas nuevas
  for (const [k, c] of appPorClave) idPorClave.set(k, c.id);

  for (const d of monday.columnas) {
    const app = appPorClave.get(d.clave);
    if (app) {
      if (app.archivada) continue; // se archivó aquí: no vuelve ni recibe valores
      let config = tipoColumna(app.tipo)?.config.validar(app.config) ?? app.config;
      if (app.tipo === d.tipo) {
        const r = agregarEtiquetas(app.tipo, config, d.config);
        if (r.agregadas.length) { config = r.config; plan.configs.push({ columnaId: app.id, titulo: app.titulo, config, agregadas: r.agregadas }); }
      }
      destino.set(d.clave, { id: app.id, tipo: app.tipo, config, def: d, nueva: false });
    } else {
      const id = e.nuevoId();
      idPorClave.set(d.clave, id);
      destino.set(d.clave, { id, tipo: d.tipo, config: d.config, def: d, nueva: true });
    }
  }
  // Columnas nuevas: sus fórmulas y espejos apuntan por clave → a los ids de la app.
  for (const [k, x] of destino) {
    if (!x.nueva) continue;
    const cfg = { ...(tipoColumna(x.tipo)?.config.validar(x.config) as Record<string, unknown> ?? {}) };
    if (x.tipo === "formula" && typeof cfg.expresion === "string") {
      cfg.expresion = cfg.expresion.replace(/\{([^}#]+)(#[^}]*)?\}/g, (m: string, ref: string, parte = "") =>
        (idPorClave.has(ref) ? `{${idPorClave.get(ref)}${parte}}` : m));
    }
    if (x.tipo === "espejo" && typeof cfg.columna === "string") cfg.columna = idPorClave.get(cfg.columna) ?? "";
    x.config = cfg;
    plan.columnasNuevas.push({ id: x.id, nivel: x.def.nivel, titulo: x.def.titulo, tipo: x.tipo, config: cfg, orden: ordenSig[x.def.nivel]++, mondayColumnId: x.def.mondayColumnId ?? k.split(":")[1] });
  }
  const enMonday = new Set(monday.columnas.map((d) => d.clave));
  for (const [k, c] of appPorClave) if (!c.archivada && !enMonday.has(k)) plan.columnasFueraDeMonday.push(c.titulo);

  // ── Grupos: por su clave de Monday (el título allá); si no, por título; si no, uno nuevo.
  const tituloGrupoMonday = new Map(monday.grupos.map((g) => [g.clave, g]));
  const grupoPorMonday = new Map<string, string>();
  const ordenGrupo = { sig: siguienteOrden(actual.grupos) };
  const grupoDe = (claveGrupo: string | null): string | null => {
    const g = claveGrupo ? tituloGrupoMonday.get(claveGrupo) : undefined;
    if (!g) return null;
    const titulo = g.mondayGrupo ?? g.titulo;
    if (grupoPorMonday.has(titulo)) return grupoPorMonday.get(titulo)!;
    const existente = actual.grupos.find((x) => x.mondayGrupo === titulo && !x.archivado)
      ?? actual.grupos.find((x) => x.mondayGrupo === titulo)
      ?? actual.grupos.find((x) => !x.mondayGrupo && x.titulo === titulo && !x.archivado);
    let id = existente?.id;
    if (!id) {
      id = e.nuevoId();
      const n = actual.grupos.length + plan.gruposNuevos.length;
      plan.gruposNuevos.push({ id, titulo: g.titulo, color: g.color ?? COLORES_GRUPO[n % COLORES_GRUPO.length], fase: g.fase, orden: ordenGrupo.sig++, mondayGrupo: titulo });
    }
    grupoPorMonday.set(titulo, id);
    return id;
  };

  // ── Valores de un elemento de Monday, en las columnas de la app que los reciben.
  const valoresDeMonday = (de: DefinicionTablero["elementos"][number]): Map<string, unknown> => {
    const out = new Map<string, unknown>();
    const nivel: Nivel = de.padre ? "sub" : "item";
    for (const x of destino.values()) {
      if (x.def.nivel !== nivel || esCalculado(x.tipo)) continue;
      const tipo = tipoColumna(x.tipo);
      if (!tipo) continue;
      let v: unknown;
      if (x.tipo === x.def.tipo) v = de.valores[x.def.clave] ?? null;
      else if (tipo.valor.desdeMonday) v = tipo.valor.desdeMonday(e.textoMonday(de.mondayItemId ?? de.clave, x.def.mondayColumnId ?? ""), x.config as never, e.ctx);
      else continue; // el tipo de la app no sabe leer Monday: esa columna no se toca
      const ok = v === null || v === undefined ? null : tipo.valor.validar(v, x.config as never);
      out.set(x.id, ok ?? null);
    }
    return out;
  };

  // ── Elementos.
  const appPorItem = new Map<string, ElementoActual>();
  for (const el of actual.elementos) if (el.mondayItemId) appPorItem.set(el.mondayItemId, el);
  const idPorItem = new Map<string, string>(); // item de Monday → elemento de la app (también los nuevos)
  for (const [k, el] of appPorItem) idPorItem.set(k, el.id);

  // Siguiente orden por hermanos (grupo para items, padre para subelementos), sin contar lo archivado.
  const ordenHermanos = new Map<string, number>();
  for (const el of actual.elementos) {
    if (el.archivado) continue;
    const k = el.parentId ? `p:${el.parentId}` : `g:${el.grupoId}`;
    ordenHermanos.set(k, Math.max(ordenHermanos.get(k) ?? -1, el.orden));
  }
  const siguiente = (k: string) => { const n = (ordenHermanos.get(k) ?? -1) + 1; ordenHermanos.set(k, n); return n; };

  const vistos = new Set<string>();
  // Items primero: los subelementos nuevos necesitan el id de su padre.
  const ordenados = [...monday.elementos.filter((x) => !x.padre), ...monday.elementos.filter((x) => x.padre)];
  for (const de of ordenados) {
    const itemId = de.mondayItemId ?? de.clave;
    vistos.add(itemId);
    const grupoId = de.padre ? null : grupoDe(de.grupo);
    const parentId = de.padre ? idPorItem.get(de.padre) ?? null : null;
    if (de.padre ? !parentId : !grupoId) continue; // sin padre o sin grupo (no debería pasar)
    const valores = valoresDeMonday(de);
    const previo = appPorItem.get(itemId);

    if (!previo) {
      const id = e.nuevoId();
      idPorItem.set(itemId, id);
      plan.elementosNuevos.push({
        id, grupoId, parentId, nombre: de.nombre, orden: siguiente(parentId ? `p:${parentId}` : `g:${grupoId}`),
        valores: Object.fromEntries([...valores].filter(([, v]) => v !== null)), mondayItemId: itemId,
      });
      continue;
    }

    if (previo.archivado) plan.restaurar.push(previo.id);
    const cambio: ElementoCambiado = { id: previo.id, cambios: [], antes: { nombre: previo.nombre, grupoId: previo.grupoId, parentId: previo.parentId } };
    if (de.nombre !== previo.nombre) cambio.nombre = de.nombre;
    if (grupoId !== previo.grupoId || parentId !== previo.parentId) {
      cambio.grupoId = grupoId;
      cambio.parentId = parentId;
      cambio.orden = siguiente(parentId ? `p:${parentId}` : `g:${grupoId}`);
    }
    const nuevos = { ...previo.valores };
    for (const [colId, v] of valores) {
      const antes = previo.valores[colId] ?? null;
      if (mismoValor(antes, v)) continue;
      if (v === null) delete nuevos[colId]; else nuevos[colId] = v;
      cambio.cambios.push({ columnaId: colId, antes, despues: v });
    }
    if (cambio.cambios.length) cambio.valores = nuevos;
    if (cambio.nombre !== undefined || cambio.grupoId !== undefined || cambio.valores) plan.elementosCambiados.push(cambio);
  }

  // Lo que ya no está en Monday (borrado o archivado allá) se archiva aquí; no se borra.
  for (const el of actual.elementos) {
    if (el.mondayItemId && !el.archivado && !vistos.has(el.mondayItemId)) plan.archivar.push(el.id);
  }
  return plan;
}

/** ¿El plan cambia algo? */
export function planVacio(p: PlanSincronizacion): boolean {
  return !p.gruposNuevos.length && !p.columnasNuevas.length && !p.configs.length && !p.elementosNuevos.length
    && !p.elementosCambiados.length && !p.archivar.length && !p.restaurar.length;
}
