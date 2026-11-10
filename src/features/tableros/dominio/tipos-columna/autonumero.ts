// Tipo "ID automático": un número consecutivo con prefijo ("IN-127", "PML-31"). Lo pone la app al
// crear el elemento (siguiente número del tablero); no se edita. Es el "Item ID" de Monday, que
// Iniciativas y PML usan como identificador.
import { definirTipo, esObjeto } from "./tipo";

export interface ConfigAutonumero { prefijo: string }

/** Siguiente valor: prefijo + (el mayor número que ya existe + 1). */
export function siguienteAutonumero(c: ConfigAutonumero, existentes: unknown[]): string {
  const max = existentes.reduce<number>((m, v) => {
    const n = typeof v === "string" ? Number(v.match(/(\d+)\s*$/)?.[1] ?? NaN) : NaN;
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${c.prefijo}${max + 1}`;
}

/** "IN-127" → "IN-" (para importar). */
export function prefijoDe(valor: string): string {
  return valor.replace(/\d+\s*$/, "");
}

export const autonumero = definirTipo<string, ConfigAutonumero>({
  clave: "autonumero",
  etiqueta: "ID automático",
  icono: "№",
  descripcion: "Número consecutivo con prefijo (IN-127). Lo pone la app al crear el elemento.",
  automatico: true,
  config: {
    defecto: { prefijo: "" },
    validar: (c) => ({ prefijo: esObjeto(c) && typeof c.prefijo === "string" ? c.prefijo.slice(0, 12) : "" }),
  },
  valor: {
    validar: (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : typeof v === "number" ? String(v) : null),
    texto: (v) => v,
    comparar: (a, b) => a.localeCompare(b, "es", { numeric: true }),
    desdeMonday: (t) => (t ?? "").trim() || null,
  },
});
