// Tipo "Creado": cuándo se creó el elemento ("2026-08-10 20:34:26 UTC", el mismo formato que el
// "Creation log" de Monday, del que Iniciativas saca su fecha de creación). Lo pone la app.
import { definirTipo } from "./tipo";

const FORMATO = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/;

/** Marca de tiempo en el formato del Creation log de Monday. */
export function marcaCreacion(d: Date = new Date()): string {
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export const creacion = definirTipo<string, Record<string, never>>({
  clave: "creacion",
  etiqueta: "Creado",
  icono: "🕓",
  descripcion: "Cuándo se creó el elemento. Lo pone la app.",
  automatico: true,
  config: { defecto: {}, validar: () => ({}) },
  valor: {
    validar: (v) => (typeof v === "string" && FORMATO.test(v.trim()) ? v.trim() : null),
    texto: (v) => {
      const d = new Date(v.replace(" UTC", "Z").replace(" ", "T"));
      return Number.isNaN(d.getTime()) ? v : d.toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
    },
    comparar: (a, b) => a.localeCompare(b),
    desdeMonday: (t) => (t && FORMATO.test(t.trim()) ? t.trim() : null),
  },
});
