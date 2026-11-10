// Tipo "Fórmula": se calcula con otras columnas del mismo elemento (dominio/formulas.ts); no se
// guarda. Su `formato` dice qué devuelve (número, fecha o texto), y con eso puede tener un rol: una
// fórmula de fecha puede ser la Fecha límite y una numérica el Costo.
import { definirTipo, esObjeto, fechaValida } from "./tipo";
import { numero, type ConfigNumero } from "./numero";
import { fecha } from "./fecha";

export type FormatoFormula = "numero" | "fecha" | "texto";
export interface ConfigFormula extends ConfigNumero {
  /** Con ids de columna: "{<id>} * 9". La UI la muestra con títulos. */
  expresion: string;
  formato: FormatoFormula;
}

const FORMATOS: FormatoFormula[] = ["numero", "fecha", "texto"];

export const formula = definirTipo<number | string, ConfigFormula>({
  clave: "formula",
  etiqueta: "Fórmula",
  icono: "ƒ",
  descripcion: "Se calcula con otras columnas: {Esfuerzo real} * 9, FIN({Plan}), IF({Status}=\"Done\", …).",
  calculado: true,
  config: {
    defecto: { expresion: "", formato: "numero", decimales: 2, unidad: "", unidadAntes: false },
    validar: (c) => {
      const o = esObjeto(c) ? c : {};
      return {
        ...numero.config.validar(o),
        expresion: typeof o.expresion === "string" ? o.expresion.slice(0, 2000) : "",
        formato: FORMATOS.includes(o.formato as FormatoFormula) ? (o.formato as FormatoFormula) : "numero",
      };
    },
  },
  valor: {
    // Valida el RESULTADO calculado según el formato.
    validar: (v, c) => {
      if (c.formato === "numero") return typeof v === "number" && Number.isFinite(v) ? v : null;
      if (c.formato === "fecha") return fechaValida(v);
      return typeof v === "string" && v !== "" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : null;
    },
    texto: (v, c) => {
      if (c.formato === "numero") return numero.valor.texto(v as number, c);
      if (c.formato === "fecha") return fecha.valor.texto(v as string, {});
      return String(v);
    },
    comparar: (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "es")),
  },
});
