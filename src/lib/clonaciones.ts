// src/lib/clonaciones.ts
// Dominio del reporte "Clonación de Files" (archivo "Clonacion files",
// pestaña "clonacion" — distinto al de la hoja ROI de 003).
// Módulo PURO (cliente + servidor). Reutiliza el horario hábil de
// src/lib/horario.ts (mismo horario que 003) pero es un dominio independiente
// de src/lib/tramites.ts a propósito — no comparte código con 003, para que un
// cambio en uno no pueda romper al otro.
//
// Una fila del origen = una clonación. Un mismo c807_file puede repetirse: no
// se agrupa ni se deduplica (ver apps-script/roi-clonacion-README.md).

import { segundosHabiles, fmtHHMMSS } from "@/lib/horario";
import type { ClonacionRow } from "@/types";

export const SIN_DATO = "(sin dato)";

export const norm = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * "MESA 3" / "mesa 3" → "Mesa 3". El origen escribe Mesa y Proceso con
 * capitalización dispar; sin unificar, "Mesa 2" y "MESA 2" se agruparían por
 * separado en filtros y rankings. Solo toca estas dos columnas — Usuario y
 * Cliente se dejan tal cual llegan (son nombres propios / razones sociales).
 */
export const tituloCase = (s: string): string =>
  s.trim().toLowerCase().replace(/(^|[\s/·-])([a-záéíóúñü])/gi, (_, sep, ch) => sep + ch.toUpperCase());

/**
 * El origen guarda "Comentario" con HTML ("a<br>b"). Se convierte a texto plano
 * con saltos de línea reales — el HTML crudo NUNCA se inyecta en la vista.
 */
export const limpiarComentario = (s: unknown): string =>
  String(s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * "Origen" de una clonación, deducido del comentario:
 *
 *  · Si el comentario empieza con "Creado como réplica del file <CODIGO>"
 *    (CODIGO con formato GT-AAAA-#####, dígitos variables) → devuelve
 *    "<CODIGO> - v"  si ese código aparece en la columna c807_file del set,
 *    "<CODIGO> - sv" si no aparece (padre no encontrado).
 *  · Cualquier otro comentario (o vacío) → "Padre".
 *
 * `filesExistentes` son los c807_file del origen ya normalizados (TRIM + MAYÚS).
 */
const RE_REPLICA = /^\s*creado como r[eé]plica del file\s+(GT-\d{4}-\d+)/i;

/** Código del file padre si el comentario declara una réplica; null si no. MAYÚS. */
export const codigoPadreDeComentario = (comentario: string): string | null => {
  const m = comentario.match(RE_REPLICA);
  return m ? m[1].toUpperCase() : null;
};

export function origenDeComentario(comentario: string, filesExistentes: Set<string>): string {
  const codigo = codigoPadreDeComentario(comentario);
  if (!codigo) return "Padre";
  return `${codigo} - ${filesExistentes.has(codigo) ? "v" : "sv"}`;
}

/**
 * Categoría interna del "Origen". Solo se muestra tal cual en la tabla de
 * Detalle; el resto del tablero usa el eje "herramienta" (ver más abajo).
 */
export type OrigenTipo = "v" | "sv" | "padre";

/** Deriva la categoría del string de `origen` (que ya la codifica). */
export const tipoDeOrigen = (origen: string): OrigenTipo =>
  origen === "Padre" ? "padre" : origen.endsWith(" - sv") ? "sv" : "v";

/**
 * Eje de análisis del tablero: "con" herramienta = réplicas verificadas (V);
 * "sin" herramienta = todo lo demás (Padre y SV). Es lo que filtra el
 * desplegable y lo que parte los KPIs, la línea de tiempo y el costo.
 */
export type Herramienta = "sin" | "con";
export const HERRAMIENTA_OPCIONES: Herramienta[] = ["sin", "con"];
export const HERRAMIENTA_LABEL: Record<Herramienta, string> = {
  sin: "Sin herramienta", con: "Con herramienta",
};
export const herramientaDe = (t: OrigenTipo): Herramienta => (t === "v" ? "con" : "sin");

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

const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export function etiquetaMes(clave: string): string {
  const [a, m] = clave.split("-");
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES_CORTO[i]} ${a}` : clave;
}

// ── Registro (una clonación) ────────────────────────────────────────────
export interface ClonacionRegistro {
  file: string;
  solicitud: Date | null;
  creacion: Date;
  usuario: string;
  cliente: string;
  /** Mesa de trabajo del origen (columna "Mesa"). Ojo: no confundir con `mes`
   *  (el periodo YYYY-MM). SIN_DATO cuando la celda viene vacía. */
  mesa: string;
  /** Proceso del origen (columna "Proceso"). SIN_DATO cuando viene vacía. */
  proceso: string;
  /** Comentario del origen, ya en texto plano (ver limpiarComentario). "" si vacío. */
  comentario: string;
  /** Deducido del comentario (ver origenDeComentario): "GT-AAAA-##### - v|sv" o "Padre". */
  origen: string;
  /** Categoría de `origen` para el filtro de la página. */
  origenTipo: OrigenTipo;
  /**
   * Fecha desde la que se mide el tiempo hábil (hasta `creacion`):
   *  · origen "v" → Creacion_fecha MÁS ANTIGUA del file padre en c807_file
   *    (si el padre no tiene fecha, cae a Solicitud_fecha).
   *  · origen "padre" / "sv" → Solicitud_fecha (tal cual).
   * null si no hay ninguna → la fila se conserva pero no es medible.
   * OJO: el costo (C6) y el filtro de antigüedad NO usan esto, siguen con
   * Solicitud_fecha → Creacion_fecha (trabajo real de la persona).
   */
  inicioMetrica: Date | null;
  /** "YYYY-MM" de Creacion_fecha — el filtro de Mes agrupa por aquí. */
  mes: string;
  /** D2: segundos hábiles entre `inicioMetrica` y Creacion_fecha. null si no hay
   *  inicio; 0 (no null) cuando la fila es anómala (inicio posterior a creación). */
  segHabiles: number | null;
  /** `inicioMetrica` posterior a Creacion_fecha. */
  anomalo: boolean;
  /** Días calendario entre Solicitud_fecha y Creacion_fecha (NO cambia con la
   *  métrica: lo usa el filtro "Antigüedad máx. de la solicitud"). */
  diasAntiguedad: number | null;
}

/**
 * Construye un registro por fila (sin agrupar ni deduplicar c807_file).
 *
 * Se descartan las filas sin Creacion_fecha: sin ella no hay mes al que
 * atribuir la clonación y todo el tablero (filtro de periodo, ventana de
 * costo) cuelga de ese agrupamiento. Es la única fecha que se exige — sin
 * Solicitud_fecha la fila se conserva, pero sus 4 columnas derivadas (D2)
 * quedan vacías, tal como pide la regla de la hoja.
 */
export function construirRegistros(rows: ClonacionRow[]): ClonacionRegistro[] {
  // Todos los c807_file del origen (incluidas filas que luego se descartan por
  // no tener Creacion_fecha) — para resolver el "Origen" de las réplicas.
  const filesExistentes = new Set(rows.map((r) => (r.c807_file || "").trim().toUpperCase()));

  // c807_file → Creacion_fecha MÁS ANTIGUA (un file puede repetirse). Es la
  // "fecha inicial" del tiempo hábil para las réplicas verificadas (origen "v").
  const creacionPadre = new Map<string, Date>();
  for (const r of rows) {
    const c = parseFecha(r.Creacion_fecha);
    if (!c) continue;
    const key = (r.c807_file || "").trim().toUpperCase();
    const prev = creacionPadre.get(key);
    if (!prev || c.getTime() < prev.getTime()) creacionPadre.set(key, c);
  }

  const out: ClonacionRegistro[] = [];
  for (const r of rows) {
    const creacion = parseFecha(r.Creacion_fecha);
    if (!creacion) continue;
    const solicitud = parseFecha(r.Solicitud_fecha);
    const diasAntiguedad = solicitud
      ? Math.round((creacion.getTime() - solicitud.getTime()) / 86_400_000)
      : null;
    const mesa = r.Mesa?.trim();
    const proceso = r.Proceso?.trim();
    const comentario = limpiarComentario(r.Comentario);
    const origen = origenDeComentario(comentario, filesExistentes);
    const origenTipo = tipoDeOrigen(origen);

    // Inicio del tiempo hábil: para "v", la creación más antigua del padre
    // (si el padre no tiene fecha, cae a Solicitud); para el resto, Solicitud.
    const codigoPadre = codigoPadreDeComentario(comentario);
    const inicioMetrica = origenTipo === "v" && codigoPadre
      ? creacionPadre.get(codigoPadre) ?? solicitud
      : solicitud;
    const segHabiles = inicioMetrica ? segundosHabiles(inicioMetrica, creacion) : null;
    const anomalo = inicioMetrica ? inicioMetrica.getTime() > creacion.getTime() : false;

    out.push({
      file: r.c807_file || "",
      solicitud, creacion,
      usuario: r.Usuario || SIN_DATO,
      cliente: r.Cliente || SIN_DATO,
      mesa: mesa ? tituloCase(mesa) : SIN_DATO,
      proceso: proceso ? tituloCase(proceso) : SIN_DATO,
      comentario,
      origen,
      origenTipo,
      inicioMetrica,
      mes: mesDe(creacion),
      segHabiles, anomalo, diasAntiguedad,
    });
  }
  return out;
}

/** D2 en minutos — el nombre de columna del origen es "Minutos_Habiles". */
export function minutosHabiles(seg: number | null): number | null {
  return seg == null ? null : Math.round(seg / 60);
}

// ── Métricas ─────────────────────────────────────────────────────────────
export type Metrica = "mediana" | "promedio" | "p90";
export const METRICA_LABEL: Record<Metrica, string> = { mediana: "Mediana", promedio: "Promedio", p90: "P90" };

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

/** Percentil 90 por nearest-rank — mismo método que usa 003. */
export function percentil90(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)];
}

export function aplicarMetrica(v: number[], m: Metrica): number | null {
  return m === "mediana" ? mediana(v) : m === "promedio" ? promedio(v) : percentil90(v);
}

// ── Distribución por rangos (C4 — también es un filtro) ───────────────────
export type RangoKey = "r1" | "r2" | "r3" | "r4" | "r5" | "r6" | "r7" | "r8";

export const RANGOS: { key: RangoKey; label: string; max: number }[] = [
  { key: "r1", label: "≤ 15 min", max: 15 * 60 },
  { key: "r2", label: "15–30 min", max: 30 * 60 },
  { key: "r3", label: "30–60 min", max: 60 * 60 },
  { key: "r4", label: "1–4 h", max: 4 * 3600 },
  { key: "r5", label: "4–9 h (≤ 1 jornada)", max: 9 * 3600 },
  { key: "r6", label: "9–18 h (1–2 jornadas)", max: 18 * 3600 },
  { key: "r7", label: "18–44 h (≤ 1 semana)", max: 44 * 3600 },
  { key: "r8", label: "> 44 h", max: Infinity },
];

export function rangoDe(segHabiles: number): RangoKey {
  for (const r of RANGOS) if (segHabiles <= r.max) return r.key;
  return "r8";
}

// ── Filtros ──────────────────────────────────────────────────────────────
export type AntiguedadMax = "sin_limite" | "365" | "90" | "30";
export const ANTIGUEDAD_LABEL: Record<AntiguedadMax, string> = {
  sin_limite: "Sin límite", "365": "1 año", "90": "90 días", "30": "30 días",
};
const ANTIGUEDAD_DIAS: Record<"365" | "90" | "30", number> = { "365": 365, "90": 90, "30": 30 };

export interface Filtros {
  /** Periodo YYYY-MM (columna derivada `mes`). No confundir con `mesas`. */
  meses: string[];
  usuarios: string[];
  clientes: string[];
  /** Mesa de trabajo (columna "Mesa" del origen). */
  mesas: string[];
  /** Proceso (columna "Proceso" del origen). */
  procesos: string[];
  /** Eje herramienta: "con" (réplicas V) / "sin" (Padre + SV). */
  herramienta: Herramienta[];
  busqueda: string;
  antiguedadMax: AntiguedadMax;
  incluirAnomalos: boolean;
  /** Bucket de rangos de tiempo hábil, activo como filtro (ver distribucionRangos).
   *  Sin UI hoy: la gráfica C4 se quitó, pero la lógica sigue disponible. */
  rango: RangoKey | null;
}

export const FILTROS_VACIOS: Filtros = {
  meses: [], usuarios: [], clientes: [], mesas: [], procesos: [], herramienta: [], busqueda: "",
  antiguedadMax: "sin_limite", incluirAnomalos: false, rango: null,
};

export const hayFiltros = (f: Filtros): boolean =>
  f.meses.length > 0 || f.usuarios.length > 0 || f.clientes.length > 0 ||
  f.mesas.length > 0 || f.procesos.length > 0 || f.herramienta.length > 0 || f.busqueda.trim() !== "" ||
  f.antiguedadMax !== "sin_limite" || f.incluirAnomalos || f.rango !== null;

export function aplicarFiltros(base: ClonacionRegistro[], f: Filtros): ClonacionRegistro[] {
  const q = norm(f.busqueda);
  return base.filter((r) => {
    if (f.meses.length && !f.meses.includes(r.mes)) return false;
    if (f.usuarios.length && !f.usuarios.includes(r.usuario)) return false;
    if (f.clientes.length && !f.clientes.includes(r.cliente)) return false;
    if (f.mesas.length && !f.mesas.includes(r.mesa)) return false;
    if (f.procesos.length && !f.procesos.includes(r.proceso)) return false;
    if (f.herramienta.length && !f.herramienta.includes(herramientaDe(r.origenTipo))) return false;
    if (q && !norm(r.file).includes(q)) return false;
    if (!f.incluirAnomalos && r.anomalo) return false;
    if (f.antiguedadMax !== "sin_limite") {
      // Sin Solicitud_fecha no hay antigüedad que juzgar: la fila no se excluye.
      if (r.diasAntiguedad != null && r.diasAntiguedad > ANTIGUEDAD_DIAS[f.antiguedadMax]) return false;
    }
    if (f.rango && (r.segHabiles == null || rangoDe(r.segHabiles) !== f.rango)) return false;
    return true;
  });
}

/**
 * Registros anómalos del recorte — SIEMPRE los cuenta (Parte E1), ignorando
 * el checkbox "incluir anómalos" pero respetando el resto de los filtros.
 */
export function contarAnomalos(base: ClonacionRegistro[], f: Filtros): number {
  return aplicarFiltros(base, { ...f, incluirAnomalos: true }).filter((r) => r.anomalo).length;
}

/**
 * Distribución de C4: se calcula con todos los filtros activos EXCEPTO el
 * suyo propio, para poder ver el resto de barras y cambiar de selección.
 */
export interface FilaRango { key: RangoKey; label: string; n: number; pct: number; acumulado: number }

export function distribucionRangos(base: ClonacionRegistro[], f: Filtros): FilaRango[] {
  const sinRango = aplicarFiltros(base, { ...f, rango: null }).filter((r) => r.segHabiles != null);
  const total = sinRango.length || 1;
  let acumulado = 0;
  return RANGOS.map((r) => {
    const n = sinRango.filter((x) => rangoDe(x.segHabiles as number) === r.key).length;
    const pct = (n / total) * 100;
    acumulado += pct;
    return { key: r.key, label: r.label, n, pct, acumulado };
  });
}

// ── KPIs (C2) ────────────────────────────────────────────────────────────
const UMBRAL_9H_SEG = 9 * 3600;
const UMBRAL_PROMEDIO_INFLADO = 3; // promedio > 3× mediana
const ANTIGUEDAD_INFLA_DIAS = 365; // "años atrás" (Parte E2)

export interface KPIs {
  n: number;
  mediana: number | null;
  promedio: number | null;
  p90: number | null;
  /** % de filas medibles resueltas en ≤ 9 h hábiles. null si no hay filas medibles. */
  pctResueltos9h: number | null;
  anomalos: number;
  costoTotal: number;
  promedioInflado: boolean;
  /** Filas medibles con > 1 año entre `inicioMetrica` y Creacion_fecha — la causa típica del inflado. */
  casosInflados: number;
}

const DIA_MS = 86_400_000;

export function calcularKPIs(base: ClonacionRegistro[], filtrados: ClonacionRegistro[], f: Filtros, costoTotal: number): KPIs {
  const medibles = filtrados.filter((r) => r.segHabiles != null);
  const valores = medibles.map((r) => r.segHabiles as number);
  const med = mediana(valores), prom = promedio(valores), p90 = percentil90(valores);
  return {
    n: filtrados.length,
    mediana: med, promedio: prom, p90,
    pctResueltos9h: medibles.length
      ? (medibles.filter((r) => (r.segHabiles as number) <= UMBRAL_9H_SEG).length / medibles.length) * 100
      : null,
    anomalos: contarAnomalos(base, f),
    costoTotal,
    promedioInflado: prom != null && med != null && med > 0 && prom > UMBRAL_PROMEDIO_INFLADO * med,
    casosInflados: medibles.filter((r) =>
      r.inicioMetrica != null && (r.creacion.getTime() - r.inicioMetrica.getTime()) / DIA_MS > ANTIGUEDAD_INFLA_DIAS,
    ).length,
  };
}

// ── Opciones de filtro ───────────────────────────────────────────────────
export interface Opcion { value: string; label: string; count: number }
export interface OpcionesFiltro {
  meses: Opcion[]; usuarios: Opcion[]; clientes: Opcion[]; mesas: Opcion[]; procesos: Opcion[]; herramienta: Opcion[];
}

export function opcionesDeFiltro(base: ClonacionRegistro[]): OpcionesFiltro {
  const meses = new Map<string, number>(), usuarios = new Map<string, number>(), clientes = new Map<string, number>();
  const mesas = new Map<string, number>(), procesos = new Map<string, number>();
  const herramienta: Record<Herramienta, number> = { sin: 0, con: 0 };
  for (const r of base) {
    if (r.mes) meses.set(r.mes, (meses.get(r.mes) ?? 0) + 1);
    usuarios.set(r.usuario, (usuarios.get(r.usuario) ?? 0) + 1);
    clientes.set(r.cliente, (clientes.get(r.cliente) ?? 0) + 1);
    mesas.set(r.mesa, (mesas.get(r.mesa) ?? 0) + 1);
    procesos.set(r.proceso, (procesos.get(r.proceso) ?? 0) + 1);
    herramienta[herramientaDe(r.origenTipo)]++;
  }
  const porVolumen = (m: Map<string, number>): Opcion[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
      .map(([value, count]) => ({ value, label: value, count }));
  return {
    meses: [...meses.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([value, count]) => ({ value, label: etiquetaMes(value), count })),
    usuarios: porVolumen(usuarios),
    clientes: porVolumen(clientes),
    mesas: porVolumen(mesas),
    procesos: porVolumen(procesos),
    // Orden fijo Sin · Con herramienta (no por volumen).
    herramienta: HERRAMIENTA_OPCIONES.map((h) => ({ value: h, label: HERRAMIENTA_LABEL[h], count: herramienta[h] })),
  };
}

// ── Serie mensual (C3) ───────────────────────────────────────────────────
export interface PuntoMes {
  clave: string; label: string; n: number; volumen: number;
  mediana: number | null; promedio: number | null; p90: number | null;
}

export function serieMensual(filtrados: ClonacionRegistro[]): PuntoMes[] {
  const cubos = new Map<string, ClonacionRegistro[]>();
  for (const r of filtrados) {
    if (!r.mes) continue;
    const l = cubos.get(r.mes);
    if (l) l.push(r); else cubos.set(r.mes, [r]);
  }
  return [...cubos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, regs]) => {
      const vals = regs.filter((r) => r.segHabiles != null).map((r) => r.segHabiles as number);
      return {
        clave, label: etiquetaMes(clave), n: vals.length, volumen: regs.length,
        mediana: mediana(vals), promedio: promedio(vals), p90: percentil90(vals),
      };
    });
}

// ── Rankings por usuario / cliente (C5) ───────────────────────────────────
export interface FilaRanking { clave: string; valor: number | null; n: number }

export type DimensionRanking = "usuario" | "cliente" | "mesa" | "proceso";

export function agruparPor(filtrados: ClonacionRegistro[], campo: DimensionRanking, metrica: Metrica): FilaRanking[] {
  const cubos = new Map<string, number[]>();
  for (const r of filtrados) {
    if (r.segHabiles == null) continue;
    const clave = r[campo];
    const l = cubos.get(clave);
    if (l) l.push(r.segHabiles); else cubos.set(clave, [r.segHabiles]);
  }
  return [...cubos.entries()].map(([clave, vals]) => ({ clave, valor: aplicarMetrica(vals, metrica), n: vals.length }));
}

// ── Costo del tiempo (C6 — D3/D4) ─────────────────────────────────────────
// Un usuario trabaja varios files a la vez: sumar la duración de cada file
// cobraría la misma hora muchas veces. Se unen los tramos que se traslapan de
// CADA usuario (nunca entre usuarios distintos) y cada hora hábil se cuenta
// una sola vez — ver unirIntervalos.
//
// El tramo de cada fila es `inicioMetrica → creacion` (el MISMO par que el
// tiempo hábil): para Padres/SV eso es Solicitud → Creación; para las réplicas
// verificadas (V), desde la creación del file padre. La sección se muestra
// partida en dos grupos — ver costoClonacionPorOrigen.

export const TARIFA_CLONACION_DEFECTO = 6; // USD/hora hábil, por usuario
const UMBRAL_ALERTA_PERIODO_PCT = 120; // Parte E3: no 100%, la solicitud puede ser anterior al periodo

/** Tramo de reloj en milisegundos. */
interface Intervalo { inicio: number; fin: number }

/** Fusiona los tramos que se tocan o solapan. Devuelve bloques disjuntos. */
function unirIntervalos(lista: Intervalo[]): Intervalo[] {
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
function segundosDeUnion(lista: Intervalo[]): number {
  return unirIntervalos(lista).reduce((s, iv) => s + segundosHabiles(new Date(iv.inicio), new Date(iv.fin)), 0);
}

/**
 * Parte un intervalo por frontera de mes para poder repartir su costo. Se
 * aplica DESPUÉS de unir los tramos de cada usuario (D4): agrupar por mes
 * antes de unir daría doble conteo cuando un tramo cruza fin de mes.
 */
function recortarPorMes(iv: Intervalo): { clave: string; iv: Intervalo }[] {
  const out: { clave: string; iv: Intervalo }[] = [];
  let cursor = iv.inicio;
  let guarda = 0;
  while (cursor < iv.fin && guarda++ < 10_000) {
    const d = new Date(cursor);
    const siguiente = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const fin = Math.min(siguiente, iv.fin);
    out.push({ clave: mesDe(new Date(cursor)), iv: { inicio: cursor, fin } });
    cursor = fin;
  }
  return out;
}

export interface FilaCostoUsuario {
  usuario: string;
  files: number;
  /** Suma por file: cuenta la misma hora una vez por clonación abierta. */
  horasSuma: number;
  /** Unión de tramos: cada hora cuenta una sola vez. Esta es la que cuesta. */
  horasEfectivas: number;
  /** horasSuma ÷ horasEfectivas × 100 — 100% = sin traslape, 300% = triplicado. */
  traslapePct: number;
  /** horasEfectivas ÷ horas hábiles de la ventana mostrada × 100. Puede pasar
   *  de 100% si la solicitud es anterior al primer file del periodo. */
  pctPeriodo: number;
  costo: number;
}

export interface PuntoCostoMes { clave: string; label: string; costo: number; horas: number; volumen: number }

export interface Ventana { inicio: number; fin: number; horas: number }

export interface CostoClonacion {
  costoTotal: number;
  horasEfectivas: number;
  horasSuma: number;
  /** % de horasSuma que el traslape descuenta: (suma − efectivas) ÷ suma × 100. */
  pctTraslapeDescontado: number;
  nUsuarios: number;
  /** Files que aportaron un tramo costeable (suma de personas.files). */
  nFiles: number;
  /** costoTotal ÷ nFiles — lo que cuesta, en promedio, producir un file del grupo. */
  costoPorFile: number;
  personas: FilaCostoUsuario[];
  serie: PuntoCostoMes[];
  /** Rango de Creacion_fecha del recorte mostrado — el techo contra el que se mide "% del periodo". */
  ventana: Ventana;
  tarifa: number;
  /** Usuarios con pctPeriodo > 120% — dispara el aviso de Parte E4. */
  usuariosAlerta: FilaCostoUsuario[];
}

export function costoClonacion(filtrados: ClonacionRegistro[], tarifa: number): CostoClonacion {
  // Ventana: rango de Creacion_fecha del recorte mostrado (Parte E3).
  let minC = Infinity, maxC = -Infinity;
  for (const r of filtrados) {
    const t = r.creacion.getTime();
    if (t < minC) minC = t;
    if (t > maxC) maxC = t;
  }
  const ventana: Ventana = isFinite(minC) && isFinite(maxC) && maxC > minC
    ? { inicio: minC, fin: maxC, horas: segundosHabiles(new Date(minC), new Date(maxC)) / 3600 }
    : { inicio: 0, fin: 0, horas: 0 };

  // Intervalos válidos por usuario: solo donde fin > inicio (D3) — esto
  // excluye los anómalos del costo SIEMPRE, sin importar el checkbox de
  // "incluir anómalos" (ese checkbox es para las métricas de tiempo).
  const porUsuario = new Map<string, Intervalo[]>();
  const filesPorUsuario = new Map<string, number>();
  for (const r of filtrados) {
    if (!r.inicioMetrica) continue;
    const inicio = r.inicioMetrica.getTime(), fin = r.creacion.getTime();
    if (fin <= inicio) continue;
    const l = porUsuario.get(r.usuario);
    if (l) l.push({ inicio, fin }); else porUsuario.set(r.usuario, [{ inicio, fin }]);
    filesPorUsuario.set(r.usuario, (filesPorUsuario.get(r.usuario) ?? 0) + 1);
  }

  const personas: FilaCostoUsuario[] = [...porUsuario.entries()]
    .map(([usuario, lista]) => {
      const horasSuma = lista.reduce((s, iv) => s + segundosHabiles(new Date(iv.inicio), new Date(iv.fin)), 0) / 3600;
      const horasEfectivas = segundosDeUnion(lista) / 3600;
      return {
        usuario,
        files: filesPorUsuario.get(usuario) ?? 0,
        horasSuma, horasEfectivas,
        traslapePct: horasEfectivas > 0 ? (horasSuma / horasEfectivas) * 100 : 0,
        pctPeriodo: ventana.horas > 0 ? (horasEfectivas / ventana.horas) * 100 : 0,
        costo: horasEfectivas * tarifa,
      };
    })
    .sort((a, b) => b.horasEfectivas - a.horasEfectivas);

  const horasEfectivas = personas.reduce((s, p) => s + p.horasEfectivas, 0);
  const horasSuma = personas.reduce((s, p) => s + p.horasSuma, 0);
  const costoTotal = horasEfectivas * tarifa;
  const nFiles = personas.reduce((s, p) => s + p.files, 0);

  // Serie mensual (D4): se recorta cada bloque YA UNIDO en fronteras de mes,
  // así los meses suman el total exacto. No se agrupa por mes antes de unir.
  const cubosMes = new Map<string, Map<string, Intervalo[]>>(); // mes → usuario → trozos
  for (const [usuario, lista] of porUsuario) {
    for (const bloque of unirIntervalos(lista)) {
      for (const { clave, iv } of recortarPorMes(bloque)) {
        let porU = cubosMes.get(clave);
        if (!porU) { porU = new Map(); cubosMes.set(clave, porU); }
        const l = porU.get(usuario);
        if (l) l.push(iv); else porU.set(usuario, [iv]);
      }
    }
  }
  const volumenPorMes = new Map<string, number>();
  for (const r of filtrados) {
    if (r.segHabiles == null) continue;
    volumenPorMes.set(r.mes, (volumenPorMes.get(r.mes) ?? 0) + 1);
  }
  const serie: PuntoCostoMes[] = [...cubosMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, porU]) => {
      let seg = 0;
      for (const trozos of porU.values()) seg += segundosDeUnion(trozos);
      const horas = seg / 3600;
      return { clave, label: etiquetaMes(clave), costo: horas * tarifa, horas, volumen: volumenPorMes.get(clave) ?? 0 };
    });

  return {
    costoTotal, horasEfectivas, horasSuma,
    pctTraslapeDescontado: horasSuma > 0 ? ((horasSuma - horasEfectivas) / horasSuma) * 100 : 0,
    nUsuarios: personas.length,
    nFiles,
    costoPorFile: nFiles > 0 ? costoTotal / nFiles : 0,
    personas, serie, ventana, tarifa,
    usuariosAlerta: personas.filter((p) => p.pctPeriodo > UMBRAL_ALERTA_PERIODO_PCT),
  };
}

export interface CostoPorOrigen {
  /** Grupo "Sin herramienta": Padre + SV. */
  padreSv: CostoClonacion;
  /** Grupo "Con herramienta": réplicas verificadas (V) — su tramo va desde la creación del file padre. */
  v: CostoClonacion;
  costoTotal: number;
  horasEfectivas: number;
  /**
   * Contrafactual: cuánto habrían costado los files V si NO existiera la
   * herramienta de clonación — es decir, producidos a mano, al mismo costo/file
   * que un file original (Padre+SV).
   */
  contrafactual: {
    /** Costo promedio de un file Padre+SV — la tarifa contra la que se compara. */
    costoPorFilePadreSv: number;
    /** Total de clonaciones V del recorte. */
    nFilesV: number;
    /** nFilesV × costoPorFilePadreSv. */
    costoManualV: number;
    /** costoManualV − costo real de los V. */
    ahorro: number;
  };
}

/**
 * Costo partido en dos grupos: "Sin herramienta" (Padre + SV) y "Con
 * herramienta" (V). La unión de tramos por usuario se hace DENTRO de cada grupo
 * (así cada número responde "cuánto cuesta este grupo"); el total es la suma.
 */
export function costoClonacionPorOrigen(filtrados: ClonacionRegistro[], tarifa: number): CostoPorOrigen {
  const v = costoClonacion(filtrados.filter((r) => r.origenTipo === "v"), tarifa);
  const padreSv = costoClonacion(filtrados.filter((r) => r.origenTipo !== "v"), tarifa);
  const nFilesV = filtrados.filter((r) => r.origenTipo === "v").length;
  const costoManualV = nFilesV * padreSv.costoPorFile;
  return {
    padreSv, v,
    costoTotal: padreSv.costoTotal + v.costoTotal,
    horasEfectivas: padreSv.horasEfectivas + v.horasEfectivas,
    contrafactual: {
      costoPorFilePadreSv: padreSv.costoPorFile,
      nFilesV,
      costoManualV,
      ahorro: costoManualV - v.costoTotal,
    },
  };
}

// ── Exportación CSV ──────────────────────────────────────────────────────
const csvCampo = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const isoFecha = (d: Date | null): string =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ` +
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
    : "";

/** CSV del detalle filtrado completo (no solo la página visible), C7. */
export function exportarDetalleCSV(regs: ClonacionRegistro[]): string {
  const cab = ["c807_file", "Origen", "Solicitud_fecha", "Creacion_fecha", "Inicio_tiempo_habil", "Usuario", "Cliente", "Mesa", "Proceso", "Comentario", "Tiempo habil"];
  const lineas = [cab.join(",")];
  for (const r of regs) {
    lineas.push([
      r.file, r.origen, isoFecha(r.solicitud), isoFecha(r.creacion), isoFecha(r.inicioMetrica),
      r.usuario, r.cliente, r.mesa, r.proceso,
      r.comentario.replace(/\n/g, " · "), fmtHHMMSS(r.segHabiles),
    ].map(csvCampo).join(","));
  }
  return lineas.join("\n");
}

/** CSV de la tabla de costo por usuario, con fila TOTAL al final. */
export function exportarCostoCSV(personas: FilaCostoUsuario[]): string {
  const cab = ["Usuario", "Files", "Horas sumadas", "Horas efectivas", "Traslape %", "% del periodo", "Costo", "Costo por file"];
  const lineas = [cab.join(",")];
  let tFiles = 0, tSuma = 0, tEfectivas = 0, tCosto = 0;
  for (const p of personas) {
    tFiles += p.files; tSuma += p.horasSuma; tEfectivas += p.horasEfectivas; tCosto += p.costo;
    lineas.push([
      p.usuario, p.files, p.horasSuma.toFixed(2), p.horasEfectivas.toFixed(2),
      p.traslapePct.toFixed(1), p.pctPeriodo.toFixed(1), p.costo.toFixed(2),
      (p.files > 0 ? p.costo / p.files : 0).toFixed(2),
    ].map(csvCampo).join(","));
  }
  lineas.push([
    "TOTAL", tFiles, tSuma.toFixed(2), tEfectivas.toFixed(2), "", "", tCosto.toFixed(2),
    (tFiles > 0 ? tCosto / tFiles : 0).toFixed(2),
  ].map(csvCampo).join(","));
  return lineas.join("\n");
}

/** Dispara la descarga de un CSV en el navegador, con BOM UTF-8 (Excel). */
export function descargarCSV(nombre: string, contenido: string): void {
  const url = URL.createObjectURL(new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
