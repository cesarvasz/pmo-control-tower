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

import type { ImplementacionRow } from "@/types";

/** Clave del cubo de filas sin Fecha_cierre. No choca con ninguna «yyyy-MM». */
export const SIN_FECHA = "sin-fecha";
export const SIN_CLIENTE = "(Sin cliente)";

export interface Celda {
  volumen: number;
  profit: number;
}

// ── Formato ───────────────────────────────────────────────────────────────

/** Importe con separador de miles y 2 decimales; «—» si no hay valor. */
export const fmtImporte = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
