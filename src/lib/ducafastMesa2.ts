// src/lib/ducafastMesa2.ts
// Meta mensual del ROI 003 para el Beneficio de un CKU en /players (Victoria): lo que se
// ahorraría en un mes si TODOS los Files de la Mesa 2 hubieran costado lo que cuesta uno con
// Ducafast.
//
//   Total de Files del mes (Mesa 2)
//   × costo por File CON Ducafast   = costo con Ducafast
//   × costo por File SIN Ducafast   = costo sin Ducafast
//   Meta del mes = costo sin Ducafast − costo con Ducafast = Total × (sin − con)
//
// OJO: la meta de un mes se calcula con los datos del mes ANTERIOR (la de noviembre, con los
// Files de la Mesa 2 de octubre): con el mes en curso apenas empezado habría muy pocos Files y
// la meta se movería todos los días. `metaDucafastPorMes` devuelve el cálculo de cada mes
// (el «de octubre»); quien muestra la meta de noviembre lo busca con `mesAnterior`.
//
// Los costos por File son los de la pestaña 003 con el filtro «Mesa 2» y ese mes: mismo
// cálculo (ahorroDucafast), tarifa por defecto y tramo completo T1→T5, con el reloj de cada
// persona repartido sobre TODOS los Files (ver horasAsignadasPorFile). Puro: sin red.

import {
  ETAPA_KEYS, TARIFA_HORA_DEFECTO, ahorroDucafast, horasAsignadasPorFile,
  type Expediente,
} from "@/lib/tramites";

/** La mesa cuyo ahorro se mide como meta. */
export const MESA_META_DUCAFAST = "Mesa 2";

/** El mes anterior de «yyyy-MM»: «2026-11» → «2026-10», «2026-01» → «2025-12». */
export function mesAnterior(clave: string): string {
  const [a, m] = clave.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

export interface MetaDucafastMesa2 {
  /** Todos los Files de la mesa creados ese mes (con + sin Ducafast). */
  files: number;
  filesConDucafast: number;
  filesSinDucafast: number;
  /** Qué parte de los Files del mes usó Ducafast (0–1): filesConDucafast ÷ files. Es lo que se muestra en
   *  /players por ahora (sin meta). */
  porcentajeDucafast: number;
  /** Costo por File de cada grupo (horas × tarifa + licencias, sobre los Files con tiempo medido). */
  costoPorFileCon: number;
  costoPorFileSin: number;
  /** Costo TOTAL de cada grupo, como el «Costo total» de la pestaña 003: sus Files con tiempo medido × su costo por
   *  File. null si el grupo no tiene Files con tiempo medido. (No es el costo de la meta de abajo, que usa TODOS los Files.) */
  costoTotalCon: number | null;
  costoTotalSin: number | null;
  /** Total de Files × costo por File con Ducafast. */
  costoConDucafast: number;
  /** Total de Files × costo por File sin Ducafast. */
  costoSinDucafast: number;
  /** Costo sin Ducafast − costo con Ducafast. null si el mes no tiene Files de los dos grupos
   *  (no hay con qué comparar). */
  meta: number | null;
  /** El beneficio REAL del mes (el «Beneficio Ducafast» de la pestaña 003 con filtro Mesa 2): Files con
   *  Ducafast × (costo por File sin − con). null si el mes no tiene los dos grupos. Es lo que se lleva
   *  cumplido; la meta de un mes se calcula con el mes anterior, el cumplimiento con el propio mes. */
  ahorro: number | null;
}

/** «yyyy-MM» → la meta de ese mes, para todos los meses con Files en la mesa. */
export function metaDucafastPorMes(todos: Expediente[], mesa = MESA_META_DUCAFAST): Record<string, MetaDucafastMesa2> {
  const reparto = horasAsignadasPorFile(todos, ETAPA_KEYS);
  const porMes = new Map<string, Expediente[]>();
  for (const e of todos) {
    if (!e.mes || !e.mesas.includes(mesa)) continue;
    const lista = porMes.get(e.mes);
    if (lista) lista.push(e); else porMes.set(e.mes, [e]);
  }
  const out: Record<string, MetaDucafastMesa2> = {};
  for (const [mes, lista] of porMes) {
    const a = ahorroDucafast(lista, TARIFA_HORA_DEFECTO, ETAPA_KEYS, reparto);
    const files = lista.length;
    const costoConDucafast = files * a.costoPorFileConDucafast;
    const costoSinDucafast = files * a.costoPorFileSinDucafast;
    out[mes] = {
      files,
      filesConDucafast: lista.filter((e) => e.ducafast).length,
      filesSinDucafast: lista.filter((e) => !e.ducafast).length,
      porcentajeDucafast: lista.filter((e) => e.ducafast).length / files,
      costoTotalCon: a.filesConDucafast > 0 ? a.filesConDucafast * a.costoPorFileConDucafast : null,
      costoTotalSin: a.filesSinDucafast > 0 ? a.filesSinDucafast * a.costoPorFileSinDucafast : null,
      costoPorFileCon: a.costoPorFileConDucafast,
      costoPorFileSin: a.costoPorFileSinDucafast,
      costoConDucafast,
      costoSinDucafast,
      meta: a.disponible ? costoSinDucafast - costoConDucafast : null,
      ahorro: a.disponible ? a.ahorro : null,
    };
  }
  return out;
}
