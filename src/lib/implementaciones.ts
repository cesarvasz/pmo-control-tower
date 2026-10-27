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

import type { ImplementacionRow, MetaCliente, ObjetivoMes } from "@/types";

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
// Cada cliente tiene UNA meta que vale para todos los meses: Vol (files del mes) y
// CM1 (dólares de Profit por file), capturados a mano. Meta de Profit del mes =
// Vol × CM1. Lo que cambia de un mes a otro es el % de esa meta que hay que
// alcanzar (no siempre 100 %): uno por mes, igual para todos los clientes. El % que
// se muestra es Profit real ÷ meta; la meta se da por cumplida cuando el Profit llega
// a meta × % a alcanzar. «Sin fecha» no tiene mes, así que no se compara con ninguna
// meta. Una meta de 0 (o sin Vol/CM1) no es meta: no hay con qué dividir.

export const METAS_MAX = 500;
const NOMBRE_MAX = 200;
const TOPE = 1e9;

/** % a alcanzar de un mes cuando el usuario no escribe ninguno: la meta completa. */
export const OBJETIVO_DEFECTO = 100;
/** Tope del % a alcanzar (una meta «de estiramiento» puede pasar de 100). */
export const OBJETIVO_MAX = 1000;

const centavos = (n: number) => Math.round(n * 100);

/** Meta de Profit de UN mes: Vol × CM1. */
export const metaProfitMensual = (m: Pick<MetaCliente, "vol" | "cm1">) => m.vol * m.cm1;

/** «yyyy-MM» válido (mes 01–12). «Sin fecha» no es un mes con % a alcanzar. */
const esMesValido = (mes: unknown): mes is string => typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);

const esObjetivoValido = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 && n <= OBJETIVO_MAX;

/** Lo que usan las tablas: la meta de cada cliente y el % a alcanzar de cada mes. */
export interface IndiceMetas {
  /** Cliente → su meta, solo las útiles (Vol × CM1 > 0). */
  clientes: Map<string, MetaCliente>;
  /** «yyyy-MM» → % a alcanzar capturado. Un mes que falte vale OBJETIVO_DEFECTO. */
  objetivos: Map<string, number>;
}

export function indexarMetas(metas: MetaCliente[], objetivos: ObjetivoMes[] = []): IndiceMetas {
  const clientes = new Map<string, MetaCliente>();
  for (const m of metas) if (metaProfitMensual(m) > 0) clientes.set(m.cliente, m);
  return {
    clientes,
    objetivos: new Map(objetivos.filter((o) => esObjetivoValido(o.objetivo)).map((o): [string, number] => [o.mes, o.objetivo])),
  };
}

/** % a alcanzar de un mes (100 si no se capturó). */
export const objetivoDe = (idx: IndiceMetas, mes: string) => idx.objetivos.get(mes) ?? OBJETIVO_DEFECTO;

/** Lo guardado en Firestore → metas por cliente y % a alcanzar por mes. Lee también los
 *  dos formatos anteriores: una meta por cliente sin mes (valía para todos los meses) y
 *  una meta por cliente Y mes con su propio Vol, CM1 y %. Del segundo se toma, por
 *  cliente, el Vol y CM1 del mes más reciente, y por mes el primer % que aparezca. El
 *  100 % es el valor por defecto y no se guarda. Lo ilegible se ignora. */
export function leerDocMetas(d: { metas?: unknown; objetivos?: unknown } | null | undefined): {
  metas: MetaCliente[];
  objetivos: ObjetivoMes[];
} {
  const porCliente = new Map<string, { meta: MetaCliente; mes: string }>();
  const objetivos = new Map<string, number>();
  const ponObjetivo = (mes: unknown, obj: unknown, pisa: boolean) => {
    if (!esMesValido(mes) || !esObjetivoValido(obj) || obj === OBJETIVO_DEFECTO) return;
    if (pisa || !objetivos.has(mes)) objetivos.set(mes, obj);
  };

  for (const raw of Array.isArray(d?.metas) ? d.metas : []) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const { cliente, vol, cm1 } = o;
    if (typeof cliente !== "string" || !cliente.trim()) continue;
    if (typeof vol !== "number" || !Number.isFinite(vol) || typeof cm1 !== "number" || !Number.isFinite(cm1)) continue;
    const mes = typeof o.mes === "string" ? o.mes : "";
    const previa = porCliente.get(cliente);
    if (!previa || mes > previa.mes) porCliente.set(cliente, { meta: { cliente, vol, cm1 }, mes });
    ponObjetivo(o.mes, o.objetivo, false);
  }
  for (const raw of Array.isArray(d?.objetivos) ? d.objetivos : []) {
    const o = (raw ?? {}) as Record<string, unknown>;
    ponObjetivo(o.mes, o.objetivo, true);
  }

  return {
    metas: [...porCliente.values()].map((x) => x.meta).sort((a, b) => a.cliente.localeCompare(b.cliente, "es")),
    objetivos: [...objetivos].map(([mes, objetivo]) => ({ mes, objetivo })).sort((a, b) => (a.mes < b.mes ? -1 : 1)),
  };
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

export type ResultadoObjetivos = { ok: true; objetivos: ObjetivoMes[] } | { ok: false; error: string };

/** Valida los % a alcanzar que llegan del popup: lista de {mes, objetivo}, mes
 *  «yyyy-MM», objetivo mayor que 0 y hasta OBJETIVO_MAX, un solo % por mes. Se redondea
 *  a 2 decimales y sale ordenado por mes. Una lista ausente cuenta como vacía. */
export function normalizarObjetivos(input: unknown): ResultadoObjetivos {
  if (input == null) return { ok: true, objetivos: [] };
  if (!Array.isArray(input)) return { ok: false, error: "objetivos debe ser una lista" };
  if (input.length > METAS_MAX) return { ok: false, error: `Máximo ${METAS_MAX} meses` };

  const vistos = new Set<string>();
  const objetivos: ObjetivoMes[] = [];
  for (const raw of input) {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (!esMesValido(o.mes)) return { ok: false, error: "Mes inválido" };
    if (vistos.has(o.mes)) return { ok: false, error: `Mes repetido: ${etiquetaMes(o.mes)}` };
    vistos.add(o.mes);
    if (!esObjetivoValido(o.objetivo)) return { ok: false, error: `% a alcanzar inválido para ${etiquetaMes(o.mes)}` };
    objetivos.push({ mes: o.mes, objetivo: Math.round(o.objetivo * 100) / 100 });
  }
  return { ok: true, objetivos: objetivos.sort((a, b) => (a.mes < b.mes ? -1 : 1)) };
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

export interface ObjetivoEditado {
  /** null = campo vacío (vale OBJETIVO_DEFECTO y no se guarda). */
  objetivo: number | null;
  error: string;
}

/** Lee el campo «% a alcanzar» de un mes. Acepta «90» o «90 %». El 0 no sirve: con él
 *  cualquier Profit «cumpliría». */
export function evaluarObjetivo(txt: string): ObjetivoEditado {
  if (!txt.trim()) return { objetivo: null, error: "" };
  const n = aNumero(txt);
  if (n == null) return { objetivo: null, error: "Número inválido" };
  if (n <= 0) return { objetivo: null, error: "Debe ser mayor que 0" };
  if (n > OBJETIVO_MAX) return { objetivo: null, error: `Máximo ${OBJETIVO_MAX}%` };
  return { objetivo: n, error: "" };
}

/** Profit real contra meta. `pct` es una fracción (0.85 = 85 %). */
export interface Avance {
  /** Meta de Profit, en dólares (Vol × CM1; sumada si junta varias). */
  meta: number;
  profit: number;
  pct: number;
  /** Profit que hay que juntar para dar la meta por cumplida: meta × % a alcanzar del mes. */
  requerido: number;
  /** ¿El Profit llega al requerido? Se compara en centavos. */
  cumple: boolean;
  /** Cuántas metas (un cliente) se juntaron en este avance. */
  n: number;
}

interface Parte { meta: number; profit: number; objetivo: number }

/** Junta una o varias metas en un solo avance. Compara lo mismo con lo mismo: cada
 *  parte trae la meta y el Profit del MISMO cliente y mes. */
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

/** La parte de un cliente en un mes, o null si el cliente no tiene meta o el mes es
 *  «Sin fecha». Un mes en que el cliente no tuvo files cuenta con Profit 0. */
function parte(fila: FilaCliente, mes: string, idx: IndiceMetas): Parte | null {
  const m = idx.clientes.get(fila.cliente);
  if (!m || mes === SIN_FECHA) return null;
  return { meta: metaProfitMensual(m), profit: fila.porMes[mes]?.profit ?? 0, objetivo: objetivoDe(idx, mes) };
}

const soloPartes = (ps: (Parte | null)[]) => ps.filter((p): p is Parte => p != null);

/** % de la meta de UN cliente en UN mes. null si el cliente no tiene meta, o si el mes
 *  es «Sin fecha». */
export function avanceMesCliente(fila: FilaCliente, mes: string, idx: IndiceMetas): Avance | null {
  return avance(soloPartes([parte(fila, mes, idx)]));
}

/** % de la meta de TODOS los clientes que tienen meta en un mes. Compara lo mismo
 *  con lo mismo: el Profit de los clientes sin meta no entra al numerador. */
export function avanceTotalMes(matriz: MatrizClienteMes, mes: string, idx: IndiceMetas): Avance | null {
  return avance(soloPartes(matriz.clientes.map((c) => parte(c, mes, idx))));
}

// ── Semáforo por file ─────────────────────────────────────────────────────
// El CM1 de la meta de un cliente es lo que CADA file suyo debe dejar de Profit (es el
// mismo en todos los meses). Cumple si su Profit es igual o mayor que ese CM1; el % a
// alcanzar del mes NO se aplica aquí: es la regla del total del mes. Sin meta para su
// cliente (o sin Profit en la hoja) no se puede juzgar: queda «sin-meta», en gris.

export type Semaforo = "cumple" | "no-cumple" | "sin-meta";
export type FiltroSemaforo = "todos" | "cumplen" | "no-cumplen";

export interface EvaluacionFile {
  estado: Semaforo;
  /** CM1 contra el que se juzgó; null si no hubo meta. */
  cm1: number | null;
}

/** Juzga un file contra el CM1 de su cliente. Compara en centavos: un Profit de
 *  12.299999999999997 (resta de decimales en la hoja) que se muestra «$12.30» no debe
 *  salir en rojo contra un CM1 de $12.30. `metas` es el índice de `indexarMetas` (solo
 *  metas con Vol × CM1 > 0, por lo que su CM1 es > 0). */
export function evaluarFile(r: ImplementacionRow, metas: IndiceMetas): EvaluacionFile {
  const meta = metas.clientes.get(r.Cliente.trim() || SIN_CLIENTE);
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
