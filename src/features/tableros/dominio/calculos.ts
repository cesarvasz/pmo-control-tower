// Columnas CALCULADAS de un tablero (fórmula, espejo, archivo): su valor no se guarda, se arma con
// los demás valores del elemento, el directorio de personas, los tableros ligados y los archivos.
// Lo usan la UI (mostrar) y el adaptador de métricas (una fórmula puede ser la Fecha límite o el
// Costo). Lógica PURA.

import { tipoColumna } from "./tipos-columna";
import { etiquetaStatus, type ConfigStatus } from "./tipos-columna/status";
import type { ConfigDropdown } from "./tipos-columna/dropdown";
import type { ConfigFormula } from "./tipos-columna/formula";
import type { ConfigEspejo } from "./tipos-columna/espejo";
import type { ConfigRelacion } from "./tipos-columna/relacion";
import { analizar, ErrorFormula, evaluar, hoyLocal, referencias, type Nodo, type ValorF } from "./formulas";
import type { Columna, Elemento, Nivel, TableroCompleto } from "./tablero";

export interface PersonaCalc {
  nombre: string;
  tld?: string | null;
  rol?: string | null;
  email?: string | null;
  grupo?: string | null;
  hrsMes?: number | null;
}

/** Un tablero ligado por una columna Relación (solo lo que el usuario puede ver). */
export interface TableroLigado {
  nombre: string;
  columnas: Columna[];
  elementos: { id: string; nombre: string; valores: Record<string, unknown> }[];
}

export interface ArchivoCalc { id: string; elementoId: string; columnaId: string | null; nombre: string }

export interface ContextoCalculo {
  personas: Map<string, PersonaCalc>;
  ligados?: Record<string, TableroLigado>;
  archivos?: ArchivoCalc[];
  hoy?: string;
}

/** { elementoId: { columnaId: valor calculado } } — más los errores de fórmula por columna. */
export interface Calculados {
  valores: Map<string, Record<string, unknown>>;
  errores: Map<string, string>;
}

const ERROR_CICLO = "La fórmula se usa a sí misma (directa o indirectamente)";

/** Valida una fórmula (ya con ids) contra las columnas de su nivel. null = está bien. */
export function errorFormula(expresion: string, nivel: Nivel, columnas: Columna[], columnaId?: string): string | null {
  let arbol: Nodo;
  try { arbol = analizar(expresion); } catch (e) { return e instanceof ErrorFormula ? e.message : "Fórmula inválida"; }
  const mismas = columnas.filter((c) => c.nivel === nivel);
  for (const ref of referencias(arbol)) {
    if (ref === "nombre") continue;
    if (ref === columnaId) return ERROR_CICLO;
    if (!mismas.some((c) => c.id === ref)) return "Usa una columna que no existe en este nivel";
  }
  // Ciclos indirectos: A usa B y B usa A.
  const usos = new Map<string, string[]>();
  for (const c of mismas) {
    if (c.tipo !== "formula") continue;
    const expr = c.id === columnaId ? expresion : (c.config as ConfigFormula | undefined)?.expresion ?? "";
    try { usos.set(c.id, referencias(analizar(expr))); } catch { usos.set(c.id, []); }
  }
  if (columnaId && !usos.has(columnaId)) usos.set(columnaId, referencias(arbol));
  const visitando = new Set<string>();
  const ciclo = (id: string): boolean => {
    if (visitando.has(id)) return true;
    visitando.add(id);
    const r = (usos.get(id) ?? []).some(ciclo);
    visitando.delete(id);
    return r;
  };
  return columnaId && ciclo(columnaId) ? ERROR_CICLO : null;
}

export function calcularTablero(t: Pick<TableroCompleto, "columnas" | "elementos">, ctx: ContextoCalculo): Calculados {
  const hoy = ctx.hoy ?? hoyLocal();
  const errores = new Map<string, string>();
  const arboles = new Map<string, Nodo | null>();
  for (const c of t.columnas) {
    if (c.tipo !== "formula") continue;
    const expr = (tipoColumna("formula")!.config.validar(c.config) as ConfigFormula).expresion;
    if (!expr.trim()) { arboles.set(c.id, null); continue; }
    try { arboles.set(c.id, analizar(expr)); } catch (e) { arboles.set(c.id, null); errores.set(c.id, e instanceof Error ? e.message : "Fórmula inválida"); }
  }
  const archivosPor = new Map<string, ArchivoCalc[]>();
  for (const a of ctx.archivos ?? []) archivosPor.set(`${a.elementoId}:${a.columnaId}`, [...(archivosPor.get(`${a.elementoId}:${a.columnaId}`) ?? []), a]);

  const nivelDe = (e: Elemento): Nivel => (e.parentId ? "sub" : "item");
  const valores = new Map<string, Record<string, unknown>>();

  for (const e of t.elementos) {
    const cols = t.columnas.filter((c) => c.nivel === nivelDe(e));
    const porId = new Map(cols.map((c) => [c.id, c]));
    const hechos: Record<string, unknown> = {};
    const enCurso = new Set<string>();

    /** Valor "crudo" de una columna (guardado o calculado). */
    const valor = (c: Columna): unknown => {
      if (!tipoColumna(c.tipo)?.calculado) return e.valores[c.id];
      if (c.id in hechos) return hechos[c.id];
      if (enCurso.has(c.id)) { errores.set(c.id, ERROR_CICLO); return null; }
      enCurso.add(c.id);
      let v: unknown = null;
      try {
        if (c.tipo === "formula") v = calcularFormula(c);
        else if (c.tipo === "espejo") v = calcularEspejo(c);
        else if (c.tipo === "archivo") v = (archivosPor.get(`${e.id}:${c.id}`) ?? []).map((a) => a.id);
      } finally { enCurso.delete(c.id); }
      const tipo = tipoColumna(c.tipo)!;
      const ok = v === null || v === undefined ? null : tipo.valor.validar(v, tipo.config.validar(c.config));
      hechos[c.id] = ok;
      return ok;
    };

    /** Valor de una columna tal como lo ve una fórmula. */
    const valorParaFormula = (ref: string): ValorF => {
      if (ref === "nombre") return e.nombre;
      const c = porId.get(ref);
      if (!c) return null;
      const v = valor(c);
      if (v === null || v === undefined) return null;
      const config = tipoColumna(c.tipo)?.config.validar(c.config);
      switch (c.tipo) {
        case "numero": case "fecha": case "texto": case "checkbox": return v as ValorF;
        case "timeline": return v as ValorF;
        case "status": return etiquetaStatus(config as ConfigStatus, v as string)?.texto ?? null;
        case "dropdown": return (v as string[]).map((id) => (config as ConfigDropdown).opciones.find((o) => o.id === id)?.texto).filter(Boolean).join(", ");
        case "persona": return (v as string[]).map((id) => ctx.personas.get(id)?.nombre ?? "").filter(Boolean).join(", ");
        case "relacion": return nombresLigados(c, v as string[]).join(", ");
        case "archivo": return (v as string[]).length;
        default: return typeof v === "number" || typeof v === "string" ? v : null;
      }
    };

    const calcularFormula = (c: Columna): unknown => {
      const arbol = arboles.get(c.id);
      if (!arbol) return null;
      try {
        return evaluar(arbol, valorParaFormula, hoy);
      } catch (err) {
        errores.set(c.id, err instanceof Error ? err.message : "Error en la fórmula");
        return null;
      }
    };

    const nombresLigados = (c: Columna, ids: string[]): string[] => {
      const ligado = ctx.ligados?.[(c.config as ConfigRelacion | undefined)?.tableroId ?? ""];
      return ids.map((id) => ligado?.elementos.find((x) => x.id === id)?.nombre ?? "").filter(Boolean);
    };

    const calcularEspejo = (c: Columna): unknown => {
      const { columna, campo } = tipoColumna("espejo")!.config.validar(c.config) as ConfigEspejo;
      const origen = porId.get(columna);
      if (!origen || !campo) return null;
      const ids = (valor(origen) as string[] | null) ?? [];
      let partes: (string | number)[] = [];
      if (origen.tipo === "persona") {
        partes = ids.map((id) => ctx.personas.get(id)?.[campo as keyof PersonaCalc]).filter((x): x is string | number => x !== null && x !== undefined && x !== "");
      } else if (origen.tipo === "relacion") {
        const ligado = ctx.ligados?.[(origen.config as ConfigRelacion | undefined)?.tableroId ?? ""];
        const destino = ligado?.columnas.find((x) => x.id === campo);
        partes = ids.flatMap((id) => {
          const el = ligado?.elementos.find((x) => x.id === id);
          if (!el) return [];
          if (campo === "nombre") return [el.nombre];
          if (!destino) return [];
          const tipo = tipoColumna(destino.tipo);
          const config = tipo?.config.validar(destino.config);
          const v = tipo && el.valores[destino.id] != null ? tipo.valor.validar(el.valores[destino.id], config) : null;
          if (v === null || v === undefined || !tipo) return [];
          return [tipo.valor.texto(v, config, { nombrePersona: (p) => ctx.personas.get(p)?.nombre })];
        });
      }
      if (!partes.length) return null;
      return partes.length === 1 && typeof partes[0] === "number" ? partes[0] : partes.join(", ");
    };

    for (const c of cols) if (tipoColumna(c.tipo)?.calculado) valor(c);
    valores.set(e.id, hechos);
  }
  return { valores, errores };
}

/** El valor de una celda: el calculado si la columna es calculada, si no el guardado. */
export function valorDeCelda(calc: Calculados, e: Elemento, c: Columna): unknown {
  return tipoColumna(c.tipo)?.calculado ? calc.valores.get(e.id)?.[c.id] ?? null : e.valores[c.id];
}
