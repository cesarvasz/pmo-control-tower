// Tipo "Fecha": un día, guardado como "AAAA-MM-DD".
import { definirTipo, fechaValida } from "./tipo";

export const fecha = definirTipo<string, Record<string, never>>({
  clave: "fecha",
  etiqueta: "Fecha",
  icono: "📅",
  descripcion: "Un día del calendario.",
  config: { defecto: {}, validar: () => ({}) },
  valor: {
    validar: (v) => fechaValida(v),
    texto: (v) => {
      const [a, m, d] = v.split("-");
      return `${d}/${m}/${a}`;
    },
    comparar: (a, b) => a.localeCompare(b),
    desdeMonday: (t) => fechaValida(t ?? ""),
  },
});
