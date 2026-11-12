// Tipo "Espejo": muestra un dato de lo que está ligado en otra columna del mismo elemento. Sobre
// una columna Persona trae un dato del directorio (TLD, rol, correo…); sobre una Relación, el valor
// de una columna del tablero ligado. Se calcula; no se guarda (como el "mirror" de Monday).
import { definirTipo, esObjeto } from "./tipo";

export interface ConfigEspejo {
  /** id de la columna Persona o Relación (mismo nivel) de la que se lee. */
  columna: string;
  /** Persona: "tld" | "rol" | "email" | "grupo" | "hrsMes" | "nombre". Relación: id de columna del tablero ligado, o "nombre". */
  campo: string;
}

export const CAMPOS_PERSONA: { clave: string; etiqueta: string }[] = [
  { clave: "tld", etiqueta: "TLD" },
  { clave: "rol", etiqueta: "Rol" },
  { clave: "grupo", etiqueta: "Grupo" },
  { clave: "email", etiqueta: "Correo" },
  { clave: "hrsMes", etiqueta: "Hrs/mes" },
  { clave: "nombre", etiqueta: "Nombre" },
];

export const espejo = definirTipo<string | number, ConfigEspejo>({
  clave: "espejo",
  etiqueta: "Espejo",
  icono: "⇆",
  descripcion: "Muestra un dato de la persona o del elemento ligado en otra columna (p. ej. el TLD del Responsable).",
  calculado: true,
  config: {
    defecto: { columna: "", campo: "" },
    validar: (c) => {
      const o = esObjeto(c) ? c : {};
      return { columna: typeof o.columna === "string" ? o.columna : "", campo: typeof o.campo === "string" ? o.campo : "" };
    },
  },
  valor: {
    validar: (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" ? v : null),
    texto: (v) => String(v),
    comparar: (a, b) => String(a).localeCompare(String(b), "es", { numeric: true }),
  },
});
