// Tipo "Casilla": sí / no.
import { definirTipo } from "./tipo";

export const checkbox = definirTipo<boolean, Record<string, never>>({
  clave: "checkbox",
  etiqueta: "Casilla",
  icono: "☑",
  descripcion: "Marcado o no marcado.",
  config: { defecto: {}, validar: () => ({}) },
  valor: {
    // Solo se guarda `true`: desmarcado = vacío.
    validar: (v) => (v === true ? true : null),
    texto: (v) => (v ? "✓" : ""),
    comparar: (a, b) => Number(a) - Number(b),
    desdeMonday: (t) => ((t ?? "").trim() === "v" ? true : null),
  },
});
