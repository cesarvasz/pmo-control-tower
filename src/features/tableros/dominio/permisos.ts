// Motor de permisos de tableros (capas 2 y 3). Lógica PURA: el servidor la usa como única puerta
// antes de leer o escribir, y la UI la usa para mostrar u ocultar botones.
//
// Capa 2 — regla por rol (tabla tablero_permisos), para UN tablero o para TODA una categoría.
//          La del tablero gana sobre la de su categoría. Sin regla = sin acceso.
// Capa 3 — el dato: "solo lo mío" limita a los elementos donde la persona del usuario está en
//          `responsables`, y `columnasEditables` limita qué columnas puede cambiar.
// El Admin (acción manage_roles) puede todo.

export const NIVELES = ["ninguno", "ver", "editar_valores", "editar_estructura", "administrar"] as const;
export type Nivel = (typeof NIVELES)[number];

export const NIVEL_ETIQUETA: Record<Nivel, string> = {
  ninguno: "Sin acceso",
  ver: "Ver",
  editar_valores: "Editar valores",
  editar_estructura: "Editar estructura",
  administrar: "Administrar",
};

export const NIVEL_DESCRIPCION: Record<Nivel, string> = {
  ninguno: "No lo ve. Sirve para quitar un tablero que la categoría sí da.",
  ver: "Ve el tablero, sin cambiar nada.",
  editar_valores: "Cambia valores de las celdas (todas o solo las columnas elegidas).",
  editar_estructura: "Además crea, renombra y quita columnas y grupos.",
  administrar: "Además archiva el tablero y lo guarda como plantilla.",
};

export function esNivel(v: unknown): v is Nivel {
  return typeof v === "string" && (NIVELES as readonly string[]).includes(v);
}

const RANGO: Record<Nivel, number> = { ninguno: 0, ver: 1, editar_valores: 2, editar_estructura: 3, administrar: 4 };

export interface ReglaPermiso {
  id?: string;
  rolId: string;
  tableroId: string | null;
  categoria: string | null;
  nivel: Nivel;
  /** Roles de columna o ids de columna que puede editar. Vacío = todas. Solo aplica a "editar_valores". */
  columnasEditables: string[];
  soloLoMio: boolean;
}

export interface UsuarioTableros {
  rolId: string | null;
  esAdmin: boolean;
  /** personas.id ligada a su usuario (null = no está en el directorio). */
  personaId: string | null;
}

export interface TableroRef { id: string; categoria: string }
export interface ColumnaRef { id: string; rol: string | null }
export interface ElementoRef { responsables: string[] }

export type Operacion = "ver" | "editar_valor" | "editar_estructura" | "administrar";
const RANGO_OPERACION: Record<Operacion, number> = { ver: 1, editar_valor: 2, editar_estructura: 3, administrar: 4 };

export interface Resultado { permitido: boolean; motivo: string; regla: ReglaPermiso | null }

/** La regla que aplica a este usuario en este tablero: la del tablero, si no la de su categoría. */
export function reglaQueAplica(u: UsuarioTableros, t: TableroRef, reglas: ReglaPermiso[]): ReglaPermiso | null {
  if (!u.rolId) return null;
  const delRol = reglas.filter((r) => r.rolId === u.rolId);
  return delRol.find((r) => r.tableroId === t.id) ?? delRol.find((r) => !r.tableroId && r.categoria === t.categoria) ?? null;
}

/** ¿Puede hacer `op` en el tablero (y, si se da, en esa columna y ese elemento)? Con el motivo. */
export function evaluar(
  u: UsuarioTableros,
  op: Operacion,
  t: TableroRef,
  reglas: ReglaPermiso[],
  donde: { columna?: ColumnaRef; elemento?: ElementoRef } = {},
): Resultado {
  if (u.esAdmin) return { permitido: true, motivo: "Admin: puede todo.", regla: null };
  const regla = reglaQueAplica(u, t, reglas);
  if (!regla) return { permitido: false, motivo: "Su rol no tiene regla para este tablero ni para su categoría.", regla };
  const origen = regla.tableroId ? "regla del tablero" : `regla de la categoría «${regla.categoria}»`;

  if (RANGO[regla.nivel] < RANGO_OPERACION[op]) {
    return { permitido: false, motivo: `Su ${origen} da «${NIVEL_ETIQUETA[regla.nivel]}», no alcanza.`, regla };
  }

  // "Solo lo mío" limita ver y editar valores a sus elementos. La estructura es del tablero entero.
  if (regla.soloLoMio && donde.elemento && (op === "ver" || op === "editar_valor")) {
    if (!u.personaId) return { permitido: false, motivo: "Solo lo suyo, pero su usuario no está ligado a nadie del directorio.", regla };
    if (!donde.elemento.responsables.includes(u.personaId)) {
      return { permitido: false, motivo: "Solo lo suyo, y no es responsable de este elemento.", regla };
    }
  }

  // Columnas editables: solo restringen a quien tiene exactamente "editar valores".
  if (op === "editar_valor" && donde.columna && regla.nivel === "editar_valores" && regla.columnasEditables.length) {
    const c = donde.columna;
    if (!regla.columnasEditables.includes(c.id) && !(c.rol && regla.columnasEditables.includes(c.rol))) {
      return { permitido: false, motivo: "Esa columna no está entre las que puede editar.", regla };
    }
  }

  return { permitido: true, motivo: `Permitido por la ${origen}.`, regla };
}

export function puede(...args: Parameters<typeof evaluar>): boolean {
  return evaluar(...args).permitido;
}

/** Deja solo los elementos que el usuario puede ver (aplica "solo lo mío"). */
export function filtrarVisibles<E extends ElementoRef>(u: UsuarioTableros, t: TableroRef, reglas: ReglaPermiso[], elementos: E[]): E[] {
  if (!puede(u, "ver", t, reglas)) return [];
  return elementos.filter((e) => puede(u, "ver", t, reglas, { elemento: e }));
}

/** Normaliza una regla que viene de un formulario. Devuelve null si no es válida. */
export function validarRegla(v: unknown): ReglaPermiso | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const rolId = typeof o.rolId === "string" ? o.rolId.trim() : "";
  const tableroId = typeof o.tableroId === "string" && o.tableroId.trim() ? o.tableroId.trim() : null;
  const categoria = typeof o.categoria === "string" && o.categoria.trim() ? o.categoria.trim() : null;
  if (!rolId || !esNivel(o.nivel) || (tableroId === null) === (categoria === null)) return null;
  const columnasEditables = Array.isArray(o.columnasEditables)
    ? [...new Set(o.columnasEditables.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()))]
    : [];
  return { rolId, tableroId, categoria, nivel: o.nivel, columnasEditables, soloLoMio: o.soloLoMio === true };
}
