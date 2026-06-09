"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useData } from "@/context/DataContext";
import { fmtDate, fmtMoney } from "@/lib/business";
import { PROJ_ACTIVE_STS } from "@/lib/process";
import type { ProjBoard, ProjItem } from "@/types";
import MultiSelect from "@/components/MultiSelect";
import { EmptyRow, ErrorBox, FilterReset, Loader, StatCard } from "@/components/ui";

const HEALTH_CFG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  "on-track": { color: "#10b981", bg: "#052e1688", label: "On Track", icon: "✓" },
  "at-risk": { color: "#f59e0b", bg: "#451a0388", label: "At Risk", icon: "⚠" },
  "off-track": { color: "#ef4444", bg: "#450a0a88", label: "Off Track", icon: "✕" },
};

function estadoPill(status: string, estado: string): [string, string] {
  if (status === "Working on it") {
    if (estado === "ATRASADO")                          return ["pill-atrasado", "✕ Off Track"];
    if (estado === "EN TIEMPO" || estado === "PARA HOY") return ["pill-entiempo", "✓ On Track"];
    return ["pill-skip", "— Sin Deadline"];
  }
  if (status === "Done")         return ["pill-entiempo", "✓ Done"];
  if (status === "Future Steps") return ["pill-skip",     "— Pendiente"];
  if (estado === "ATRASADO")     return ["pill-atrasado", "✕ Atrasado"];
  if (estado === "EN TIEMPO" || estado === "PARA HOY") return ["pill-entiempo", "✓ En Tiempo"];
  return ["pill-skip", estado || "—"];
}

function calcBoardMetrics(allBoardItems: ProjItem[]): { ev: number; pv: number; ac: number; scope: number | null } {
  let ev = 0, pv = 0, ac = 0, scopeNum = 0, scopeDen = 0;
  allBoardItems.forEach((r) => {
    const onTrackWip = r.status === "Working on it" && r.estado !== "ATRASADO";
    const pvWip      = r.status === "Working on it";
    if (r.status === "Done" || onTrackWip) { ev += r.cost; scopeNum++; }
    if (r.status === "Done" || pvWip)      { pv += r.cost; scopeDen++; }
    if (r.status === "Done")               ac += r.cost;
    r.subitems.forEach((s) => {
      const sOnTrackWip = s.status === "Working on it" && s.estado !== "ATRASADO";
      const sPvWip      = s.status === "Working on it";
      if (s.status === "Done" || sOnTrackWip) { ev += s.cost; scopeNum++; }
      if (s.status === "Done" || sPvWip)      { pv += s.cost; scopeDen++; }
      if (s.status === "Done")                ac += s.cost;
    });
  });
  return { ev, pv, ac, scope: scopeDen > 0 ? (scopeNum / scopeDen) * 100 : null };
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

  if (loading && !data) return <Loader msg="Cargando portafolios..." />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const projData = data.proj;
  const projBoards = data.projBoards;

  const active = projData.filter((r) => PROJ_ACTIVE_STS.has(r.status));
  const atr = active.filter((r) => r.estado === "ATRASADO").length;
  const onTrack = active.filter((r) => r.estado === "EN TIEMPO" || r.estado === "PARA HOY").length;

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
  const visibleBoards = allBoardsSorted.filter((b) => !boardFilter.length || boardFilter.includes(b.id));

  return (
    <div>
      {/* Cards */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard value={projBoards.length} label="Total Proyectos" />
        <StatCard value={atr} label="Off Track" color="#ef4444" borderColor="#ef4444" />
        <StatCard value={onTrack} label="On Track" color="#10b981" borderColor="#10b981" />
      </div>

      {/* PM Health */}
      <PMHealth projBoards={projBoards} projData={projData} selectedPm={pms.length === 1 ? pms[0] : null} onSelect={(pm) => setPms((cur) => (cur.length === 1 && cur[0] === pm ? [] : [pm]))} />

      {/* Filtro de proyecto */}
      <div className="mb-3.5 flex flex-wrap items-end gap-3.5">
        <MultiSelect label="Proyecto" options={boardOpts} selected={boardFilter} onToggle={(v, ch) => setBoardFilter((x) => (ch ? [...x, v] : x.filter((y) => y !== v)))} onToggleAll={() => setBoardFilter([])} />
        {boardFilter.length > 0 && <FilterReset onClick={() => setBoardFilter([])} />}
      </div>

      {/* Acordeones */}
      {(() => {
        const accordions = visibleBoards
          .map((b) => {
            const items = byPM.filter((r) => r.boardId === b.id);
            if (!items.length) return null;
            const { ev, pv, ac, scope } = calcBoardMetrics(projData.filter((r) => r.boardId === b.id));
            return <BoardAccordion key={b.id} board={b} items={items} ev={ev} pv={pv} ac={ac} scope={scope} open={openBoards.has(b.id)} onToggle={() => toggleAcc(b.id)} />;
          })
          .filter(Boolean);
        return accordions.length ? accordions : <EmptyRow msg="Sin resultados." />;
      })()}
    </div>
  );
}

// ── PM Health ──────────────────────────────────────────────────────────
function PMHealth({ projBoards, projData, selectedPm, onSelect }: { projBoards: ProjBoard[]; projData: ProjItem[]; selectedPm: string | null; onSelect: (pm: string) => void }) {
  const pms = [...new Set(projBoards.filter((b) => b.pm).map((b) => b.pm))].sort();
  return (
    <div className="mb-7 flex flex-wrap gap-4">
      {pms.map((pm) => {
        const pmBoards = projBoards.filter((b) => b.pm === pm);
        const ids = new Set(pmBoards.map((b) => b.id));
        const items = projData.filter((r) => ids.has(r.boardId) && PROJ_ACTIVE_STS.has(r.status));
        const atr = items.filter((r) => r.estado === "ATRASADO").length;
        const status = atr === 0 ? "on-track" : atr <= 2 ? "at-risk" : "off-track";
        const c = HEALTH_CFG[status];
        const active = selectedPm === pm;
        return (
          <div
            key={pm}
            onClick={() => onSelect(pm)}
            className="flex min-w-[190px] flex-1 cursor-pointer flex-col gap-1.5 rounded-xl border-2 p-[18px] transition-transform hover:-translate-y-0.5"
            style={{ background: "var(--bg-surface)", borderColor: c.color, boxShadow: active ? "0 0 0 3px var(--accent)" : undefined }}
          >
            <div className="text-[0.9rem] font-semibold text-[var(--text-primary)]">{pm}</div>
            <span className="w-fit rounded-full px-3 py-1 text-[0.78rem] font-bold" style={{ color: c.color, background: c.bg }}>{c.icon} {c.label}</span>
            <div className="text-[0.75rem] text-[var(--text-muted)]">{items.length} items · {items.filter((r) => r.estado === "EN TIEMPO" || r.estado === "PARA HOY").length} on track · {pmBoards.length} proyecto{pmBoards.length !== 1 ? "s" : ""}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Acordeón por board ─────────────────────────────────────────────────
function dlCell(dl: Date | null) {
  if (!dl) return <span className="text-[var(--text-disabled)]">—</span>;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const color = dl < t ? "#ef4444" : dl.getTime() === t.getTime() ? "#f59e0b" : "#10b981";
  return <span style={{ color, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(dl)}</span>;
}

function BoardAccordion({ board, items, ev, pv, ac, scope, open, onToggle }: { board: ProjBoard; items: ProjItem[]; ev: number; pv: number; ac: number; scope: number | null; open: boolean; onToggle: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const spi = pv > 0 ? ev / pv : null;
  const cpi = ac > 0 ? Math.min(1, ev / ac) : null;
  const spiColor   = spi   === null ? "var(--text-muted)" : spi   >= 1 ? "#10b981" : spi   >= 0.85 ? "#f59e0b" : "#ef4444";
  const cpiColor   = cpi   === null ? "var(--text-muted)" : cpi   >= 1 ? "#10b981" : cpi   >= 0.85 ? "#f59e0b" : "#ef4444";
  const scopeColor = scope === null ? "var(--text-muted)" : scope >= 100 ? "#10b981" : scope >= 85 ? "#f59e0b" : "#ef4444";

  const isOffTrack = items.some(
    (r) => (r.status === "Working on it" && r.estado === "ATRASADO") ||
      r.subitems.some((s) => s.status === "Working on it" && s.estado === "ATRASADO")
  );

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

    <div className="mb-2 overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <div
        onClick={onToggle}
        className="flex cursor-pointer select-none items-center gap-2.5 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]"
        style={{ background: "var(--bg-surface)" }}
      >
        <span className="text-[0.8rem] text-[var(--text-muted)] transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }}>▶</span>
        <h2 className="flex-1 text-[0.98rem] font-bold text-[var(--text-primary)]">{board.name}</h2>
        {board.pm && <span className="text-[0.78rem] text-[var(--text-secondary)]">PM: <strong>{board.pm}</strong></span>}
        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]">{items.length} items</span>
        <button
          onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
          className={`pill ${isOffTrack ? "pill-atrasado" : "pill-entiempo"}`}
          style={{ fontSize: ".68rem", cursor: "pointer" }}
        >
          {isOffTrack ? "✕ Off Track" : "✓ On Track"}
        </button>
      </div>
      {open && (
        <div className="table-wrap" style={{ margin: 0, borderRadius: 0, borderLeft: 0, borderRight: 0, borderBottom: 0 }}>
          <table className="pmo">
            <thead>
              <tr>
                <th>Tarea</th><th>Status</th><th>Estado</th><th>Deadline</th>
                <th style={{ textAlign: "right" }}>Costo</th><th style={{ textAlign: "right" }}>Beneficio</th>
              </tr>
            </thead>
            <tbody>
              {groupOrder.map((grupo) => {
                const gItems = groupMap.get(grupo)!;
                const gOpen = openGroups.has(grupo);
                return (
                  <React.Fragment key={grupo}>
                    <tr
                      onClick={() => toggleGroup(grupo)}
                      className="cursor-pointer select-none"
                      style={{ background: "var(--bg-header)" }}
                    >
                      <td colSpan={6} style={{ padding: "6px 14px" }}>
                        <span
                          className="mr-2 inline-block text-[0.65rem] text-[var(--text-muted)] transition-transform"
                          style={{ transform: gOpen ? "rotate(90deg)" : undefined }}
                        >▶</span>
                        <span className="text-[0.8rem] font-semibold tracking-wide" style={{ color: "var(--text-secondary)" }}>
                          {grupo || "Sin grupo"}
                        </span>
                        <span className="ml-2 text-[0.68rem] text-[var(--text-muted)]">({gItems.length})</span>
                      </td>
                    </tr>
                    {gOpen && gItems.map((r) => {
                      const [ecls, elbl] = estadoPill(r.status, r.estado);
                      return <Row key={r.id} r={r} ecls={ecls} elbl={elbl} />;
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

function Row({ r, ecls, elbl }: { r: ProjItem; ecls: string; elbl: string }) {
  const [open, setOpen] = useState(false);
  const activeSubitems = r.subitems;
  const hasSubitems = activeSubitems.length > 0;

  return (
    <>
      <tr
        onClick={hasSubitems ? () => setOpen((o) => !o) : undefined}
        style={hasSubitems ? { cursor: "pointer" } : undefined}
      >
        <td className="ini-name" style={{ paddingLeft: 24 }}>
          {hasSubitems && (
            <span
              className="mr-1.5 inline-block text-[0.65rem] text-[var(--text-muted)] transition-transform"
              style={{ transform: open ? "rotate(90deg)" : undefined }}
            >▶</span>
          )}
          {r.name}
        </td>
        <td style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{r.status || "—"}</td>
        <td><span className={`pill ${ecls}`} style={{ fontSize: ".68rem" }}>{elbl}</span></td>
        <td>{dlCell(r.deadline)}</td>
        <td style={{ textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.cost ? fmtMoney(r.cost) : "—"}</td>
        <td style={{ textAlign: "right", fontWeight: 600, color: "#10b981", whiteSpace: "nowrap" }}>{r.benefit ? fmtMoney(r.benefit) : "—"}</td>
      </tr>
      {open && activeSubitems.map((s) => {
        const [secls, selbl] = estadoPill(s.status, s.estado);
        return (
          <tr key={s.id} style={{ background: "var(--bg-hover)" }}>
            <td className="ini-name" style={{ paddingLeft: 44, color: "var(--text-muted)", fontSize: ".78rem" }}>↳ {s.name}</td>
            <td style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>{s.status || "—"}</td>
            <td><span className={`pill ${secls}`} style={{ fontSize: ".65rem" }}>{selbl}</span></td>
            <td>{dlCell(s.deadline)}</td>
            <td>—</td><td>—</td>
          </tr>
        );
      })}
    </>
  );
}
