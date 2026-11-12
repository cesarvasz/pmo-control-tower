// Alta de un elemento con FORMULARIO (pop-up): qué campos lleva, en qué grupo cae por defecto y con
// qué valores nace. Lo decide la categoría del tablero (dominio/categorias.ts · altaConFormulario).
// Lógica PURA.

import { categoriaTablero } from "./categorias";
import { claveNombre } from "./personas";
import { columnasDe, type Columna, type Grupo } from "./tablero";
import { esEditable, tipoColumna } from "./tipos-columna";
import type { ConfigStatus } from "./tipos-columna/status";

/** ¿Los elementos de esta categoría se crean con formulario? (si no, con la fila «+ Agregar elemento») */
export const altaConFormulario = (categoria: string) => categoriaTablero(categoria)?.altaConFormulario;

/** Los campos del formulario: las columnas del elemento (nivel item) que se llenan a mano, OCULTAS
 *  incluidas (que no salgan en la fila no quiere decir que no se llenen). Quedan fuera las que se
 *  calculan solas (fórmula, espejo, archivo, calculadas por la app) y las que pone la app (ID, creación). */
export function columnasDelFormulario(columnas: Columna[]): Columna[] {
  return columnasDe(columnas, "item", true).filter((c) => esEditable(c.tipo));
}

/** El grupo donde cae por defecto: el que dice la categoría (por título, sin importar mayúsculas ni
 *  acentos) y, si no existe, el primero. null si el tablero no tiene grupos. */
export function grupoInicialId(categoria: string, grupos: Pick<Grupo, "id" | "titulo">[]): string | null {
  const titulo = altaConFormulario(categoria)?.grupoInicial;
  const hallado = titulo ? grupos.find((g) => claveNombre(g.titulo) === claveNombre(titulo)) : undefined;
  return (hallado ?? grupos[0])?.id ?? null;
}

/** Los valores con que nace el elemento en el formulario: el status inicial de la categoría (p. ej. «New»),
 *  si la columna de status lo tiene. */
export function valoresDeAlta(categoria: string, columnas: Columna[]): Record<string, unknown> {
  const texto = altaConFormulario(categoria)?.statusInicial;
  const col = columnas.find((c) => c.nivel === "item" && c.tipo === "status" && c.rol === "status");
  if (!texto || !col) return {};
  const etiquetas = (tipoColumna("status")!.config.validar(col.config) as ConfigStatus).etiquetas;
  const e = etiquetas.find((x) => claveNombre(x.texto) === claveNombre(texto));
  return e ? { [col.id]: e.id } : {};
}
