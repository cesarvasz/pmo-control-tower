// REGISTRO de categorías de status. Cada etiqueta de una columna Status pertenece a una
// categoría; las métricas leen la CATEGORÍA, nunca el texto de la etiqueta. Así un tablero puede
// llamar a sus etiquetas como quiera ("Listo", "Done", "Terminado") y medirse igual.
// Agregar una categoría = agregar una entrada.

export interface CategoriaStatus {
  clave: string;
  etiqueta: string;
  descripcion: string;
  /** false = el elemento no cuenta en ninguna métrica (como Out Of Scope / On Hold hoy). */
  cuentaEnMetricas: boolean;
  /** Color por defecto de una etiqueta nueva de esta categoría. */
  color: string;
}

export const CATEGORIAS_STATUS: CategoriaStatus[] = [
  { clave: "sin_iniciar", etiqueta: "Sin iniciar", descripcion: "Todavía no arranca.", cuentaEnMetricas: true, color: "#c4c4c4" },
  { clave: "en_curso", etiqueta: "En curso", descripcion: "Se está trabajando.", cuentaEnMetricas: true, color: "#fdab3d" },
  { clave: "atascado", etiqueta: "Atascado", descripcion: "Detenido por algo interno o externo.", cuentaEnMetricas: true, color: "#e2445c" },
  { clave: "hecho", etiqueta: "Hecho", descripcion: "Terminado.", cuentaEnMetricas: true, color: "#00c875" },
  { clave: "pausa", etiqueta: "En pausa", descripcion: "On Hold: no cuenta mientras esté pausado.", cuentaEnMetricas: false, color: "#a25ddc" },
  { clave: "fuera", etiqueta: "Fuera de medición", descripcion: "Out Of Scope / No Viable: nunca cuenta.", cuentaEnMetricas: false, color: "#808080" },
];

export const CATEGORIA_STATUS_DEFECTO = "sin_iniciar";

export function categoriaStatus(clave: string): CategoriaStatus | undefined {
  return CATEGORIAS_STATUS.find((c) => c.clave === clave);
}

/** Categoría de una etiqueta de Monday según su texto (para la importación). Revisable a mano. */
export function categoriaDeTextoMonday(texto: string): string {
  const t = texto.trim().toLowerCase();
  if (!t) return "sin_iniciar";
  if (t === "done" || t === "listo" || t === "terminado" || t === "completado" || t === "aprobado" || t === "approved") return "hecho";
  if (t.startsWith("stuck") || t.includes("atascado") || t.includes("bloqueado")) return "atascado";
  if (t === "on hold" || t.includes("pausa")) return "pausa";
  if (t === "out of scope" || t === "no viable" || t.includes("cancelad")) return "fuera";
  if (t === "not started" || t === "pendiente" || t === "sin iniciar") return "sin_iniciar";
  return "en_curso";
}
