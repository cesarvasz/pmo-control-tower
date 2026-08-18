"use client";

// Desarrollo Timelines — Gantt del ciclo de vida de DESARROLLO por hito.
// Cada hito (subitem, por PMS ID) es una línea con 4 fechas tomadas de 3 steps
// del board (ver lib/devTimeline.ts):
//   A firmado  · B análisis · C limit (deadline) · D entrega (fin real)
// Todas las líneas comparten un eje temporal para ver traslapes. Filtros por
// Proyecto, PM y Developer. Scope: hitos en Desarrollo (toggle para incluir
// los ya entregados).

import { useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { fmtDate } from "@/lib/business";
import { buildDevTimelines, type DevTimelineRow } from "@/lib/devTimeline";
import MultiSelect, { type MSOption } from "@/components/MultiSelect";
import { EmptyRow, ErrorBox, FilterReset, Loader, StatCard } from "@/components/ui";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DAY = 86_400_000;
const LABEL_W = 220; // ancho de la columna de etiquetas (izquierda)

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

/** Ticks de inicio de mes entre min y max (inclusive). */
function monthTicks(min: Date, max: Date): { date: Date; label: string }[] {
  const ticks: { date: Date; label: string }[] = [];
  for (let d = startOfMonth(min); d <= max; d = addMonth(d)) {
    ticks.push({ date: new Date(d), label: `${MONTHS_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
  }
  return ticks;
}

// ── Geometría de una fila (posiciones en % sobre el eje [min,max]) ─────────
interface RowGeom {
  row: DevTimelineRow;
  hasDates: boolean;
  preL: number; preW: number;      // segmento firma→análisis (espera pre-dev)
  devL: number; devW: number;      // segmento desarrollo (análisis→fin)
  lateL: number; lateW: number;    // porción atrasada (limit→fin), si aplica
  firmadoX: number | null;         // A
  analisisX: number | null;        // B
  limitX: number | null;           // C (deadline)
  entregaX: number | null;         // D
  ongoingX: number | null;         // marcador "hoy" si sigue en curso
  late: boolean;
  entregado: boolean;
}

export default function DesarrolloTimelinesPage() {
  const { data, loading, error } = useData();
  const [nowMs] = useState(() => Date.now()); // "hoy" fijado al montar (evita impureza en render)
  const [hover, setHover] = useState<{ g: RowGeom; x: number; y: number } | null>(null);
  const [proyectos, setProyectos] = useState<string[]>([]);
  const [pms, setPms] = useState<string[]>([]);
  const [devs, setDevs] = useState<string[]>([]);
  const [incluirEntregados, setIncluirEntregados] = useState(false);
  const [incluirFuturos, setIncluirFuturos] = useState(false);

  const allRows = useMemo(
    () => (data ? buildDevTimelines(data.proj, data.projBoards) : []),
    [data],
  );

  // Scope por fase: base = en desarrollo AHORA (Working on it); los entregados
  // (Done) y los futuros (Future Steps / no iniciados) entran solo si se activan.
  const scoped = useMemo(
    () => allRows.filter((r) =>
      r.devPhase === "working" ||
      (incluirEntregados && r.devPhase === "done") ||
      (incluirFuturos && r.devPhase === "future")),
    [allRows, incluirEntregados, incluirFuturos],
  );

  // Opciones dependientes: cada filtro se calcula sobre las filas ya acotadas
  // por los OTROS filtros (se excluye a sí mismo), y sus counts reflejan eso.
  const proyectoOpts = useMemo(
    () => opt(scoped.filter((r) =>
      (pms.length === 0 || pms.includes(r.pm)) &&
      (devs.length === 0 || devs.includes(r.developer))).map((r) => r.proyecto)),
    [scoped, pms, devs],
  );
  const pmOpts = useMemo(
    () => opt(scoped.filter((r) =>
      (proyectos.length === 0 || proyectos.includes(r.proyecto)) &&
      (devs.length === 0 || devs.includes(r.developer))).map((r) => r.pm)),
    [scoped, proyectos, devs],
  );
  const devOpts = useMemo(
    () => opt(scoped.filter((r) =>
      (proyectos.length === 0 || proyectos.includes(r.proyecto)) &&
      (pms.length === 0 || pms.includes(r.pm))).map((r) => r.developer)),
    [scoped, proyectos, pms],
  );

  const rows = useMemo(
    () => scoped.filter((r) =>
      (proyectos.length === 0 || proyectos.includes(r.proyecto)) &&
      (pms.length === 0 || pms.includes(r.pm)) &&
      (devs.length === 0 || devs.includes(r.developer))),
    [scoped, proyectos, pms, devs],
  );

  // ── Dominio temporal (eje X) ──
  const domain = useMemo(() => {
    const dates: number[] = [];
    for (const r of rows) {
      for (const dt of [r.firmado, r.analisis, r.limit, r.entrega]) if (dt) dates.push(dt.getTime());
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
      const { firmado, analisis, limit, entrega, enDesarrollo } = r;
      const entregado = !!entrega;
      const devFrom = analisis ?? firmado ?? limit ?? entrega;
      const endReal = entrega ?? (enDesarrollo ? new Date(today) : (limit ?? devFrom));
      const late = !!(limit && endReal && endReal.getTime() > limit.getTime() + DAY);

      const firmadoX = firmado ? pct(firmado) : null;
      const analisisX = analisis ? pct(analisis) : null;
      const limitX = limit ? pct(limit) : null;
      const entregaX = entrega ? pct(entrega) : null;
      const ongoingX = !entregado && enDesarrollo ? pct(new Date(today)) : null;

      // Segmento espera pre-dev (firma → análisis).
      let preL = 0, preW = 0;
      if (firmado && analisis && analisis.getTime() > firmado.getTime()) {
        preL = pct(firmado); preW = pct(analisis) - preL;
      }
      // Segmento desarrollo (análisis/firma → fin real).
      let devL = 0, devW = 0;
      if (devFrom && endReal && endReal.getTime() >= devFrom.getTime()) {
        devL = pct(devFrom); devW = Math.max(pct(endReal) - devL, 0.4);
      }
      // Porción atrasada (limit → fin real).
      let lateL = 0, lateW = 0;
      if (late && limit && endReal) {
        lateL = pct(limit); lateW = Math.max(pct(endReal) - lateL, 0.4);
      }

      return {
        row: r,
        hasDates: !!(firmado || analisis || limit || entrega),
        preL, preW, devL, devW, lateL, lateW,
        firmadoX, analisisX, limitX, entregaX, ongoingX, late, entregado,
      };
    }).sort((a, b) => {
      // Ordena por inicio del desarrollo para que los traslapes salten a la vista.
      const sa = a.devL || a.firmadoX || 0, sb = b.devL || b.firmadoX || 0;
      return sa - sb || a.row.proyecto.localeCompare(b.row.proyecto);
    });
  }, [rows, domain, nowMs]);

  const ticks = domain ? monthTicks(domain.min, domain.max) : [];
  const tickPct = (d: Date) => domain ? ((d.getTime() - domain.min.getTime()) / domain.span) * 100 : 0;
  const chartMinWidth = LABEL_W + Math.max(ticks.length, 4) * 88;

  // Stats
  const total = rows.length;
  const enCurso = rows.filter((r) => r.enDesarrollo).length;
  const atrasados = geoms.filter((g) => g.late).length;
  const aTiempo = geoms.filter((g) => g.entregado && !g.late).length;

  const anyFilter = proyectos.length > 0 || pms.length > 0 || devs.length > 0 || incluirEntregados || incluirFuturos;
  const reset = () => { setProyectos([]); setPms([]); setDevs([]); setIncluirEntregados(false); setIncluirFuturos(false); };
  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) =>
    (v: string, ch: boolean) => setter((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)));

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Desarrollo Timelines</h1>
      </div>
      <p className="mb-5 text-[0.82rem] text-[var(--text-muted)]">
        Ciclo de vida de desarrollo de cada hito sobre una línea de tiempo compartida, para ver traslapes.
        Cada barra va de la firma de hitos a la entrega, con su deadline (Limit Date) marcado.
      </p>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard value={total} label="Hitos" />
        <StatCard value={enCurso} label="En curso" color="var(--accent)" borderColor="var(--accent)" />
        <StatCard value={atrasados} label="Atrasados" color="var(--bad)" borderColor="var(--bad)" />
        <StatCard value={aTiempo} label="Entregados a tiempo" color="var(--ok)" borderColor="var(--ok)" />
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3.5">
        <MultiSelect label="Proyecto" options={proyectoOpts} selected={proyectos} onToggle={toggle(setProyectos)} onToggleAll={() => setProyectos([])} />
        <MultiSelect label="PM" options={pmOpts} selected={pms} onToggle={toggle(setPms)} onToggleAll={() => setPms([])} />
        <MultiSelect label="Developer" options={devOpts} selected={devs} onToggle={toggle(setDevs)} onToggleAll={() => setDevs([])} />
        <button
          onClick={() => setIncluirEntregados((v) => !v)}
          className="self-end whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors"
          style={incluirEntregados
            ? { borderColor: "var(--ok)", color: "var(--ok)", background: "var(--bg-hover)" }
            : { borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          {incluirEntregados ? "✓ Con entregados" : "+ Entregados"}
        </button>
        <button
          onClick={() => setIncluirFuturos((v) => !v)}
          className="self-end whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors"
          style={incluirFuturos
            ? { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--bg-hover)" }
            : { borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          {incluirFuturos ? "✓ Con futuros" : "+ Futuros"}
        </button>
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
                      {/* Segmento espera (firma → análisis) */}
                      {g.preW > 0 && (
                        <div className="absolute h-[7px] rounded" title="Espera: firma de hitos → análisis técnico"
                          style={{ left: `${g.preL}%`, width: `${g.preW}%`, top: -3, background: "var(--text-disabled)", opacity: 0.45 }} />
                      )}
                      {/* Segmento desarrollo */}
                      {g.devW > 0 && (
                        <div className="absolute h-[9px] rounded" title="Desarrollo (análisis → fin)"
                          style={{ left: `${g.devL}%`, width: `${g.devW}%`, top: -4, background: "var(--accent)" }} />
                      )}
                      {/* Porción atrasada (limit → fin) */}
                      {g.lateW > 0 && (
                        <div className="absolute h-[9px] rounded" title="Atraso: pasado el Limit Date"
                          style={{ left: `${g.lateL}%`, width: `${g.lateW}%`, top: -4, background: "var(--bad)" }} />
                      )}
                      {/* Deadline (Limit Date) */}
                      {g.limitX != null && (
                        <div className="absolute" title={`Deadline (Limit Date): ${fmtDate(g.row.limit)}`}
                          style={{ left: `${g.limitX}%`, top: -9, bottom: -9, width: 2, background: "var(--warn)", transform: "translateX(-1px)" }} />
                      )}
                      {/* A firmado */}
                      {g.firmadoX != null && <Dot x={g.firmadoX} color="var(--text-secondary)" title={`Hitos firmados: ${fmtDate(g.row.firmado)}`} />}
                      {/* B análisis */}
                      {g.analisisX != null && <Dot x={g.analisisX} color="var(--accent)" title={`Análisis técnico: ${fmtDate(g.row.analisis)}`} />}
                      {/* D entrega */}
                      {g.entregaX != null && <Diamond x={g.entregaX} color={g.late ? "var(--bad)" : "var(--ok)"} title={`Entrega: ${fmtDate(g.row.entrega)}${g.late ? " (atrasado)" : ""}`} />}
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
  const atraso = g.late && r.limit && endReal ? daysBetween(r.limit, endReal) : null;

  const estado = g.entregado
    ? (g.late ? { label: "Entregado con atraso", color: "var(--bad)" } : { label: "Entregado a tiempo", color: "var(--ok)" })
    : g.late ? { label: "En curso · atrasado", color: "var(--bad)" }
    : { label: "En curso", color: "var(--accent)" };

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
        <TipRow dot="var(--text-secondary)" label="Hitos firmados" value={r.firmado ? fmtDate(r.firmado) : "—"} muted={!r.firmado} />
        <TipRow dot="var(--accent)" label="Análisis técnico" value={r.analisis ? fmtDate(r.analisis) : "—"} muted={!r.analisis} />
        <TipRow dot="var(--warn)" label="Deadline (Limit)" value={r.limit ? fmtDate(r.limit) : "—"} muted={!r.limit} />
        <TipRow dot={g.late ? "var(--bad)" : "var(--ok)"} label="Entrega" value={r.entrega ? fmtDate(r.entrega) : "pendiente"} muted={!r.entrega} />
      </div>

      {(espera != null || desarrollo != null || atraso != null) && (
        <div className="mt-2 flex flex-col gap-1 border-t pt-2 text-[0.7rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
          {espera != null && <div>Espera firma → análisis: <b className="text-[var(--text-secondary)]">{fmtDays(espera)}</b></div>}
          {desarrollo != null && <div>Desarrollo (análisis → {g.entregado ? "entrega" : "hoy"}): <b className="text-[var(--text-secondary)]">{fmtDays(desarrollo)}</b></div>}
          {atraso != null && atraso > 0 && <div style={{ color: "var(--bad)" }}>Atraso vs. deadline: <b>{fmtDays(atraso)}</b></div>}
        </div>
      )}
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
      {item(<span className="inline-block h-[9px] w-6 rounded" style={{ background: "var(--accent)" }} />, "Desarrollo")}
      {item(<span className="inline-block h-[7px] w-6 rounded" style={{ background: "var(--text-disabled)", opacity: 0.45 }} />, "Espera (firma → análisis)")}
      {item(<span className="inline-block h-[9px] w-6 rounded" style={{ background: "var(--bad)" }} />, "Atraso (pasado Limit Date)")}
      {item(<span className="inline-block h-4 w-0.5" style={{ background: "var(--warn)" }} />, "Deadline (Limit Date)")}
      {item(<span className="inline-block h-2.5 w-2.5 rounded-full" style={{ border: "2px solid var(--text-secondary)" }} />, "Hitos firmados")}
      {item(<span className="inline-block h-2.5 w-2.5 rounded-full" style={{ border: "2px solid var(--accent)" }} />, "Análisis técnico")}
      {item(<span className="inline-block h-2.5 w-2.5" style={{ background: "var(--ok)", transform: "rotate(45deg)" }} />, "Entrega")}
    </div>
  );
}
