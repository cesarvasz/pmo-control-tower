// Tipo "Relación": liga elementos de OTRO tablero (p. ej. un proyecto con su objetivo de
// Estrategia). El valor guardado son ids de elementos. Para ligar personas se usa "Persona".
import { definirTipo, esObjeto, listaUnica, partirTextoMonday } from "./tipo";

export interface ConfigRelacion { tableroId: string; multiple: boolean }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validarValor(v: unknown, c: ConfigRelacion): string[] | null {
  const ids = listaUnica(Array.isArray(v) ? v : [v]).filter((id) => UUID_RE.test(id)).map((id) => id.toLowerCase());
  const out = c.multiple ? ids : ids.slice(0, 1);
  return out.length ? out : null;
}

export const relacion = definirTipo<string[], ConfigRelacion>({
  clave: "relacion",
  etiqueta: "Relación",
  icono: "🔗",
  descripcion: "Liga elementos de otro tablero.",
  config: {
    defecto: { tableroId: "", multiple: true },
    validar: (c) => {
      const o = esObjeto(c) ? c : {};
      return { tableroId: typeof o.tableroId === "string" && UUID_RE.test(o.tableroId) ? o.tableroId : "", multiple: o.multiple !== false };
    },
  },
  valor: {
    validar: validarValor,
    texto: (v, _c, ctx) => v.map((id) => ctx?.nombreElemento?.(id) ?? "¿?").join(", "),
    comparar: (a, b) => a.join(",").localeCompare(b.join(",")),
    desdeMonday: (t, c, ctx) => {
      const ids = partirTextoMonday(t).map((n) => ctx?.personaPorNombre?.(n)).filter((x): x is string => !!x);
      return validarValor(ids, c);
    },
  },
});
