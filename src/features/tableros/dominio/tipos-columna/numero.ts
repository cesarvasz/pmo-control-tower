// Tipo "Número": con decimales y unidad opcionales ("hrs", "$"…).
import { definirTipo, esObjeto } from "./tipo";

export interface ConfigNumero { decimales: number; unidad: string; unidadAntes: boolean }

export const numero = definirTipo<number, ConfigNumero>({
  clave: "numero",
  etiqueta: "Número",
  icono: "#",
  descripcion: "Cantidades, costos, horas… con unidad opcional.",
  config: {
    defecto: { decimales: 2, unidad: "", unidadAntes: false },
    validar: (c) => {
      const o = esObjeto(c) ? c : {};
      const dec = typeof o.decimales === "number" ? Math.round(o.decimales) : 2;
      return {
        decimales: Math.min(6, Math.max(0, dec)),
        unidad: typeof o.unidad === "string" ? o.unidad.trim().slice(0, 10) : "",
        unidadAntes: o.unidadAntes === true,
      };
    },
  },
  valor: {
    validar: (v) => {
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/,/g, "")) : NaN;
      return Number.isFinite(n) ? n : null;
    },
    texto: (v, c) => {
      const s = v.toLocaleString("es-GT", { minimumFractionDigits: 0, maximumFractionDigits: c.decimales });
      if (!c.unidad) return s;
      return c.unidadAntes ? `${c.unidad}${s}` : `${s} ${c.unidad}`;
    },
    comparar: (a, b) => a - b,
    desdeMonday: (t) => {
      const n = Number((t ?? "").replace(/[^0-9.\-]/g, ""));
      return (t ?? "").trim() !== "" && Number.isFinite(n) ? n : null;
    },
  },
});
