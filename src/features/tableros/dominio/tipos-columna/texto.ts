// Tipo "Texto": una línea o un párrafo (config.multilinea).
import { definirTipo, esObjeto } from "./tipo";

export interface ConfigTexto { multilinea: boolean }
const MAX = 5000;

export const texto = definirTipo<string, ConfigTexto>({
  clave: "texto",
  etiqueta: "Texto",
  icono: "T",
  descripcion: "Texto libre, de una línea o de varias.",
  config: {
    defecto: { multilinea: false },
    validar: (c) => ({ multilinea: esObjeto(c) && c.multilinea === true }),
  },
  valor: {
    validar: (v) => {
      if (typeof v !== "string" && typeof v !== "number") return null;
      const s = String(v).trim().slice(0, MAX);
      return s || null;
    },
    texto: (v) => v,
    comparar: (a, b) => a.localeCompare(b, "es"),
    desdeMonday: (t) => (t ?? "").trim().slice(0, MAX) || null,
  },
});
