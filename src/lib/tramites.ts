// src/lib/tramites.ts
// Dominio del reporte de tiempos de trámites (hoja ROI → expedientes).
// Módulo PURO (cliente + servidor). Los tiempos salen de lib/horario.ts.
//
// Formato del origen: ANCHO — una fila por expediente, con una columna de fecha
// por hito. Un mismo c807_file puede repetirse cuando alguna dimensión difiere
// (hoy solo `Proceso`); esas filas se fusionan en un solo expediente que
// conserva TODOS los valores, para que el filtro lo incluya si alguno coincide.
//
// El cálculo por expediente ocurre una sola vez (construirExpedientes); filtrar
// después solo selecciona subconjuntos.

import { segundosHabiles, SEGUNDOS_SEMANA, fmtHHMMSS } from "@/lib/horario";
import type { RoiRow } from "@/types";

export const norm = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// ── Hitos ────────────────────────────────────────────────────────────────
export type HitoKey = "creado" | "dpr" | "clasificacion" | "preduca" | "revision" | "firma";

// En orden de la cadena — así los recorre la tabla de cobertura.
export const HITOS: { key: HitoKey; label: string; col: keyof RoiRow }[] = [
  { key: "creado",        label: "Creado",               col: "Creado" },
  { key: "dpr",           label: "DPR",                  col: "DPR" },
  { key: "clasificacion", label: "Clasificación exacta", col: "Clasificacion_exacta" },
  { key: "preduca",       label: "Creación Pre-DUCA",    col: "Creacion_Pre_DUCA" },
  { key: "revision",      label: "Revisión Analista",    col: "Revision_Analista" },
  { key: "firma",         label: "Solicitar firma def.", col: "Solicitar_firma_def" },
];

export const HITO_LABEL: Record<HitoKey, string> =
  Object.fromEntries(HITOS.map((h) => [h.key, h.label])) as Record<HitoKey, string>;

// ── Etapas (cadena secuencial) ───────────────────────────────────────────
// La columna Revision_Analista partió la antigua T4 (Pre-DUCA → Firma) en dos
// tramos, así que la cadena pasó de 4 etapas a 5. La Revisión va DESPUÉS de la
// Pre-DUCA: así lo confirma el negocio y así lo registran los timestamps
// (Revisión posterior a Pre-DUCA en el 99.9% de los expedientes).
export type EtapaKey = "t1" | "t2" | "t3" | "t4" | "t5";

export const ETAPAS: { key: EtapaKey; label: string; corto: string; desde: HitoKey; hasta: HitoKey; color: string }[] = [
  { key: "t1", label: "Creado → DPR",                   corto: "T1", desde: "creado",        hasta: "dpr",           color: "var(--etapa-1)" },
  { key: "t2", label: "DPR → Clasificación",            corto: "T2", desde: "dpr",           hasta: "clasificacion", color: "var(--etapa-2)" },
  { key: "t3", label: "Clasificación → Pre-DUCA",       corto: "T3", desde: "clasificacion", hasta: "preduca",       color: "var(--etapa-3)" },
  { key: "t4", label: "Pre-DUCA → Revisión",            corto: "T4", desde: "preduca",       hasta: "revision",      color: "var(--etapa-4)" },
  { key: "t5", label: "Revisión → Solicitar firma",     corto: "T5", desde: "revision",      hasta: "firma",         color: "var(--etapa-5)" },
];

export const ETAPA_KEYS: EtapaKey[] = ETAPAS.map((e) => e.key);

// ── Ejecutores automatizados ─────────────────────────────────────────────
// Cuentan en volúmenes pero quedan fuera de cualquier conteo de personal.
// Heurística por TOKEN (no substring) para no marcar a "BOTELLO" por contener
// "BOT" ni a "GARCIA" por contener "IA". Lista configurable.
export const TOKENS_AUTOMATIZADOS = ["OCR", "IA", "BOT", "RPA", "API", "ROBOT", "SISTEMA"];
export const PREFIJOS_AUTOMATIZADOS = ["AUTOMAT"];

export function esAutomatizado(
  nombre: string,
  tokens: string[] = TOKENS_AUTOMATIZADOS,
  prefijos: string[] = PREFIJOS_AUTOMATIZADOS,
): boolean {
  const partes = norm(nombre).toUpperCase().split(/[^A-ZÑ0-9]+/).filter(Boolean);
  if (partes.some((p) => tokens.includes(p))) return true;
  return partes.some((p) => prefijos.some((pre) => p.startsWith(pre)));
}

// ── Mesas ────────────────────────────────────────────────────────────────
export const SIN_MESA = "(sin mesa)";
export const SIN_DATO = "(sin dato)";

/** Orden natural: "Mesa 10" después de "Mesa 9". Sin mesa va al final. */
export function ordenarMesas(mesas: string[]): string[] {
  return [...mesas].sort((a, b) => {
    if (a === SIN_MESA) return 1;
    if (b === SIN_MESA) return -1;
    const na = a.match(/\d+/), nb = b.match(/\d+/);
    const ma = /^mesa/i.test(a), mb = /^mesa/i.test(b);
    if (ma && mb && na && nb) return +na[0] - +nb[0] || a.localeCompare(b, "es");
    if (ma !== mb) return ma ? -1 : 1;
    return a.localeCompare(b, "es");
  });
}

// ── Parseo ───────────────────────────────────────────────────────────────
/** "2026-01-05T08:40:26" o "2026-01-05 08:40:26" → Date local. */
export function parseFecha(s: unknown): Date | null {
  const raw = String(s ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return isNaN(d.getTime()) ? null : d;
}

export const mesDe = (d: Date | null): string =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "";

export const diaDe = (d: Date | null): string =>
  d ? `${mesDe(d)}-${String(d.getDate()).padStart(2, "0")}` : "";

const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function etiquetaMes(clave: string): string {
  const [a, m] = clave.split("-");
  return `${MESES_ES[+m - 1] ?? m} ${a?.slice(2) ?? ""}`;
}
export function etiquetaDia(clave: string): string {
  const [, m, d] = clave.split("-");
  return `${d} ${MESES_ES[+m - 1] ?? m}`;
}

// ── Expediente ───────────────────────────────────────────────────────────
export interface Expediente {
  file: string;
  creado: Date | null;
  mes: string;
  /** Dimensiones multivaluadas: un c807_file repetido conserva TODOS sus valores. */
  procesos: string[];
  clientes: string[];
  usuarios: string[];
  analistas: string[];
  embarques: string[];
  documentos: string[];
  mesas: string[];
  ducafast: boolean;
  hitos: Partial<Record<HitoKey, Date>>;
  /**
   * Digitalización, tal como viene de la hoja. Se toma UNA vez por expediente,
   * no se suma entre sus filas: un c807_file repetido trae el mismo valor en
   * todas (verificado sobre los 3,109 duplicados reales, cero discrepancias),
   * así que sumarlas contaría licencias que no existen.
   */
  docs: number;
  paginas: number;
  licencias: number;
  /** Costo de las licencias, de la hoja. Es independiente del costo por horas. */
  costoLicencias: number;
  /** Segundos hábiles por etapa; ausente si falta alguno de sus dos hitos. */
  etapas: Partial<Record<EtapaKey, number>>;
  /** Suma de todas las etapas. null si el expediente no recorrió el ciclo completo. */
  total: number | null;
}

const add = (set: Set<string>, v: unknown, vacio = SIN_DATO) => {
  const s = String(v ?? "").trim();
  set.add(s || vacio);
};

/** Número de la hoja; 0 si viene vacío o no numérico. */
const num = (v: unknown): number => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * Agrupa las filas del origen en expedientes y calcula sus tiempos.
 *
 * · Un c807_file repetido se fusiona en UN expediente que conserva todos los
 *   valores de cada dimensión (regla: el filtro lo incluye si alguno coincide).
 * · Ante fechas distintas para el mismo hito, vale la más TEMPRANA.
 * · Un expediente sin el hito de una etapa no entra en el cálculo de ESA etapa.
 * · El Total se calcula POR EXPEDIENTE y solo si recorrió todas las etapas.
 */
export function construirExpedientes(rows: RoiRow[]): Expediente[] {
  const porFile = new Map<string, RoiRow[]>();
  for (const r of rows) {
    const f = String(r.c807_file ?? "").trim();
    if (!f) continue;
    const arr = porFile.get(f);
    if (arr) arr.push(r); else porFile.set(f, [r]);
  }

  const out: Expediente[] = [];
  for (const [file, filas] of porFile) {
    const procesos = new Set<string>(), clientes = new Set<string>();
    const usuarios = new Set<string>(), analistas = new Set<string>();
    const embarques = new Set<string>(), documentos = new Set<string>();
    const mesas = new Set<string>();
    const hitos: Partial<Record<HitoKey, Date>> = {};
    let ducafast = false;
    let docs = 0, paginas = 0, licencias = 0, costoLicencias = 0;

    for (const r of filas) {
      // Máximo, no suma: las filas repetidas traen el mismo valor y sumarlas
      // inventaría licencias. El máximo además es idempotente si algún día
      // difirieran.
      docs = Math.max(docs, num(r["Documents Count"]));
      paginas = Math.max(paginas, num(r["Pages Count"]));
      licencias = Math.max(licencias, num(r.Licencias));
      costoLicencias = Math.max(costoLicencias, num(r.Costo));

      add(procesos, r.Proceso); add(clientes, r.Cliente);
      add(usuarios, r.Usuario); add(analistas, r.Analista);
      add(embarques, r.Embarque); add(documentos, r.Documento);
      add(mesas, r.Mesa, SIN_MESA);

      const dc = norm(r.Docalpha);
      if (dc.includes("ducafast") && !dc.startsWith("no ")) ducafast = true;

      for (const h of HITOS) {
        const d = parseFecha(r[h.col]);
        if (!d) continue;
        const prev = hitos[h.key];
        if (!prev || d.getTime() < prev.getTime()) hitos[h.key] = d;
      }
    }

    const etapas: Partial<Record<EtapaKey, number>> = {};
    for (const e of ETAPAS) {
      const a = hitos[e.desde], b = hitos[e.hasta];
      if (a && b) etapas[e.key] = segundosHabiles(a, b);
    }
    const completo = ETAPA_KEYS.every((k) => etapas[k] != null);

    out.push({
      file,
      creado: hitos.creado ?? null,
      mes: mesDe(hitos.creado ?? null),
      procesos: [...procesos].sort(),
      clientes: [...clientes].sort(),
      usuarios: [...usuarios].sort(),
      analistas: [...analistas].sort(),
      embarques: [...embarques].sort(),
      documentos: [...documentos].sort(),
      mesas: ordenarMesas([...mesas]),
      ducafast,
      hitos,
      docs, paginas, licencias, costoLicencias,
      etapas,
      total: completo ? ETAPA_KEYS.reduce((s, k) => s + (etapas[k] as number), 0) : null,
    });
  }
  return out;
}

// ── Métricas ─────────────────────────────────────────────────────────────
export type Metrica = "mediana" | "promedio" | "p90";

export const METRICA_LABEL: Record<Metrica, string> = {
  mediana: "Mediana", promedio: "Promedio", p90: "P90",
};

export function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function promedio(v: number[]): number | null {
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

/** Percentil 90 por nearest-rank. */
export function percentil90(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)];
}

export function aplicarMetrica(v: number[], m: Metrica): number | null {
  return m === "mediana" ? mediana(v) : m === "promedio" ? promedio(v) : percentil90(v);
}

// ── Indicadores ──────────────────────────────────────────────────────────
export interface Indicador {
  key: EtapaKey | "total";
  label: string;
  corto: string;
  valor: number | null;
  n: number;
  cobertura: number;
}

export function valoresEtapa(exps: Expediente[], key: EtapaKey | "total"): number[] {
  const out: number[] = [];
  for (const e of exps) {
    const v = key === "total" ? e.total : e.etapas[key];
    if (v != null) out.push(v);
  }
  return out;
}

export function calcularIndicadores(exps: Expediente[], metrica: Metrica): Indicador[] {
  const den = exps.length || 1;
  const filas: Indicador[] = ETAPAS.map((e) => {
    const v = valoresEtapa(exps, e.key);
    return { key: e.key, label: e.label, corto: e.corto, valor: aplicarMetrica(v, metrica), n: v.length, cobertura: v.length / den };
  });
  const vt = valoresEtapa(exps, "total");
  filas.push({
    key: "total", label: "Total · ciclo completo", corto: "Total",
    valor: aplicarMetrica(vt, metrica), n: vt.length, cobertura: vt.length / den,
  });
  return filas;
}

// ── Composición del ciclo (barra apilada) ────────────────────────────────
export interface SegmentoCiclo {
  key: EtapaKey;
  label: string;
  corto: string;
  color: string;
  /** Cuota real del ciclo, del tiempo AGREGADO de la etapa. Los pct suman 100. */
  pct: number;
  /** Tramo del total que representa esta etapa: pct aplicado a `total`.
   *  Los `aporte` de todos los segmentos suman exactamente `total`. */
  aporte: number;
  /** Métrica de la etapa por sí sola (informativo, NO es lo que dibuja la barra). */
  valor: number | null;
}

/**
 * Tramos con nombre propio dentro del ciclo, para marcarlos sobre la barra.
 * Ducafast va de Creado a Creación Pre-DUCA: es la parte de armar la DUCA.
 */
export const GRUPOS_ETAPAS: { key: string; label: string; etapas: EtapaKey[] }[] = [
  { key: "ducafast", label: "Ducafast", etapas: ["t1", "t2", "t3"] },
];

export interface GrupoCiclo {
  key: string;
  label: string;
  etapas: EtapaKey[];
  /** Posición del tramo sobre la barra, en % del ancho total. */
  desdePct: number;
  anchoPct: number;
  /** Cuota del ciclo y tramo de tiempo — misma base que los segmentos, así cuadran. */
  pct: number;
  aporte: number;
  /**
   * Métrica REAL del tramo por expediente (mediana de T1+T2+T3, no suma de
   * medianas). Es la respuesta a «cuánto tarda Ducafast», y no coincide con
   * `aporte` por la misma razón de siempre: la mediana de una suma no es la
   * suma de las medianas.
   */
  valor: number | null;
}

export interface Composicion {
  /** Expedientes con el ciclo completo — única base donde la composición cuadra. */
  n: number;
  cobertura: number;
  /** Métrica del Total calculada POR EXPEDIENTE: el número grande de la barra. */
  total: number | null;
  segmentos: SegmentoCiclo[];
  /** Tramos con nombre (Ducafast) para anotarlos sobre la barra. */
  grupos: GrupoCiclo[];
}

/**
 * Descompone el ciclo en la cuota de cada etapa, para la barra apilada.
 *
 * Dos decisiones que evitan que la barra mienta:
 *
 * 1. Se calcula SOLO sobre los expedientes que recorrieron TODAS las etapas. Si
 *    cada etapa se midiera sobre su propio subconjunto, las cuotas no sumarían 100.
 *
 * 2. Las proporciones salen del tiempo AGREGADO de cada etapa, no de aplicar la
 *    métrica a cada una por separado. Con las medianas reales, la suma de los
 *    segmentos daba 01:10 contra un ciclo real de 03:02 (la regla #3 otra vez):
 *    dibujar eso daría una barra que no representa el total que la encabeza.
 *    Con el agregado, `aporte` reparte el total exacto entre las etapas.
 */
export function composicionCiclo(exps: Expediente[], metrica: Metrica): Composicion {
  const completos = exps.filter((e) => e.total != null);
  const den = exps.length || 1;
  const total = aplicarMetrica(completos.map((e) => e.total as number), metrica);

  // Tiempo agregado por etapa sobre la base común → cuotas que suman 100.
  const sumas = ETAPAS.map((e) => completos.reduce((s, x) => s + (x.etapas[e.key] as number), 0));
  const sumaTotal = sumas.reduce((s, x) => s + x, 0);

  const segmentos: SegmentoCiclo[] = ETAPAS.map((e, i) => {
    const pct = sumaTotal > 0 ? (sumas[i] / sumaTotal) * 100 : 0;
    return {
      key: e.key, label: e.label, corto: e.corto, color: e.color,
      pct,
      aporte: total != null ? (pct / 100) * total : 0,
      valor: aplicarMetrica(completos.map((x) => x.etapas[e.key] as number), metrica),
    };
  });

  // Tramos con nombre: se posicionan sumando las cuotas de sus etapas.
  const grupos: GrupoCiclo[] = GRUPOS_ETAPAS.map((g) => {
    const idx = g.etapas.map((k) => ETAPA_KEYS.indexOf(k)).filter((i) => i >= 0).sort((a, b) => a - b);
    const desdePct = segmentos.slice(0, idx[0] ?? 0).reduce((s, x) => s + x.pct, 0);
    const propios = idx.map((i) => segmentos[i]);
    const pct = propios.reduce((s, x) => s + x.pct, 0);
    return {
      key: g.key, label: g.label, etapas: g.etapas,
      desdePct, anchoPct: pct, pct,
      aporte: propios.reduce((s, x) => s + x.aporte, 0),
      valor: aplicarMetrica(
        completos.map((e) => g.etapas.reduce((s, k) => s + (e.etapas[k] as number), 0)),
        metrica,
      ),
    };
  });

  return { n: completos.length, cobertura: completos.length / den, total, segmentos, grupos };
}

// ── Costo unitario, plantilla necesaria y proyección ─────────────────────

/** Objetivo de ocupación para dimensionar la plantilla. */
export const UTILIZACION_OBJETIVO = 0.95;

export interface PuntoProyectado extends PuntoCosto {
  /** Estimado en vez de medido. */
  estimado: boolean;
  /** El mes en curso, completado a partir de lo que lleva transcurrido. */
  parcial: boolean;
  costoPorExpediente: number;
}

export interface Unitario {
  /** Expedientes trabajados: los que tienen algo medido. */
  expedientes: number;
  costoOperativo: number;
  costoLicencias: number;
  costoTotal: number;
  /** Lo que cuesta un expediente, todo incluido. */
  porExpediente: number;
  operativoPorExpediente: number;
  licenciasPorExpediente: number;
  /** Horas de reloj por expediente. */
  horasPorExpediente: number;
  /** Personas que harían el mismo trabajo ocupadas al UTILIZACION_OBJETIVO. */
  personasNecesarias: number;
  /** Plantilla que aparece hoy en el recorte. */
  personasActuales: number;
  /** Horas que daría una persona al objetivo, en la ventana. */
  horasPorPersonaObjetivo: number;
}

export function costoUnitario(c: Costo): Unitario {
  const expedientes = c.n;
  const horasPorPersonaObjetivo = c.ventana.horas * UTILIZACION_OBJETIVO;
  return {
    expedientes,
    costoOperativo: c.costo,
    costoLicencias: c.licencias.costo,
    costoTotal: c.costoTotal,
    porExpediente: expedientes > 0 ? c.costoTotal / expedientes : 0,
    operativoPorExpediente: expedientes > 0 ? c.costo / expedientes : 0,
    licenciasPorExpediente: expedientes > 0 ? c.licencias.costo / expedientes : 0,
    horasPorExpediente: expedientes > 0 ? c.horas / expedientes : 0,
    personasNecesarias: horasPorPersonaObjetivo > 0 ? c.horas / horasPorPersonaObjetivo : 0,
    personasActuales: c.personas.length,
    horasPorPersonaObjetivo,
  };
}

/** Horas hábiles de un mes completo, para saber cuánto lleva transcurrido. */
function horasDelMes(anio: number, mes: number): number {
  const ini = new Date(anio, mes, 1);
  const fin = new Date(anio, mes + 1, 1);
  return segundosHabiles(ini, fin) / 3600;
}

/**
 * Completa el mes en curso y proyecta los que faltan del año.
 *
 * Método, a propósito simple y explicable: se promedian los últimos `mesesBase`
 * meses COMPLETOS y ese promedio se repite hacia adelante. El mes en curso no
 * entra en la base — está a medias — y se completa por regla de tres sobre las
 * horas hábiles que lleva transcurridas.
 *
 * No se extrapola tendencia: con 20 meses de historia y una caída fuerte de
 * tiempos, una recta daría números que se sienten precisos y no lo son. Un
 * promedio reciente es más honesto y se entiende sin explicación.
 */
export function proyectarAnio(
  serie: PuntoCosto[],
  referencia: Date,
  mesesBase = 3,
): PuntoProyectado[] {
  const conCosto = (p: PuntoCosto, estimado: boolean, parcial: boolean): PuntoProyectado => ({
    ...p, estimado, parcial,
    costoPorExpediente: p.volumen > 0 ? p.costo / p.volumen : 0,
  });

  if (serie.length === 0) return [];

  const anio = referencia.getFullYear();
  const mesActual = `${anio}-${String(referencia.getMonth() + 1).padStart(2, "0")}`;

  // Lo medido, marcando como parcial el mes al que pertenece la referencia.
  const out: PuntoProyectado[] = serie.map((p) => conCosto(p, false, p.clave === mesActual));

  // Base: los últimos meses completos. Se calcula ANTES de tocar el parcial,
  // para que el mes a medias no se contamine a sí mismo.
  const base = out.filter((p) => !p.parcial).slice(-mesesBase);
  if (base.length === 0) return out;
  const prom = (f: (p: PuntoProyectado) => number) => base.reduce((s, p) => s + f(p), 0) / base.length;
  const vol = prom((p) => p.volumen), hrs = prom((p) => p.horas), cst = prom((p) => p.costo);
  const costoPorExpBase = vol > 0 ? cst / vol : 0;
  const horasPorExpBase = vol > 0 ? hrs / vol : 0;

  // El mes en curso se completa por lo que lleva transcurrido.
  //
  // El VOLUMEN se escala por el tiempo corrido — los expedientes se crean a un
  // ritmo parejo. El COSTO no: los expedientes recién creados todavía no
  // terminan su ciclo, así que su tiempo medido está truncado y escalarlo solo
  // multiplicaría el sesgo (agosto salía a $8 por expediente contra $12 de
  // julio, no por mejorar sino por estar a medias). Se estima con el costo
  // unitario de los meses completos, que sí tienen el ciclo cerrado.
  const idx = out.findIndex((p) => p.clave === mesActual);
  if (idx >= 0) {
    const total = horasDelMes(anio, referencia.getMonth());
    const corridas = segundosHabiles(new Date(anio, referencia.getMonth(), 1), referencia) / 3600;
    const factor = corridas > 0 ? total / corridas : 1;
    if (factor > 1) {
      const p = out[idx];
      const volumen = Math.round(p.volumen * factor);
      out[idx] = conCosto(
        { ...p, volumen, horas: volumen * horasPorExpBase, costo: volumen * costoPorExpBase },
        true, true,
      );
    }
  }

  // Los meses que faltan del año de la referencia.
  for (let m = referencia.getMonth() + 1; m < 12; m++) {
    const clave = `${anio}-${String(m + 1).padStart(2, "0")}`;
    if (out.some((p) => p.clave === clave)) continue;
    out.push(conCosto(
      { clave, label: etiquetaMes(clave), volumen: Math.round(vol), horas: hrs, costo: cst },
      true, false,
    ));
  }

  return out.sort((a, b) => a.clave.localeCompare(b.clave));
}

// ── Filtros ──────────────────────────────────────────────────────────────
export interface Filtros {
  meses: string[];
  usuarios: string[];
  analistas: string[];
  clientes: string[];
  mesas: string[];
  procesos: string[];
  documentos: string[];
  embarques: string[];
  ducafast: "todos" | "si" | "no";
  metrica: Metrica;
}

export const FILTROS_VACIOS: Filtros = {
  meses: [], usuarios: [], analistas: [], clientes: [], mesas: [],
  procesos: [], documentos: [], embarques: [], ducafast: "todos", metrica: "mediana",
};

export const hayFiltros = (f: Filtros): boolean =>
  f.meses.length > 0 || f.usuarios.length > 0 || f.analistas.length > 0 ||
  f.clientes.length > 0 || f.mesas.length > 0 || f.procesos.length > 0 ||
  f.documentos.length > 0 || f.embarques.length > 0 || f.ducafast !== "todos";

/** Un expediente pasa si ALGUNO de sus valores coincide (dimensiones multivaluadas). */
const coincide = (valores: string[], sel: Set<string>) => sel.size === 0 || valores.some((v) => sel.has(v));

export function filtrarExpedientes(exps: Expediente[], f: Filtros): Expediente[] {
  const meses = new Set(f.meses), usuarios = new Set(f.usuarios), analistas = new Set(f.analistas);
  const clientes = new Set(f.clientes), mesas = new Set(f.mesas), procesos = new Set(f.procesos);
  const documentos = new Set(f.documentos), embarques = new Set(f.embarques);

  return exps.filter((e) => {
    if (meses.size && !meses.has(e.mes)) return false;
    if (f.ducafast === "si" && !e.ducafast) return false;
    if (f.ducafast === "no" && e.ducafast) return false;
    return coincide(e.usuarios, usuarios) && coincide(e.analistas, analistas)
      && coincide(e.clientes, clientes) && coincide(e.mesas, mesas)
      && coincide(e.procesos, procesos) && coincide(e.documentos, documentos)
      && coincide(e.embarques, embarques);
  });
}

// ── Agregación por dimensión ─────────────────────────────────────────────
export interface FilaAgregada {
  clave: string;
  label: string;
  volumen: number;
  tiempos: Record<EtapaKey | "total", number | null>;
  personas: number;
  automatizados: number;
  /** Solo en tablas de persona: expedientes que hizo de punta a punta. */
  cicloCompleto?: number;
}

function tiemposDe(exps: Expediente[], metrica: Metrica): Record<EtapaKey | "total", number | null> {
  const out = {} as Record<EtapaKey | "total", number | null>;
  for (const k of ETAPA_KEYS) out[k] = aplicarMetrica(valoresEtapa(exps, k), metrica);
  out.total = aplicarMetrica(valoresEtapa(exps, "total"), metrica);
  return out;
}

/** Agrupa por una dimensión multivaluada: el expediente cuenta en cada grupo. */
export function agruparPor(
  exps: Expediente[],
  claves: (e: Expediente) => string[],
  metrica: Metrica,
  personasDe: (e: Expediente) => string[] = (e) => e.analistas,
): FilaAgregada[] {
  const grupos = new Map<string, Expediente[]>();
  for (const e of exps) {
    for (const c of claves(e)) {
      const arr = grupos.get(c);
      if (arr) arr.push(e); else grupos.set(c, [e]);
    }
  }
  return [...grupos.entries()].map(([clave, lista]) => {
    const humanos = new Set<string>(), bots = new Set<string>();
    for (const e of lista) {
      for (const p of personasDe(e)) {
        if (p === SIN_DATO) continue;
        (esAutomatizado(p) ? bots : humanos).add(p);
      }
    }
    return {
      clave, label: clave, volumen: lista.length,
      tiempos: tiemposDe(lista, metrica),
      personas: humanos.size, automatizados: bots.size,
    };
  }).sort((a, b) => b.volumen - a.volumen || a.label.localeCompare(b.label, "es"));
}

// ── Atribución de tiempo a las personas ──────────────────────────────────
// Regla de negocio: el trámite se reparte en dos tramos con dueños distintos.
//
//   · El USUARIO responde por lo que pasa hasta la Revisión (T1–T4).
//   · El ANALISTA responde solo por la revisión, de Revisión a Solicitar firma (T5).
//   · Si el Usuario y el Analista son la MISMA persona, esa persona hizo el
//     trámite de punta a punta y carga el ciclo completo.
//
// Sin esto, ambas dimensiones cargaban el ciclo entero y un analista que solo
// revisa aparecía con cientos de horas: casi todas eran espera anterior a que
// él tocara el expediente.
//
// Los datos respaldan el reparto: de los 11,366 expedientes sin Usuario,
// NINGUNO tiene las etapas T1–T4 completas; de los 715 sin Analista, ninguno
// tiene T5. O sea que la regla no deja tiempo medido sin dueño.

/** Etapas hasta la Revisión del analista — responsabilidad del Usuario. */
export const ETAPAS_PREVIAS: EtapaKey[] = ["t1", "t2", "t3", "t4"];
/** Revisión → Solicitar firma — responsabilidad del Analista. */
export const ETAPAS_REVISION: EtapaKey[] = ["t5"];

export type Rol = "usuario" | "analista";

export const personasDelRol = (e: Expediente, rol: Rol): string[] =>
  rol === "usuario" ? e.usuarios : e.analistas;

const NORM_SIN_DATO = norm(SIN_DATO);
const reales = (v: string[]) => v.map(norm).filter((x) => x !== NORM_SIN_DATO);

/**
 * ¿Usuario y Analista son la misma persona?
 *
 * Se compara normalizado (sin acentos ni mayúsculas) por seguridad, aunque en el
 * origen actual no hay variantes de escritura: los 171 nombres tienen una sola
 * forma cruda cada uno. Un expediente sin Usuario o sin Analista no es "mismo".
 */
export function mismaPersona(e: Expediente): boolean {
  const us = reales(e.usuarios), as = reales(e.analistas);
  if (!us.length || !as.length) return false;
  return us.length === as.length && us.every((u) => as.includes(u));
}

/** Etapas que carga una persona en este expediente, según su rol. */
export function etapasAtribuidas(e: Expediente, rol: Rol): EtapaKey[] {
  if (mismaPersona(e)) return ETAPA_KEYS;
  return rol === "usuario" ? ETAPAS_PREVIAS : ETAPAS_REVISION;
}

/** Tiempo que carga una persona en este expediente. null si le falta una etapa suya. */
export function tiempoAtribuido(e: Expediente, rol: Rol): number | null {
  let s = 0;
  for (const k of etapasAtribuidas(e, rol)) {
    const v = e.etapas[k];
    if (v == null) return null;
    s += v;
  }
  return s;
}

/**
 * Agrupa por persona atribuyendo solo el tiempo del que esa persona responde.
 *
 * Las etapas fuera de su alcance quedan en null (la tabla las muestra como «—»),
 * no en cero: no es que tardara nada, es que ese tramo no era suyo.
 */
export function agruparPorPersona(exps: Expediente[], rol: Rol, metrica: Metrica): FilaAgregada[] {
  const grupos = new Map<string, Expediente[]>();
  for (const e of exps) {
    for (const p of personasDelRol(e, rol)) {
      const arr = grupos.get(p);
      if (arr) arr.push(e); else grupos.set(p, [e]);
    }
  }

  return [...grupos.entries()].map(([clave, lista]) => {
    const tiempos = {} as Record<EtapaKey | "total", number | null>;
    for (const k of ETAPA_KEYS) {
      const v: number[] = [];
      for (const e of lista) {
        if (!etapasAtribuidas(e, rol).includes(k)) continue; // no es suya
        const s = e.etapas[k];
        if (s != null) v.push(s);
      }
      tiempos[k] = aplicarMetrica(v, metrica);
    }
    const totales: number[] = [];
    for (const e of lista) {
      const t = tiempoAtribuido(e, rol);
      if (t != null) totales.push(t);
    }
    tiempos.total = aplicarMetrica(totales, metrica);

    // Cuántos de sus expedientes hizo de punta a punta.
    const cicloCompleto = lista.filter((e) => mismaPersona(e)).length;

    return {
      clave, label: clave, volumen: lista.length, tiempos,
      personas: esAutomatizado(clave) || clave === SIN_DATO ? 0 : 1,
      automatizados: esAutomatizado(clave) ? 1 : 0,
      cicloCompleto,
    };
  }).sort((a, b) => b.volumen - a.volumen || a.label.localeCompare(b.label, "es"));
}

// ── Cobertura por hito ───────────────────────────────────────────────────
export interface FilaHito {
  key: HitoKey;
  label: string;
  expedientes: number;
  cobertura: number;
}

/** Cuántos expedientes alcanzaron cada hito. Sustituye a «Por acción»: el
 *  formato ancho ya no trae quién ejecutó cada uno. */
export function coberturaHitos(exps: Expediente[]): FilaHito[] {
  const den = exps.length || 1;
  return HITOS.map(({ key, label }) => {
    const n = exps.reduce((s, e) => s + (e.hitos[key] ? 1 : 0), 0);
    return { key, label, expedientes: n, cobertura: n / den };
  });
}

// ── Series de tiempo ─────────────────────────────────────────────────────
export interface PuntoSerie {
  clave: string;
  label: string;
  volumen: number;
  valores: Record<EtapaKey | "total", number | null>;
}

export function serieTemporal(exps: Expediente[], metrica: Metrica, porDia: boolean): PuntoSerie[] {
  const grupos = new Map<string, Expediente[]>();
  for (const e of exps) {
    const k = porDia ? diaDe(e.creado) : e.mes;
    if (!k) continue;
    const arr = grupos.get(k);
    if (arr) arr.push(e); else grupos.set(k, [e]);
  }
  return [...grupos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, lista]) => ({
      clave,
      label: porDia ? etiquetaDia(clave) : etiquetaMes(clave),
      volumen: lista.length,
      valores: tiemposDe(lista, metrica),
    }));
}

// ── Carga y capacidad ────────────────────────────────────────────────────
// Las etapas miden TIEMPO TRANSCURRIDO, no horas trabajadas (ver aviso en la UI).
export const HORAS_SEMANA_PERSONA = 44;

export interface FilaCarga {
  clave: string;
  label: string;
  volumen: number;
  /** Plantilla REAL del periodo: personas distintas que aparecen en sus expedientes. */
  usuarios: number;
  analistas: number;
  /** Unión de ambas: una persona que hace los dos papeles cuenta una sola vez. */
  personas: number;
  /** Personas que en ese periodo actuaron como Usuario y como Analista. */
  ambos: number;
  /** Ejecutores automatizados del periodo — cuentan trámites, no plantilla. */
  automatizados: number;
  demandaHoras: number;
  demandaAjustada: number;
  capacidadHoras: number;
  horasPorPersona: number;
  expedientesPorPersona: number;
  personasNecesarias: number;
  difPersonas: number;
  difHoras: number;
  /** demandaAjustada ÷ capacidadHoras. >1 significa más reloj que jornada. */
  utilizacion: number;
  excede: boolean;
}

/**
 * Carga contra la plantilla REAL de cada periodo.
 *
 * La plantilla no se estima: se cuenta. Son las personas distintas (Usuario o
 * Analista, sin duplicar a quien hace ambos papeles) que aparecen en los
 * expedientes de ese periodo. Los ejecutores automatizados se reportan aparte,
 * porque tramitan pero no consumen jornada.
 *
 * La demanda usa TODO el tiempo medido, no solo los ciclos completos: cada hora
 * medida ocupó el calendario aunque al trámite le falte un hito.
 *
 * `utilizacion` por encima de 1 no es sobrecarga: es la prueba de que estas
 * horas son de reloj y no de trabajo. Con la plantilla real, los meses van de
 * 2× a 7× — ese múltiplo es justamente cuántos expedientes lleva en paralelo
 * una persona, y es lo que el control de `simultaneos` permite corregir.
 */
export function cargaYCapacidad(
  exps: Expediente[], simultaneos: number, porDia = false,
): FilaCarga[] {
  const div = Math.max(1, simultaneos);
  const grupos = new Map<string, Expediente[]>();
  for (const e of exps) {
    const k = porDia ? diaDe(e.creado) : e.mes;
    if (!k) continue;
    const arr = grupos.get(k);
    if (arr) arr.push(e); else grupos.set(k, [e]);
  }

  return [...grupos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, lista]) => {
      const us = new Set<string>(), an = new Set<string>(), bots = new Set<string>();
      for (const e of lista) {
        for (const p of e.usuarios) {
          if (p === SIN_DATO) continue;
          (esAutomatizado(p) ? bots : us).add(p);
        }
        for (const p of e.analistas) {
          if (p === SIN_DATO) continue;
          (esAutomatizado(p) ? bots : an).add(p);
        }
      }
      const personas = new Set([...us, ...an]).size;
      const ambos = [...us].filter((x) => an.has(x)).length;

      const demandaHoras = lista.reduce((s, e) => s + segundosMedidos(e), 0) / 3600;
      const demandaAjustada = demandaHoras / div;
      const semanas = porDia ? 1 / 5 : 52 / 12;
      const horasPorPersona = HORAS_SEMANA_PERSONA * semanas;
      const capacidadHoras = personas * horasPorPersona;
      const personasNecesarias = demandaAjustada / horasPorPersona;

      return {
        clave, label: porDia ? etiquetaDia(clave) : etiquetaMes(clave),
        volumen: lista.length,
        usuarios: us.size, analistas: an.size, personas, ambos, automatizados: bots.size,
        demandaHoras, demandaAjustada, capacidadHoras,
        horasPorPersona: personas > 0 ? demandaAjustada / personas : 0,
        expedientesPorPersona: personas > 0 ? lista.length / personas : 0,
        personasNecesarias,
        difPersonas: personasNecesarias - personas,
        difHoras: demandaAjustada - capacidadHoras,
        utilizacion: capacidadHoras > 0 ? demandaAjustada / capacidadHoras : 0,
        excede: capacidadHoras > 0 && demandaAjustada > capacidadHoras,
      };
    });
}

// ── Horas reales por persona (unión de intervalos) ───────────────────────
// Una persona que lleva 5 expedientes traslapados NO trabajó la suma de los 5:
// el reloj corrió una sola vez. Sumar por expediente cuenta la misma hora tantas
// veces como trámites abiertos hubiera.
//
// Medido sobre los datos reales: la suma infla 7.16× las horas de reloj
// (933,432 h contra 130,420 h). La prueba de que la unión es lo correcto es
// física: la ventana completa tiene 3,647 horas hábiles y con la unión NADIE la
// supera (el máximo queda en 3,645 h, el 100%). Con la suma había personas con
// 82,066 h en esa misma ventana, 22 veces lo posible.
//
// Esto sustituye al divisor de «expedientes simultáneos», que era una suposición
// a ojo: el traslape ahora se mide.

/** Tramo de reloj en milisegundos. */
export interface Intervalo { inicio: number; fin: number }

/**
 * Ventana de reloj de la que responde una persona en un expediente, según la
 * regla de atribución: el Usuario hasta la Revisión, el Analista de la Revisión
 * a la Firma, y el ciclo entero si es la misma persona.
 */
export function intervaloAtribuido(e: Expediente, rol: Rol): Intervalo | null {
  const etapas = etapasAtribuidas(e, rol);
  const primera = ETAPAS.find((x) => x.key === etapas[0]);
  const ultima = ETAPAS.find((x) => x.key === etapas[etapas.length - 1]);
  if (!primera || !ultima) return null;

  const a = e.hitos[primera.desde], b = e.hitos[ultima.hasta];
  if (!a || !b) return null;
  const inicio = a.getTime(), fin = b.getTime();
  // Hitos fuera de orden: no hay ventana que contar.
  return fin > inicio ? { inicio, fin } : null;
}

/** Fusiona los tramos que se tocan o solapan. Devuelve bloques disjuntos. */
export function unirIntervalos(lista: Intervalo[]): Intervalo[] {
  const orden = [...lista].sort((a, b) => a.inicio - b.inicio);
  const out: Intervalo[] = [];
  for (const iv of orden) {
    const ultimo = out[out.length - 1];
    if (ultimo && iv.inicio <= ultimo.fin) {
      if (iv.fin > ultimo.fin) ultimo.fin = iv.fin;
    } else out.push({ ...iv });
  }
  return out;
}

/** Segundos hábiles cubiertos por la unión — cada instante cuenta una vez. */
export function segundosDeUnion(lista: Intervalo[]): number {
  return unirIntervalos(lista)
    .reduce((s, iv) => s + segundosHabiles(new Date(iv.inicio), new Date(iv.fin)), 0);
}

export interface FilaPersona {
  clave: string;
  label: string;
  expedientes: number;
  /** Suma por expediente: cuenta la misma hora una vez por trámite abierto. */
  horasSuma: number;
  /** Horas de reloj realmente ocupadas. Esta es la que cuesta dinero. */
  horasReales: number;
  /** horasSuma ÷ horasReales: expedientes en paralelo, medido. */
  traslape: number;
  /** Bloques disjuntos de trabajo tras unir. */
  bloques: number;
  costo: number;
  automatizado: boolean;
  /** Horas hábiles de la ventana: lo que esa persona pudo haber trabajado. */
  horasDisponibles: number;
  /** Lo que cuesta tenerla disponible toda la ventana. */
  costoDisponible: number;
  /** horasReales ÷ horasDisponibles. 1 = ocupada de punta a punta. */
  utilizacion: number;
  /** Diferencia en dinero entre la disponibilidad y lo usado. */
  costoSinUsar: number;
}

/** Ventana del recorte: de la primera actividad medida a la última. */
export interface Ventana {
  inicio: number;
  fin: number;
  /** Horas hábiles que caben en la ventana — el techo de una persona. */
  horas: number;
}

export function ventanaDe(exps: Expediente[]): Ventana {
  let min = Infinity, max = -Infinity;
  for (const e of exps) {
    for (const k of HITOS) {
      const d = e.hitos[k.key];
      if (!d) continue;
      const t = d.getTime();
      if (t < min) min = t;
      if (t > max) max = t;
    }
  }
  if (!isFinite(min) || !isFinite(max) || max <= min) return { inicio: 0, fin: 0, horas: 0 };
  return { inicio: min, fin: max, horas: segundosHabiles(new Date(min), new Date(max)) / 3600 };
}

/** Intervalos de cada persona, mezclando sus dos roles: es el mismo reloj. */
function intervalosPorPersona(exps: Expediente[]): Map<string, Intervalo[]> {
  const m = new Map<string, Intervalo[]>();
  const add = (p: string, iv: Intervalo | null) => {
    if (!iv || p === SIN_DATO) return;
    const l = m.get(p);
    if (l) l.push(iv); else m.set(p, [iv]);
  };
  for (const e of exps) {
    const mismo = mismaPersona(e);
    for (const u of e.usuarios) add(u, intervaloAtribuido(e, "usuario"));
    for (const a of e.analistas) {
      // Si es la misma persona ya se contó su ciclo completo como Usuario.
      if (mismo && e.usuarios.includes(a)) continue;
      add(a, intervaloAtribuido(e, "analista"));
    }
  }
  return m;
}

/**
 * Horas de reloj y costo por persona, con el traslape ya descontado.
 *
 * Se acompaña de la DISPONIBILIDAD: las horas hábiles que caben en la ventana
 * del recorte, iguales para todos. La diferencia entre lo disponible y lo usado,
 * en dinero, es el hueco entre tener a alguien y tenerlo ocupado.
 *
 * Ojo al leerlo: la ventana es la misma para todos, así que quien entró tarde o
 * salió antes aparece infrautilizado sin que eso signifique nada. El dato honesto
 * es comparativo entre personas presentes todo el periodo, no un juicio individual.
 */
export function costoPorPersona(
  exps: Expediente[],
  tarifa = TARIFA_HORA_DEFECTO,
  ventana?: Ventana,
): FilaPersona[] {
  const v = ventana ?? ventanaDe(exps);
  const costoDisponible = v.horas * tarifa;

  return [...intervalosPorPersona(exps).entries()]
    .map(([clave, lista]) => {
      const bloques = unirIntervalos(lista);
      const suma = lista.reduce((s, iv) => s + segundosHabiles(new Date(iv.inicio), new Date(iv.fin)), 0) / 3600;
      const reales = bloques.reduce((s, iv) => s + segundosHabiles(new Date(iv.inicio), new Date(iv.fin)), 0) / 3600;
      const costo = reales * tarifa;
      return {
        clave, label: clave,
        expedientes: lista.length,
        horasSuma: suma,
        horasReales: reales,
        traslape: reales > 0 ? suma / reales : 0,
        bloques: bloques.length,
        costo,
        automatizado: esAutomatizado(clave),
        horasDisponibles: v.horas,
        costoDisponible,
        utilizacion: v.horas > 0 ? reales / v.horas : 0,
        costoSinUsar: Math.max(0, costoDisponible - costo),
      };
    })
    .sort((a, b) => b.horasReales - a.horasReales);
}

// ── Costo del tiempo ─────────────────────────────────────────────────────
// Traduce a dinero el tiempo medido, a una tarifa por hora.
//
// LO QUE ESTE NÚMERO ES Y LO QUE NO ES
// Las etapas miden tiempo TRANSCURRIDO entre dos hitos, no horas trabajadas.
// El costo crudo (simultaneos = 1) responde a «cuánto vale el tiempo que estos
// trámites ocupan en el calendario», no a «cuánto se pagó en sueldos»: la mayor
// parte de T1 es expediente esperando en cola, no alguien trabajándolo.
//
// La escala lo deja claro: el tiempo medido equivale a ~262 personas a tiempo
// completo durante el periodo, cuando en el origen hay 120 personas distintas.
// Por eso `simultaneos` divide la demanda igual que en cargaYCapacidad: es el
// número de expedientes que una persona lleva a la vez, y con él el costo se
// acerca a horas de trabajo reales.

export const TARIFA_HORA_DEFECTO = 8; // USD

// ── Licencias de digitalización ──────────────────────────────────────────
// Costo que NO sale del reloj: viene ya calculado en la hoja, por expediente.
// Se suma aparte del costo por horas y luego se juntan, porque son cosas
// distintas — una es tiempo de personas, la otra es consumo de licencias.

export interface Licencias {
  /** Licencias usadas en el recorte. */
  total: number;
  /** Costo que trae la hoja para esas licencias. */
  costo: number;
  /** Expedientes que consumieron al menos una. */
  expedientes: number;
  /** Cobertura: expedientes con licencia sobre el total del recorte. */
  cobertura: number;
  /** costo ÷ total. En los datos actuales sale exacto a 1.10 USD. */
  precioUnitario: number;
  /** Promedio de licencias entre los expedientes que sí usaron. */
  porExpediente: number;
  docs: number;
  paginas: number;
}

export function contarLicencias(exps: Expediente[]): Licencias {
  let total = 0, costo = 0, expedientes = 0, docs = 0, paginas = 0;
  for (const e of exps) {
    total += e.licencias;
    costo += e.costoLicencias;
    docs += e.docs;
    paginas += e.paginas;
    if (e.licencias > 0) expedientes++;
  }
  return {
    total, costo, expedientes,
    cobertura: exps.length > 0 ? expedientes / exps.length : 0,
    precioUnitario: total > 0 ? costo / total : 0,
    porExpediente: expedientes > 0 ? total / expedientes : 0,
    docs, paginas,
  };
}

export interface PuntoCosto {
  clave: string;
  label: string;
  volumen: number;
  horas: number;
  costo: number;
}

export interface CostoEtapa {
  key: EtapaKey;
  label: string;
  corto: string;
  color: string;
  horas: number;
  costo: number;
  pct: number;
}

export interface Costo {
  /** Horas de reloj REALES: unión de intervalos por persona, sin doble conteo. */
  horas: number;
  /** Suma por expediente, para comparar. Cuenta la misma hora varias veces. */
  horasSuma: number;
  /** horasSuma ÷ horas: expedientes en paralelo, medido sobre los datos. */
  traslape: number;
  costo: number;
  /** Expedientes con al menos una etapa medida — la base del cálculo. */
  n: number;
  tarifa: number;
  personas: FilaPersona[];
  porEtapa: CostoEtapa[];
  serie: PuntoCosto[];
  /** Ventana del recorte: el techo de horas que cabe en el periodo. */
  ventana: Ventana;
  /** Digitalización, de la hoja — no del reloj. */
  licencias: Licencias;
  /** costo (horas) + licencias.costo: lo que suma todo el recorte. */
  costoTotal: number;
  /** Plantilla × horas de la ventana × tarifa: el costo de la disponibilidad. */
  costoDisponible: number;
  /** costoDisponible − costo: disponibilidad no ocupada, en dinero. */
  costoSinUsar: number;
  /** costo ÷ costoDisponible. */
  utilizacion: number;
}

/** Segundos medidos de un expediente, sumando todas las etapas que sí tienen dato. */
export function segundosMedidos(e: Expediente): number {
  let s = 0;
  for (const k of ETAPA_KEYS) s += e.etapas[k] ?? 0;
  return s;
}

/**
 * Costo del tiempo medido, por etapa y por periodo.
 *
 * Cuenta TODAS las etapas con dato, no solo los expedientes de ciclo completo:
 * cada hora medida ocupó el calendario, aunque al trámite le falte un hito. Con
 * solo los ciclos completos el total baja a unas dos terceras partes.
 */
export function costoTiempo(
  exps: Expediente[],
  tarifa = TARIFA_HORA_DEFECTO,
  porDia = false,
  incluirBots = false,
): Costo {
  const ventana = ventanaDe(exps);
  const personas = costoPorPersona(exps, tarifa, ventana)
    .filter((p) => incluirBots || !p.automatizado);

  const horas = personas.reduce((s, p) => s + p.horasReales, 0);
  const horasSuma = personas.reduce((s, p) => s + p.horasSuma, 0);
  // La disponibilidad total es la de la plantilla que aparece en el recorte.
  const costoDisponible = personas.length * ventana.horas * tarifa;

  // El reparto por etapa se queda en proporciones del tiempo transcurrido —
  // es lo único que puede decir dónde se va el reloj — pero el dinero que
  // muestra cada tramo se escala al costo REAL, para que sumen el total.
  const sumas = ETAPAS.map((e) => exps.reduce((s, x) => s + (x.etapas[e.key] ?? 0), 0));
  const sumaTotal = sumas.reduce((s, x) => s + x, 0);
  const porEtapa: CostoEtapa[] = ETAPAS.map((e, i) => {
    const pct = sumaTotal > 0 ? (sumas[i] / sumaTotal) * 100 : 0;
    return {
      key: e.key, label: e.label, corto: e.corto, color: e.color,
      pct,
      horas: (pct / 100) * horas,
      costo: (pct / 100) * horas * tarifa,
    };
  });

  // Serie: los intervalos se recortan al periodo antes de unirlos, así cada mes
  // recibe solo el reloj que le toca y los meses suman el total exacto.
  const intervalos = intervalosPorPersonaFiltrado(exps, incluirBots);
  const cubos = new Map<string, { porPersona: Map<string, Intervalo[]>; volumen: number }>();
  const cubo = (k: string) => {
    let c = cubos.get(k);
    if (!c) { c = { porPersona: new Map(), volumen: 0 }; cubos.set(k, c); }
    return c;
  };
  for (const e of exps) {
    const k = porDia ? diaDe(e.creado) : e.mes;
    if (k) cubo(k).volumen++;
  }
  for (const [persona, lista] of intervalos) {
    for (const iv of lista) {
      for (const trozo of recortarPorPeriodo(iv, porDia)) {
        const c = cubo(trozo.clave);
        const l = c.porPersona.get(persona);
        if (l) l.push(trozo.iv); else c.porPersona.set(persona, [trozo.iv]);
      }
    }
  }

  const serie: PuntoCosto[] = [...cubos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, c]) => {
      let seg = 0;
      for (const lista of c.porPersona.values()) seg += segundosDeUnion(lista);
      const h = seg / 3600;
      return {
        clave,
        label: porDia ? etiquetaDia(clave) : etiquetaMes(clave),
        volumen: c.volumen,
        horas: h,
        costo: h * tarifa,
      };
    });

  const costo = horas * tarifa;
  const licencias = contarLicencias(exps);
  return {
    horas, horasSuma,
    traslape: horas > 0 ? horasSuma / horas : 0,
    costo,
    n: exps.filter((e) => segundosMedidos(e) > 0).length,
    tarifa, personas, porEtapa, serie,
    ventana,
    costoDisponible,
    costoSinUsar: Math.max(0, costoDisponible - costo),
    utilizacion: costoDisponible > 0 ? costo / costoDisponible : 0,
    licencias,
    costoTotal: costo + licencias.costo,
  };
}

function intervalosPorPersonaFiltrado(exps: Expediente[], incluirBots: boolean): Map<string, Intervalo[]> {
  const m = intervalosPorPersona(exps);
  if (incluirBots) return m;
  for (const p of [...m.keys()]) if (esAutomatizado(p)) m.delete(p);
  return m;
}

/** Parte un intervalo por frontera de mes (o día) para poder repartirlo. */
function recortarPorPeriodo(iv: Intervalo, porDia: boolean): { clave: string; iv: Intervalo }[] {
  const out: { clave: string; iv: Intervalo }[] = [];
  let cursor = iv.inicio;
  let guarda = 0;
  while (cursor < iv.fin && guarda++ < 10_000) {
    const d = new Date(cursor);
    const siguiente = porDia
      ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
      : new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const fin = Math.min(siguiente, iv.fin);
    out.push({
      clave: porDia ? diaDe(d) : mesDe(d),
      iv: { inicio: cursor, fin },
    });
    cursor = fin;
  }
  return out;
}

/** Personas (no automatizadas) distintas en un recorte, por dimensión. */
export function contarPersonas(exps: Expediente[], de: (e: Expediente) => string[] = (e) => e.analistas): number {
  const s = new Set<string>();
  for (const e of exps) for (const p of de(e)) if (p !== SIN_DATO && !esAutomatizado(p)) s.add(p);
  return s.size;
}

// ── Opciones de filtro ───────────────────────────────────────────────────
export interface Opcion { value: string; label: string; count: number; automatizado?: boolean }

export interface OpcionesFiltro {
  meses: Opcion[]; usuarios: Opcion[]; analistas: Opcion[]; clientes: Opcion[];
  mesas: Opcion[]; procesos: Opcion[]; documentos: Opcion[]; embarques: Opcion[];
}

function contar(exps: Expediente[], get: (e: Expediente) => string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of exps) for (const v of get(e)) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

const porVolumen = (m: Map<string, number>, marcarBots = false): Opcion[] =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .map(([value, count]) => ({
      value, label: value, count,
      ...(marcarBots ? { automatizado: esAutomatizado(value) } : {}),
    }));

export function opcionesDeFiltro(exps: Expediente[]): OpcionesFiltro {
  const mesas = contar(exps, (e) => e.mesas);
  return {
    meses: [...contar(exps, (e) => [e.mes]).entries()]
      .filter(([v]) => v)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([value, count]) => ({ value, label: etiquetaMes(value), count })),
    usuarios: porVolumen(contar(exps, (e) => e.usuarios), true),
    analistas: porVolumen(contar(exps, (e) => e.analistas), true),
    clientes: porVolumen(contar(exps, (e) => e.clientes)),
    mesas: ordenarMesas([...mesas.keys()]).map((value) => ({ value, label: value, count: mesas.get(value) ?? 0 })),
    procesos: porVolumen(contar(exps, (e) => e.procesos)),
    documentos: porVolumen(contar(exps, (e) => e.documentos)),
    embarques: porVolumen(contar(exps, (e) => e.embarques)),
  };
}

// ── Exportación CSV ──────────────────────────────────────────────────────
const csvCampo = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const iso = (d: Date | null | undefined) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}` : "";

/** CSV del recorte filtrado: tiempos en hh:mm:ss y también en segundos. */
export function exportarCSV(exps: Expediente[]): string {
  const cab = [
    "c807_file", "Creado", "Mes", "Proceso", "Cliente", "Usuario", "Analista",
    "Embarque", "Documento", "Mesa", "Ducafast",
    ...HITOS.filter((h) => h.key !== "creado").map((h) => h.label),
    ...ETAPAS.flatMap((e) => [e.corto, `${e.corto}_seg`]),
    "Total", "Total_seg",
  ];
  const lineas = [cab.join(",")];
  for (const e of exps) {
    const fila: unknown[] = [
      e.file, iso(e.creado), e.mes,
      e.procesos.join(" | "), e.clientes.join(" | "), e.usuarios.join(" | "),
      e.analistas.join(" | "), e.embarques.join(" | "), e.documentos.join(" | "),
      e.mesas.join(" | "), e.ducafast ? "Ducafast" : "No Ducafast",
      ...HITOS.filter((h) => h.key !== "creado").map((h) => iso(e.hitos[h.key])),
    ];
    for (const et of ETAPAS) {
      const v = e.etapas[et.key];
      fila.push(v == null ? "" : fmtHHMMSS(v), v ?? "");
    }
    fila.push(e.total == null ? "" : fmtHHMMSS(e.total), e.total ?? "");
    lineas.push(fila.map(csvCampo).join(","));
  }
  return lineas.join("\n");
}

export { SEGUNDOS_SEMANA };
