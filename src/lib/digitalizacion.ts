// src/lib/digitalizacion.ts
// Dominio del reporte "Digitalización OCR" (pestaña "009"). Módulo PURO
// (cliente + servidor). La ventana hábil vive en lib/ocrHabil.ts — DISTINTA a la
// de 003 y Clonación, a propósito (ver el aviso de ese archivo).
//
// Una fila del export = un file (`c807_file` es la llave de negocio, sin
// duplicados). Dos tiempos por file, ambos recortados a la ventana hábil
// L–V 08:00–18:00:
//   · T1 = Creacion  → Digit_docs             (digitalización de documentos)
//   · T2 = Digit_docs → Digit_carta_licencia  (digitalización de la carta de licencia)
// Cualquiera de los dos hitos de digitalización puede faltar (file aún en
// proceso): ese tiempo queda en `null` y NO entra en promedios/medianas.
// El reporte muestra promedio / mediana / P90 de T1 y T2 en el tiempo y por cliente.

import type { OcrRow } from "@/types";
import { segDeFecha, segmentosHabiles, duracion } from "@/lib/ocrHabil";

// ── Estadística ─────────────────────────────────────────────────────────
export function promedio(v: number[]): number | null {
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}
export function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Percentil 90 por nearest-rank. */
export function percentil90(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)];
}

/** Estadística elegida en la UI: promedio o mediana (un solo selector que
 *  gobierna la tarjeta de tiempos y la línea de tiempo). */
export type StatSel = "prom" | "mediana";

/** Resumen estadístico de una lista de duraciones en segundos. Los `null` se
 *  ignoran (files que aún no tienen ese hito); `n` es cuántos sí contaron. */
export interface Stat {
  n: number;
  prom: number | null;
  mediana: number | null;
  p90: number | null;
  max: number;
  enCero: number;
}

export function stat(segs: (number | null)[]): Stat {
  const v = segs.filter((s): s is number => s != null);
  return {
    n: v.length,
    prom: promedio(v),
    mediana: mediana(v),
    p90: percentil90(v),
    max: v.length ? Math.max(...v) : 0,
    enCero: v.filter((s) => s === 0).length,
  };
}

// ── Fechas de reloj de pared (UTC, igual que roi.ts) ─────────────────────
const p2 = (n: number) => String(n).padStart(2, "0");
export const claveDia = (d: Date) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
export const claveMes = (d: Date) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}`;
/** Lunes de la semana de `d`, como "YYYY-MM-DD". */
export function claveSemana(d: Date): string {
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  const lun = new Date(d.getTime() - dow * 86_400_000);
  return `${lun.getUTCFullYear()}-${p2(lun.getUTCMonth() + 1)}-${p2(lun.getUTCDate())}`;
}

const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function etiquetaMes(clave: string): string {
  const [a, m] = clave.split("-");
  return `${MESES_ES[+m - 1] ?? m} ${a?.slice(2) ?? ""}`;
}
export function etiquetaDia(clave: string): string {
  const [, m, d] = clave.split("-");
  return `${d} ${MESES_ES[+m - 1] ?? m}`;
}
export function etiquetaSemana(clave: string): string {
  return `sem. ${etiquetaDia(clave)}`;
}

// ── File ────────────────────────────────────────────────────────────────
export interface FileOcr {
  id: string;
  file: string;
  cliente: string;
  embarque: string;
  /** Reloj de pared (ver ocrHabil.segDeFecha) — para agrupar/mostrar (getUTC*). */
  creado: Date | null;
  docs: Date | null;
  carta: Date | null;
  creadoSeg: number | null;
  docsSeg: number | null;
  cartaSeg: number | null;
  /** Hábil Creación→Digit_docs, en segundos. `null` si falta algún extremo. */
  t1Seg: number | null;
  /** Hábil Digit_docs→Digit_carta_licencia, en segundos. `null` si falta algún extremo. */
  t2Seg: number | null;
  /** T1 + T2 si ambos existen; `null` si no. */
  totalSeg: number | null;
  /** Tiene los dos hitos de digitalización (T1 y T2 calculables). */
  completo: boolean;
}

const habilSeg = (a: number | null, b: number | null): number | null =>
  a != null && b != null ? duracion(segmentosHabiles(a, b)) : null;
const fechaDe = (seg: number | null): Date | null => (seg != null ? new Date(seg * 1000) : null);

/** Una fila del export → un file. `c807_file` es único, no se agrupa. */
export function construirFiles(rows: OcrRow[]): FileOcr[] {
  const out: FileOcr[] = [];
  for (const r of rows) {
    const file = String(r.c807_file ?? "").trim();
    if (!file) continue;
    const creadoSeg = segDeFecha(r.Creacion);
    const docsSeg = segDeFecha(r.Digit_docs);
    const cartaSeg = segDeFecha(r.Digit_carta_licencia);
    const t1Seg = habilSeg(creadoSeg, docsSeg);
    const t2Seg = habilSeg(docsSeg, cartaSeg);
    out.push({
      id: String(r.id ?? ""),
      file,
      cliente: String(r.Cliente ?? "").trim() || "(sin cliente)",
      embarque: String(r.Embarque ?? "").trim() || "(sin embarque)",
      creado: fechaDe(creadoSeg),
      docs: fechaDe(docsSeg),
      carta: fechaDe(cartaSeg),
      creadoSeg, docsSeg, cartaSeg,
      t1Seg, t2Seg,
      totalSeg: t1Seg != null && t2Seg != null ? t1Seg + t2Seg : null,
      completo: t1Seg != null && t2Seg != null,
    });
  }
  return out;
}

// ── Filtros ─────────────────────────────────────────────────────────────
export type Agrupacion = "mes" | "semana" | "dia";
/** "Casos extremos": oculta los files cuya T1 supere este tope hábil. */
export type MaxHoras = "todos" | "8h" | "4h" | "2h" | "1h";

export interface Filtros {
  clientes: string[];
  /** "YYYY-MM-DD" sobre `Creacion`. Vacío = extremo abierto. */
  desde: string;
  hasta: string;
  agrupar: Agrupacion;
  /** Solo files con los dos hitos de digitalización (T1 y T2 calculables). */
  soloCompletos: boolean;
  maxHoras: MaxHoras;
}

export const FILTROS_VACIOS: Filtros = {
  clientes: [], desde: "", hasta: "", agrupar: "mes", soloCompletos: false, maxHoras: "todos",
};

const LIMITE_MAX_HORAS: Record<MaxHoras, number> = {
  todos: Infinity, "8h": 8 * 3600, "4h": 4 * 3600, "2h": 2 * 3600, "1h": 3600,
};

export function filtrar(files: FileOcr[], f: Filtros): FileOcr[] {
  const cli = new Set(f.clientes);
  const lim = LIMITE_MAX_HORAS[f.maxHoras];
  return files.filter((x) => {
    if (cli.size && !cli.has(x.cliente)) return false;
    if (f.desde && (x.creado == null || claveDia(x.creado) < f.desde)) return false;
    if (f.hasta && (x.creado == null || claveDia(x.creado) > f.hasta)) return false;
    if (f.soloCompletos && !x.completo) return false;
    if (x.t1Seg != null && x.t1Seg > lim) return false;
    return true;
  });
}

export interface Opcion { value: string; label: string; count: number }

export function opcionesDeFiltro(files: FileOcr[]): { clientes: Opcion[] } {
  const m = new Map<string, number>();
  for (const x of files) m.set(x.cliente, (m.get(x.cliente) ?? 0) + 1);
  return {
    clientes: [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
      .map(([value, count]) => ({ value, label: value, count })),
  };
}

/** Rango completo de fechas de `Creacion` en los datos, como "YYYY-MM-DD". */
export function rangoFechas(files: FileOcr[]): { desde: string; hasta: string } {
  let desde = "", hasta = "";
  for (const x of files) {
    if (!x.creado) continue;
    const c = claveDia(x.creado);
    if (!desde || c < desde) desde = c;
    if (!hasta || c > hasta) hasta = c;
  }
  return { desde, hasta };
}

// ── KPIs ───────────────────────────────────────────────────────────────
export interface KpisOcr {
  /** Files del recorte (todos, tengan o no digitalización). */
  files: number;
  /** Cuántos tienen T1 calculable (Creación + Digit_docs). */
  conT1: number;
  /** Cuántos tienen T2 calculable (Digit_docs + Digit_carta_licencia). */
  conT2: number;
  /** Cuántos tienen los dos. */
  completos: number;
  t1: Stat;
  t2: Stat;
  /** T1 + T2, solo sobre los files completos. */
  total: Stat;
}

export function calcularKpis(files: FileOcr[]): KpisOcr {
  return {
    files: files.length,
    conT1: files.filter((f) => f.t1Seg != null).length,
    conT2: files.filter((f) => f.t2Seg != null).length,
    completos: files.filter((f) => f.completo).length,
    t1: stat(files.map((f) => f.t1Seg)),
    t2: stat(files.map((f) => f.t2Seg)),
    total: stat(files.map((f) => f.totalSeg)),
  };
}

// ── Serie por período (línea de tiempo) ────────────────────────────────
export interface PuntoSerieOcr {
  clave: string;
  label: string;
  files: number;
  /** Cuántos del período tienen T2. */
  conT2: number;
  t1Prom: number | null;
  t1Mediana: number | null;
  t1P90: number | null;
  t2Prom: number | null;
  t2Mediana: number | null;
  t2P90: number | null;
}

const claveDe = (d: Date, a: Agrupacion) =>
  a === "dia" ? claveDia(d) : a === "semana" ? claveSemana(d) : claveMes(d);
const etiquetaDe = (clave: string, a: Agrupacion) =>
  a === "dia" ? etiquetaDia(clave) : a === "semana" ? etiquetaSemana(clave) : etiquetaMes(clave);

/** Serie por período (agrupada por `Creacion`). Cada punto trae la estadística
 *  de T1 y de T2 de los files creados en ese período — los null se ignoran. */
export function serie(files: FileOcr[], f: Filtros): PuntoSerieOcr[] {
  const grupos = new Map<string, FileOcr[]>();
  for (const x of files) {
    if (!x.creado) continue;
    const k = claveDe(x.creado, f.agrupar);
    const arr = grupos.get(k);
    if (arr) arr.push(x); else grupos.set(k, [x]);
  }
  return [...grupos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, xs]) => {
      const t1 = stat(xs.map((x) => x.t1Seg));
      const t2 = stat(xs.map((x) => x.t2Seg));
      return {
        clave,
        label: etiquetaDe(clave, f.agrupar),
        files: xs.length,
        conT2: t2.n,
        t1Prom: t1.prom, t1Mediana: t1.mediana, t1P90: t1.p90,
        t2Prom: t2.prom, t2Mediana: t2.mediana, t2P90: t2.p90,
      };
    });
}

// ── Tabla por cliente ──────────────────────────────────────────────────
export interface FilaCliente {
  cliente: string;
  files: number;
  conT2: number;
  t1Prom: number | null;
  t1Mediana: number | null;
  t2Prom: number | null;
  t2Mediana: number | null;
  /** Promedio de (T1 + T2) sobre los files completos del cliente. */
  totalProm: number | null;
}

export function porCliente(files: FileOcr[]): FilaCliente[] {
  const grupos = new Map<string, FileOcr[]>();
  for (const x of files) {
    const arr = grupos.get(x.cliente);
    if (arr) arr.push(x); else grupos.set(x.cliente, [x]);
  }
  return [...grupos.entries()]
    .map(([cliente, xs]) => {
      const t1 = stat(xs.map((x) => x.t1Seg));
      const t2 = stat(xs.map((x) => x.t2Seg));
      const total = stat(xs.map((x) => x.totalSeg));
      return {
        cliente,
        files: xs.length,
        conT2: t2.n,
        t1Prom: t1.prom, t1Mediana: t1.mediana,
        t2Prom: t2.prom, t2Mediana: t2.mediana,
        totalProm: total.prom,
      };
    })
    .sort((a, b) => b.files - a.files || a.cliente.localeCompare(b.cliente, "es"));
}

// ── Tabla por file ─────────────────────────────────────────────────────
export interface FilaFile {
  file: string;
  cliente: string;
  creado: Date | null;
  docs: Date | null;
  carta: Date | null;
  t1Seg: number | null;
  t2Seg: number | null;
  totalSeg: number | null;
}

export function porFile(files: FileOcr[]): FilaFile[] {
  return files.map((x) => ({
    file: x.file,
    cliente: x.cliente,
    creado: x.creado,
    docs: x.docs,
    carta: x.carta,
    t1Seg: x.t1Seg,
    t2Seg: x.t2Seg,
    totalSeg: x.totalSeg,
  }));
}

// ── Exportación CSV ────────────────────────────────────────────────────
const csvCampo = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const iso = (d: Date | null) =>
  d ? `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ` +
      `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}` : "";
const min1 = (seg: number | null) => (seg == null ? "" : (seg / 60).toFixed(2));

export function exportFilesCSV(filas: FilaFile[]): string {
  const cab = [
    "c807_file", "Cliente", "Creacion", "Digit_docs", "Digit_carta_licencia",
    "T1_min", "T2_min", "Total_min",
  ];
  const lineas = [cab.join(",")];
  for (const r of filas) {
    lineas.push([
      r.file, r.cliente, iso(r.creado), iso(r.docs), iso(r.carta),
      min1(r.t1Seg), min1(r.t2Seg), min1(r.totalSeg),
    ].map(csvCampo).join(","));
  }
  return lineas.join("\n");
}

export function exportClientesCSV(filas: FilaCliente[]): string {
  const cab = [
    "Cliente", "Files", "Con_T2",
    "T1_prom_min", "T1_mediana_min", "T2_prom_min", "T2_mediana_min", "Total_prom_min",
  ];
  const lineas = [cab.join(",")];
  for (const r of filas) {
    lineas.push([
      r.cliente, r.files, r.conT2,
      min1(r.t1Prom), min1(r.t1Mediana), min1(r.t2Prom), min1(r.t2Mediana), min1(r.totalProm),
    ].map(csvCampo).join(","));
  }
  return lineas.join("\n");
}

export function exportSerieCSV(puntos: PuntoSerieOcr[]): string {
  const cab = [
    "Periodo", "Files", "Con_T2",
    "T1_prom_min", "T1_mediana_min", "T1_p90_min",
    "T2_prom_min", "T2_mediana_min", "T2_p90_min",
  ];
  const lineas = [cab.join(",")];
  for (const p of puntos) {
    lineas.push([
      p.label, p.files, p.conT2,
      min1(p.t1Prom), min1(p.t1Mediana), min1(p.t1P90),
      min1(p.t2Prom), min1(p.t2Mediana), min1(p.t2P90),
    ].map(csvCampo).join(","));
  }
  return lineas.join("\n");
}
