// Clasificación de proyectos por clase (A / B / C) y los países a los que aplica.
// Definida por el usuario; no sale de Monday, así que vive aquí como tabla fija.
//
//   · Clase A y B: se listan por código PM-XXX con sus países.
//   · Clase C: todos los PML (no se listan; se asignan por tipo de fila).
//   · Un proyecto fuera de la tabla es "Sin clasificar" (PM-006, PM-010, PM-014
//     al momento de escribir esto) hasta que se le asigne clase y países.

import type { ClaseEntry } from "@/types";

export const PAISES_TODOS =["GT", "SV", "HN", "NI", "CR", "PA"] as const;

export type Clase = "A" | "B" | "C" | "Sin clasificar";
export const CLASES: Clase[] = ["A", "B", "C", "Sin clasificar"];

export interface ClaseInfo {
  clase: "A" | "B";
  paises: readonly string[];
}

/** Clave = número del PM (3 dígitos). */
const POR_NUMERO: Record<string, ClaseInfo> = {
  "001": { clase: "A", paises: ["GT"] },
  "002": { clase: "A", paises: ["GT"] },
  "003": { clase: "A", paises: ["GT"] },
  "005": { clase: "A", paises: PAISES_TODOS },
  // PM-006: clase A confirmada; países pendientes (no aparece en la gráfica por país hasta definirlos).
  "006": { clase: "A", paises: [] },
  "007": { clase: "A", paises: ["GT"] },
  "008": { clase: "A", paises: ["SV"] },
  "012": { clase: "A", paises: ["NI", "HN", "CR"] },
  "013": { clase: "A", paises: ["GT"] },
  "004": { clase: "B", paises: ["HN", "NI", "CR", "PA"] },
  "009": { clase: "B", paises: ["SV", "GT", "CR", "NI", "HN"] },
  "011": { clase: "B", paises: ["GT"] },
};

/** Proyecto sin PM ID (no es un board de Monday). Clase A, todos los países. */
export const PROYECTO_SIN_ID = {
  nombre: "Homologar Gacela, MACF, IMPALA",
  info: { clase: "A", paises: PAISES_TODOS } as ClaseInfo,
};

// ── Clase asignada a mano (pestaña Clasificación de Calidad & Cumplimiento) ──
// Un Admin (o quien tenga la acción "edit_clasificacion") le pone Clase A, B o C a cada Proyecto y
// PML con un dropdown; se guarda en Firestore por id (de board o de PML). Lo que NO tiene clase
// asignada usa la de siempre: la tabla de arriba para un proyecto, y Clase C para un PML.

/** Las clases que se pueden asignar (no existe asignar «Sin clasificar»). */
export type ClaseAsignable = "A" | "B" | "C";
export const CLASES_ASIGNABLES: readonly ClaseAsignable[] = ["A", "B", "C"];

export const esClaseAsignable = (v: unknown): v is ClaseAsignable =>
  typeof v === "string" && (CLASES_ASIGNABLES as readonly string[]).includes(v);

/** Lo que llega de Firestore, depurado: solo las entradas con una clase válida. */
export function leerClases(raw: unknown): Record<string, ClaseEntry> {
  const out: Record<string, ClaseEntry> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const e = v as Partial<ClaseEntry> | null;
    if (e && esClaseAsignable(e.clase)) out[id] = { clase: e.clase, by: e.by ?? "", at: e.at ?? "" };
  }
  return out;
}

/** Clase de un Proyecto: la asignada; si no, la de la tabla por su código (PM-XXX); si no, «Sin clasificar». */
export function claseDeProyecto(code: string, id: string, clases: Record<string, ClaseEntry>): Clase {
  return clases[id]?.clase ?? claseDeCodigo(code)?.clase ?? "Sin clasificar";
}

/** Clase de un PML: la asignada; si no, Clase C (todos los PML lo son por defecto). */
export function claseDePml(id: string, clases: Record<string, ClaseEntry>): Clase {
  return clases[id]?.clase ?? "C";
}

/** El ID de un board de Proyectos: «PM-017» de «PM-017 | Impala» y también de «PM-017 Impala 2.0» (Monday lo
 *  nombró sin la barra); "" si el nombre no trae ningún ID. */
export function codigoDeBoard(boardName: string | undefined): string {
  const nombre = boardName ?? "";
  const i = nombre.indexOf("|");
  if (i >= 0) return nombre.slice(0, i).trim();
  return nombre.trim().match(/^(PM[- ]?\d{3})\s+\S/i)?.[1] ?? "";
}

/** Clase de un board de Proyectos (la asignada a mano o la de siempre), con el mismo ID que muestra la tabla. */
export function claseDeBoard(b: { id: string; name: string | undefined }, clases: Record<string, ClaseEntry>): Clase {
  return claseDeProyecto(codigoDeBoard(b.name), b.id, clases);
}

/** La clase de un ProjItem (un item del board de su proyecto). */
export const claseDeItemProyecto = (p: { boardId: string; boardName: string }, clases: Record<string, ClaseEntry>): Clase =>
  claseDeBoard({ id: p.boardId, name: p.boardName }, clases);

/** La fuente de la nota EVM a la que cuenta una clase: A, B y C, la suya; «Sin clasificar» no cuenta en ninguna
 *  (hasta que se le asigne una clase) y devuelve null. */
export const fuenteDeClase = (c: Clase): "A" | "B" | "C" | null => (c === "A" || c === "B" || c === "C" ? c : null);

/** Clase y países de un código de board ("PM-003", "PM 003"…); undefined si no está clasificado. */
export function claseDeCodigo(code: string): ClaseInfo | undefined {
  const n = code.match(/(\d{3})/);
  return n ? POR_NUMERO[n[1]] : undefined;
}
