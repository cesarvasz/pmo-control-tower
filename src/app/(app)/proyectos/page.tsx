"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useData } from "@/context/DataContext";
import { fmtDate, fmtMoney } from "@/lib/business";
import type { ProjBoard, ProjItem } from "@/types";
import MultiSelect from "@/components/MultiSelect";
import { EmptyRow, ErrorBox, FilterReset, Loader, StatCard } from "@/components/ui";

const HEALTH_CFG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  "on-track": { color: "#10b981", bg: "#052e1688", label: "On Track", icon: "✓" },
  "at-risk": { color: "#f59e0b", bg: "#451a0388", label: "At Risk", icon: "⚠" },
  "off-track": { color: "#ef4444", bg: "#450a0a88", label: "Off Track", icon: "✕" },
};

const EPILL: Record<string, [string, string]> = {
  ATRASADO: ["pill-atrasado", "✕ Atrasado"],
  "PARA HOY": ["pill-parahoy", "⚠ Para Hoy"],
  "EN TIEMPO": ["pill-entiempo", "✓ En Tiempo"],
  "EN PROCESO": ["pill-skip", "— En Proceso"],
};

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

  const atr = projData.filter((r) => r.estado === "ATRASADO").length;
  const ph = projData.filter((r) => r.estado === "PARA HOY").length;
  const et = projData.filter((r) => r.estado === "EN TIEMPO").length;

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
    count: projData.filter((r) => r.boardId === b.id && r.status !== "Done").length,
  }));
  const pmBoardIds = pms.length ? new Set(projBoards.filter((b) => pms.includes(b.pm)).map((b) => b.id)) : null;
  const byPM = pmBoardIds ? projData.filter((r) => pmBoardIds.has(r.boardId)) : projData;
  const visibleBoards = allBoardsSorted.filter((b) => !boardFilter.length || boardFilter.includes(b.id));

  return (
    <div>
      {/* Cards */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard value={projData.length} label="Total Items" />
        <StatCard value={atr} label="Atrasados" color="#ef4444" borderColor="#ef4444" />
        <StatCard value={ph} label="Para Hoy" color="#f59e0b" borderColor="#f59e0b" />
        <StatCard value={et} label="En Tiempo" color="#10b981" borderColor="#10b981" />
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
            const items = byPM.filter((r) => r.boardId === b.id && r.status !== "Done");
            if (!items.length) return null;
            return <BoardAccordion key={b.id} board={b} items={items} open={openBoards.has(b.id)} onToggle={() => toggleAcc(b.id)} />;
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
        const items = projData.filter((r) => ids.has(r.boardId) && r.status !== "Done");
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
            <div className="text-[0.75rem] text-[var(--text-muted)]">{items.length} items · {items.filter((r) => r.estado === "EN TIEMPO").length} en tiempo · {pmBoards.length} proyecto{pmBoards.length !== 1 ? "s" : ""}</div>
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

function BoardAccordion({ board, items, open, onToggle }: { board: ProjBoard; items: ProjItem[]; open: boolean; onToggle: () => void }) {
  const atr = items.filter((r) => r.estado === "ATRASADO").length;
  const ph = items.filter((r) => r.estado === "PARA HOY").length;
  const et = items.filter((r) => r.estado === "EN TIEMPO").length;

  return (
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
        {atr > 0 && <span className="pill pill-atrasado" style={{ fontSize: ".68rem" }}>{atr} atrasado{atr !== 1 ? "s" : ""}</span>}
        {ph > 0 && <span className="pill pill-parahoy" style={{ fontSize: ".68rem" }}>{ph} hoy</span>}
        {et > 0 && <span className="pill pill-entiempo" style={{ fontSize: ".68rem" }}>{et} en tiempo</span>}
      </div>
      {open && (
        <div className="table-wrap" style={{ margin: 0, borderRadius: 0, borderLeft: 0, borderRight: 0, borderBottom: 0 }}>
          <table className="pmo">
            <thead>
              <tr>
                <th>Tarea</th><th>Grupo</th><th>Status</th><th>Estado</th><th>Deadline</th>
                <th style={{ textAlign: "right" }}>Costo</th><th style={{ textAlign: "right" }}>Beneficio</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const [ecls, elbl] = EPILL[r.estado] ?? ["pill-skip", r.estado];
                return (
                  <Row key={r.id} r={r} ecls={ecls} elbl={elbl} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ r, ecls, elbl }: { r: ProjItem; ecls: string; elbl: string }) {
  return (
    <>
      <tr>
        <td className="ini-name">{r.name}</td>
        <td style={{ fontSize: ".78rem", color: "var(--text-secondary)" }}>{r.grupo || "—"}</td>
        <td style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{r.status || "—"}</td>
        <td><span className={`pill ${ecls}`} style={{ fontSize: ".68rem" }}>{elbl}</span></td>
        <td>{dlCell(r.deadline)}</td>
        <td style={{ textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.cost ? fmtMoney(r.cost) : "—"}</td>
        <td style={{ textAlign: "right", fontWeight: 600, color: "#10b981", whiteSpace: "nowrap" }}>{r.benefit ? fmtMoney(r.benefit) : "—"}</td>
      </tr>
      {r.subitems.map((s) => {
        const [secls, selbl] = EPILL[s.estado] ?? ["pill-skip", s.estado];
        return (
          <tr key={s.id} style={{ background: "var(--bg-hover)" }}>
            <td className="ini-name" style={{ paddingLeft: 28, color: "var(--text-secondary)", fontSize: ".82rem" }}>↳ {s.name}</td>
            <td>—</td>
            <td style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{s.status || "—"}</td>
            <td><span className={`pill ${secls}`} style={{ fontSize: ".68rem" }}>{selbl}</span></td>
            <td>{dlCell(s.deadline)}</td>
            <td>—</td><td>—</td>
          </tr>
        );
      })}
    </>
  );
}
