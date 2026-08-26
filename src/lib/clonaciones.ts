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
  /** "YYYY-MM" de Creacion_Fecha — el filtro de Mes agrupa por aquí. */
  mes: string;
  /** D2: segundos hábiles entre Solicitud_fecha y Creacion_Fecha. null si
   *  falta Solicitud_fecha; 0 (no null) cuando la fila es anómala. */
  segHabiles: number | null;
  /** Solicitud_fecha > Creacion_Fecha. */
  anomalo: boolean;
  /** Días calendario entre Solicitud_fecha y Creacion_Fecha. Puede ser
   *  negativo en filas anómalas — solo Minutos_Habiles se fuerza a 0, esto no. */
  diasAntiguedad: number | null;
}

/**
 * Construye un registro por fila (sin agrupar ni deduplicar c807_file).
 *
 * Se descartan las filas sin Creacion_Fecha: sin ella no hay mes al que
 * atribuir la clonación y todo el tablero (filtro de periodo, ventana de
 * costo) cuelga de ese agrupamiento. Es la única fecha que se exige — sin
 * Solicitud_fecha la fila se conserva, pero sus 4 columnas derivadas (D2)
 * quedan vacías, tal como pide la regla de la hoja.
 */
export function construirRegistros(rows: ClonacionRow[]): ClonacionRegistro[] {
  const out: ClonacionRegistro[] = [];
  for (const r of rows) {
    const creacion = parseFecha(r.Creacion_Fecha);
    if (!creacion) continue;
    const solicitud = parseFecha(r.Solicitud_fecha);
    const segHabiles = solicitud ? segundosHabiles(solicitud, creacion) : null;
    const anomalo = solicitud ? solicitud.getTime() > creacion.getTime() : false;
    const diasAntiguedad = solicitud
      ? Math.round((creacion.getTime() - solicitud.getTime()) / 86_400_000)
      : null;
    out.push({
      file: r.c807_file || "",
      solicitud, creacion,
      usuario: r.Usuario || SIN_DATO,
      cliente: r.Cliente || SIN_DATO,
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
  meses: string[];
  usuarios: string[];
  clientes: string[];
  busqueda: string;
  antiguedadMax: AntiguedadMax;
  incluirAnomalos: boolean;
  /** Bucket de C4 activo como filtro. Se calcula sobre TODOS los filtros
   *  excepto este — ver distribucionRangos. */
  rango: RangoKey | null;
  metrica: Metrica;
}

export const FILTROS_VACIOS: Filtros = {
  meses: [], usuarios: [], clientes: [], busqueda: "",
  antiguedadMax: "sin_limite", incluirAnomalos: false, rango: null, metrica: "mediana",
};

export const hayFiltros = (f: Filtros): boolean =>
  f.meses.length > 0 || f.usuarios.length > 0 || f.clientes.length > 0 || f.busqueda.trim() !== "" ||
  f.antiguedadMax !== "sin_limite" || f.incluirAnomalos || f.rango !== null;

export function aplicarFiltros(base: ClonacionRegistro[], f: Filtros): ClonacionRegistro[] {
  const q = norm(f.busqueda);
  return base.filter((r) => {
    if (f.meses.length && !f.meses.includes(r.mes)) return false;
    if (f.usuarios.length && !f.usuarios.includes(r.usuario)) return false;
    if (f.clientes.length && !f.clientes.includes(r.cliente)) return false;
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
  /** Filas con > 1 año entre Solicitud_fecha y Creacion_Fecha — la causa típica del inflado. */
  casosInflados: number;
}

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
    casosInflados: medibles.filter((r) => r.diasAntiguedad != null && r.diasAntiguedad > ANTIGUEDAD_INFLA_DIAS).length,
  };
}

// ── Opciones de filtro ───────────────────────────────────────────────────
export interface Opcion { value: string; label: string; count: number }
export interface OpcionesFiltro { meses: Opcion[]; usuarios: Opcion[]; clientes: Opcion[] }

export function opcionesDeFiltro(base: ClonacionRegistro[]): OpcionesFiltro {
  const meses = new Map<string, number>(), usuarios = new Map<string, number>(), clientes = new Map<string, number>();
  for (const r of base) {
    if (r.mes) meses.set(r.mes, (meses.get(r.mes) ?? 0) + 1);
    usuarios.set(r.usuario, (usuarios.get(r.usuario) ?? 0) + 1);
    clientes.set(r.cliente, (clientes.get(r.cliente) ?? 0) + 1);
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

export function agruparPor(filtrados: ClonacionRegistro[], campo: "usuario" | "cliente", metrica: Metrica): FilaRanking[] {
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
  personas: FilaCostoUsuario[];
  serie: PuntoCostoMes[];
  /** Rango de Creacion_Fecha del recorte mostrado — el techo contra el que se mide "% del periodo". */
  ventana: Ventana;
  tarifa: number;
  /** Usuarios con pctPeriodo > 120% — dispara el aviso de Parte E4. */
  usuariosAlerta: FilaCostoUsuario[];
}

export function costoClonacion(filtrados: ClonacionRegistro[], tarifa: number): CostoClonacion {
  // Ventana: rango de Creacion_Fecha del recorte mostrado (Parte E3).
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
    if (!r.solicitud) continue;
    const inicio = r.solicitud.getTime(), fin = r.creacion.getTime();
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
    personas, serie, ventana, tarifa,
    usuariosAlerta: personas.filter((p) => p.pctPeriodo > UMBRAL_ALERTA_PERIODO_PCT),
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
  const cab = ["c807_file", "Solicitud_fecha", "Creacion_Fecha", "Usuario", "Cliente", "Tiempo habil"];
  const lineas = [cab.join(",")];
  for (const r of regs) {
    lineas.push([
      r.file, isoFecha(r.solicitud), isoFecha(r.creacion), r.usuario, r.cliente, fmtHHMMSS(r.segHabiles),
    ].map(csvCampo).join(","));
  }
  return lineas.join("\n");
}

/** CSV de la tabla de costo por usuario, con fila TOTAL al final. */
export function exportarCostoCSV(personas: FilaCostoUsuario[]): string {
  const cab = ["Usuario", "Files", "Horas sumadas", "Horas efectivas", "Traslape %", "% del periodo", "Costo"];
  const lineas = [cab.join(",")];
  let tFiles = 0, tSuma = 0, tEfectivas = 0, tCosto = 0;
  for (const p of personas) {
    tFiles += p.files; tSuma += p.horasSuma; tEfectivas += p.horasEfectivas; tCosto += p.costo;
    lineas.push([
      p.usuario, p.files, p.horasSuma.toFixed(2), p.horasEfectivas.toFixed(2),
      p.traslapePct.toFixed(1), p.pctPeriodo.toFixed(1), p.costo.toFixed(2),
    ].map(csvCampo).join(","));
  }
  lineas.push([
    "TOTAL", tFiles, tSuma.toFixed(2), tEfectivas.toFixed(2), "", "", tCosto.toFixed(2),
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
