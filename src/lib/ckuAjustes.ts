// src/lib/ckuAjustes.ts
// Ajustes manuales a la medición de un CKU (Players). Una actividad (subitem) de Proyectos que el PMO pidió
// dejar «a tiempo» aunque en Monday figure con atraso: en Cumplimiento de Entrega pasa de atraso a a tiempo
// y en Calidad de Entregas vale 100 (sin importar si cerró tarde o si se le movió la fecha). Solo cambia la
// medición de los CKUs: Monday y la medición de los PM no se tocan. La llave es el id del subitem en Monday;
// el texto es de quién lo pidió y por qué, solo para que quede a la vista. Módulo PURO.

export const ACTIVIDADES_A_TIEMPO: ReadonlyMap<string, string> = new Map([
  ["13363023626", "PM-012 DUCAfast Reg › Flete y Seguro encabezado DUCA › Prueba de escenario — pedido del PMO el 2026-10-30"],
]);

export const esActividadATiempo = (id: string): boolean => ACTIVIDADES_A_TIEMPO.has(id);
