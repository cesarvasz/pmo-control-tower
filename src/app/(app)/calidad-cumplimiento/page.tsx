"use client";

// Auditoría cruzada de las dos métricas de "entregas" del KPI:
//   · Cumplimiento de Entrega (peso 15): REQ + items/subitems de Proyecto con
//     veredicto on-time/late.
//   · Calidad de Entregas (peso 20, "reproceso"): REQ CERRADOS + fases de
//     Proyecto COMPLETADAS, limpias vs. con reproceso.
// Objetivo: ver cuántos casos hay de cada tipo y QUIÉN ha sido el responsable
// asignado, para medir patrones y poder asignar responsables desde aquí mismo
// (reutiliza ResponsibleSelect — misma atribución que REQ/Proyectos).

import { Fragment, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { fmtDate } from "@/lib/business";
import { buildEntregaRows, buildReprocesoRows } from "@/lib/dashboard";
import { DELAY_RESPONSIBLES, REPROCESO_RESPONSIBLES, RESPONSIBLE_COLOR, countByResponsible, type DelayMap } from "@/lib/delay";
import ResponsibleSelect from "@/components/ResponsibleSelect";
import MultiSelect, { type MSOption } from "@/components/MultiSelect";
import { EmptyRow, ErrorBox, FilterReset, Loader, Pill, StatCard } from "@/components/ui";
import type { ProjBoard, ProjItem, ReqItem } from "@/types";

const SIN_ASIGNAR = "Sin asignar";
const responsableOf = (id: string, map: DelayMap) => map[id]?.responsible || SIN_ASIGNAR;

export default function CalidadCumplimientoPage() {
  const { data, loading, error } = useData();
  const [tab, setTab] = useState<"entrega" | "reproceso">("entrega");

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const { req, proj, projBoards, delayAttributions: delays, reprocesoAttributions: reproceso } = data;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Calidad &amp; Cumplimiento</h1>
      </div>
      <p className="mb-5 text-[0.82rem] text-[var(--text-muted)]">
        Quién ha sido responsable de los atrasos y los reprocesos, para medir patrones y asignar responsables.
      </p>

      {/* Tabs */}
      <div className="mb-6 flex w-fit rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
        {([
          ["entrega", "Cumplimiento de Entrega"],
          ["reproceso", "Calidad de Entregas"],
        ] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className="rounded-md px-3.5 py-1.5 text-[0.82rem] font-bold transition-colors"
            style={tab === v ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-muted)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "entrega"
        ? <EntregaTab req={req} proj={proj} projBoards={projBoards} delays={delays} />
        : <ReprocesoTab req={req} proj={proj} projBoards={projBoards} reproceso={reproceso} />}
    </div>
  );
}

// ── Barra horizontal por responsable (paleta categórica validada) ─────────
function ResponsibleBars({ counts, total }: { counts: Record<string, number>; total: number }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  if (entries.length === 0) return <div className="py-6 text-center text-[0.8rem] text-[var(--text-disabled)]">Sin casos para los filtros seleccionados.</div>;
  return (
    <div className="viz-resp flex flex-col gap-2.5">
      {entries.map(([label, n]) => (
        <div key={label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-right text-[0.78rem] text-[var(--text-secondary)]" title={label}>{label}</span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="viz-track" style={{ width: `${(n / max) * 100}%` }}>
              <div className="viz-seg viz-seg--only" style={{ width: "100%", background: RESPONSIBLE_COLOR[label] ?? RESPONSIBLE_COLOR[SIN_ASIGNAR] }} />
            </div>
            <span className="shrink-0 text-[0.82rem] font-semibold tabular-nums text-[var(--text-primary)]">
              {n} <span className="font-normal text-[var(--text-muted)]">· {total ? Math.round((n / total) * 100) : 0}%</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Filtros compartidos por ambas pestañas ─────────────────────────────────
function useRowFilters<T extends { pm: string; tipo?: "PM" | "PML" }>(rows: T[]) {
  const [pms, setPms] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [resps, setResps] = useState<string[]>([]);
  const [soloProblema, setSoloProblema] = useState(true);

  const allPMs = useMemo(() => [...new Set(rows.map((r) => r.pm).filter(Boolean))].sort(), [rows]);
  const pmOpts: MSOption[] = allPMs.map((pm) => ({
    value: pm, label: pm, count: rows.filter((r) => r.pm === pm).length,
  }));

  const allTipos = useMemo(() => [...new Set(rows.map((r) => r.tipo).filter(Boolean) as string[])].sort(), [rows]);
  const tipoOpts: MSOption[] = allTipos.map((t) => ({
    value: t, label: t, count: rows.filter((r) => r.tipo === t).length,
  }));

  const byPm = useMemo(
    () => rows.filter((r) =>
      (pms.length === 0 || pms.includes(r.pm)) &&
      (tipos.length === 0 || (r.tipo != null && tipos.includes(r.tipo)))),
    [rows, pms, tipos],
  );

  const anyFilter = pms.length > 0 || tipos.length > 0 || resps.length > 0 || !soloProblema;
  const reset = () => { setPms([]); setTipos([]); setResps([]); setSoloProblema(true); };

  return { pms, setPms, pmOpts, tipos, setTipos, tipoOpts, resps, setResps, soloProblema, setSoloProblema, byPm, anyFilter, reset };
}

// ── Cumplimiento de Entrega ─────────────────────────────────────────────
// Desde este cambio la unidad es la FASE de Proyecto (board+grupo), no el hito
// individual: un solo responsable por fase, y el acordeón de abajo muestra
// SOLO los steps/hitos que salieron atrasados dentro de esa fase (solo lectura,
// no se asigna responsable ahí — ver buildEntregaRows en lib/dashboard.ts).
function FaseAtrasadaAccordion({ items }: { items: { kind: "step" | "hito"; name: string; stepPadre: string; deadline: Date | null }[] }) {
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-left text-[0.76rem]">
        <thead>
          <tr style={{ background: "var(--bg-hover)" }}>
            <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Tipo</th>
            <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Nombre</th>
            <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Step padre</th>
            <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="px-3 py-1.5"><Pill tone="bad" small>{it.kind === "step" ? "Step" : "Hito"}</Pill></td>
              <td className="px-3 py-1.5 text-[var(--text-primary)]">{it.name}</td>
              <td className="px-3 py-1.5 text-[var(--text-secondary)]">{it.stepPadre || <span className="text-[var(--text-disabled)]">—</span>}</td>
              <td className="px-3 py-1.5 whitespace-nowrap text-[var(--text-secondary)]">{fmtDate(it.deadline)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntregaTab({ req, proj, projBoards, delays }: {
  req: ReqItem[]; proj: ProjItem[]; projBoards: ProjBoard[]; delays: DelayMap;
}) {
  const rows = useMemo(() => buildEntregaRows(req, proj, projBoards), [req, proj, projBoards]);
  const { pms, setPms, pmOpts, tipos, setTipos, tipoOpts, resps, setResps, soloProblema, setSoloProblema, byPm, anyFilter, reset } = useRowFilters(rows);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const toggleAbierta = (id: string) => setAbiertas((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const late = byPm.filter((r) => r.verdict === "late");
  const onTimeCount = byPm.length - late.length;
  const pct = byPm.length ? Math.round((onTimeCount / byPm.length) * 100) : null;
  const pctColor = pct === null ? "#6b7280" : pct >= 90 ? "var(--ok)" : pct >= 75 ? "var(--warn)" : "var(--bad)";

  const respCounts = countByResponsible(late.map((r) => r.id), delays);
  const respOpts: MSOption[] = [...DELAY_RESPONSIBLES, SIN_ASIGNAR].map((r) => ({ value: r, label: r, count: respCounts[r] ?? 0 }));

  const tableRows = byPm
    .filter((r) => resps.length === 0 || resps.includes(responsableOf(r.id, delays)))
    .filter((r) => !soloProblema || r.verdict === "late")
    .sort((a, b) => (a.verdict === b.verdict ? a.pm.localeCompare(b.pm) || a.name.localeCompare(b.name) : a.verdict === "late" ? -1 : 1));

  return (
    <div>
      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard value={byPm.length} label="Total entregas" />
        <StatCard value={onTimeCount} label="A tiempo" color="var(--ok)" borderColor="var(--ok)" />
        <StatCard value={late.length} label="Con atraso" color="var(--bad)" borderColor="var(--bad)" />
        <StatCard value={pct !== null ? `${pct}%` : "—"} label="% a tiempo" color={pctColor} borderColor={pctColor} />
      </div>

      {/* Gráfica por responsable */}
      <div className="mb-6 rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="mb-4 text-[0.82rem] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          Responsable de los atrasos {pms.length > 0 && <span className="font-normal normal-case text-[var(--text-muted)]">· {pms.join(", ")}</span>}
        </div>
        <ResponsibleBars counts={respCounts} total={late.length} />
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3.5">
        <MultiSelect label="Tipo" options={tipoOpts} selected={tipos} onToggle={(v, ch) => setTipos((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setTipos([])} />
        <MultiSelect label="PM" options={pmOpts} selected={pms} onToggle={(v, ch) => setPms((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setPms([])} />
        <MultiSelect label="Responsable" options={respOpts} selected={resps} onToggle={(v, ch) => setResps((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setResps([])} />
        <button
          onClick={() => setSoloProblema((v) => !v)}
          className="self-end whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors"
          style={soloProblema
            ? { borderColor: "var(--bad)", color: "var(--bad)", background: "var(--bad-bg)" }
            : { borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          {soloProblema ? "✓ Solo con atraso" : "Solo con atraso"}
        </button>
        {anyFilter && <FilterReset onClick={reset} />}
      </div>

      {/* Detalle */}
      {tableRows.length === 0 ? <EmptyRow /> : (
        <div className="table-wrap">
          <table className="pmo">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Tipo</th><th>ID / Proyecto</th><th>Fase</th><th>Atrasos</th><th>PM</th><th>Deadline</th><th>Estado</th><th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => {
                const expandible = r.source === "Proyecto" && r.totalAtrasados > 0;
                const abierta = expandible && abiertas.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <tr className={expandible ? "cursor-pointer" : undefined} onClick={() => expandible && toggleAbierta(r.id)}>
                      <td>
                        {expandible && (
                          <span
                            className="inline-block text-[0.6rem] text-[var(--accent)]"
                            style={{ transition: "transform 0.15s", transform: abierta ? "rotate(90deg)" : undefined }}
                          >▶</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Pill tone={r.tipo === "PM" ? "info" : "neutral"}>{r.tipo}</Pill>
                      </td>
                      {/* Los REQ (PML) no cuelgan de un proyecto: proyecto vacío → "—". */}
                      <td>
                        {r.projName ? (
                          <div className="leading-tight">
                            {r.projCode && <div className="ini-id">{r.projCode}</div>}
                            <div style={{ color: "var(--text-secondary)" }}>{r.projName}</div>
                          </div>
                        ) : (
                          <span className="ini-name">{r.name}</span>
                        )}
                      </td>
                      <td style={{ color: "var(--text-secondary)" }}>{r.fase || <span className="text-[var(--text-disabled)]">—</span>}</td>
                      <td className="tabular-nums" style={{ color: r.totalAtrasados > 0 ? "var(--bad)" : "var(--text-secondary)" }}>
                        {r.source === "Proyecto" ? `${r.totalAtrasados} / ${r.totalEvaluados}` : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="pm-name">{r.pm || <span className="text-[var(--text-disabled)]">—</span>}</td>
                      <td style={{ whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{r.deadline ? fmtDate(r.deadline) : <span className="text-[var(--text-disabled)]">—</span>}</td>
                      <td>{r.verdict === "late" ? <Pill tone="bad">✕ Atrasado</Pill> : <Pill tone="ok">✓ A tiempo</Pill>}</td>
                      <td onClick={(e) => e.stopPropagation()}><ResponsibleSelect itemId={r.id} kind="delay" emptyPenalizes={r.verdict === "late"} /></td>
                    </tr>
                    {abierta && (
                      <tr>
                        <td></td>
                        <td colSpan={8} className="pb-3">
                          <FaseAtrasadaAccordion items={r.itemsAtrasados} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Calidad de Entregas (Reproceso) ─────────────────────────────────────
function ReprocesoTab({ req, proj, projBoards, reproceso }: {
  req: ReqItem[]; proj: ProjItem[]; projBoards: ProjBoard[]; reproceso: DelayMap;
}) {
  const rows = useMemo(() => buildReprocesoRows(req, proj, projBoards, reproceso), [req, proj, projBoards, reproceso]);
  const { pms, setPms, pmOpts, resps, setResps, soloProblema, setSoloProblema, byPm, anyFilter, reset } = useRowFilters(rows);

  const conReproceso = byPm.filter((r) => r.verdict === "reproceso");
  const limpias = byPm.length - conReproceso.length;
  const pct = byPm.length ? Math.round((limpias / byPm.length) * 100) : null;
  const pctColor = pct === null ? "#6b7280" : pct >= 90 ? "var(--ok)" : pct >= 75 ? "var(--warn)" : "var(--bad)";

  const respCounts = countByResponsible(conReproceso.map((r) => r.id), reproceso);
  const respOpts: MSOption[] = [...REPROCESO_RESPONSIBLES, SIN_ASIGNAR].map((r) => ({ value: r, label: r, count: respCounts[r] ?? 0 }));

  const tableRows = byPm
    .filter((r) => resps.length === 0 || resps.includes(responsableOf(r.id, reproceso)))
    .filter((r) => !soloProblema || r.verdict === "reproceso")
    .sort((a, b) => (a.verdict === b.verdict ? a.pm.localeCompare(b.pm) || a.name.localeCompare(b.name) : a.verdict === "reproceso" ? -1 : 1));

  return (
    <div>
      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard value={byPm.length} label="Total unidades" />
        <StatCard value={limpias} label="Limpias" color="var(--ok)" borderColor="var(--ok)" />
        <StatCard value={conReproceso.length} label="Con reproceso" color="var(--bad)" borderColor="var(--bad)" />
        <StatCard value={pct !== null ? `${pct}%` : "—"} label="% limpias" color={pctColor} borderColor={pctColor} />
      </div>

      {/* Gráfica por responsable */}
      <div className="mb-6 rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="mb-4 text-[0.82rem] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          Responsable de los reprocesos {pms.length > 0 && <span className="font-normal normal-case text-[var(--text-muted)]">· {pms.join(", ")}</span>}
        </div>
        <ResponsibleBars counts={respCounts} total={conReproceso.length} />
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3.5">
        <MultiSelect label="PM" options={pmOpts} selected={pms} onToggle={(v, ch) => setPms((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setPms([])} />
        <MultiSelect label="Responsable" options={respOpts} selected={resps} onToggle={(v, ch) => setResps((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setResps([])} />
        <button
          onClick={() => setSoloProblema((v) => !v)}
          className="self-end whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors"
          style={soloProblema
            ? { borderColor: "var(--bad)", color: "var(--bad)", background: "var(--bad-bg)" }
            : { borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          {soloProblema ? "✓ Solo con reproceso" : "Solo con reproceso"}
        </button>
        {anyFilter && <FilterReset onClick={reset} />}
      </div>

      {/* Detalle */}
      {tableRows.length === 0 ? <EmptyRow /> : (
        <div className="table-wrap">
          <table className="pmo">
            <thead>
              <tr>
                <th>Fuente</th><th>Nombre</th><th>PM</th><th>Estado</th><th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap", color: "var(--text-muted)" }}>{r.source}</td>
                  <td className="ini-name">{r.name}</td>
                  <td className="pm-name">{r.pm || <span className="text-[var(--text-disabled)]">—</span>}</td>
                  <td>{r.verdict === "reproceso" ? <Pill tone="bad">✕ Con reproceso</Pill> : <Pill tone="ok">✓ Limpia</Pill>}</td>
                  <td><ResponsibleSelect itemId={r.id} kind="reproceso" emptyPenalizes={r.verdict === "reproceso"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
