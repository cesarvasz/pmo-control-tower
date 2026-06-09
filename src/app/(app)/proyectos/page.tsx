"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useData } from "@/context/DataContext";
import { fmtDate, fmtMoney } from "@/lib/business";
import { PROJ_ACTIVE_STS, calcBoardMetrics, deriveBoardHealth } from "@/lib/process";
import type { BoardHealthData, HealthStatus } from "@/lib/process";
import type { ProjBoard, ProjItem } from "@/types";
import MultiSelect from "@/components/MultiSelect";
import ProjectReportModal from "@/components/ProjectReportModal";
import { EmptyRow, ErrorBox, FilterReset, Loader, StatCard } from "@/components/ui";

const HEALTH_CFG = {
  "on-track":  { color: "#10b981", bg: "var(--health-on-track-bg)",  label: "On Track", icon: "✓" },
  "in-risk":   { color: "#f59e0b", bg: "var(--health-in-risk-bg)",   label: "In Risk",  icon: "⚠" },
  "off-track": { color: "#ef4444", bg: "var(--health-off-track-bg)", label: "Off Track", icon: "✕" },
} as const;


function estadoPill(status: string, estado: string): [string, string] {
  if (status === "Done")      return ["pill-entiempo", "✓ On Track"];
  if (estado === "ATRASADO")  return ["pill-atrasado", "✕ Off Track"];
  if (estado === "PARA HOY")  return ["pill-parahoy",  "⚠ In Risk"];
  if (estado === "EN TIEMPO") return ["pill-entiempo", "✓ On Track"];
  return ["pill-skip", "— Pending"];
}


export default function ProyectosPage() {
  return (
    <Suspense fallback={<Loader msg="Cargando portafolios..." />}>
      <ProyectosInner />
    </Suspense>
  );
}

function ProyectosInner() {
  const sp = useSearchParams();
  const { data, loading, error } = useData();
  const [pms, setPms] = useState<string[]>(() => {
    const pm = sp.get("pm");
    return pm ? [pm] : [];
  });
  const [boardFilter, setBoardFilter] = useState<string[]>([]);
  const [openBoards, setOpenBoards] = useState<Set<string>>(new Set());
  const [filterNoDl, setFilterNoDl] = useState(false);

  if (loading && !data) return <Loader msg="Cargando portafolios..." />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const projData = data.proj;
  const projBoards = data.projBoards;

  const boardHealthMap = new Map<string, BoardHealthData>();
  projBoards.forEach((b) => {
    boardHealthMap.set(b.id, deriveBoardHealth(calcBoardMetrics(projData.filter((r) => r.boardId === b.id))));
  });
  const boardsOffTrack = projBoards.filter((b) => boardHealthMap.get(b.id)?.healthStatus === "off-track").length;
  const boardsInRisk   = projBoards.filter((b) => boardHealthMap.get(b.id)?.healthStatus === "in-risk").length;
  const boardsOnTrack  = projBoards.filter((b) => boardHealthMap.get(b.id)?.healthStatus === "on-track").length;

  const toggleAcc = (id: string) =>
    setOpenBoards((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // ── Boards visibles ──
  const allBoardsSorted = [...projBoards].sort((a, b) => a.name.localeCompare(b.name));
  const boardOpts = allBoardsSorted.map((b) => ({
    value: b.id, label: b.name,
    count: projData.filter((r) => r.boardId === b.id && PROJ_ACTIVE_STS.has(r.status)).length,
  }));
  const pmBoardIds = pms.length ? new Set(projBoards.filter((b) => pms.includes(b.pm)).map((b) => b.id)) : null;
  const byPM = pmBoardIds ? projData.filter((r) => pmBoardIds.has(r.boardId)) : projData;
  const visibleBoards = allBoardsSorted.filter((b) =>
    boardHealthMap.get(b.id)?.healthStatus !== null &&
    (!boardFilter.length || boardFilter.includes(b.id))
  );

  return (
    <div>
      {/* Cards */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard value={projBoards.length} label="Total Proyectos" />
        <StatCard value={boardsOffTrack} label="Off Track" color="#ef4444" borderColor="#ef4444" />
        <StatCard value={boardsInRisk}   label="In Risk"   color="#f59e0b" borderColor="#f59e0b" />
        <StatCard value={boardsOnTrack}  label="On Track"  color="#10b981" borderColor="#10b981" />
      </div>

      {/* PM Health */}
      <PMHealth projBoards={projBoards} boardHealthMap={boardHealthMap} selectedPm={pms.length === 1 ? pms[0] : null} onSelect={(pm) => setPms((cur) => (cur.length === 1 && cur[0] === pm ? [] : [pm]))} />

      {/* Filtro de proyecto */}
      {(() => {
        const noDlCount = byPM.reduce((acc, r) => acc + r.subitems.filter((s) => s.deadline === null).length, 0);
        return (
          <div className="mb-3.5 flex flex-wrap items-end gap-3.5">
            <MultiSelect label="Proyecto" options={boardOpts} selected={boardFilter} onToggle={(v, ch) => setBoardFilter((x) => (ch ? [...x, v] : x.filter((y) => y !== v)))} onToggleAll={() => setBoardFilter([])} />
            <button
              onClick={() => setFilterNoDl((f) => !f)}
              className="rounded-lg border px-3 py-1.5 text-[0.73rem] font-semibold transition-colors"
              style={{
                borderColor: filterNoDl ? "#ef4444" : "var(--border)",
                color: filterNoDl ? "#ef4444" : "var(--text-secondary)",
                background: filterNoDl ? "#ef444415" : "transparent",
              }}
            >
              Sin Fecha · {noDlCount}
            </button>
            {(boardFilter.length > 0 || filterNoDl) && (
              <FilterReset onClick={() => { setBoardFilter([]); setFilterNoDl(false); }} />
            )}
          </div>
        );
      })()}

      {/* Acordeones */}
      {(() => {
        const accordions = visibleBoards
          .map((b) => {
            const items = byPM.filter((r) => r.boardId === b.id);
            if (!items.length) return null;
            const bh = boardHealthMap.get(b.id)!;
            return <BoardAccordion key={b.id} board={b} items={items} ev={bh.ev} pv={bh.pv} ac={bh.ac} scope={bh.scope} open={openBoards.has(b.id) || filterNoDl} onToggle={() => toggleAcc(b.id)} filterNoDl={filterNoDl} />;
          })
          .filter(Boolean);
        return accordions.length ? accordions : <EmptyRow msg="Sin resultados." />;
      })()}
    </div>
  );
}

// ── PM Health ──────────────────────────────────────────────────────────
function PMHealth({ projBoards, boardHealthMap, selectedPm, onSelect }: {
  projBoards: ProjBoard[];
  boardHealthMap: Map<string, BoardHealthData>;
  selectedPm: string | null;
  onSelect: (pm: string) => void;
}) {
  const pms = [...new Set(projBoards.filter((b) => b.pm).map((b) => b.pm))].sort();
  return (
    <div className="mb-7 flex flex-wrap gap-4">
      {pms.map((pm) => {
        const pmBoards = projBoards
          .filter((b) => b.pm === pm && boardHealthMap.get(b.id)?.healthStatus !== null);
        const boardsData = pmBoards.map((b) => boardHealthMap.get(b.id)!);
        const onTrack  = boardsData.filter((h) => h.healthStatus === "on-track").length;
        const inRisk   = boardsData.filter((h) => h.healthStatus === "in-risk").length;
        const offTrack = boardsData.filter((h) => h.healthStatus === "off-track").length;

        const hiValues = boardsData.map((h) => h.healthIndex).filter((v): v is number => v != null);
        const pmHI = hiValues.length > 0 ? hiValues.reduce((a, b) => a + b, 0) / hiValues.length : null;
        const pmStatus: HealthStatus = pmHI === null ? "on-track"
          : pmHI >= 0.95 ? "on-track"
          : pmHI >= 0.85 ? "in-risk"
          : "off-track";

        const c = HEALTH_CFG[pmStatus];
        const isActive = selectedPm === pm;
        return (
          <div
            key={pm}
            onClick={() => onSelect(pm)}
            className="flex min-w-[190px] flex-1 cursor-pointer flex-col gap-1.5 rounded-xl border-2 p-[18px] transition-transform hover:-translate-y-0.5"
            style={{ background: "var(--bg-surface)", borderColor: c.color, boxShadow: isActive ? "0 0 0 3px var(--accent)" : undefined }}
          >
            <div className="text-[0.9rem] font-semibold text-[var(--text-primary)]">{pm}</div>
            <span className="w-fit rounded-full px-3 py-1 text-[0.78rem] font-bold" style={{ color: c.color, background: c.bg }}>
              {c.icon} {c.label}{pmHI !== null ? ` · ${Math.round(pmHI * 100)}%` : ""}
            </span>
            <div className="text-[0.75rem] font-medium text-[var(--text-primary)]">
              {pmBoards.length} proyecto{pmBoards.length !== 1 ? "s" : ""}
            </div>
            <div className="flex gap-3 text-[0.72rem] text-[var(--text-muted)]">
              <span style={{ color: "#10b981" }}>✓ {onTrack} on track</span>
              {inRisk > 0 && <span style={{ color: "#f59e0b" }}>⚠ {inRisk} in risk</span>}
              <span style={{ color: "#ef4444" }}>✕ {offTrack} off track</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Acordeón por board ─────────────────────────────────────────────────
function dlCell(dl: Date | null, opts?: { isDone?: boolean; redDash?: boolean }) {
  if (!dl) {
    return opts?.redDash
      ? <span style={{ color: "#ef4444", fontWeight: 600 }}>—</span>
      : <span className="text-[var(--text-disabled)]">—</span>;
  }
  if (opts?.isDone) {
    return <span style={{ color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(dl)}</span>;
  }
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const color = dl < t ? "#ef4444" : dl.getTime() === t.getTime() ? "#f59e0b" : "#10b981";
  return <span style={{ color, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(dl)}</span>;
}

function BoardAccordion({ board, items, ev, pv, ac, scope, open, onToggle, filterNoDl }: { board: ProjBoard; items: ProjItem[]; ev: number; pv: number; ac: number; scope: number | null; open: boolean; onToggle: () => void; filterNoDl: boolean }) {
  const [showModal, setShowModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const spi = pv > 0 ? ev / pv : null;
  const cpi = ac > 0 ? Math.min(1, ev / ac) : null;
  const spiColor   = spi   === null ? "var(--text-muted)" : spi   >= 1 ? "#10b981" : spi   >= 0.85 ? "#f59e0b" : "#ef4444";
  const cpiColor   = cpi   === null ? "var(--text-muted)" : cpi   >= 1 ? "#10b981" : cpi   >= 0.85 ? "#f59e0b" : "#ef4444";
  const scopeColor = scope === null ? "var(--text-muted)" : scope >= 100 ? "#10b981" : scope >= 85 ? "#f59e0b" : "#ef4444";

  const healthIndex = (spi !== null && cpi !== null && scope !== null)
    ? (spi + cpi + scope / 100) / 3
    : null;
  const healthStatus = healthIndex === null ? null
    : healthIndex >= 0.95 ? "on-track"
    : healthIndex >= 0.85 ? "in-risk"
    : "off-track";
  const HEALTH_BADGE = {
    "on-track":  { color: "#10b981", bg: "var(--health-on-track-bg)",  label: "✓ On Track" },
    "in-risk":   { color: "#f59e0b", bg: "var(--health-in-risk-bg)",   label: "⚠ In Risk" },
    "off-track": { color: "#ef4444", bg: "var(--health-off-track-bg)", label: "✕ Off Track" },
  };
  const badge = healthStatus ? HEALTH_BADGE[healthStatus] : null;

  const toggleGroup = (g: string) =>
    setOpenGroups((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });

  const groupOrder: string[] = [];
  const groupMap = new Map<string, ProjItem[]>();
  items.forEach((r) => {
    if (!groupMap.has(r.grupo)) { groupOrder.push(r.grupo); groupMap.set(r.grupo, []); }
    groupMap.get(r.grupo)!.push(r);
  });

  return (
    <>
      {showReport && (
        <ProjectReportModal
          board={board}
          items={items}
          ev={ev}
          pv={pv}
          ac={ac}
          scope={scope}
          onClose={() => setShowReport(false)}
        />
      )}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="min-w-[300px] rounded-2xl border p-6 shadow-xl"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)]">Cronograma</div>
                <div className="text-[0.95rem] font-bold text-[var(--text-primary)]">{board.name}</div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >✕</button>
            </div>

            {healthIndex !== null && badge && (
              <div className="mb-5 rounded-xl p-4 text-center" style={{ background: "var(--bg-hover)" }}>
                <div className="mb-1 text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">EVM</div>
                <div className="text-[2.8rem] font-bold tabular-nums leading-none" style={{ color: badge.color }}>
                  {healthIndex.toFixed(2)}
                </div>
                <div className="mt-1.5 text-[0.8rem] font-semibold" style={{ color: badge.color }}>{badge.label}</div>
              </div>
            )}

            <div className="mb-5 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="mb-1 text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)]">SPI</div>
                <div className="text-[2rem] font-bold tabular-nums leading-none" style={{ color: spiColor }}>
                  {spi !== null ? spi.toFixed(2) : "—"}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)]">CPI</div>
                <div className="text-[2rem] font-bold tabular-nums leading-none" style={{ color: cpiColor }}>
                  {cpi !== null ? cpi.toFixed(2) : "—"}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)]">Scope</div>
                <div className="text-[2rem] font-bold tabular-nums leading-none" style={{ color: scopeColor }}>
                  {scope !== null ? `${scope.toFixed(0)}%` : "—"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 rounded-xl p-3" style={{ background: "var(--bg-hover)" }}>
              <div>
                <div className="mb-0.5 text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">EV</div>
                <div className="text-[0.95rem] font-bold tabular-nums" style={{ color: "#10b981" }}>
                  {ev ? fmtMoney(ev) : "$0"}
                </div>
              </div>
              <div>
                <div className="mb-0.5 text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">PV</div>
                <div className="text-[0.95rem] font-bold tabular-nums" style={{ color: "#f59e0b" }}>
                  {pv ? fmtMoney(pv) : "$0"}
                </div>
              </div>
              <div>
                <div className="mb-0.5 text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">AC</div>
                <div className="text-[0.95rem] font-bold tabular-nums" style={{ color: "#94a3b8" }}>
                  {ac ? fmtMoney(ac) : "$0"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    <div className="mb-3 overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
      {/* ── Board header ── */}
      <div
        onClick={onToggle}
        className="flex cursor-pointer select-none items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--bg-hover)]"
        style={{ background: "var(--bg-surface)" }}
      >
        <span
          className="text-[0.72rem] text-[var(--text-muted)]"
          style={{ display: "inline-block", transition: "transform 0.15s", transform: open ? "rotate(90deg)" : undefined }}
        >▶</span>
        <h2 className="flex-1 text-[0.95rem] font-bold text-[var(--text-primary)]">{board.name}</h2>
        {board.pm && <span className="text-[0.75rem] text-[var(--text-secondary)]">PM: <strong>{board.pm}</strong></span>}
        <span className="rounded-full px-2 py-0.5 text-[0.7rem]" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
          {items.length} items
        </span>
        {badge && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
            className="rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold"
            style={{ color: badge.color, background: badge.bg }}
          >
            {badge.label}
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setShowReport(true); }}
          className="rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Report
        </button>
      </div>

      {open && (
        <div className="table-wrap" style={{ margin: 0, borderRadius: 0, border: 0 }}>
          <table className="pmo">
            <thead>
              <tr>
                <th>Tarea</th><th>Status</th><th>Estado</th><th>Deadline</th>
                <th style={{ textAlign: "right" }}>Costo</th><th style={{ textAlign: "right" }}>Beneficio</th>
              </tr>
            </thead>
            <tbody>
              {groupOrder.map((grupo) => {
                const allGItems = groupMap.get(grupo)!;
                const gItems = filterNoDl
                  ? allGItems.filter((r) => r.subitems.some((s) => s.deadline === null))
                  : allGItems;
                if (filterNoDl && gItems.length === 0) return null;
                const gOpen = filterNoDl || openGroups.has(grupo);
                return (
                  <React.Fragment key={grupo}>
                    {/* ── Group header row ── */}
                    <tr onClick={() => toggleGroup(grupo)} className="cursor-pointer select-none">
                      <td colSpan={6} style={{ padding: 0, borderTop: "1px solid var(--border)" }}>
                        <div
                          className="flex items-center gap-2 px-4 py-2"
                          style={{ background: "var(--bg-hover)", borderLeft: "3px solid var(--accent)" }}
                        >
                          <span
                            className="text-[0.58rem]"
                            style={{ display: "inline-block", transition: "transform 0.15s", transform: gOpen ? "rotate(90deg)" : undefined, color: "var(--accent)" }}
                          >▶</span>
                          <span className="text-[0.72rem] font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                            {grupo || "Sin grupo"}
                          </span>
                          <span
                            className="ml-auto rounded-full px-2 py-px text-[0.63rem]"
                            style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                          >
                            {gItems.length}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {gOpen && gItems.map((r) => {
                      const [ecls, elbl] = estadoPill(r.status, r.estado);
                      return <Row key={r.id} r={r} ecls={ecls} elbl={elbl} filterNoDl={filterNoDl} />;
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </>
  );
}

function Row({ r, ecls, elbl, filterNoDl }: { r: ProjItem; ecls: string; elbl: string; filterNoDl: boolean }) {
  const [open, setOpen] = useState(false);
  const allSubitems = r.subitems;
  const visibleSubitems = filterNoDl ? allSubitems.filter((s) => s.deadline === null) : allSubitems;
  const hasSubitems = allSubitems.length > 0;
  const isOpen = (filterNoDl && visibleSubitems.length > 0) || open;

  const SUB_BG = "var(--bg-hover)";

  return (
    <>
      {/* ── Item row ── */}
      <tr
        onClick={hasSubitems ? () => setOpen((o) => !o) : undefined}
        style={{ cursor: hasSubitems ? "pointer" : undefined }}
      >
        <td className="ini-name" style={{ paddingLeft: 16 }}>
          <span
            className="mr-1.5 inline-block text-[0.6rem] transition-transform"
            style={{
              color: hasSubitems ? "var(--text-muted)" : "transparent",
              transform: isOpen ? "rotate(90deg)" : undefined,
              userSelect: "none",
            }}
          >▶</span>
          {r.name}
          {hasSubitems && (
            <span className="ml-2 rounded-full px-1.5 py-px text-[0.6rem]" style={{ background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              {allSubitems.length}
            </span>
          )}
        </td>
        <td style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{r.status || "—"}</td>
        <td><span className={`pill ${ecls}`} style={{ fontSize: ".68rem" }}>{elbl}</span></td>
        <td>{dlCell(r.deadline, { isDone: r.status === "Done" })}</td>
        <td style={{ textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.cost ? fmtMoney(r.cost) : "—"}</td>
        <td style={{ textAlign: "right", fontWeight: 600, color: "#10b981", whiteSpace: "nowrap" }}>{r.benefit ? fmtMoney(r.benefit) : "—"}</td>
      </tr>
      {/* ── Subitem rows ── */}
      {isOpen && visibleSubitems.map((s, i) => {
        const [secls, selbl] = estadoPill(s.status, s.estado);
        const isLast = i === visibleSubitems.length - 1;
        return (
          <tr key={s.id}>
            <td
              className="ini-name"
              style={{
                paddingLeft: 34,
                fontSize: ".78rem",
                color: "var(--text-secondary)",
                background: SUB_BG,
                borderLeft: "3px solid var(--border-subtle)",
              }}
            >
              <span style={{ color: "var(--text-disabled)", marginRight: 5, fontFamily: "monospace" }}>
                {isLast ? "└─" : "├─"}
              </span>
              {s.name}
            </td>
            <td style={{ fontSize: ".72rem", color: "var(--text-muted)", background: SUB_BG }}>{s.status || "—"}</td>
            <td style={{ background: SUB_BG }}><span className={`pill ${secls}`} style={{ fontSize: ".63rem" }}>{selbl}</span></td>
            <td style={{ background: SUB_BG }}>{dlCell(s.deadline, { isDone: s.status === "Done", redDash: true })}</td>
            <td style={{ background: SUB_BG, color: "var(--text-disabled)" }}>—</td>
            <td style={{ background: SUB_BG, color: "var(--text-disabled)" }}>—</td>
          </tr>
        );
      })}
    </>
  );
}
