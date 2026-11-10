// REGISTRO de categorías de tablero. La categoría dice para qué sirve un tablero y qué roles de
// columna necesita para poder medirse. Los permisos también se dan por categoría (un rol puede
// editar todos los "proyecto" sin tener que darle permiso tablero por tablero).
// Agregar una categoría = agregar una entrada.

export interface CategoriaTablero {
  clave: string;
  etiqueta: string;
  descripcion: string;
  /** Roles de columna (nivel item) sin los cuales las métricas de esta categoría no se calculan. */
  rolesRequeridos: string[];
}

export const CATEGORIAS_TABLERO: CategoriaTablero[] = [
  {
    clave: "proyecto",
    etiqueta: "Proyecto",
    descripcion: "Proyectos VALOR (hoy PM-001 a PM-019). Cuentan en EVM, Cumplimiento, Calidad y Beneficio.",
    rolesRequeridos: ["status", "responsable", "plan", "fecha_limite", "fin_real", "costo"],
  },
  {
    clave: "pml",
    etiqueta: "PML / VALOR Lite",
    descripcion: "Requerimientos. Cuentan en Cumplimiento y Calidad.",
    rolesRequeridos: ["status", "responsable", "fecha_limite", "fin_real"],
  },
  {
    clave: "iniciativas",
    etiqueta: "Iniciativas",
    descripcion: "Embudo de ideas antes de volverse proyecto.",
    rolesRequeridos: ["status", "responsable"],
  },
  {
    clave: "estrategia",
    etiqueta: "Estrategia",
    descripcion: "Catálogo de objetivos estratégicos al que se ligan los proyectos.",
    rolesRequeridos: [],
  },
  {
    clave: "libre",
    etiqueta: "Libre",
    descripcion: "Cualquier otro tablero. No entra en las métricas.",
    rolesRequeridos: [],
  },
];

export const CATEGORIA_DEFECTO = "libre";

export function categoriaTablero(clave: string): CategoriaTablero | undefined {
  return CATEGORIAS_TABLERO.find((c) => c.clave === clave);
}

/** Roles que la categoría pide y el tablero no tiene (para avisar "no se puede medir X"). */
export function rolesFaltantes(categoria: string, columnas: { rol: string | null; nivel?: string }[]): string[] {
  const tiene = new Set(columnas.filter((c) => (c.nivel ?? "item") === "item" && c.rol).map((c) => c.rol));
  return (categoriaTablero(categoria)?.rolesRequeridos ?? []).filter((r) => !tiene.has(r));
}
