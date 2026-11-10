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
  { clave: "fecha_limite", etiqueta: "Fecha límite", descripcion: "Contra qué se mide el Cumplimiento.", tipos: ["fecha"] },
  { clave: "nueva_fecha_limite", etiqueta: "Nueva fecha límite", descripcion: "Fecha renegociada (penaliza Calidad).", tipos: ["fecha"] },
  { clave: "fin_real", etiqueta: "Fin real", descripcion: "Cuándo se terminó de verdad.", tipos: ["fecha"] },
  { clave: "costo", etiqueta: "Costo", descripcion: "Costo planeado (EVM, Costo x Unid Neg).", tipos: ["numero"] },
  { clave: "beneficio", etiqueta: "Beneficio", descripcion: "Beneficio esperado (Beneficio Confirmado).", tipos: ["numero"] },
  { clave: "esfuerzo_plan", etiqueta: "Esfuerzo planeado", descripcion: "Horas planeadas.", tipos: ["numero"] },
  { clave: "esfuerzo_real", etiqueta: "Esfuerzo real", descripcion: "Horas reales.", tipos: ["numero"] },
  { clave: "tipo_elemento", etiqueta: "Tipo (Hito / Entregable / Actividad)", descripcion: "Qué clase de elemento es.", tipos: ["status", "dropdown"] },
  { clave: "fase_valor", etiqueta: "Fase VALOR", descripcion: "Fase cuando no sale del grupo (caso Programa, PM-019).", tipos: ["status", "dropdown"] },
];

export function rolColumna(clave: string): RolColumna | undefined {
  return ROLES_COLUMNA.find((r) => r.clave === clave);
}

/** Roles que puede tener una columna de este tipo (para el selector de rol). */
export function rolesParaTipo(tipo: string): RolColumna[] {
  return ROLES_COLUMNA.filter((r) => r.tipos.includes(tipo));
}
