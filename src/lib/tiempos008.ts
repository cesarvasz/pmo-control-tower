// src/lib/tiempos008.ts
// Análisis de tiempos ROI 008 (Ducafast SV) — reglas de negocio y agregados.
// Módulo PURO (cliente + servidor): la página ROI lo usa en el navegador, igual
// que la pestaña 003 usa lib/tramites.ts. Los tiempos se calculan UNA vez por
// carga (prepararFiles); los filtros solo eligen subconjuntos y cada combinación
// de filtros se calcula una sola vez (crearCalculadora).
//
// Reglas (las mismas que explica la sección «Cómo se calcularon los tiempos»):
//   · Una fila por file. El mes sale de Fecha_file.
//   · Ducafast = el file tiene fecha en DPR. Solo esos llevan tiempos.
//   · T1 = Creado → DPR · T2 = DPR → Clasificación exacta · T3 = Clasificación
//     exacta → Solicitud prepóliza. Cada tramo se mide solo con sus dos fechas;
//     si falta Creado, T1 no se mide (no se usa Fecha_file en su lugar).
//   · Tiempos en horas hábiles (lib/horario008.ts): L–V 8:00–18:00 corrido.
//   · T3 invertido: la solicitud es anterior a la clasificación (en reloj). Ese
//     file sale de T3 y de la cadena, pero cuenta en T1 y T2, y va a «Files a revisar».
//   · Cadena = T1 + T2 + T3 del mismo file, solo con los tres medidos.
//   · T2 simultáneo: DPR y Clasificación exacta a 5 s o menos en reloj.

import { claveMes, leerFecha, partesFecha, segundosHabilesEntre, fmtHabil } from "@/lib/horario008";
import type { Roi008Row } from "@/types";

// ── Tramos ────────────────────────────────────────────────────────────────

export type Tramo = "t1" | "t2" | "t3";
export type Medida = Tramo | "cadena";

export const TRAMO_KEYS: Tramo[] = ["t1", "t2", "t3"];
export const MEDIDA_KEYS: Medida[] = ["t1", "t2", "t3", "cadena"];

export const MEDIDAS: Record<Medida, { corto: string; label: string }> = {
  t1: { corto: "T1", label: "Creado → DPR" },
  t2: { corto: "T2", label: "DPR → Clasificación exacta" },
  t3: { corto: "T3", label: "Clasificación exacta → Solicitud prepóliza" },
  cadena: { corto: "Cadena", label: "Creado → Solicitud prepóliza" },
};

/** Diferencia máxima en reloj (segundos) para que DPR y Clasificación cuenten como simultáneos. */
export const SIMULTANEO_SEG = 5;
/** Meses con menos files con Ducafast que esto no se dibujan en «Tiempos por mes». */
export const MIN_FILES_GRAFICA = 10;

// ── Columnas ──────────────────────────────────────────────────────────────

/** Columnas que necesita el tablero, con su nombre en la hoja. */
export const COLUMNAS = {
  fileId: "File_id",
  file: "File",
  fechaFile: "Fecha_file",
  cliente: "Cliente",
  usuario: "Usuario",
  creado: "Creado",
  dpr: "DPR",
  clas: "Clasificacion_exacta",
  sol: "Solicitud_prepoliza",
} as const;
export type ClaveColumna = keyof typeof COLUMNAS;

/** «Clasificación exacta» = «Clasificacion_exacta» = «clasificacionexacta». */
export const normalizarNombre = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Ubica cada columna requerida por su ENCABEZADO (no por posición), sin importar
 * mayúsculas, tildes, espacios o guiones. Las columnas extra se ignoran.
 */
export function ubicarColumnas(encabezados: string[]):
  { ok: true; mapa: Record<ClaveColumna, string> } | { ok: false; faltan: string[] } {
  const porNorm = new Map<string, string>();
  for (const h of encabezados) {
    const n = normalizarNombre(String(h));
    if (n && !porNorm.has(n)) porNorm.set(n, h);
  }
  const mapa = {} as Record<ClaveColumna, string>;
  const faltan: string[] = [];
  for (const [k, nombre] of Object.entries(COLUMNAS) as [ClaveColumna, string][]) {
    const real = porNorm.get(normalizarNombre(nombre));
    if (real === undefined) faltan.push(nombre);
    else mapa[k] = real;
  }
  return faltan.length ? { ok: false, faltan } : { ok: true, mapa };
}

// ── Files ─────────────────────────────────────────────────────────────────

export const SIN_CLIENTE = "(sin cliente)";
export const SIN_USUARIO = "(sin usuario)";

export interface File008 {
  file: string;
  /** Fechas en segundos de hora de pared (ver lib/horario008.ts); null = vacía. */
  fechaFile: number;
  mes: string;
  cliente: string;
  usuario: string;
  creado: number | null;
  dpr: number | null;
  clas: number | null;
  sol: number | null;
  ducafast: boolean;
  /** Tiempos hábiles en segundos; null = no se mide. */
  t1: number | null;
  t2: number | null;
  /** null también cuando está invertido (ver t3Invertido). */
  t3: number | null;
  t3Invertido: boolean;
  /** Diferencia hábil Clasificación → Solicitud de un T3 invertido (≤ 0). */
  t3Diferencia: number | null;
  cadena: number | null;
  /** Solo tiene sentido con t2 medido. */
  t2Simultaneo: boolean;
}

export type Preparacion =
  | { ok: true; files: File008[]; sinFechaFile: number }
  | { ok: false; faltan: string[] };

const texto = (v: unknown) => (v == null ? "" : String(v)).trim();

/** Una fila de la hoja → File008 (con sus tiempos ya calculados). */
export function construirFile(campos: {
  file: string; fechaFile: number; cliente: string; usuario: string;
  creado: number | null; dpr: number | null; clas: number | null; sol: number | null;
}): File008 {
  const { creado, dpr, clas, sol } = campos;
  // Solo los files con Ducafast (DPR lleno) llevan tiempos.
  let t1: number | null = null, t2: number | null = null, t3: number | null = null;
  let t3Invertido = false, t3Diferencia: number | null = null, t2Simultaneo = false;
  if (dpr != null) {
    if (creado != null) t1 = segundosHabilesEntre(creado, dpr);
    if (clas != null) {
      t2 = segundosHabilesEntre(dpr, clas);
      t2Simultaneo = Math.abs(clas - dpr) <= SIMULTANEO_SEG;
      if (sol != null) {
        const bruto = segundosHabilesEntre(clas, sol);
        // Invertido = la solicitud es anterior a la clasificación en reloj.
        if (sol < clas) { t3Invertido = true; t3Diferencia = bruto; } else t3 = bruto;
      }
    }
  }
  return {
    ...campos,
    cliente: campos.cliente || SIN_CLIENTE,
    usuario: campos.usuario || SIN_USUARIO,
    mes: claveMes(campos.fechaFile),
    ducafast: dpr != null,
    t1, t2, t3,
    t3Invertido,
    t3Diferencia,
    cadena: t1 != null && t2 != null && t3 != null ? t1 + t2 + t3 : null,
    t2Simultaneo,
  };
}

/**
 * Filas de la pestaña "008" → files con sus tiempos. Si falta alguna columna
 * requerida no se calcula nada (ok: false con la lista). `encabezados` son los
 * de la hoja; sin ellos se toman las claves de la primera fila.
 * Las filas sin Fecha_file (no debería haber) no se cuentan y se reportan aparte.
 */
export function prepararFiles(rows: Roi008Row[], encabezados?: string[]): Preparacion {
  const cols = ubicarColumnas(encabezados ?? (rows[0] ? Object.keys(rows[0]) : []));
  if (!cols.ok) return cols;
  const c = cols.mapa;

  const files: File008[] = [];
  let sinFechaFile = 0;
  for (const r of rows) {
    const fechaFile = leerFecha(r[c.fechaFile]);
    if (fechaFile == null) { sinFechaFile++; continue; }
    files.push(construirFile({
      file: texto(r[c.file]),
      fechaFile,
      cliente: texto(r[c.cliente]),
      usuario: texto(r[c.usuario]),
      creado: leerFecha(r[c.creado]),
      dpr: leerFecha(r[c.dpr]),
      clas: leerFecha(r[c.clas]),
      sol: leerFecha(r[c.sol]),
    }));
  }
  return { ok: true, files, sinFechaFile };
}

// ── Estadísticas ──────────────────────────────────────────────────────────

export interface Estad {
  n: number;
  promedio: number | null;
  mediana: number | null;
}

/** Promedio y mediana (con n par, la mediana es el promedio de los dos del centro). */
export function estadisticas(valores: number[]): Estad {
  const n = valores.length;
  if (!n) return { n: 0, promedio: null, mediana: null };
  const ord = Float64Array.from(valores).sort();
  let suma = 0;
  for (let i = 0; i < n; i++) suma += ord[i];
  const mitad = n >> 1;
  return { n, promedio: suma / n, mediana: n % 2 ? ord[mitad] : (ord[mitad - 1] + ord[mitad]) / 2 };
}

const valoresDe = (files: File008[], m: Medida) => {
  const out: number[] = [];
  for (const f of files) { const v = f[m]; if (v != null) out.push(v); }
  return out;
};

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

// ── Meses ─────────────────────────────────────────────────────────────────

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-01" → "enero 2026". */
export function etiquetaMes(clave: string): string {
  const [y, m] = clave.split("-").map(Number);
  return MESES[m - 1] ? `${MESES[m - 1]} ${y}` : clave;
}

/** "2026-01" → "ene" (o "ene 26" si se pide el año, para series de más de un año). */
export function mesCorto(clave: string, conAnio = false): string {
  const [y, m] = clave.split("-").map(Number);
  const base = MESES_CORTO[m - 1] ?? clave;
  return conAnio ? `${base} ${String(y).slice(-2)}` : base;
}

/** Fecha de pared → "2 de enero de 2026". */
export function fechaLarga(t: number): string {
  const p = partesFecha(t);
  return `${p.d} de ${MESES[p.m - 1]} de ${p.y}`;
}

// ── Formato de números ────────────────────────────────────────────────────

/** 22947 → "22,947" (coma de miles siempre, también con 4 cifras). */
export const fmtNum = (n: number) => Math.round(n).toLocaleString("en-US");
/** Razón 0–1 → "14.9%". null → "—". */
export const fmtPct = (r: number | null | undefined) => (r == null || !isFinite(r) ? "—" : `${(r * 100).toFixed(1)}%`);

// ── Filtros ───────────────────────────────────────────────────────────────

export interface Filtros008 {
  /** "yyyy-MM" o null = todos los meses. */
  mes: string | null;
  cliente: string | null;
  usuario: string | null;
}
export const FILTROS_VACIOS: Filtros008 = { mes: null, cliente: null, usuario: null };
export const hayFiltros = (f: Filtros008) => f.mes != null || f.cliente != null || f.usuario != null;

const alfabetico = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });

/** Opciones de los selectores, sacadas de los datos. Cliente y usuario en orden
 *  alfabético en español; los meses en orden cronológico. */
export function opcionesDeFiltro(files: File008[]) {
  const meses = new Set<string>(), clientes = new Set<string>(), usuarios = new Set<string>();
  for (const f of files) { meses.add(f.mes); clientes.add(f.cliente); usuarios.add(f.usuario); }
  return {
    meses: [...meses].sort().map((m) => ({ value: m, label: etiquetaMes(m) })),
    clientes: [...clientes].sort(alfabetico),
    usuarios: [...usuarios].sort(alfabetico),
  };
}

/** "Mostrando: noviembre 2026 · todos los clientes · Ana". */
export function textoMostrando(f: Filtros008): string {
  return [
    f.mes ? etiquetaMes(f.mes) : "todos los meses",
    f.cliente ?? "todos los clientes",
    f.usuario ?? "todos los usuarios",
  ].join(" · ");
}

// ── Agregados ─────────────────────────────────────────────────────────────

export interface FilaUso {
  nombre: string;
  total: number;
  con: number;
  sin: number;
  pct: number | null;
}

export interface FilaMes extends FilaUso {
  mes: string;
  tramos: Record<Tramo, Estad>;
  /** % de T2 simultáneos sobre los T2 medidos del mes. */
  simultaneo: number | null;
  invertidos: number;
}

export interface FilaUsuarioTiempo {
  usuario: string;
  medidas: Record<Medida, Estad>;
}

export interface Rango {
  label: string;
  desde: number;
  hasta: number;
}

/** Rangos de la distribución, en segundos hábiles: [desde, hasta). */
export const RANGOS: Rango[] = [
  { label: "Menos de 1 min", desde: -Infinity, hasta: 60 },
  { label: "1 a 15 min", desde: 60, hasta: 900 },
  { label: "15 min a 1 h", desde: 900, hasta: 3_600 },
  { label: "1 a 4 h", desde: 3_600, hasta: 14_400 },
  { label: "4 a 10 h (hasta 1 día)", desde: 14_400, hasta: 36_000 },
  { label: "1 a 3 días hábiles (10–30 h)", desde: 36_000, hasta: 108_000 },
  { label: "3 a 5 días hábiles (30–50 h)", desde: 108_000, hasta: 180_000 },
  { label: "Más de 5 días hábiles", desde: 180_000, hasta: Infinity },
];

export interface FilaRango {
  label: string;
  porTramo: Record<Tramo, { n: number; pct: number | null }>;
}

export interface Aporte {
  /** Files con la cadena completa sobre los que se reparte. */
  n: number;
  /** Promedio de la cadena = suma de los promedios de los tramos. */
  total: number | null;
  partes: { key: Tramo; promedio: number; pct: number }[];
}

export interface Agregados008 {
  resumen: { total: number; con: number; sin: number; uso: number | null };
  /** Primera y última Fecha_file del recorte. */
  rango: { desde: number | null; hasta: number | null };
  medidas: Record<Medida, Estad>;
  aporte: Aporte;
  simultaneo: { n: number; pct: number | null };
  invertidos: number;
  porUsuario: FilaUso[];
  porCliente: FilaUso[];
  usuariosTiempo: FilaUsuarioTiempo[];
  distribucion: FilaRango[];
  topCadena: File008[];
  revisar: File008[];
}

/** Total / Ducafast / Sin / % de un grupo de files. */
function uso(nombre: string, files: File008[]): FilaUso {
  let con = 0;
  for (const f of files) if (f.ducafast) con++;
  return { nombre, total: files.length, con, sin: files.length - con, pct: ratio(con, files.length) };
}

function agrupar(files: File008[], clave: (f: File008) => string): Map<string, File008[]> {
  const m = new Map<string, File008[]>();
  for (const f of files) {
    const k = clave(f);
    const g = m.get(k);
    if (g) g.push(f); else m.set(k, [f]);
  }
  return m;
}

/** Ducafast de mayor a menor, luego total de mayor a menor, luego nombre. */
const porDucafast = (a: FilaUso, b: FilaUso) => b.con - a.con || b.total - a.total || alfabetico(a.nombre, b.nombre);

function tablaUso(files: File008[], clave: (f: File008) => string): FilaUso[] {
  return [...agrupar(files, clave)].map(([k, g]) => uso(k, g)).sort(porDucafast);
}

/** Aporte de cada tramo al promedio de la cadena, sobre los files con cadena completa. */
export function calcularAporte(files: File008[]): Aporte {
  const conCadena = files.filter((f) => f.cadena != null);
  const n = conCadena.length;
  if (!n) return { n: 0, total: null, partes: [] };
  const prom = TRAMO_KEYS.map((k) => conCadena.reduce((s, f) => s + f[k]!, 0) / n);
  const total = prom[0] + prom[1] + prom[2];
  return {
    n,
    total,
    partes: TRAMO_KEYS.map((key, i) => ({ key, promedio: prom[i], pct: total > 0 ? prom[i] / total : 0 })),
  };
}

function medidasDe(files: File008[]): Record<Medida, Estad> {
  return {
    t1: estadisticas(valoresDe(files, "t1")),
    t2: estadisticas(valoresDe(files, "t2")),
    t3: estadisticas(valoresDe(files, "t3")),
    cadena: estadisticas(valoresDe(files, "cadena")),
  };
}

function distribucion(files: File008[]): FilaRango[] {
  const porTramo = TRAMO_KEYS.map((k) => valoresDe(files, k));
  return RANGOS.map((r) => ({
    label: r.label,
    porTramo: Object.fromEntries(TRAMO_KEYS.map((k, i) => {
      const vals = porTramo[i];
      let n = 0;
      for (const v of vals) if (v >= r.desde && v < r.hasta) n++;
      return [k, { n, pct: ratio(n, vals.length) }];
    })) as Record<Tramo, { n: number; pct: number | null }>,
  }));
}

/** Todo lo que responde a los tres filtros (mes, cliente y usuario). */
export function calcularAgregados(files: File008[]): Agregados008 {
  const duc = files.filter((f) => f.ducafast);
  let desde: number | null = null, hasta: number | null = null;
  for (const f of files) {
    if (desde == null || f.fechaFile < desde) desde = f.fechaFile;
    if (hasta == null || f.fechaFile > hasta) hasta = f.fechaFile;
  }
  const conT2 = duc.filter((f) => f.t2 != null);
  const sim = conT2.filter((f) => f.t2Simultaneo).length;
  const r = uso("", files);

  return {
    resumen: { total: r.total, con: r.con, sin: r.sin, uso: r.pct },
    rango: { desde, hasta },
    medidas: medidasDe(duc),
    aporte: calcularAporte(duc),
    simultaneo: { n: sim, pct: ratio(sim, conT2.length) },
    invertidos: duc.filter((f) => f.t3Invertido).length,
    porUsuario: tablaUso(files, (f) => f.usuario),
    porCliente: tablaUso(files, (f) => f.cliente),
    usuariosTiempo: [...agrupar(duc, (f) => f.usuario)].map(([usuario, g]) => ({ usuario, medidas: medidasDe(g) })),
    distribucion: distribucion(duc),
    topCadena: duc.filter((f) => f.cadena != null)
      .sort((a, b) => b.cadena! - a.cadena! || a.file.localeCompare(b.file))
      .slice(0, 10),
    revisar: duc.filter((f) => f.t3Invertido)
      .sort((a, b) => a.t3Diferencia! - b.t3Diferencia! || a.file.localeCompare(b.file)),
  };
}

/** Tablas y gráficas que ya son por mes: responden a cliente y usuario, no al mes. */
export function calcularPorMes(files: File008[]): FilaMes[] {
  return [...agrupar(files, (f) => f.mes)].sort(([a], [b]) => a.localeCompare(b)).map(([mes, g]) => {
    const duc = g.filter((f) => f.ducafast);
    const conT2 = duc.filter((f) => f.t2 != null);
    return {
      ...uso(etiquetaMes(mes), g),
      mes,
      tramos: {
        t1: estadisticas(valoresDe(duc, "t1")),
        t2: estadisticas(valoresDe(duc, "t2")),
        t3: estadisticas(valoresDe(duc, "t3")),
      },
      simultaneo: ratio(conT2.filter((f) => f.t2Simultaneo).length, conT2.length),
      invertidos: duc.filter((f) => f.t3Invertido).length,
    };
  });
}

/** Top de usuarios por el promedio de la medida elegida (de mayor a menor). */
export function topUsuarios(filas: FilaUsuarioTiempo[], medida: Medida, cuantos = 10): FilaUsuarioTiempo[] {
  return filas
    .filter((u) => u.medidas[medida].n > 0)
    .sort((a, b) =>
      b.medidas[medida].promedio! - a.medidas[medida].promedio!
      || b.medidas[medida].n - a.medidas[medida].n
      || alfabetico(a.usuario, b.usuario))
    .slice(0, cuantos);
}

export interface Calculo008 {
  agregados: Agregados008;
  porMes: FilaMes[];
}

/**
 * Calculadora con memoria: cada combinación de filtros se calcula una sola vez
 * por carga. Lo «por mes» depende solo de cliente y usuario, así que se guarda
 * aparte y cambiar de mes no lo recalcula.
 */
export function crearCalculadora(files: File008[]): (f: Filtros008) => Calculo008 {
  const cacheBase = new Map<string, { base: File008[]; porMes: FilaMes[] }>();
  const cache = new Map<string, Calculo008>();
  return (f) => {
    const kBase = `${f.cliente ?? "\u0000"}\u0001${f.usuario ?? "\u0000"}`;
    const k = `${kBase}\u0001${f.mes ?? "\u0000"}`;
    const hecho = cache.get(k);
    if (hecho) return hecho;

    let b = cacheBase.get(kBase);
    if (!b) {
      const base = files.filter((x) =>
        (f.cliente == null || x.cliente === f.cliente) && (f.usuario == null || x.usuario === f.usuario));
      b = { base, porMes: calcularPorMes(base) };
      cacheBase.set(kBase, b);
    }
    const recorte = f.mes == null ? b.base : b.base.filter((x) => x.mes === f.mes);
    const r = { agregados: calcularAgregados(recorte), porMes: b.porMes };
    cache.set(k, r);
    return r;
  };
}

// ── Frases ────────────────────────────────────────────────────────────────

/** "De la creación a la solicitud de prepóliza, un file con Ducafast tarda…". null sin cadenas. */
export function fraseEncabezado(a: Agregados008): string | null {
  const c = a.medidas.cadena;
  if (!c.n || !a.aporte.partes.length) return null;
  const mayor = a.aporte.partes.reduce((x, y) => (y.pct > x.pct ? y : x));
  return `De la creación a la solicitud de prepóliza, un file con Ducafast tarda en mediana ${fmtHabil(c.mediana)} ` +
    `y en promedio ${fmtHabil(c.promedio)} horas hábiles. ${MEDIDAS[mayor.key].corto} ` +
    `(${MEDIDAS[mayor.key].label}) concentra el ${fmtPct(mayor.pct)} de ese tiempo.`;
}

/** "El uso de Ducafast pasó de X en <mes> a Y en <mes>, con un máximo de Z en <mes>. El mes con más files fue…". */
export function fraseUso(porMes: FilaMes[]): string | null {
  if (!porMes.length) return null;
  const primero = porMes[0], ultimo = porMes[porMes.length - 1];
  const maxUso = porMes.reduce((x, y) => ((y.pct ?? -1) > (x.pct ?? -1) ? y : x));
  const maxFiles = porMes.reduce((x, y) => (y.total > x.total ? y : x));
  const masFiles = `El mes con más files fue ${etiquetaMes(maxFiles.mes)}, con ${fmtNum(maxFiles.total)}.`;
  if (porMes.length === 1) {
    return `El uso de Ducafast en ${etiquetaMes(primero.mes)} fue de ${fmtPct(primero.pct)}, con ${fmtNum(primero.total)} files.`;
  }
  return `El uso de Ducafast pasó de ${fmtPct(primero.pct)} en ${etiquetaMes(primero.mes)} a ` +
    `${fmtPct(ultimo.pct)} en ${etiquetaMes(ultimo.mes)}, con un máximo de ${fmtPct(maxUso.pct)} en ` +
    `${etiquetaMes(maxUso.mes)}. ${masFiles}`;
}
