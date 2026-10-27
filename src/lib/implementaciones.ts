// src/lib/implementaciones.ts
// Dominio del reporte de Implementación: agrupar por Cliente y por mes de cierre,
// sumar volumen y Profit, y filtrar por mes. Funciones puras, seguras para el
// cliente — la parte que habla con el Apps Script (y trae node:zlib) vive en
// implementacion.ts y NO se importa desde los componentes. Misma separación que
// clonacion.ts / clonaciones.ts.
//
// Reglas:
//  · Volumen = número de filas (un registro de la hoja = un file).
//  · Profit  = suma de la columna Profit tal como viene en la hoja; una celda
//    vacía cuenta como 0 en la suma.
//  · El mes sale de Fecha_cierre. Una fila sin Fecha_cierre no cae en ningún mes:
//    va a un cubo propio, «Sin fecha», para que los totales cuadren siempre.

import type { ImplementacionRow, MetaCliente, MetaClienteLegacy } from "@/types";

/** Clave del cubo de filas sin Fecha_cierre. No choca con ninguna «yyyy-MM». */
export const SIN_FECHA = "sin-fecha";
export const SIN_CLIENTE = "(Sin cliente)";

export interface Celda {
  volumen: number;
  profit: number;
}

// ── Números ───────────────────────────────────────────────────────────────

/**
 * Celda o texto → número. null si está vacío o no se puede interpretar (nunca
 * NaN: un NaN se colaría en las sumas y las arruinaría en silencio). Acepta
 * «Q1,234.50», «$1,234.50», «500 USD»; un paréntesis o un signo menos es negativo,
 * como en contabilidad. Se asume formato «1,234.50» (coma de miles, punto decimal).
 */
export function aNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;

  const s = v.trim();
  if (!s) return null;

  const sinMoneda = s.replace(/^[^\d()-]+/, ""); // «Q», «$», «USD »…
  const negativo = /^\(.*\)$/.test(sinMoneda) || sinMoneda.startsWith("-");
  const limpio = s.replace(/[^\d.]/g, "");
  if (!/\d/.test(limpio)) return null;

  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

// ── Formato ───────────────────────────────────────────────────────────────

/** Importe en dólares con separador de miles y 2 decimales («$1,234.50»,
 *  «-$20.00»); «—» si no hay valor. */
export const fmtImporte = (n: number | null) => {
  if (n == null) return "—";
  const abs = Math.abs(n).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Un -0.004 se redondea a «0.00»: no se le pone un signo menos a un cero.
  return n < 0 && abs !== "0.00" ? `-$${abs}` : `$${abs}`;
};

/** Fracción → «85.3%» (hasta un decimal). */
export const fmtPct = (fraccion: number) =>
  `${(Math.round(fraccion * 1000) / 10).toLocaleString("es-GT", { maximumFractionDigits: 1 })}%`;

/** "yyyy-MM-ddTHH:mm:ss" → "dd/mm/yyyy" (o con hora si la trae). Se parte el texto
 *  a mano: pasar por Date movería la hora según la zona del navegador. */
export function fmtFechaCorta(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return "—";
  const dia = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] === "00" && m[5] === "00" ? dia : `${dia} ${m[4]}:${m[5]}`;
}

// ── Meses ─────────────────────────────────────────────────────────────────

const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** "2026-03-02T10:00:00" → "2026-03". Sin fecha (o ilegible) → SIN_FECHA. */
export function claveMes(fechaCierre: string): string {
  const m = fechaCierre.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : SIN_FECHA;
}

/** "2026-03" → "Mar 2026". */
export function etiquetaMes(clave: string): string {
  if (clave === SIN_FECHA) return "Sin fecha";
  const [a, m] = clave.split("-");
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES_CORTO[i]} ${a}` : clave;
}

/** Orden cronológico; «Sin fecha» siempre al final. */
function porMes(a: string, b: string): number {
  if (a === b) return 0;
  if (a === SIN_FECHA) return 1;
  if (b === SIN_FECHA) return -1;
  return a < b ? -1 : 1;
}

export interface PuntoMes extends Celda {
  clave: string;
  label: string;
}

/** Un punto por cada mes presente en las filas, del más viejo al más nuevo. Es la
 *  línea de tiempo: incluye «Sin fecha» al final cuando hay filas sin Fecha_cierre. */
export function serieMensual(rows: ImplementacionRow[]): PuntoMes[] {
  const cubos = new Map<string, Celda>();
  for (const r of rows) {
    const k = claveMes(r.Fecha_cierre);
    const c = cubos.get(k) ?? { volumen: 0, profit: 0 };
    c.volumen += 1;
    c.profit += r.Profit ?? 0;
    cubos.set(k, c);
  }
  return [...cubos.entries()]
    .sort((a, b) => porMes(a[0], b[0]))
    .map(([clave, c]) => ({ clave, label: etiquetaMes(clave), ...c }));
}

/** Filas de los meses elegidos. Sin selección (`[]`) = todas. */
export function filtrarPorMeses(rows: ImplementacionRow[], meses: string[]): ImplementacionRow[] {
  if (meses.length === 0) return rows;
  const sel = new Set(meses);
  return rows.filter((r) => sel.has(claveMes(r.Fecha_cierre)));
}

// ── Cliente × mes ─────────────────────────────────────────────────────────

export interface FilaCliente {
  cliente: string;
  /** Solo trae los meses en los que el cliente tiene filas. */
  porMes: Record<string, Celda>;
  total: Celda;
}

export interface MatrizClienteMes {
  /** Columnas: meses presentes en las filas, cronológicos, «Sin fecha» al final. */
  meses: string[];
  /** Ordenados por volumen total (mayor primero), luego Profit y nombre. */
  clientes: FilaCliente[];
  totalesPorMes: Record<string, Celda>;
  total: Celda;
}

/** Agrupa por Cliente y, dentro de cada uno, por mes de cierre: volumen (conteo
 *  de filas) y Profit (suma). Los totales por mes y el total general suman
 *  exactamente las mismas filas que la tabla. */
export function agruparPorClienteYMes(rows: ImplementacionRow[]): MatrizClienteMes {
  const porCliente = new Map<string, FilaCliente>();
  const totalesPorMes: Record<string, Celda> = {};
  const total: Celda = { volumen: 0, profit: 0 };

  const sumar = (c: Celda, profit: number) => { c.volumen += 1; c.profit += profit; };

  for (const r of rows) {
    const nombre = r.Cliente.trim() || SIN_CLIENTE;
    const mes = claveMes(r.Fecha_cierre);
    const profit = r.Profit ?? 0;

    let fila = porCliente.get(nombre);
    if (!fila) {
      fila = { cliente: nombre, porMes: {}, total: { volumen: 0, profit: 0 } };
      porCliente.set(nombre, fila);
    }
    sumar(fila.porMes[mes] ??= { volumen: 0, profit: 0 }, profit);
    sumar(fila.total, profit);
    sumar(totalesPorMes[mes] ??= { volumen: 0, profit: 0 }, profit);
    sumar(total, profit);
  }

  const clientes = [...porCliente.values()].sort((a, b) =>
    b.total.volumen - a.total.volumen || b.total.profit - a.total.profit || a.cliente.localeCompare(b.cliente, "es"));

  return { meses: Object.keys(totalesPorMes).sort(porMes), clientes, totalesPorMes, total };
}

// ── Totales ───────────────────────────────────────────────────────────────

export interface TotalesImplementacion {
  ingresos: number;
  egresos: number;
  profit: number;
}

/** Suma de las tres columnas de importe. Una celda vacía (null) cuenta como 0. */
export function totalesImplementacion(rows: ImplementacionRow[]): TotalesImplementacion {
  const t: TotalesImplementacion = { ingresos: 0, egresos: 0, profit: 0 };
  for (const r of rows) {
    t.ingresos += r.ingresos_facturados ?? 0;
    t.egresos += r.egresos_liquidados ?? 0;
    t.profit += r.Profit ?? 0;
  }
  return t;
}

// ── Metas ─────────────────────────────────────────────────────────────────
// Las metas son por cliente Y por mes de cierre. Cada una lleva tres datos que
// captura el usuario: Vol, CM1 y el % de la meta que hay que alcanzar (no siempre
// 100 %). Meta de Profit del mes = Vol × CM1; se da por cumplida cuando el Profit
// real llega a meta × % a alcanzar. El % que se muestra es Profit real ÷ meta.
// «Sin fecha» no tiene mes, así que no se compara con ninguna meta. Una meta de 0
// (o sin Vol/CM1) no es meta: no hay con qué dividir.

export const METAS_MAX = 2000;
const NOMBRE_MAX = 200;
const TOPE = 1e9;

/** % a alcanzar cuando el usuario no escribe ninguno: la meta completa. */
export const OBJETIVO_DEFECTO = 100;
/** Tope del % a alcanzar (una meta «de estiramiento» puede pasar de 100). */
export const OBJETIVO_MAX = 1000;

const centavos = (n: number) => Math.round(n * 100);

/** Meta de Profit de UN mes: Vol × CM1. */
export const metaProfitMensual = (m: Pick<MetaCliente, "vol" | "cm1">) => m.vol * m.cm1;

/** «yyyy-MM» válido (mes 01–12). «Sin fecha» no es un mes con meta. */
const esMesValido = (mes: unknown): mes is string => typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);

/** Llave de una meta en el índice: un cliente en un mes. */
export const claveMeta = (cliente: string, mes: string) => `${mes}|${cliente}`;

/** Índice (cliente, mes) → meta. */
export type IndiceMetas = Map<string, MetaCliente>;

/** (cliente, mes) → su meta, solo las útiles (Vol × CM1 > 0). */
export function indexarMetas(metas: MetaCliente[]): IndiceMetas {
  const idx: IndiceMetas = new Map();
  for (const m of metas) if (metaProfitMensual(m) > 0) idx.set(claveMeta(m.cliente, m.mes), m);
  return idx;
}

/** Cuántos meses distintos tienen al menos una meta útil. */
export const mesesConMeta = (idx: IndiceMetas) => new Set([...idx.values()].map((m) => m.mes)).size;

/** Metas guardadas → metas por (cliente, mes). Las del formato anterior (una por
 *  cliente, sin mes) valían para TODOS los meses: se expanden a cada mes de `meses`
 *  con el 100 % a alcanzar, para que nada cambie hasta que se vuelvan a guardar. Si
 *  hay una meta del mes y una del formato anterior, manda la del mes. */
export function expandirMetas(guardadas: (MetaCliente | MetaClienteLegacy)[], meses: string[]): MetaCliente[] {
  const out = new Map<string, MetaCliente>();
  for (const g of guardadas) {
    if ("mes" in g) continue;
    for (const mes of meses) {
      out.set(claveMeta(g.cliente, mes), { cliente: g.cliente, mes, vol: g.vol, cm1: g.cm1, objetivo: OBJETIVO_DEFECTO });
    }
  }
  for (const g of guardadas) {
    if (!("mes" in g)) continue;
    const objetivo = typeof g.objetivo === "number" && g.objetivo > 0 ? g.objetivo : OBJETIVO_DEFECTO;
    out.set(claveMeta(g.cliente, g.mes), { ...g, objetivo });
  }
  return [...out.values()];
}

export type ResultadoMetas = { ok: true; metas: MetaCliente[] } | { ok: false; error: string };

/** Valida lo que llega del popup antes de guardarlo: lista de {cliente, mes, vol,
 *  cm1, objetivo}. Vol y CM1 numéricos, finitos y no negativos; `objetivo` mayor que
 *  0 (si falta, 100); mes «yyyy-MM»; sin repetir un cliente en el mismo mes. El CM1 y
 *  el objetivo se redondean a 2 decimales. Devuelve las metas ordenadas por cliente
 *  y mes (guardado estable). */
export function normalizarMetas(input: unknown): ResultadoMetas {
  if (!Array.isArray(input)) return { ok: false, error: "metas debe ser una lista" };
  if (input.length > METAS_MAX) return { ok: false, error: `Máximo ${METAS_MAX} metas` };

  const vistos = new Set<string>();
  const metas: MetaCliente[] = [];
  for (const raw of input) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const cliente = typeof o.cliente === "string" ? o.cliente.trim() : "";
    if (!cliente || cliente.length > NOMBRE_MAX) return { ok: false, error: "Cliente inválido" };
    if (!esMesValido(o.mes)) return { ok: false, error: `Mes inválido para ${cliente}` };
    const mes = o.mes;
    const llave = claveMeta(cliente, mes);
    if (vistos.has(llave)) return { ok: false, error: `Meta repetida: ${cliente} en ${etiquetaMes(mes)}` };
    vistos.add(llave);

    const { vol, cm1 } = o;
    const etiqueta = `${cliente} (${etiquetaMes(mes)})`;
    if (typeof vol !== "number" || !Number.isFinite(vol) || vol < 0 || vol > TOPE)
      return { ok: false, error: `Vol inválido para ${etiqueta}` };
    if (typeof cm1 !== "number" || !Number.isFinite(cm1) || cm1 < 0 || cm1 > TOPE)
      return { ok: false, error: `CM1 inválido para ${etiqueta}` };

    const obj = o.objetivo ?? OBJETIVO_DEFECTO;
    if (typeof obj !== "number" || !Number.isFinite(obj) || obj <= 0 || obj > OBJETIVO_MAX)
      return { ok: false, error: `% a alcanzar inválido para ${etiqueta}` };

    metas.push({ cliente, mes, vol, cm1: Math.round(cm1 * 100) / 100, objetivo: Math.round(obj * 100) / 100 });
  }
  return {
    ok: true,
    metas: metas.sort((a, b) => a.cliente.localeCompare(b.cliente, "es") || (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0)),
  };
}

export interface FilaMetaEditada {
  vol: number | null;
  cm1: number | null;
  /** % a alcanzar; 100 si el campo está vacío (o es ilegible). */
  objetivo: number;
  errorVol: string;
  errorCm1: string;
  errorObjetivo: string;
  /** Los tres campos están vacíos: ese cliente no tiene meta ese mes. */
  vacia: boolean;
  /** Vol y CM1 son válidos y el % a alcanzar también: la fila es una meta lista para guardar. */
  completa: boolean;
}

/** Lee los tres campos de texto del popup para un cliente en un mes. Vacíos los tres
 *  = sin meta. Si hay algo escrito, Vol y CM1 son obligatorios; el % a alcanzar, si
 *  se deja vacío, es 100. */
export function evaluarFilaMeta(volTxt: string, cm1Txt: string, objetivoTxt = ""): FilaMetaEditada {
  const lee = (txt: string, nombre: string) => {
    if (!txt.trim()) return { n: null as number | null, vacio: true, error: "" };
    const n = aNumero(txt);
    if (n == null) return { n: null, vacio: false, error: "Número inválido" };
    if (n < 0) return { n: null, vacio: false, error: "Debe ser 0 o más" };
    if (n > TOPE) return { n: null, vacio: false, error: `${nombre} demasiado grande` };
    return { n, vacio: false, error: "" };
  };

  const v = lee(volTxt, "Vol");
  const c = lee(cm1Txt, "CM1");

  // El % a alcanzar tiene su propia regla: 0 no sirve (todo «cumpliría»).
  let objetivo = OBJETIVO_DEFECTO;
  let errorObjetivo = "";
  const objVacio = !objetivoTxt.trim();
  if (!objVacio) {
    const n = aNumero(objetivoTxt);
    if (n == null) errorObjetivo = "Número inválido";
    else if (n <= 0) errorObjetivo = "Debe ser mayor que 0";
    else if (n > OBJETIVO_MAX) errorObjetivo = `Máximo ${OBJETIVO_MAX}%`;
    else objetivo = n;
  }

  const vacia = v.vacio && c.vacio && objVacio;
  const errorVol = v.error || (v.vacio && !vacia ? "Falta Vol" : "");
  const errorCm1 = c.error || (c.vacio && !vacia ? "Falta CM1" : "");
  return {
    vol: v.n, cm1: c.n, objetivo, errorVol, errorCm1, errorObjetivo, vacia,
    completa: v.n != null && c.n != null && !errorObjetivo,
  };
}

/** Profit real contra meta. `pct` es una fracción (0.85 = 85 %). */
export interface Avance {
  /** Meta de Profit, en dólares (Vol × CM1; sumada si junta varias). */
  meta: number;
  profit: number;
  pct: number;
  /** Profit que hay que juntar para dar la meta por cumplida: meta × % a alcanzar
   *  (cada meta con el suyo). */
  requerido: number;
  /** ¿El Profit llega al requerido? Se compara en centavos. */
  cumple: boolean;
  /** Cuántas metas (un cliente en un mes) se juntaron en este avance. */
  n: number;
}

interface Parte { meta: number; profit: number; objetivo: number }

/** Junta una o varias metas (cliente × mes) en un solo avance. Compara lo mismo con
 *  lo mismo: cada parte trae la meta y el Profit del MISMO cliente y mes. */
function avance(partes: Parte[]): Avance | null {
  const meta = partes.reduce((s, p) => s + p.meta, 0);
  if (!(meta > 0)) return null;
  const profit = partes.reduce((s, p) => s + p.profit, 0);
  // meta (USD) × % = centavos exactos; se redondea cada parte para no arrastrar basura decimal.
  const requeridoCent = partes.reduce((s, p) => s + Math.round(p.meta * p.objetivo), 0);
  return {
    meta, profit, pct: profit / meta,
    requerido: requeridoCent / 100,
    cumple: centavos(profit) >= requeridoCent,
    n: partes.length,
  };
}

/** La parte de un cliente en un mes, o null si ese mes no tiene meta para él. Un mes
 *  en que el cliente no tuvo files cuenta con Profit 0. */
function parte(fila: FilaCliente, mes: string, metas: IndiceMetas): Parte | null {
  const m = metas.get(claveMeta(fila.cliente, mes));
  if (!m || mes === SIN_FECHA) return null;
  return { meta: metaProfitMensual(m), profit: fila.porMes[mes]?.profit ?? 0, objetivo: m.objetivo };
}

const soloPartes = (ps: (Parte | null)[]) => ps.filter((p): p is Parte => p != null);

/** % de la meta de UN cliente en UN mes. null si ese mes no tiene meta para él, o si
 *  el mes es «Sin fecha». */
export function avanceMesCliente(fila: FilaCliente, mes: string, metas: IndiceMetas): Avance | null {
  return avance(soloPartes([parte(fila, mes, metas)]));
}

/** % de la meta de un cliente en todos los meses mostrados que tienen meta: suma de
 *  las metas de esos meses contra el Profit de esos mismos meses. */
export function avanceTotalCliente(fila: FilaCliente, meses: string[], metas: IndiceMetas): Avance | null {
  return avance(soloPartes(meses.map((k) => parte(fila, k, metas))));
}

/** % de la meta de TODOS los clientes que tienen meta en un mes. Compara lo mismo
 *  con lo mismo: el Profit de los clientes sin meta no entra al numerador. */
export function avanceTotalMes(matriz: MatrizClienteMes, mes: string, metas: IndiceMetas): Avance | null {
  return avance(soloPartes(matriz.clientes.map((c) => parte(c, mes, metas))));
}

/** % de la meta de todos los clientes, en todos los meses mostrados que tienen meta. */
export function avanceTotalGeneral(matriz: MatrizClienteMes, metas: IndiceMetas): Avance | null {
  return avance(soloPartes(matriz.clientes.flatMap((c) => matriz.meses.map((k) => parte(c, k, metas)))));
}

// ── Semáforo por file ─────────────────────────────────────────────────────
// El CM1 de la meta de un cliente EN EL MES DE CIERRE del file es lo que ese file
// debe dejar de Profit. Cumple si su Profit es igual o mayor que ese CM1 (el % a
// alcanzar de la meta mensual NO se aplica aquí: es la regla del total del mes). Sin
// meta para su cliente en ese mes, sin fecha de cierre o sin Profit en la hoja no se
// puede juzgar: queda «sin-meta», en gris.

export type Semaforo = "cumple" | "no-cumple" | "sin-meta";
export type FiltroSemaforo = "todos" | "cumplen" | "no-cumplen";

export interface EvaluacionFile {
  estado: Semaforo;
  /** CM1 contra el que se juzgó; null si no hubo meta. */
  cm1: number | null;
}

/** Juzga un file contra el CM1 de su cliente en su mes de cierre. Compara en
 *  centavos: un Profit de 12.299999999999997 (resta de decimales en la hoja) que se
 *  muestra «$12.30» no debe salir en rojo contra un CM1 de $12.30. `metas` es el
 *  índice de `indexarMetas` (solo metas con Vol × CM1 > 0, por lo que su CM1 es > 0). */
export function evaluarFile(r: ImplementacionRow, metas: IndiceMetas): EvaluacionFile {
  const meta = metas.get(claveMeta(r.Cliente.trim() || SIN_CLIENTE, claveMes(r.Fecha_cierre)));
  if (!meta || r.Profit == null) return { estado: "sin-meta", cm1: meta?.cm1 ?? null };
  return { estado: centavos(r.Profit) >= centavos(meta.cm1) ? "cumple" : "no-cumple", cm1: meta.cm1 };
}

export interface ResumenSemaforo {
  cumplen: number;
  noCumplen: number;
  sinMeta: number;
}

export function resumenSemaforo(estados: Semaforo[]): ResumenSemaforo {
  const r: ResumenSemaforo = { cumplen: 0, noCumplen: 0, sinMeta: 0 };
  for (const e of estados) {
    if (e === "cumple") r.cumplen += 1;
    else if (e === "no-cumple") r.noCumplen += 1;
    else r.sinMeta += 1;
  }
  return r;
}

/** ¿Pasa este estado el filtro? «todos» deja pasar todo, incluidos los sin meta. */
export function pasaFiltroSemaforo(estado: Semaforo, filtro: FiltroSemaforo): boolean {
  if (filtro === "cumplen") return estado === "cumple";
  if (filtro === "no-cumplen") return estado === "no-cumple";
  return true;
}
