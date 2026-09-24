"use client";

// Desarrollo Timelines — Gantt del ciclo de vida de DESARROLLO por hito.
// Cada hito es una línea con 5 puntos, MISMO nombre en las dos plantillas
// (ver lib/devTimeline.ts para de dónde sale cada uno según `plantilla`):
//   A Inicio · Req Terminado · B Analisis tecnico · C Entrega Desarrollo (deadline) · D Salida en vivo
// Todas las líneas comparten un eje temporal para ver traslapes. Filtros por
// Proyecto, PM, Developer y Status (A futuro / En Curso / Completados — ver
// rowStatus). Las tarjetas se recalculan sobre el mismo set ya filtrado.

/** Etiquetas de los puntos A/D — iguales en las dos plantillas. */
const POINT_LABELS = { firmado: "Inicio", limit: "Entrega Desarrollo", entrega: "Salida en vivo" };

import { useCallback, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { businessDays, fmtDate } from "@/lib/business";
import {
  buildDevTimelines, barStatus, devStatusKind, wasDeliveredLate, monthTicks,
  BAR_COLOR, BAR_STATUS_LABEL, type DevTimelineRow,
} from "@/lib/devTimeline";
import MultiSelect, { type MSOption } from "@/components/MultiSelect";
import { EmptyRow, ErrorBox, FilterReset, Loader, SplitStatCard, StatCard } from "@/components/ui";
const DAY = 86_400_000;
const LABEL_W = 220; // ancho de la columna de etiquetas (izquierda)

// devStatusKind/barStatus/BAR_COLOR/BAR_STATUS_LABEL/wasDeliveredLate/monthTicks
// viven en lib/devTimeline.ts — compartidos con el mini-Gantt de
// ProjectReportModal (pestaña "Desarrollo Timeliness").

export type RowStatus = "A futuro" | "En Curso" | "Completados";
const STATUS_ORDER: RowStatus[] = ["A futuro", "En Curso", "Completados"];

/** Status del filtro/tarjetas de cada hito:
 *  · "A futuro": SOLO plantilla nueva, cuando su Inicio (CPM Start Date,
 *    `firmado`) todavía no llega, o ni siquiera tiene CPM cargado en Monday —
 *    en ambos casos no ha arrancado de verdad. La plantilla vieja NUNCA cae acá
 *    (no tiene concepto de CPM por hito; su `firmado` es "Hitos firmados",
 *    otra cosa) — sus hitos "Future Steps" cuentan como "En Curso".
 *  · "Completados": devPhase "done" (y no es "A futuro").
 *  · "En Curso": el resto (working o future de la plantilla vieja). */
function rowStatus(r: DevTimelineRow, nowMs: number): RowStatus {
  if (r.plantilla === "nueva" && (r.firmado === null || r.firmado.getTime() > nowMs)) return "A futuro";
  return r.devPhase === "done" ? "Completados" : "En Curso";
}

// Días hábiles entre dos puntos consecutivos del ciclo (Guatemala, sin fines de
// semana NI asuetos oficiales — businessDays(..., true)). null si falta
// cualquiera de las dos fechas o si quedan en orden invertido (dato sucio en
// Monday, ej. Inicio con CPM replanificado después de fechas ya reales).
function segmentDays(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  const days = businessDays(from, to, true);
  return days > 0 || from.getTime() === to.getTime() ? days : null;
}

/** Número de proyecto ("PM-013 | TDP ADU" → 13) para ordenar el Gantt por
 *  proyecto. -1 si el nombre no sigue la convención "PM-XXX | …". */
function pmNumber(proyecto: string): number {
  const m = proyecto.match(/PM-(\d+)/i);
  return m ? parseInt(m[1], 10) : -1;
}

type MetricMode = "promedio" | "mediana";

/** Promedio o mediana (según `mode`) de una lista de días hábiles — null y n=0 si viene vacía. */
function summarize(values: number[], mode: MetricMode): { value: number | null; n: number } {
  const n = values.length;
  if (n === 0) return { value: null, n };
  if (mode === "promedio") return { value: values.reduce((a, b) => a + b, 0) / n, n };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const value = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { value, n };
}

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1);

/** Cuenta valores no vacíos y los arma como opciones de MultiSelect (ordenadas). */
const opt = (vals: string[]): MSOption[] => {
  const counts = new Map<string, number>();
  for (const v of vals) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: value, count }));
};

// ── Geometría de una fila (posiciones en % sobre el eje [min,max]) ─────────
// Los colores son SOLO para los puntos (marcadores); la barra es una sola,
// coloreada por `barStatus` (ver arriba): verde completado, amarillo en curso
// a tiempo, rojo atrasado, azul futuro/no iniciado.
interface RowGeom {
  row: DevTimelineRow;
  hasDates: boolean;
  barL: number; barW: number; barColor: string;
  firmadoX: number | null;         // A
  reqTerminadoX: number | null;    // solo plantilla nueva
  analisisX: number | null;        // B
  limitX: number | null;           // C (deadline)
  entregaX: number | null;         // D
  ongoingX: number | null;         // marcador "hoy" si sigue en curso
  late: boolean;                   // wasDeliveredLate — para el diamante de Salida en vivo
  entregado: boolean;
}

export default function DesarrolloTimelinesPage() {
  const { data, loading, error } = useData();
  const [nowMs] = useState(() => Date.now()); // "hoy" fijado al montar (evita impureza en render)
  const [hover, setHover] = useState<{ g: RowGeom; x: number; y: number } | null>(null);
  const [proyectos, setProyectos] = useState<string[]>([]);
  const [pms, setPms] = useState<string[]>([]);
  const [devs, setDevs] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [metricMode, setMetricMode] = useState<MetricMode>("promedio");

  const allRows = useMemo(
    () => (data ? buildDevTimelines(data.proj, data.projBoards, data.devTeamRoster) : []),
    [data],
  );

  // Opciones dependientes: cada filtro se calcula sobre las filas ya acotadas
  // por los OTROS filtros (se excluye a sí mismo), y sus counts reflejan eso.
  const proyectoOpts = useMemo(
    () => opt(allRows.filter((r) =>
      (pms.length === 0 || pms.includes(r.pm)) &&
      (devs.length === 0 || devs.includes(r.developer)) &&
      (statuses.length === 0 || statuses.includes(rowStatus(r, nowMs)))).map((r) => r.proyecto)),
    [allRows, pms, devs, statuses, nowMs],
  );
  const pmOpts = useMemo(
    () => opt(allRows.filter((r) =>
      (proyectos.length === 0 || proyectos.includes(r.proyecto)) &&
      (devs.length === 0 || devs.includes(r.developer)) &&
      (statuses.length === 0 || statuses.includes(rowStatus(r, nowMs)))).map((r) => r.pm)),
    [allRows, proyectos, devs, statuses, nowMs],
  );
  const devOpts = useMemo(
    () => opt(allRows.filter((r) =>
      (proyectos.length === 0 || proyectos.includes(r.proyecto)) &&
      (pms.length === 0 || pms.includes(r.pm)) &&
      (statuses.length === 0 || statuses.includes(rowStatus(r, nowMs)))).map((r) => r.developer)),
    [allRows, proyectos, pms, statuses, nowMs],
  );
  const statusOpts = useMemo(() => {
    const filtered = allRows.filter((r) =>
      (proyectos.length === 0 || proyectos.includes(r.proyecto)) &&
      (pms.length === 0 || pms.includes(r.pm)) &&
      (devs.length === 0 || devs.includes(r.developer)));
    const counts: Record<RowStatus, number> = { "A futuro": 0, "En Curso": 0, "Completados": 0 };
    for (const r of filtered) counts[rowStatus(r, nowMs)]++;
    return STATUS_ORDER.map((s) => ({ value: s, label: s, count: counts[s] }));
  }, [allRows, proyectos, pms, devs, nowMs]);

  const bySelectFilters = useCallback((r: DevTimelineRow) =>
    (proyectos.length === 0 || proyectos.includes(r.proyecto)) &&
    (pms.length === 0 || pms.includes(r.pm)) &&
    (devs.length === 0 || devs.includes(r.developer)) &&
    (statuses.length === 0 || statuses.includes(rowStatus(r, nowMs))),
    [proyectos, pms, devs, statuses, nowMs],
  );

  const rows = useMemo(() => allRows.filter(bySelectFilters), [allRows, bySelectFilters]);

  // Tarjetas de DESARROLLO: cada fila (hito) es un desarrollo individual — no se
  // agrupan por proyecto. Se calculan sobre `rows`, es decir YA con todos los
  // filtros aplicados (Proyecto/PM/Developer/Status) — al filtrar por Status
  // las tarjetas reflejan exactamente lo filtrado. "A futuro"/Completado/En
  // Curso = rowStatus. Atrasado: en "En Curso" es `barStatus === "atrasado"`
  // (Stuck siempre cuenta, Working on it solo si ya pasó el Limit Date — la
  // MISMA regla que colorea las barras del Gantt); en "Completados" es
  // `wasDeliveredLate` (la Salida en vivo real llegó después del deadline) —
  // un veredicto histórico, no el status en vivo. "Desarrollos" es la suma
  // EXACTA de las otras 3 tarjetas.
  const devStats = useMemo(() => {
    let aFuturo = 0, aFuturoSinCpm = 0, enCursoEnTiempo = 0, enCursoAtrasado = 0, completadosEnTiempo = 0, completadosAtrasado = 0;
    for (const r of rows) {
      const status = rowStatus(r, nowMs);
      if (status === "A futuro") {
        aFuturo++;
        if (r.plantilla === "nueva" && r.firmado === null) aFuturoSinCpm++;
        continue;
      }
      if (status === "Completados") {
        if (wasDeliveredLate(r)) completadosAtrasado++; else completadosEnTiempo++;
      } else {
        if (barStatus(r, nowMs) === "atrasado") enCursoAtrasado++; else enCursoEnTiempo++;
      }
    }
    return {
      total: rows.length,
      aFuturo, aFuturoSinCpm,
      enCurso: enCursoEnTiempo + enCursoAtrasado, enCursoEnTiempo, enCursoAtrasado,
      completados: completadosEnTiempo + completadosAtrasado, completadosEnTiempo, completadosAtrasado,
    };
  }, [rows, nowMs]);

  // Tiempos (días hábiles, sin asuetos) de cada tramo consecutivo del ciclo,
  // sobre `rows` (ya filtrado) — Promedio/Mediana según `metricMode`. Cada
  // tramo se calcula sobre los hitos que SÍ tienen ambas fechas de su tramo
  // (independiente entre sí: un hito sin Analisis tecnico igual aporta a los
  // otros 3 tramos que sí tenga completos).
  const timingStats = useMemo(() => {
    const reqTerminado: number[] = [], analisisT: number[] = [], entregaDev: number[] = [], salidaVivo: number[] = [];
    for (const r of rows) {
      const a = segmentDays(r.firmado, r.reqTerminado); if (a !== null) reqTerminado.push(a);
      const b = segmentDays(r.reqTerminado, r.analisis); if (b !== null) analisisT.push(b);
      const c = segmentDays(r.analisis, r.limit); if (c !== null) entregaDev.push(c);
      const e = segmentDays(r.limit, r.entrega); if (e !== null) salidaVivo.push(e);
    }
    return {
      reqTerminado: summarize(reqTerminado, metricMode),
      analisis: summarize(analisisT, metricMode),
      entregaDev: summarize(entregaDev, metricMode),
      salidaVivo: summarize(salidaVivo, metricMode),
    };
  }, [rows, metricMode]);

  // ── Dominio temporal (eje X) ──
  const domain = useMemo(() => {
    const dates: number[] = [];
    for (const r of rows) {
      for (const dt of [r.firmado, r.reqTerminado, r.analisis, r.limit, r.entrega]) if (dt) dates.push(dt.getTime());
      if (r.enDesarrollo) dates.push(nowMs); // barras en curso llegan a hoy
    }
    if (dates.length === 0) return null;
    const min = startOfMonth(new Date(Math.min(...dates)));
    const max = addMonth(new Date(Math.max(...dates)));
    return { min, max, span: max.getTime() - min.getTime() };
  }, [rows, nowMs]);

  const geoms: RowGeom[] = useMemo(() => {
    if (!domain) return [];
    const today = nowMs;
    const pct = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - domain.min.getTime()) / domain.span) * 100));
    return rows.map((r) => {
      const { firmado, reqTerminado, analisis, limit, entrega, enDesarrollo } = r;
      const entregado = !!entrega;
      const kind = devStatusKind(r.devStatus);
      const startPoint = firmado ?? reqTerminado ?? analisis ?? limit ?? entrega;
      const endReal = entrega ?? (kind === "active" ? new Date(today) : (limit ?? startPoint));
      const late = wasDeliveredLate(r); // solo para el diamante de Salida en vivo

      const firmadoX = firmado ? pct(firmado) : null;
      const reqTerminadoX = reqTerminado ? pct(reqTerminado) : null;
      const analisisX = analisis ? pct(analisis) : null;
      const limitX = limit ? pct(limit) : null;
      const entregaX = entrega ? pct(entrega) : null;
      const ongoingX = !entregado && enDesarrollo ? pct(new Date(today)) : null;

      // Una sola barra, de la primera fecha disponible a la última (o "hoy" si
      // sigue activa) — el color viene de `barStatus`, no de comparar fechas.
      let barL = 0, barW = 0;
      if (startPoint && endReal && endReal.getTime() >= startPoint.getTime()) {
        barL = pct(startPoint);
        barW = Math.max(pct(endReal) - barL, 0.4);
      }

      return {
        row: r,
        hasDates: !!(firmado || reqTerminado || analisis || limit || entrega),
        barL, barW, barColor: BAR_COLOR[barStatus(r, today)],
        firmadoX, reqTerminadoX, analisisX, limitX, entregaX, ongoingX, late, entregado,
      };
    }).sort((a, b) => {
      // Agrupa por proyecto (PM-### descendente); dentro de cada proyecto, por
      // inicio del desarrollo para que los traslapes salten a la vista.
      const pa = pmNumber(a.row.proyecto), pb = pmNumber(b.row.proyecto);
      if (pa !== pb) return pb - pa;
      const sa = a.firmadoX ?? 0, sb = b.firmadoX ?? 0;
      return sa - sb || a.row.hito.localeCompare(b.row.hito);
    });
  }, [rows, domain, nowMs]);

  const ticks = domain ? monthTicks(domain.min, domain.max) : [];
  const tickPct = (d: Date) => domain ? ((d.getTime() - domain.min.getTime()) / domain.span) * 100 : 0;
  const chartMinWidth = LABEL_W + Math.max(ticks.length, 4) * 88;

  const anyFilter = proyectos.length > 0 || pms.length > 0 || devs.length > 0 || statuses.length > 0;
  const reset = () => { setProyectos([]); setPms([]); setDevs([]); setStatuses([]); };
  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) =>
    (v: string, ch: boolean) => setter((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)));

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Desarrollo Timeliness</h1>
      </div>
      <p className="mb-5 text-[0.82rem] text-[var(--text-muted)]">
        Ciclo de vida de desarrollo de cada hito sobre una línea de tiempo compartida, para ver traslapes.
        Cada barra va del Inicio a la Salida en vivo, con su Entrega Desarrollo (deadline) marcada.
      </p>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard value={devStats.total} label="Desarrollos" />
        <FuturoStatCard value={devStats.aFuturo} sinCpm={devStats.aFuturoSinCpm} />
        <SplitStatCard value={devStats.enCurso} label="En curso" enTiempo={devStats.enCursoEnTiempo} atrasado={devStats.enCursoAtrasado} />
        <SplitStatCard value={devStats.completados} label="Completados" enTiempo={devStats.completadosEnTiempo} atrasado={devStats.completadosAtrasado} />
      </div>

      {/* Tiempos por tramo (días hábiles, sin asuetos) */}
      <div className="mb-2 flex items-center gap-2.5">
        <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Tiempos (días hábiles)</span>
        <div className="flex rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
          {(["promedio", "mediana"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetricMode(m)}
              className="rounded-md px-2.5 py-1 text-[0.72rem] font-semibold capitalize transition-colors"
              style={metricMode === m
                ? { background: "var(--accent)", color: "#fff" }
                : { color: "var(--text-muted)" }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TiempoStatCard label="Tiempo de Req Terminado" stat={timingStats.reqTerminado} />
        <TiempoStatCard label="Tiempo de Analisis tecnico" stat={timingStats.analisis} />
        <TiempoStatCard label="Tiempo de Entrega de desarrollo" stat={timingStats.entregaDev} />
        <TiempoStatCard label="Tiempo de Salida en vivo" stat={timingStats.salidaVivo} />
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3.5">
        <MultiSelect label="Proyecto" options={proyectoOpts} selected={proyectos} onToggle={toggle(setProyectos)} onToggleAll={() => setProyectos([])} />
        <MultiSelect label="PM" options={pmOpts} selected={pms} onToggle={toggle(setPms)} onToggleAll={() => setPms([])} />
        <MultiSelect label="Developer" options={devOpts} selected={devs} onToggle={toggle(setDevs)} onToggleAll={() => setDevs([])} />
        <MultiSelect label="Status" options={statusOpts} selected={statuses} onToggle={toggle(setStatuses)} onToggleAll={() => setStatuses([])} />
        {anyFilter && <FilterReset onClick={reset} />}
      </div>

      {/* Leyenda */}
      <Legend />

      {/* Gantt */}
      {geoms.length === 0 || !domain ? (
        <EmptyRow msg="Sin hitos en desarrollo para los filtros seleccionados." />
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
          <div style={{ minWidth: chartMinWidth }}>
            {/* Eje */}
            <div className="flex items-end border-b" style={{ borderColor: "var(--border)" }}>
              <div style={{ width: LABEL_W }} className="shrink-0 px-3 py-2 text-[0.7rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                Hito · Proyecto
              </div>
              <div className="relative h-9 flex-1">
                {ticks.map((t, i) => (
                  <div key={i} className="absolute top-0 h-full" style={{ left: `${tickPct(t.date)}%` }}>
                    <div className="h-full w-px" style={{ background: "var(--border)" }} />
                    <span className="absolute top-1 left-1 whitespace-nowrap text-[0.68rem] text-[var(--text-muted)]">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Filas */}
            {geoms.map((g) => (
              <div key={g.row.key}
                className="flex items-stretch border-b transition-colors last:border-b-0 hover:bg-[var(--bg-hover)]"
                style={{ borderColor: "var(--border)" }}
                onMouseMove={(e) => setHover({ g, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}>
                <div style={{ width: LABEL_W }} className="shrink-0 px-3 py-2">
                  <div className="truncate text-[0.8rem] font-semibold text-[var(--text-primary)]" title={g.row.hito}>{g.row.hito}</div>
                  <div className="truncate text-[0.68rem] text-[var(--text-muted)]" title={`${g.row.proyecto}${g.row.developer ? " · " + g.row.developer : ""}`}>
                    {g.row.proyecto}{g.row.developer && <> · <span className="text-[var(--text-secondary)]">{g.row.developer}</span></>}
                  </div>
                </div>

                <div className="relative flex-1" style={{ minHeight: 44 }}>
                  {/* Grid vertical (meses) */}
                  {ticks.map((t, i) => (
                    <div key={i} className="absolute top-0 bottom-0 w-px" style={{ left: `${tickPct(t.date)}%`, background: "var(--border)", opacity: 0.5 }} />
                  ))}

                  {!g.hasDates ? (
                    <div className="flex h-full items-center pl-2 text-[0.72rem] italic text-[var(--text-disabled)]">— sin fechas —</div>
                  ) : (
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
                      {/* Barra única — color por status: verde completado, amarillo en
                          curso a tiempo, rojo atrasado, azul futuro (ver barStatus) */}
                      {g.barW > 0 && (
                        <div className="absolute h-[9px] rounded" title={BAR_STATUS_LABEL[barStatus(g.row, nowMs)]}
                          style={{ left: `${g.barL}%`, width: `${g.barW}%`, top: -4, background: g.barColor }} />
                      )}
                      {/* C Entrega Desarrollo (deadline) */}
                      {g.limitX != null && (
                        <div className="absolute" title={`${POINT_LABELS.limit}: ${fmtDate(g.row.limit)}`}
                          style={{ left: `${g.limitX}%`, top: -9, bottom: -9, width: 2, background: "var(--warn)", transform: "translateX(-1px)" }} />
                      )}
                      {/* A Inicio */}
                      {g.firmadoX != null && <Dot x={g.firmadoX} color="var(--text-secondary)" title={`${POINT_LABELS.firmado}: ${fmtDate(g.row.firmado)}`} />}
                      {/* Req Terminado */}
                      {g.reqTerminadoX != null && <Dot x={g.reqTerminadoX} color="var(--warn)" title={`Req Terminado: ${fmtDate(g.row.reqTerminado)}`} />}
                      {/* B Analisis tecnico */}
                      {g.analisisX != null && <Dot x={g.analisisX} color="var(--accent)" title={`Analisis tecnico: ${fmtDate(g.row.analisis)}`} />}
                      {/* D Salida en vivo */}
                      {g.entregaX != null && <Diamond x={g.entregaX} color={g.late ? "var(--bad)" : "var(--ok)"} title={`${POINT_LABELS.entrega}: ${fmtDate(g.row.entrega)}${g.late ? " (atrasado)" : ""}`} />}
                      {/* En curso → marcador hoy */}
                      {g.ongoingX != null && <Dot x={g.ongoingX} color="var(--accent)" hollow title="En curso (hoy)" />}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hover && <TimelineTooltip g={hover.g} x={hover.x} y={hover.y} nowMs={nowMs} />}
    </div>
  );
}

// ── Tooltip explicativo por fila ──
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
const fmtDays = (n: number) => `${n} día${Math.abs(n) === 1 ? "" : "s"}`;

function TipRow({ dot, label, value, muted }: { dot: string; label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
        <span style={{ color: dot }}>●</span>{label}
      </span>
      <span className={muted ? "text-[var(--text-disabled)]" : "font-semibold text-[var(--text-primary)]"} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function TimelineTooltip({ g, x, y, nowMs }: { g: RowGeom; x: number; y: number; nowMs: number }) {
  const r = g.row;
  const W = 300;
  const vw = typeof window !== "undefined" ? window.innerWidth : 9999;
  const vh = typeof window !== "undefined" ? window.innerHeight : 9999;
  const left = x + 16 + W > vw ? Math.max(8, x - W - 16) : x + 16;
  const top = Math.min(y + 16, vh - 240);

  const endReal = r.entrega ?? (r.enDesarrollo ? new Date(nowMs) : (r.limit ?? null));
  const espera = r.firmado && r.analisis ? daysBetween(r.firmado, r.analisis) : null;
  const desarrolloFrom = r.analisis ?? r.firmado;
  const desarrollo = desarrolloFrom && endReal ? daysBetween(desarrolloFrom, endReal) : null;

  const bStatus = barStatus(r, nowMs);
  const isLateNow = bStatus === "completado" ? g.late : bStatus === "atrasado";
  const atraso = isLateNow && r.limit && endReal ? daysBetween(r.limit, endReal) : null;

  const estado = bStatus === "completado"
    ? (g.late ? { label: "Entregado con atraso", color: "var(--bad)" } : { label: "Entregado a tiempo", color: "var(--ok)" })
    : bStatus === "atrasado" ? { label: "En curso · atrasado", color: "var(--bad)" }
    : bStatus === "futuro" ? { label: "Aún no inicia", color: "var(--info)" }
    : { label: "En curso", color: "var(--warn)" };

  return (
    <div
      className="pointer-events-none fixed z-[100] rounded-lg border p-3 text-[0.74rem] shadow-lg"
      style={{ left, top, width: W, background: "var(--bg-surface)", borderColor: "var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}
    >
      <div className="mb-0.5 font-bold text-[var(--text-primary)]">{r.hito}</div>
      <div className="mb-2 text-[0.7rem] text-[var(--text-muted)]">
        {r.proyecto}{r.pm && <> · PM {r.pm}</>}{r.developer && <> · Dev {r.developer}</>}
      </div>

      <div className="mb-2 inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-bold"
        style={{ color: estado.color, background: "var(--bg-hover)", border: `1px solid ${estado.color}` }}>
        {estado.label}
      </div>

      <div className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
        <TipRow dot="var(--text-secondary)" label={POINT_LABELS.firmado} value={r.firmado ? fmtDate(r.firmado) : "—"} muted={!r.firmado} />
        <TipRow dot="var(--warn)" label="Req Terminado" value={r.reqTerminado ? fmtDate(r.reqTerminado) : "—"} muted={!r.reqTerminado} />
        <TipRow dot="var(--accent)" label="Analisis tecnico" value={r.analisis ? fmtDate(r.analisis) : "—"} muted={!r.analisis} />
        <TipRow dot="var(--warn)" label={POINT_LABELS.limit} value={r.limit ? fmtDate(r.limit) : "—"} muted={!r.limit} />
        <TipRow dot={g.late ? "var(--bad)" : "var(--ok)"} label={POINT_LABELS.entrega} value={r.entrega ? fmtDate(r.entrega) : "pendiente"} muted={!r.entrega} />
      </div>

      {(espera != null || desarrollo != null || atraso != null) && (
        <div className="mt-2 flex flex-col gap-1 border-t pt-2 text-[0.7rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
          {espera != null && <div>Espera inicio → análisis: <b className="text-[var(--text-secondary)]">{fmtDays(espera)}</b></div>}
          {desarrollo != null && <div>Desarrollo (análisis → {g.entregado ? "entrega" : "hoy"}): <b className="text-[var(--text-secondary)]">{fmtDays(desarrollo)}</b></div>}
          {atraso != null && atraso > 0 && <div style={{ color: "var(--bad)" }}>Atraso vs. deadline: <b>{fmtDays(atraso)}</b></div>}
        </div>
      )}
    </div>
  );
}

// Tarjeta "A futuro": total + cuántos de esos no tienen CPM Inicio cargado
// (el resto sí tiene CPM pero apunta a una fecha que todavía no llega).
function FuturoStatCard({ value, sinCpm }: { value: number; sinCpm: number }) {
  return (
    <div className="rounded-xl border p-[18px] text-center" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div style={{ fontSize: "2.2rem", fontWeight: 700, lineHeight: 1, color: "var(--card-value-total)" }}>{value}</div>
      <div className="mt-1.5 text-[0.75rem] uppercase tracking-wide text-[var(--text-secondary)]">A futuro</div>
      <div className="mt-2.5 border-t pt-2.5 text-[0.75rem] font-semibold" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
        {sinCpm} sin CPM de inicio
      </div>
    </div>
  );
}

// Tarjeta de tiempo por tramo: Promedio/Mediana en días hábiles + tamaño de muestra.
function TiempoStatCard({ label, stat }: { label: string; stat: { value: number | null; n: number } }) {
  return (
    <div className="rounded-xl border p-[18px] text-center" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div style={{ fontSize: "2.2rem", fontWeight: 700, lineHeight: 1, color: "var(--card-value-total)" }}>
        {stat.value !== null ? stat.value.toFixed(1) : "—"}
      </div>
      <div className="mt-1.5 text-[0.75rem] uppercase tracking-wide text-[var(--text-secondary)]">{label}</div>
      <div className="mt-2.5 border-t pt-2.5 text-[0.72rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border-subtle)" }}>
        {stat.n > 0 ? `días hábiles · n=${stat.n}` : "sin datos"}
      </div>
    </div>
  );
}

// ── Marcadores ──
function Dot({ x, color, title, hollow }: { x: number; color: string; title: string; hollow?: boolean }) {
  return (
    <div className="absolute rounded-full" title={title}
      style={{
        left: `${x}%`, top: -5, width: 10, height: 10, transform: "translateX(-5px)",
        background: hollow ? "var(--bg-surface)" : color, border: `2px solid ${color}`,
        boxShadow: "0 0 0 2px var(--bg-surface)",
      }} />
  );
}
function Diamond({ x, color, title }: { x: number; color: string; title: string }) {
  return (
    <div className="absolute" title={title}
      style={{
        left: `${x}%`, top: -5, width: 10, height: 10, transform: "translateX(-5px) rotate(45deg)",
        background: color, boxShadow: "0 0 0 2px var(--bg-surface)",
      }} />
  );
}

// ── Leyenda ──
function Legend() {
  const item = (node: React.ReactNode, label: string) => (
    <span className="inline-flex items-center gap-1.5 text-[0.72rem] text-[var(--text-secondary)]">{node}{label}</span>
  );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      {item(<span className="inline-block h-[9px] w-6 rounded" style={{ background: "var(--ok)" }} />, "Completado")}
      {item(<span className="inline-block h-[9px] w-6 rounded" style={{ background: "var(--warn)" }} />, "En curso · a tiempo")}
      {item(<span className="inline-block h-[9px] w-6 rounded" style={{ background: "var(--bad)" }} />, "Atrasado (Stuck, o pasó el Limit Date)")}
      {item(<span className="inline-block h-[9px] w-6 rounded" style={{ background: "var(--info)" }} />, "Aún no inicia (Future Steps)")}
      {item(<span className="inline-block h-4 w-0.5" style={{ background: "var(--warn)" }} />, "Deadline (Entrega Desarrollo)")}
    </div>
  );
}
