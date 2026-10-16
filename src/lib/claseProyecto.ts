// Clasificación de proyectos por clase (A / B / C) y los países a los que aplica.
// Definida por el usuario; no sale de Monday, así que vive aquí como tabla fija.
//
//   · Clase A y B: se listan por código PM-XXX con sus países.
//   · Clase C: todos los PML (no se listan; se asignan por tipo de fila).
//   · Un proyecto fuera de la tabla es "Sin clasificar" (PM-006, PM-010, PM-014
//     al momento de escribir esto) hasta que se le asigne clase y países.

export const PAISES_TODOS = ["GT", "SV", "HN", "NI", "CR", "PA"] as const;

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

/** Clase y países de un código de board ("PM-003", "PM 003"…); undefined si no está clasificado. */
export function claseDeCodigo(code: string): ClaseInfo | undefined {
  const n = code.match(/(\d{3})/);
  return n ? POR_NUMERO[n[1]] : undefined;
}
