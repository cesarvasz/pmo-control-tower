// REGISTRO de roles de columna. Un rol dice QUÉ SIGNIFICA una columna para las métricas
// (Fecha límite, Costo…). Las métricas buscan la columna por su rol, nunca por nombre ni id:
// así cada tablero puede llamar a sus columnas como quiera.
// Agregar un rol = agregar una entrada (y usarlo en una métrica o en una categoría de tablero).

export interface RolColumna {
  clave: string;
  etiqueta: string;
  descripcion: string;
  /** Claves de TIPOS_COLUMNA que pueden tener este rol. */
  tipos: string[];
}

export const ROLES_COLUMNA: RolColumna[] = [
  { clave: "status", etiqueta: "Status", descripcion: "Avance del elemento (su categoría: hecho, en curso…).", tipos: ["status"] },
  { clave: "responsable", etiqueta: "Responsable", descripcion: "Quién lo hace. Define el \"solo lo mío\".", tipos: ["persona"] },
  { clave: "plan", etiqueta: "Plan (inicio–fin)", descripcion: "Fechas planeadas. Base del EVM y del Gantt.", tipos: ["timeline"] },
  { clave: "fecha_limite", etiqueta: "Fecha límite", descripcion: "Contra qué se mide el Cumplimiento. Si no hay, sale del fin del Plan.", tipos: ["fecha", "formula"] },
  { clave: "nueva_fecha_limite", etiqueta: "Nueva fecha límite", descripcion: "Fecha renegociada (penaliza Calidad).", tipos: ["fecha", "formula"] },
  { clave: "fin_real", etiqueta: "Fin real", descripcion: "Cuándo se terminó de verdad.", tipos: ["fecha"] },
  { clave: "costo", etiqueta: "Costo", descripcion: "Costo planeado (EVM, Costo x Unid Neg). Si no hay, Esfuerzo real × 9.", tipos: ["numero", "formula"] },
  { clave: "beneficio", etiqueta: "Beneficio", descripcion: "Beneficio esperado (Beneficio Confirmado).", tipos: ["numero", "formula"] },
  { clave: "esfuerzo_plan", etiqueta: "Esfuerzo planeado", descripcion: "Horas planeadas.", tipos: ["numero", "formula"] },
  { clave: "esfuerzo_real", etiqueta: "Esfuerzo real", descripcion: "Horas reales.", tipos: ["numero", "formula"] },
  { clave: "tipo_elemento", etiqueta: "Tipo (Hito / Entregable / Actividad)", descripcion: "Qué clase de elemento es.", tipos: ["status", "dropdown"] },
  { clave: "fase_valor", etiqueta: "Fase VALOR", descripcion: "Fase cuando no sale del grupo (caso Programa, PM-019).", tipos: ["status", "dropdown"] },
];

export function rolColumna(clave: string): RolColumna | undefined {
  return ROLES_COLUMNA.find((r) => r.clave === clave);
}

/** Qué tiene que devolver una fórmula para tener este rol ("fecha" o "numero"); null = ninguna puede. */
export function formatoDeRol(r: RolColumna): "fecha" | "numero" | null {
  return r.tipos.includes("formula") ? (r.tipos[0] === "fecha" ? "fecha" : "numero") : null;
}

/** Roles que puede tener una columna de este tipo (para el selector de rol). Una fórmula, según
 *  lo que devuelve (su formato). */
export function rolesParaTipo(tipo: string, config?: unknown): RolColumna[] {
  const formato = (config as { formato?: string } | undefined)?.formato;
  return ROLES_COLUMNA.filter((r) => r.tipos.includes(tipo) && (tipo !== "formula" || formatoDeRol(r) === formato));
}
