// REGISTRO de categorías de tablero. La categoría dice para qué sirve un tablero, con qué columnas
// nace y qué roles de columna necesita para poder medirse. Los permisos también se dan por
// categoría (un rol puede editar todos los "proyecto" sin darle permiso tablero por tablero).
// Agregar una categoría = agregar una entrada.

import { rolColumna } from "./roles";

/** Un rol, o varios alternativos (basta con uno: ["costo", "esfuerzo_real"]). */
export type RolRequerido = string | string[];

export interface CategoriaTablero {
  clave: string;
  etiqueta: string;
  descripcion: string;
  /** Roles (nivel item) sin los cuales las métricas de esta categoría no se calculan. */
  rolesRequeridos: RolRequerido[];
  /** Roles de las columnas con que nace un tablero nuevo de esta categoría (en este orden). */
  columnasIniciales: string[];
}

export const CATEGORIAS_TABLERO: CategoriaTablero[] = [
  {
    clave: "proyecto",
    etiqueta: "Proyecto",
    descripcion: "Proyectos VALOR (hoy PM-001 a PM-019). Cuentan en EVM, Cumplimiento, Calidad y Beneficio.",
    // La fecha límite sale del fin del Plan si no hay columna propia, y el costo del esfuerzo real × 9
    // (igual que hoy con las fórmulas de Monday).
    rolesRequeridos: ["status", "responsable", ["fecha_limite", "plan"], "fin_real", ["costo", "esfuerzo_real"]],
    columnasIniciales: ["status", "responsable", "plan", "fecha_limite", "fin_real", "costo"],
  },
  {
    clave: "pml",
    etiqueta: "PML / VALOR Lite",
    descripcion: "Requerimientos. Cuentan en Cumplimiento y Calidad.",
    rolesRequeridos: ["status", "responsable", ["fecha_limite", "plan"], "fin_real"],
    columnasIniciales: ["status", "responsable", "fecha_limite", "fin_real"],
  },
  {
    clave: "iniciativas",
    etiqueta: "Iniciativas",
    descripcion: "Embudo de ideas antes de volverse proyecto.",
    rolesRequeridos: ["status", "responsable"],
    columnasIniciales: ["status", "responsable"],
  },
  {
    clave: "estrategia",
    etiqueta: "Estrategia",
    descripcion: "Catálogo de objetivos estratégicos al que se ligan los proyectos.",
    rolesRequeridos: [],
    columnasIniciales: [],
  },
  {
    clave: "libre",
    etiqueta: "Libre",
    descripcion: "Cualquier otro tablero. No entra en las métricas.",
    rolesRequeridos: [],
    columnasIniciales: ["responsable", "status", "fecha_limite"],
  },
];

export const CATEGORIA_DEFECTO = "libre";

export function categoriaTablero(clave: string): CategoriaTablero | undefined {
  return CATEGORIAS_TABLERO.find((c) => c.clave === clave);
}

/** "Fecha límite o Plan (inicio–fin)" */
export function textoRolRequerido(r: RolRequerido): string {
  const et = (x: string) => rolColumna(x)?.etiqueta ?? x;
  return Array.isArray(r) ? r.map(et).join(" o ") : et(r);
}

/** Roles que la categoría pide y el tablero no tiene (para avisar "no se puede medir X").
 *  Una alternativa faltante se devuelve como lista ("fecha_limite" o "plan"). */
export function rolesFaltantes(categoria: string, columnas: { rol: string | null; nivel?: string }[]): RolRequerido[] {
  const tiene = new Set(columnas.filter((c) => (c.nivel ?? "item") === "item" && c.rol).map((c) => c.rol));
  return (categoriaTablero(categoria)?.rolesRequeridos ?? [])
    .filter((r) => (Array.isArray(r) ? !r.some((x) => tiene.has(x)) : !tiene.has(r)));
}
