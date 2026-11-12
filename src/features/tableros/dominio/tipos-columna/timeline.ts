// Tipo "Plan (inicio–fin)": un rango de fechas. Es el timeline de Monday.
import { definirTipo, esObjeto, fechaValida } from "./tipo";
import { fecha } from "./fecha";

export interface Rango { desde: string; hasta: string }

function validarValor(v: unknown): Rango | null {
  if (!esObjeto(v)) return null;
  const desde = fechaValida(v.desde);
  const hasta = fechaValida(v.hasta);
  if (!desde || !hasta) return null;
  return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
}

export const timeline = definirTipo<Rango, Record<string, never>>({
  clave: "timeline",
  etiqueta: "Plan (inicio–fin)",
  icono: "↔",
  descripcion: "Rango de fechas: desde y hasta.",
  config: { defecto: {}, validar: () => ({}) },
  valor: {
    validar: validarValor,
    texto: (v) => `${fecha.valor.texto(v.desde, {})} → ${fecha.valor.texto(v.hasta, {})}`,
    comparar: (a, b) => a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta),
    // Monday: "2026-01-05 - 2026-02-10"
    desdeMonday: (t) => {
      const m = (t ?? "").match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
      return m ? validarValor({ desde: m[1], hasta: m[2] }) : null;
    },
  },
});
