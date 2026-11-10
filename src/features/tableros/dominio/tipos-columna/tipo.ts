// La forma común de TODOS los tipos de columna. Cada tipo (texto, fecha, status…) es un módulo
// que implementa esta interfaz y se registra en ./index.ts. Lógica pura: sin React, red ni BD
// (el editor de celda de cada tipo se registra aparte, en la UI).

/** Datos de apoyo para mostrar o importar valores que apuntan a otras cosas (personas…). */
export interface ContextoValor {
  /** persona.id → nombre */
  nombrePersona?: (id: string) => string | undefined;
  /** nombre (como lo escribe Monday) → persona.id */
  personaPorNombre?: (nombre: string) => string | undefined;
}

export interface TipoColumna<V = unknown, C = unknown> {
  /** Clave guardada en tablero_columnas.tipo. NO se cambia una vez en uso. */
  clave: string;
  etiqueta: string;
  icono: string;
  descripcion: string;
  config: {
    defecto: C;
    /** Normaliza una config cualquiera (de la BD o de un formulario) a una válida. */
    validar(c: unknown): C;
    /** Config a partir del settings_str de la columna de Monday (importación). */
    desdeMonday?(settingsStr: string | undefined): C;
  };
  valor: {
    /** Valor válido para guardar, o null si está vacío o no es válido. */
    validar(v: unknown, c: C): V | null;
    texto(v: V, c: C, ctx?: ContextoValor): string;
    comparar(a: V, b: V, c: C): number;
    /** Valor a partir del texto que da Monday (importación). */
    desdeMonday?(texto: string | null, c: C, ctx?: ContextoValor): V | null;
  };
}

/** Ayuda de tipado para declarar un tipo: conserva V y C al escribir el módulo. */
export function definirTipo<V, C>(t: TipoColumna<V, C>): TipoColumna<V, C> {
  return t;
}

// ── Utilidades compartidas por los tipos ─────────────────────────────────────

export const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11-10" si es una fecha real del calendario; si no, null. */
export function fechaValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 10);
  if (!FECHA_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

export function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseJson(s: string | undefined): unknown {
  if (!s) return undefined;
  try { return JSON.parse(s); } catch { return undefined; }
}

/** Lista de strings sin vacíos ni repetidos, conservando el orden. */
export function listaUnica(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "";
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** "Ana, Luis" → ["Ana", "Luis"] (como Monday junta varios valores en `text`). */
export function partirTextoMonday(texto: string | null): string[] {
  return (texto ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
