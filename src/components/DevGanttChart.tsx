"use client";

// Mini-Gantt de Desarrollo Timeliness para UN proyecto — mismo lenguaje visual
// y las MISMAS reglas de color/estado que la página completa /desarrollo-timelines
// (ver lib/devTimeline.ts, única fuente de barStatus/BAR_COLOR/monthTicks/etc.),
// pero sin filtros ni tooltip flotante: acá ya viene un solo proyecto, así que
// se muestra fecha por fecha en una tabla debajo del Gantt.

import { fmtDate } from "@/lib/business";
import {
  barStatus, wasDeliveredLate, monthTicks, BAR_COLOR, BAR_STATUS_LABEL,
  type DevTimelineRow,
} from "@/lib/devTimeline";

const LABEL_W = 200;

function Dot({ x, color, title }: { x: number; color: string; title: string }) {
  return (
    <div className="absolute rounded-full" title={title}
      style={{
        left: `${x}%`, top: -5, width: 10, height: 10, transform: "translateX(-5px)",
        background: color, border: `2px solid ${color}`, boxShadow: "0 0 0 2px var(--bg-surface)",
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

function Legend() {
  const item = (node: React.ReactNode, label: string) => (
    <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-[var(--text-secondary)]">{node}{label}</span>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
      {item(<span className="inline-block h-[8px] w-5 rounded" style={{ background: "var(--ok)" }} />, "Completado")}
      {item(<span className="inline-block h-[8px] w-5 rounded" style={{ background: "var(--warn)" }} />, "En curso · a tiempo")}
      {item(<span className="inline-block h-[8px] w-5 rounded" style={{ background: "var(--bad)" }} />, "Atrasado")}
      {item(<span className="inline-block h-[8px] w-5 rounded" style={{ background: "var(--info)" }} />, "Aún no inicia")}
      {item(<span className="inline-block h-3.5 w-0.5" style={{ background: "var(--warn)" }} />, "Deadline")}
    </div>
  );
}

export default function DevGanttChart({ rows, now }: { rows: DevTimelineRow[]; now: Date }) {
  const nowMs = now.getTime();

  if (rows.length === 0) {
    return <p className="text-[0.8rem] text-[var(--text-muted)]">Este proyecto no tiene hitos en desarrollo.</p>;
  }

  const dates: number[] = [nowMs];
  rows.forEach((r) => {
    [r.firmado, r.reqTerminado, r.analisis, r.limit, r.entrega].forEach((d) => { if (d) dates.push(d.getTime()); });
  });
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const addMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const min = startOfMonth(new Date(Math.min(...dates)));
  const max = addMonth(new Date(Math.max(...dates)));
  const span = max.getTime() - min.getTime();
  const pct = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - min.getTime()) / span) * 100));

  const ticks = monthTicks(min, max);
  const tickPct = (d: Date) => ((d.getTime() - min.getTime()) / span) * 100;
  const chartMinWidth = LABEL_W + Math.max(ticks.length, 4) * 80;

  const geoms = rows.map((r) => {
    const { firmado, reqTerminado, analisis, limit, entrega, enDesarrollo } = r;
    const entregado = !!entrega;
    const startPoint = firmado ?? reqTerminado ?? analisis ?? limit ?? entrega;
    const endReal = entrega ?? (enDesarrollo ? now : (limit ?? startPoint));
    const late = wasDeliveredLate(r);

    let barL = 0, barW = 0;
    if (startPoint && endReal && endReal.getTime() >= startPoint.getTime()) {
      barL = pct(startPoint);
      barW = Math.max(pct(endReal) - barL, 0.4);
    }

    return {
      row: r,
      hasDates: !!(firmado || reqTerminado || analisis || limit || entrega),
      barL, barW, barColor: BAR_COLOR[barStatus(r, nowMs)],
      firmadoX: firmado ? pct(firmado) : null,
      reqTerminadoX: reqTerminado ? pct(reqTerminado) : null,
      analisisX: analisis ? pct(analisis) : null,
      limitX: limit ? pct(limit) : null,
      entregaX: entrega ? pct(entrega) : null,
      ongoingX: !entregado && enDesarrollo ? pct(now) : null,
      late,
    };
  });

  return (
    <div>
      <Legend />
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
        <div style={{ minWidth: chartMinWidth }}>
          {/* Eje */}
          <div className="flex items-end border-b" style={{ borderColor: "var(--border)" }}>
            <div style={{ width: LABEL_W }} className="shrink-0 px-3 py-2 text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Hito
            </div>
            <div className="relative h-8 flex-1">
              {ticks.map((t, i) => (
                <div key={i} className="absolute top-0 h-full" style={{ left: `${tickPct(t.date)}%` }}>
                  <div className="h-full w-px" style={{ background: "var(--border)" }} />
                  <span className="absolute top-1 left-1 whitespace-nowrap text-[0.64rem] text-[var(--text-muted)]">{t.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Filas */}
          {geoms.map((g) => (
            <div key={g.row.key} className="flex items-stretch border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <div style={{ width: LABEL_W }} className="shrink-0 px-3 py-2">
                <div className="truncate text-[0.76rem] font-semibold text-[var(--text-primary)]" title={g.row.hito}>{g.row.hito}</div>
                {g.row.developer && <div className="truncate text-[0.65rem] text-[var(--text-muted)]">{g.row.developer}</div>}
              </div>
              <div className="relative flex-1" style={{ minHeight: 40 }}>
                {ticks.map((t, i) => (
                  <div key={i} className="absolute top-0 bottom-0 w-px" style={{ left: `${tickPct(t.date)}%`, background: "var(--border)", opacity: 0.5 }} />
                ))}
                {!g.hasDates ? (
                  <div className="flex h-full items-center pl-2 text-[0.68rem] italic text-[var(--text-disabled)]">— sin fechas —</div>
                ) : (
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
                    {g.barW > 0 && (
                      <div className="absolute h-[8px] rounded" title={BAR_STATUS_LABEL[barStatus(g.row, nowMs)]}
                        style={{ left: `${g.barL}%`, width: `${g.barW}%`, top: -4, background: g.barColor }} />
                    )}
                    {g.limitX != null && (
                      <div className="absolute" title={`Entrega Desarrollo: ${fmtDate(g.row.limit)}`}
                        style={{ left: `${g.limitX}%`, top: -8, bottom: -8, width: 2, background: "var(--warn)", transform: "translateX(-1px)" }} />
                    )}
                    {g.firmadoX != null && <Dot x={g.firmadoX} color="var(--text-secondary)" title={`Inicio: ${fmtDate(g.row.firmado)}`} />}
                    {g.reqTerminadoX != null && <Dot x={g.reqTerminadoX} color="var(--warn)" title={`Req Terminado: ${fmtDate(g.row.reqTerminado)}`} />}
                    {g.analisisX != null && <Dot x={g.analisisX} color="var(--accent)" title={`Análisis técnico: ${fmtDate(g.row.analisis)}`} />}
                    {g.entregaX != null && <Diamond x={g.entregaX} color={g.late ? "var(--bad)" : "var(--ok)"} title={`Salida en vivo: ${fmtDate(g.row.entrega)}${g.late ? " (atrasado)" : ""}`} />}
                    {g.ongoingX != null && <Dot x={g.ongoingX} color="var(--accent)" title="En curso (hoy)" />}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabla de fechas — mismo dato del Gantt, en detalle */}
      <div className="mt-3 max-h-72 overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <table className="pmo w-full text-[0.72rem]">
          <thead>
            <tr>
              <th>Hito</th><th>Estado</th><th>Inicio</th><th>Req Terminado</th><th>Análisis técnico</th><th>Entrega Desarrollo</th><th>Salida en vivo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const bs = barStatus(r, nowMs);
              return (
                <tr key={r.key}>
                  <td style={{ maxWidth: 200, wordBreak: "break-word" }}>{r.hito}</td>
                  <td className="whitespace-nowrap font-semibold" style={{ color: BAR_COLOR[bs] }}>{BAR_STATUS_LABEL[bs]}</td>
                  <td className="whitespace-nowrap tabular-nums">{fmtDate(r.firmado)}</td>
                  <td className="whitespace-nowrap tabular-nums">{fmtDate(r.reqTerminado)}</td>
                  <td className="whitespace-nowrap tabular-nums">{fmtDate(r.analisis)}</td>
                  <td className="whitespace-nowrap tabular-nums">{fmtDate(r.limit)}</td>
                  <td className="whitespace-nowrap tabular-nums">{fmtDate(r.entrega)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
