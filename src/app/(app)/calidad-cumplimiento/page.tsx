"use client";

// Auditoría cruzada de las dos métricas de "entregas" del KPI:
//   · Cumplimiento de Entrega (peso 15): REQ + items/subitems de Proyecto con
//     veredicto on-time/late.
//   · Calidad de Entregas (peso 20, "reproceso"): REQ CERRADOS + steps de
//     Proyecto (item padre = entregable) en "Done", limpias vs. con reproceso.
// Objetivo: ver cuántos casos hay de cada tipo y QUIÉN ha sido el responsable
// asignado, para medir patrones y poder asignar responsables desde aquí mismo
// (reutiliza ResponsibleSelect — misma atribución que REQ/Proyectos).

import { Fragment, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { fmtDate } from "@/lib/business";
import { buildEntregaRows, buildReprocesoRows, calidadProjectStatus, type ReprocesoCascade, type CalidadProjectStatus, type PendingCalidadItem } from "@/lib/dashboard";
import { hasAction } from "@/lib/permissions";
import { splitBoardName } from "@/lib/proj";
import { DELAY_RESPONSIBLES, REPROCESO_RESPONSIBLES, RESPONSIBLE_COLOR, countByResponsible, type DelayMap } from "@/lib/delay";
import ResponsibleSelect from "@/components/ResponsibleSelect";
import MultiSelect, { type MSOption } from "@/components/MultiSelect";
import { EmptyRow, ErrorBox, FilterReset, Loader, Pill, StatCard } from "@/components/ui";
import type { ProjBoard, ProjItem, ReqItem } from "@/types";

const SIN_ASIGNAR = "Sin asignar";
const responsableOf = (id: string, map: DelayMap) => map[id]?.responsible || SIN_ASIGNAR;

export default function CalidadCumplimientoPage() {
  const { data, loading, error } = useData();
  const { me } = useMe();
  const [tab, setTab] = useState<"entrega" | "reproceso">("entrega");

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const { req, proj, projBoards, delayAttributions: delays, reprocesoAttributions: reproceso } = data;
  const canEditFilters = me && hasAction(me.permissions, "manage_roles");

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
        ? <EntregaTab req={req} proj={proj} projBoards={projBoards} delays={delays} canEditFilters={canEditFilters} />
        : <ReprocesoTab req={req} proj={proj} projBoards={projBoards} reproceso={reproceso} canEditFilters={canEditFilters} />}
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
function useRowFilters<T extends { pm: string; tipo?: "PM" | "PML"; id?: string; source?: "REQ" | "Proyecto"; projCode?: string }>(rows: T[]) {
  const [pms, setPms] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [resps, setResps] = useState<string[]>([]);
  const [pmlIds, setPmlIds] = useState<string[]>([]);
  const [projIds, setProjIds] = useState<string[]>([]);
  const [soloProblema, setSoloProblema] = useState(true);

  // Helper: aplicar todos los filtros EXCEPTO uno específico
  const getFilteredRows = (excludeFilter: 'pms' | 'tipos' | 'pmlIds' | 'projIds') => {
    return rows.filter((r) => {
      if (excludeFilter !== 'pms' && pms.length > 0 && !pms.includes(r.pm)) return false;
      if (excludeFilter !== 'tipos' && tipos.length > 0 && (r.tipo == null || !tipos.includes(r.tipo))) return false;
      if (excludeFilter !== 'pmlIds' && pmlIds.length > 0 && (r.source !== "REQ" || !pmlIds.includes(r.id ?? ""))) return false;
      if (excludeFilter !== 'projIds' && projIds.length > 0 && (r.source !== "Proyecto" || !projIds.includes(r.projCode ?? ""))) return false;
      return true;
    });
  };

  // Opciones dinámicas: cada filtro se calcula excluyéndose a sí mismo
  const pmOpts: MSOption[] = useMemo(() => {
    const filtered = getFilteredRows('pms');
    const allPMs = [...new Set(filtered.map((r) => r.pm).filter(Boolean))].sort();
    return allPMs.map((pm) => ({
      value: pm, label: pm, count: filtered.filter((r) => r.pm === pm).length,
    }));
  }, [rows, tipos, pmlIds, projIds]);

  const tipoOpts: MSOption[] = useMemo(() => {
    const filtered = getFilteredRows('tipos');
    const allTipos = [...new Set(filtered.map((r) => r.tipo).filter(Boolean) as string[])].sort();
    return allTipos.map((t) => ({
      value: t, label: t, count: filtered.filter((r) => r.tipo === t).length,
    }));
  }, [rows, pms, pmlIds, projIds]);

  const pmlOpts: MSOption[] = useMemo(() => {
    const filtered = getFilteredRows('pmlIds').filter((r) => r.source === "REQ");
    const allPmlIds = [...new Set(filtered.map((r) => r.id).filter(Boolean) as string[])].sort();
    return allPmlIds.map((id) => ({
      value: id, label: id, count: filtered.filter((r) => r.id === id).length,
    }));
  }, [rows, pms, tipos, projIds]);

  const projOpts: MSOption[] = useMemo(() => {
    const filtered = getFilteredRows('projIds').filter((r) => r.source === "Proyecto");
    const allProjIds = [...new Set(filtered.map((r) => r.projCode).filter(Boolean) as string[])].sort();
    return allProjIds.map((code) => ({
      value: code, label: code, count: filtered.filter((r) => r.projCode === code).length,
    }));
  }, [rows, pms, tipos, pmlIds]);

  const byPm = useMemo(
    () => rows.filter((r) =>
      (pms.length === 0 || pms.includes(r.pm)) &&
      (tipos.length === 0 || (r.tipo != null && tipos.includes(r.tipo))) &&
      (pmlIds.length === 0 || (r.source !== "REQ" || pmlIds.includes(r.id ?? ""))) &&
      (projIds.length === 0 || (r.source !== "Proyecto" || projIds.includes(r.projCode ?? "")))),
    [rows, pms, tipos, pmlIds, projIds],
  );

  const anyFilter = pms.length > 0 || tipos.length > 0 || resps.length > 0 || pmlIds.length > 0 || projIds.length > 0 || !soloProblema;
  const reset = () => { setPms([]); setTipos([]); setResps([]); setPmlIds([]); setProjIds([]); setSoloProblema(true); };

  return { pms, setPms, pmOpts, tipos, setTipos, tipoOpts, resps, setResps, pmlIds, setPmlIds, pmlOpts, projIds, setProjIds, projOpts, soloProblema, setSoloProblema, byPm, anyFilter, reset };
}

// ── Cumplimiento de Entrega ─────────────────────────────────────────────
// CPM planeado (inicio → fin) de una fila — reemplaza mostrar Inicio/Fin reales por
// separado: el rango ya trae ambas fechas planeadas en un solo vistazo. El cierre
// REAL va aparte, en la columna "End Date".
function cpmCell(start: Date | null, end: Date | null) {
  if (!start && !end) return <span className="text-[var(--text-disabled)]">—</span>;
  return <>{start ? fmtDate(start) : "—"} – {end ? fmtDate(end) : "—"}</>;
}

// Desde este cambio la unidad es la FASE de Proyecto (board+grupo), no el hito
// individual: un solo responsable por fase, y el acordeón de abajo muestra
// SOLO los steps/hitos que salieron atrasados dentro de esa fase (solo lectura,
// no se asigna responsable ahí — ver buildEntregaRows en lib/dashboard.ts).
function ReqPhaseAccordion({ phases }: { phases: { name: string; target: Date | null; actual: Date | null; late: boolean; slipDays: number }[] }) {
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-left text-[0.76rem]">
        <thead>
          <tr style={{ background: "var(--bg-hover)" }}>
            <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Fase</th>
            <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Deadline planeado</th>
            <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Fecha real</th>
            <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Estado</th>
            <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Atraso</th>
          </tr>
        </thead>
        <tbody>
          {phases.map((phase, i) => (
            <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="px-3 py-1.5 text-[var(--text-primary)]">{phase.name}</td>
              <td className="px-3 py-1.5 whitespace-nowrap text-[var(--text-secondary)]">{phase.target ? fmtDate(phase.target) : <span className="text-[var(--text-disabled)]">—</span>}</td>
              <td className="px-3 py-1.5 whitespace-nowrap text-[var(--text-secondary)]">{phase.actual ? fmtDate(phase.actual) : <span className="text-[var(--text-disabled)]">—</span>}</td>
              <td className="px-3 py-1.5">
                {phase.late ? <Pill tone="bad" small>✕ Atrasado</Pill> : <Pill tone="ok" small>✓ A tiempo</Pill>}
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap text-[var(--text-secondary)] tabular-nums">{phase.late && phase.slipDays > 0 ? `${phase.slipDays}d` : <span className="text-[var(--text-disabled)]">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

function EntregaTab({ req, proj, projBoards, delays, canEditFilters }: {
  req: ReqItem[]; proj: ProjItem[]; projBoards: ProjBoard[]; delays: DelayMap; canEditFilters: boolean | null;
}) {
  const rows = useMemo(() => buildEntregaRows(req, proj, projBoards), [req, proj, projBoards]);
  const { pms, setPms, pmOpts, tipos, setTipos, tipoOpts, resps, setResps, pmlIds, setPmlIds, pmlOpts, projIds, setProjIds, projOpts, soloProblema, setSoloProblema, byPm, anyFilter, reset } = useRowFilters(rows);
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
        <MultiSelect label="Tipo" options={tipoOpts} selected={tipos} disabled={!canEditFilters} onToggle={(v, ch) => setTipos((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setTipos([])} />
        <MultiSelect label="PM" options={pmOpts} selected={pms} disabled={!canEditFilters} onToggle={(v, ch) => setPms((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setPms([])} />
        <MultiSelect label="PML ID" options={pmlOpts} selected={pmlIds} disabled={!canEditFilters} onToggle={(v, ch) => setPmlIds((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setPmlIds([])} />
        <MultiSelect label="Proyecto" options={projOpts} selected={projIds} disabled={!canEditFilters} onToggle={(v, ch) => setProjIds((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setProjIds([])} />
        <MultiSelect label="Responsable" options={respOpts} selected={resps} disabled={!canEditFilters} onToggle={(v, ch) => setResps((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setResps([])} />
        <button
          onClick={() => setSoloProblema((v) => !v)}
          disabled={!canEditFilters}
          className="self-end whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={soloProblema
            ? { borderColor: "var(--bad)", color: "var(--bad)", background: "var(--bad-bg)" }
            : { borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          {soloProblema ? "✓ Solo con atraso" : "Solo con atraso"}
        </button>
        {anyFilter && canEditFilters && <FilterReset onClick={reset} />}
      </div>

      {/* Detalle */}
      {tableRows.length === 0 ? <EmptyRow /> : (
        <div className="table-wrap">
          <table className="pmo">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Tipo</th><th>ID / Proyecto</th><th>Fase</th><th>Atrasos</th><th>PM</th><th>Estado</th><th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => {
                const hasLatePhasesReq = r.source === "REQ" && r.phaseDetails && r.phaseDetails.some((p) => p.late);
                const expandible = (r.source === "Proyecto" && r.totalAtrasados > 0) || hasLatePhasesReq;
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
                      {/* Los REQ (PML) no cuelgan de un proyecto: proyecto vacío → muestra ID + nombre. */}
                      <td>
                        {r.projName ? (
                          <div className="leading-tight">
                            {r.projCode && <div className="ini-id">{r.projCode}</div>}
                            <div style={{ color: "var(--text-secondary)" }}>{r.projName}</div>
                          </div>
                        ) : (
                          <div className="leading-tight">
                            <div className="ini-id">{r.id}</div>
                            <div className="ini-name" style={{ color: "var(--text-secondary)" }}>{r.name}</div>
                          </div>
                        )}
                      </td>
                      <td style={{ color: "var(--text-secondary)" }}>{r.fase || <span className="text-[var(--text-disabled)]">—</span>}</td>
                      <td className="tabular-nums" style={{ color: r.totalAtrasados > 0 ? "var(--bad)" : "var(--text-secondary)" }}>
                        {r.source === "Proyecto" ? `${r.totalAtrasados} / ${r.totalEvaluados}` : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="pm-name">{r.pm || <span className="text-[var(--text-disabled)]">—</span>}</td>
                      <td>{r.verdict === "late" ? <Pill tone="bad">✕ Atrasado</Pill> : <Pill tone="ok">✓ A tiempo</Pill>}</td>
                      <td onClick={(e) => e.stopPropagation()}><ResponsibleSelect itemId={r.id} kind="delay" emptyPenalizes={r.verdict === "late"} /></td>
                    </tr>
                    {abierta && (
                      <tr>
                        <td></td>
                        <td colSpan={7} className="pb-3">
                          {r.source === "REQ" && r.phaseDetails ? (
                            <ReqPhaseAccordion phases={r.phaseDetails} />
                          ) : (
                            <FaseAtrasadaAccordion items={r.itemsAtrasados} />
                          )}
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
function ReprocesoTab({ req, proj, projBoards, reproceso, canEditFilters }: {
  req: ReqItem[]; proj: ProjItem[]; projBoards: ProjBoard[]; reproceso: DelayMap; canEditFilters: boolean | null;
}) {
  const rows = useMemo(() => buildReprocesoRows(req, proj, projBoards, reproceso), [req, proj, projBoards, reproceso]);
  // Trayectoria de Calidad por proyecto (Done + pendiente, a día de hoy) — ver
  // calidadProjectStatus en lib/dashboard. Se busca por código de proyecto (PM-XXX),
  // la misma clave que ya usan los grupos de esta tabla.
  const projectStatusByCode = useMemo(() => {
    const m = new Map<string, CalidadProjectStatus>();
    for (const s of calidadProjectStatus(proj)) {
      const { code } = splitBoardName(s.boardName);
      if (code) m.set(code, s);
    }
    return m;
  }, [proj]);
  const { pms, setPms, pmOpts, tipos, setTipos, tipoOpts, resps, setResps, pmlIds, setPmlIds, pmlOpts, projIds, setProjIds, projOpts, soloProblema, setSoloProblema, byPm, anyFilter, reset } = useRowFilters(rows);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const toggleAbierta = (id: string) => setAbiertas((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

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

  // Agrupa por PROYECTO (código+nombre) — todas sus unidades de Fase 3 (steps o hitos
  // de "Desarrollo por iteraciones...", según la plantilla) quedan juntas. REQ no
  // cuelga de un proyecto, así que va en su propia sección aparte, al final.
  const REQ_GROUP_KEY = "__REQ__";
  const grupos = (() => {
    const map = new Map<string, { key: string; label: string; code: string; rows: typeof tableRows }>();
    for (const r of tableRows) {
      const key = r.source === "REQ" ? REQ_GROUP_KEY : (r.projCode ? `${r.projCode}|${r.projName}` : r.projName || "Sin proyecto");
      let g = map.get(key);
      if (!g) { g = { key, label: r.source === "REQ" ? "REQ" : (r.projName || "Sin proyecto"), code: r.source === "REQ" ? "" : r.projCode, rows: [] }; map.set(key, g); }
      g.rows.push(r);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === REQ_GROUP_KEY) return 1;
      if (b.key === REQ_GROUP_KEY) return -1;
      return (a.code || a.label).localeCompare(b.code || b.label);
    });
  })();
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());
  const toggleProject = (key: string) => setOpenProjects((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

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
        <MultiSelect label="Tipo" options={tipoOpts} selected={tipos} disabled={!canEditFilters} onToggle={(v, ch) => setTipos((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setTipos([])} />
        <MultiSelect label="PM" options={pmOpts} selected={pms} disabled={!canEditFilters} onToggle={(v, ch) => setPms((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setPms([])} />
        <MultiSelect label="PML ID" options={pmlOpts} selected={pmlIds} disabled={!canEditFilters} onToggle={(v, ch) => setPmlIds((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setPmlIds([])} />
        <MultiSelect label="Proyecto" options={projOpts} selected={projIds} disabled={!canEditFilters} onToggle={(v, ch) => setProjIds((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setProjIds([])} />
        <MultiSelect label="Responsable" options={respOpts} selected={resps} disabled={!canEditFilters} onToggle={(v, ch) => setResps((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setResps([])} />
        <button
          onClick={() => setSoloProblema((v) => !v)}
          disabled={!canEditFilters}
          className="self-end whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={soloProblema
            ? { borderColor: "var(--bad)", color: "var(--bad)", background: "var(--bad-bg)" }
            : { borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          {soloProblema ? "✓ Solo con reproceso" : "Solo con reproceso"}
        </button>
        {anyFilter && canEditFilters && <FilterReset onClick={reset} />}
      </div>

      {/* Detalle */}
      {tableRows.length === 0 ? <EmptyRow /> : (
        <div className="table-wrap">
          <table className="pmo">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Tipo</th><th>ID / Proyecto</th><th>Fase</th><th>CPM</th><th>End Date</th><th>Status</th><th>Hitos</th><th>PM</th><th>Estado</th><th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const gConReproceso = g.rows.filter((r) => r.verdict === "reproceso").length;
                const gPct = g.rows.length ? Math.round(((g.rows.length - gConReproceso) / g.rows.length) * 100) : null;
                const gPctColor = gPct === null ? "#6b7280" : gPct >= 90 ? "var(--ok)" : gPct >= 75 ? "var(--warn)" : "var(--bad)";
                const gOpen = openProjects.has(g.key);
                const gStatus = projectStatusByCode.get(g.code);
                return (
                  <Fragment key={g.key}>
                    {/* ── Encabezado de grupo (proyecto o REQ) ── */}
                    <tr onClick={() => toggleProject(g.key)} className="cursor-pointer select-none">
                      <td colSpan={11} style={{ padding: 0, borderTop: "1px solid var(--border)" }}>
                        <div className="flex items-center gap-2 px-4 py-2" style={{ background: "var(--bg-hover)", borderLeft: "3px solid var(--accent)" }}>
                          <span
                            className="text-[0.58rem]"
                            style={{ display: "inline-block", transition: "transform 0.15s", transform: gOpen ? "rotate(90deg)" : undefined, color: "var(--accent)" }}
                          >▶</span>
                          {g.code && <span className="ini-id" style={{ marginRight: 2 }}>{g.code}</span>}
                          <span className="text-[0.78rem] font-bold" style={{ color: "var(--text-primary)" }}>{g.label}</span>
                          {gStatus && <TrayectoriaBadge status={gStatus} />}
                          <span className="ml-auto flex items-center gap-2">
                            {gConReproceso > 0 && (
                              <span style={{ color: "var(--bad)", fontSize: ".72rem", fontWeight: 600 }}>{gConReproceso} con reproceso</span>
                            )}
                            <span
                              className="rounded-full px-2 py-px text-[0.63rem] font-semibold"
                              style={{ background: "var(--bg-surface)", color: gPctColor, border: "1px solid var(--border)" }}
                            >
                              {gPct !== null ? `${gPct}%` : "—"} · {g.rows.length}
                            </span>
                          </span>
                        </div>
                      </td>
                    </tr>
                    {gOpen && g.rows.map((r) => {
                      const hasLatePhaseReq = r.source === "REQ" && r.phaseDetails && r.phaseDetails.some((p) => p.late);
                      // Expandible si el item tiene algo que desglosar: hitos ya Done, o
                      // pendientes que ya vencieron su propio CPM (marcado antes de cerrar).
                      const expandible = (r.source === "Proyecto" && (r.totalDone > 0 || r.pendingAtrasados.length > 0)) || hasLatePhaseReq;
                      const abierta = expandible && abiertas.has(r.id);
                      return (
                        <Fragment key={r.id}>
                          <tr className={expandible ? "cursor-pointer" : undefined} onClick={() => expandible && toggleAbierta(r.id)}>
                            <td>
                              {expandible && (
                                <span
                                  className="ml-4 inline-block text-[0.6rem] text-[var(--accent)]"
                                  style={{ transition: "transform 0.15s", transform: abierta ? "rotate(90deg)" : undefined }}
                                >▶</span>
                              )}
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <Pill tone={r.tipo === "PM" ? "info" : "neutral"}>{r.tipo}</Pill>
                            </td>
                            <td>
                              {r.source === "Proyecto" ? (
                                // El proyecto ya se ve en el encabezado del grupo — acá solo el entregable/hito.
                                <div className="ini-name" style={{ color: "var(--text-secondary)" }}>{r.name}</div>
                              ) : (
                                <div className="leading-tight">
                                  <div className="ini-id">{r.id}</div>
                                  <div className="ini-name" style={{ color: "var(--text-secondary)" }}>{r.name}</div>
                                </div>
                              )}
                            </td>
                            <td style={{ color: "var(--text-secondary)" }}>
                              {r.fase || <span className="text-[var(--text-disabled)]">—</span>}
                            </td>
                            <td style={{ whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{cpmCell(r.startDate, r.deadline)}</td>
                            <td style={{ whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                              {r.actualEnd ? fmtDate(r.actualEnd) : <span className="text-[var(--text-disabled)]">—</span>}
                            </td>
                            <td style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{r.status || <span className="text-[var(--text-disabled)]">—</span>}</td>
                            <td className="tabular-nums" style={{ color: "var(--text-secondary)" }}>
                              {r.unitKind === "step" ? r.totalDone : <span className="text-[var(--text-disabled)]">—</span>}
                            </td>
                            <td className="pm-name">{r.pm || <span className="text-[var(--text-disabled)]">—</span>}</td>
                            <td>{r.verdict === "reproceso" ? <Pill tone="bad">✕ Con reproceso</Pill> : <Pill tone="ok">✓ Limpia</Pill>}</td>
                            <td onClick={(e) => e.stopPropagation()}><ResponsibleSelect itemId={r.id} kind="reproceso" emptyPenalizes={r.verdict === "reproceso"} /></td>
                          </tr>
                          {abierta && (
                            <tr>
                              <td></td>
                              <td colSpan={10} className="pb-3">
                                {r.source === "REQ" && r.phaseDetails ? (
                                  <ReqPhaseAccordion phases={r.phaseDetails} />
                                ) : r.cascade ? (
                                  <ReprocesoHitosAccordion cascade={r.cascade} recuperado={r.recuperado} pendingAtrasados={r.pendingAtrasados} />
                                ) : null}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
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

// Trayectoria de Calidad del proyecto en Fase 3, a día de hoy — combina lo YA
// cerrado (Done) con lo que sigue pendiente (Working on it / Future Steps), ver
// calidadProjectStatus en lib/dashboard. "sin-atrasos" no se muestra (nada que
// señalar); "atrasado" pesa más que "recuperado" aunque hubo un historial limpio.
function TrayectoriaBadge({ status }: { status: CalidadProjectStatus }) {
  if (status.trayectoria === "sin-atrasos") return null;
  if (status.trayectoria === "atrasado") {
    const n = status.pendingAtrasados.length;
    const detalle = status.pendingAtrasados
      .map((p) => (p.stepName ? `${p.name} (${p.stepName})` : p.name))
      .join("\n");
    return (
      <Pill tone="bad" small title={`Aún no se recupera — pendiente sin cerrar, ya fuera de su CPM:\n${detalle}`}>
        ⚠ {n} pendiente{n === 1 ? "" : "s"} vencido{n === 1 ? "" : "s"}
      </Pill>
    );
  }
  return (
    <Pill tone="ok" small title="Tuvo atrasos en Fase 3, pero todo lo que sigue pendiente hoy está dentro de su CPM.">
      ↩ PM recuperado
    </Pill>
  );
}

// Detalle de hitos del ITEM + diagnóstico de recuperación: si algún hito se
// atrasó, ¿el item se puso al día dentro de su propio CPM (PM se recuperó) o el
// atraso le costó el cumplimiento del entregable (no se recuperó)? `recuperado`
// llega ya resuelto por el llamador (calcItemCalidad) — progresivo si el item
// sigue abierto, no el diagnóstico "solo Done" de cascade.recuperado.
function ReprocesoHitosAccordion({ cascade, recuperado, pendingAtrasados }: { cascade: ReprocesoCascade; recuperado: boolean | null; pendingAtrasados: PendingCalidadItem[] }) {
  const { hitos, primerAtrasoIdx } = cascade;
  const resumen = primerAtrasoIdx === null
    ? null
    : recuperado
    ? `↩ PM se recuperó: hubo atraso en "${hitos[primerAtrasoIdx].name}", pero el item se puso al día dentro de su CPM.`
    : `🔁 No se recuperó: el atraso en "${hitos[primerAtrasoIdx].name}" hizo que el item saliera fuera de su CPM.`;
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
      {resumen && (
        <div
          className="px-3 py-1.5 text-[0.76rem] font-semibold"
          style={{ background: "var(--bg-hover)", color: recuperado === true ? "var(--ok)" : recuperado === false ? "var(--bad)" : "var(--text-secondary)" }}
        >
          {resumen}
        </div>
      )}
      <table className="w-full text-left text-[0.76rem]">
        <thead>
          <tr style={{ background: "var(--bg-hover)" }}>
            <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Hito</th>
            <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Deadline</th>
            <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Entrega</th>
          </tr>
        </thead>
        <tbody>
          {hitos.length === 0 ? (
            <tr><td colSpan={3} className="px-3 py-1.5 text-[var(--text-disabled)]">Sin hitos en este item.</td></tr>
          ) : hitos.map((h, i) => (
            <tr key={h.id} className="border-t" style={{ borderColor: "var(--border)", background: i === primerAtrasoIdx ? "var(--bad-bg)" : undefined }}>
              <td className="px-3 py-1.5 text-[var(--text-primary)]">{h.name}</td>
              <td className="px-3 py-1.5 whitespace-nowrap text-[var(--text-secondary)]">{fmtDate(h.deadline)}</td>
              <td className="px-3 py-1.5">
                {h.entrega === "late" ? <Pill tone="bad" small>✕ Atraso</Pill>
                  : h.entrega === "on-time" ? <Pill tone="ok" small>✓ A tiempo</Pill>
                  : <span className="text-[var(--text-disabled)]">— pendiente</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {pendingAtrasados.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-wide" style={{ background: "var(--bg-hover)", color: "var(--bad)", borderTop: "1px solid var(--border)" }}>
            Pendientes ya vencidos (aún no Done)
          </div>
          <table className="w-full text-left text-[0.76rem]">
            <tbody>
              {pendingAtrasados.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-1.5 text-[var(--text-primary)]">{p.name}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-[var(--text-secondary)]">{fmtDate(p.deadline)}</td>
                  <td className="px-3 py-1.5"><Pill tone="bad" small>✕ Vencido</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
