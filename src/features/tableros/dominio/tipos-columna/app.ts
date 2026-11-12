// Tipo "Calculada por la app": muestra un dato que la app calcula con SUS reglas de negocio (la etapa
// de una Iniciativa, su plazo, su salud…): las mismas funciones que usan las métricas, así que el
// tablero y el Control Tower nunca dan números distintos. No se guarda ni se edita (como una
// fórmula); el servidor arma los valores (datos/calculadas-app.ts) y la UI los muestra.
// Los campos disponibles dependen de la categoría del tablero (dominio/calculadas-iniciativas.ts).
import { definirTipo, esObjeto } from "./tipo";

export interface ConfigApp {
  /** Clave del campo calculado (p. ej. «salud»); su catálogo depende de la categoría del tablero. */
  campo: string;
}

export const app = definirTipo<string | number, ConfigApp>({
  clave: "app",
  etiqueta: "Calculada por la app",
  icono: "⚙",
  descripcion: "Un dato que la app calcula con sus reglas (etapa, plazo, salud…); no se edita.",
  calculado: true,
  config: {
    defecto: { campo: "" },
    validar: (c) => ({ campo: esObjeto(c) && typeof c.campo === "string" ? c.campo : "" }),
  },
  valor: {
    validar: (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" ? v : null),
    texto: (v) => String(v),
    comparar: (a, b) => String(a).localeCompare(String(b), "es", { numeric: true }),
  },
});
