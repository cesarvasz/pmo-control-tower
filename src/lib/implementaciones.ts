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

import type { ImplementacionRow, MetaCliente } from "@/types";

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
// Meta de Profit por mes de un cliente = Vol × CM1 (dos datos que captura el
// usuario). La misma meta mensual aplica a CADA mes de la tabla. El % alcanzado es
// Profit real ÷ meta. «Sin fecha» no tiene mes, así que no se compara con ninguna
// meta. Una meta de 0 (o sin Vol/CM1) no es meta: no hay con qué dividir.

export const METAS_MAX = 500;
const NOMBRE_MAX = 200;
const TOPE = 1e9;

/** Meta de Profit de UN mes: Vol × CM1. */
export const metaProfitMensual = (m: Pick<MetaCliente, "vol" | "cm1">) => m.vol * m.cm1;

/** Cliente → su meta, solo las útiles (Vol × CM1 > 0). */
export function indexarMetas(metas: MetaCliente[]): Map<string, MetaCliente> {
  const idx = new Map<string, MetaCliente>();
  for (const m of metas) if (metaProfitMensual(m) > 0) idx.set(m.cliente, m);
  return idx;
}

export type ResultadoMetas = { ok: true; metas: MetaCliente[] } | { ok: false; error: string };

/** Valida lo que llega del popup antes de guardarlo: lista de {cliente, vol, cm1},
 *  números finitos y no negativos, sin clientes repetidos. El CM1 se redondea a
 *  centavos. Devuelve las metas ordenadas por cliente (guardado estable). */
export function normalizarMetas(input: unknown): ResultadoMetas {
  if (!Array.isArray(input)) return { ok: false, error: "metas debe ser una lista" };
  if (input.length > METAS_MAX) return { ok: false, error: `Máximo ${METAS_MAX} metas` };

  const vistos = new Set<string>();
  const metas: MetaCliente[] = [];
  for (const raw of input) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const cliente = typeof o.cliente === "string" ? o.cliente.trim() : "";
    if (!cliente || cliente.length > NOMBRE_MAX) return { ok: false, error: "Cliente inválido" };
    if (vistos.has(cliente)) return { ok: false, error: `Cliente repetido: ${cliente}` };
    vistos.add(cliente);

    const { vol, cm1 } = o;
    if (typeof vol !== "number" || !Number.isFinite(vol) || vol < 0 || vol > TOPE)
      return { ok: false, error: `Vol inválido para ${cliente}` };
    if (typeof cm1 !== "number" || !Number.isFinite(cm1) || cm1 < 0 || cm1 > TOPE)
      return { ok: false, error: `CM1 inválido para ${cliente}` };

    metas.push({ cliente, vol, cm1: Math.round(cm1 * 100) / 100 });
  }
  return { ok: true, metas: metas.sort((a, b) => a.cliente.localeCompare(b.cliente, "es")) };
}

export interface FilaMetaEditada {
  vol: number | null;
  cm1: number | null;
  errorVol: string;
  errorCm1: string;
  /** Los dos campos están vacíos: el cliente no tiene meta. */
  vacia: boolean;
  /** Vol y CM1 son válidos: la fila es una meta lista para guardar. */
  completa: boolean;
}

/** Lee los dos campos de texto del popup para un cliente. Vacíos los dos = sin
 *  meta. Con uno solo lleno, al otro le falta el dato. */
export function evaluarFilaMeta(volTxt: string, cm1Txt: string): FilaMetaEditada {
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
  const vacia = v.vacio && c.vacio;
  const errorVol = v.error || (v.vacio && !c.vacio ? "Falta Vol" : "");
  const errorCm1 = c.error || (c.vacio && !v.vacio ? "Falta CM1" : "");
  return { vol: v.n, cm1: c.n, errorVol, errorCm1, vacia, completa: v.n != null && c.n != null };
}

/** Profit real contra meta. `pct` es una fracción (0.85 = 85 %). */
export interface Avance {
  meta: number;
  profit: number;
  pct: number;
}

function avance(meta: number, profit: number): Avance | null {
  return meta > 0 ? { meta, profit, pct: profit / meta } : null;
}

const mesesConFecha = (meses: string[]) => meses.filter((k) => k !== SIN_FECHA);

/** % de la meta de UN cliente en UN mes. Un mes en que el cliente no tuvo files
 *  cuenta con Profit 0 (0 % de la meta). null si no hay meta o el mes es «Sin fecha». */
export function avanceMesCliente(fila: FilaCliente, mes: string, meta: MetaCliente | undefined): Avance | null {
  if (!meta || mes === SIN_FECHA) return null;
  return avance(metaProfitMensual(meta), fila.porMes[mes]?.profit ?? 0);
}

/** % de la meta de un cliente en todos los meses mostrados: meta mensual × cantidad
 *  de meses, contra el Profit de esos meses. */
export function avanceTotalCliente(fila: FilaCliente, meses: string[], meta: MetaCliente | undefined): Avance | null {
  if (!meta) return null;
  const reales = mesesConFecha(meses);
  if (reales.length === 0) return null;
  const profit = reales.reduce((s, k) => s + (fila.porMes[k]?.profit ?? 0), 0);
  return avance(metaProfitMensual(meta) * reales.length, profit);
}

/** % de la meta de TODOS los clientes que tienen meta en un mes. Compara lo mismo
 *  con lo mismo: el Profit de los clientes sin meta no entra al numerador. */
export function avanceTotalMes(matriz: MatrizClienteMes, mes: string, metas: Map<string, MetaCliente>): Avance | null {
  if (mes === SIN_FECHA) return null;
  let meta = 0, profit = 0;
  for (const c of matriz.clientes) {
    const m = metas.get(c.cliente);
    if (!m) continue;
    meta += metaProfitMensual(m);
    profit += c.porMes[mes]?.profit ?? 0;
  }
  return avance(meta, profit);
}

/** % de la meta de todos los clientes con meta, en todos los meses mostrados. */
export function avanceTotalGeneral(matriz: MatrizClienteMes, metas: Map<string, MetaCliente>): Avance | null {
  const reales = mesesConFecha(matriz.meses);
  if (reales.length === 0) return null;
  let meta = 0, profit = 0;
  for (const c of matriz.clientes) {
    const m = metas.get(c.cliente);
    if (!m) continue;
    meta += metaProfitMensual(m) * reales.length;
    profit += reales.reduce((s, k) => s + (c.porMes[k]?.profit ?? 0), 0);
  }
  return avance(meta, profit);
}
