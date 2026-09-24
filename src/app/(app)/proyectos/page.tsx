"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { auth } from "@/lib/firebase";
import { fmtDate, fmtMoney } from "@/lib/business";
import { authedFetch } from "@/lib/api";
import { hasAction } from "@/lib/permissions";
import { PROJ_ACTIVE_STS, calcBoardMetrics, type BoardHealthData } from "@/lib/proj";
import { calcItemCalidad, calcItemNota, isFase3, isDesarrolloPorIteracionesStep } from "@/lib/dashboard";
import { HEALTH_CFG, type HealthStatus } from "@/lib/health";
import type { ProjBoard, ProjItem } from "@/types";
import type { SurveyDoc } from "@/lib/survey";
import MultiSelect from "@/components/MultiSelect";
import ProjectReportModal from "@/components/ProjectReportModal";
import StatusSelect from "@/components/StatusSelect";
import { buildProjectMetrics, buildAllProjectMetrics, boardHealthFromMetrics } from "@/lib/projectMetrics";
import SurveySendModal from "@/components/SurveySendModal";
import SurveyResultModal from "@/components/SurveyResultModal";
import BitacoraModal from "@/components/BitacoraModal";
import { EmptyRow, ErrorBox, FilterReset, Loader, Pill, StatCard } from "@/components/ui";

// El step del proyecto que habilita la encuesta de NPS y el estado que la activa.
const NPS_STEP_RE = /encuesta para nps/i;
const isWorkingOnIt = (s: string) => s.trim().toLowerCase() === "working on it";
interface SurveyTarget { reqId: string; reqCode: string; reqName: string; pm: string }

// "ATRASADO" sin `deadline` (calcProjEstado(null)) no significa que venció —
// solo que no tiene Limit Date (típico de un Future Steps sin agendar aún).
// Sin este blindaje, esos items se ven "Off Track" sin razón real (mismo
// criterio que enScope en projSummary.ts / isOffTrack en lib/proj.ts).
function estadoPill(status: string, estado: string, deadline: Date | null): [string, string] {
  if (status === "Done")      return ["pill-entiempo", "✓ On Track"];
  if (estado === "ATRASADO" && deadline !== null) return ["pill-atrasado", "✕ Off Track"];
  if (estado === "PARA HOY")  return ["pill-parahoy",  "⚠ At Risk"];
  if (estado === "EN TIEMPO") return ["pill-entiempo", "✓ On Track"];
  return ["pill-skip", "— Pending"];
}

// Off Track = está atrasado y no se completó (un Done cuenta como On Track).
const isOffTrack = (status: string, estado: string, deadline: Date | null) => status !== "Done" && estado === "ATRASADO" && deadline !== null;


export default function ProyectosPage() {
  return (
    <Suspense fallback={<Loader />}>
      <ProyectosInner />
    </Suspense>
  );
}

function ProyectosInner() {
  const { data, loading, error, refresh, refreshBoard } = useData();
  const { me } = useMe();
  const isAdmin = hasAction(me?.permissions, "manage_users");
  const [boardFilter, setBoardFilter] = useState<string[]>([]);
  const [openBoards, setOpenBoards] = useState<Set<string>>(new Set());
  const [filterNoDl, setFilterNoDl] = useState(false);

  // Encuestas por step (reqId = id del step "Encuesta para NPS"); un proyecto puede tener varias, una por persona.
  const canManageSurveys = hasAction(me?.permissions, "manage_roles");
  const [surveys, setSurveys] = useState<Map<string, SurveyDoc[]>>(new Map());
  const [sendTarget, setSendTarget] = useState<SurveyTarget | null>(null);
  const [resultToken, setResultToken] = useState<string | null>(null);

  // Bitácora (Updates de Monday) por item/hito — mismo permiso que el dropdown de status.
  const canComment = hasAction(me?.permissions, "edit_proj_status");
  const [bitacoraTarget, setBitacoraTarget] = useState<{ id: string; name: string; email?: string } | null>(null);

  const loadSurveys = useCallback(async () => {
    try {
      const t = await auth.currentUser?.getIdToken();
      if (!t) return;
      const res = await fetch("/api/surveys", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) return;
      const list = (await res.json()) as SurveyDoc[];
      const byReq = new Map<string, SurveyDoc[]>();
      for (const s of list) {
        const arr = byReq.get(s.reqId);
        if (arr) arr.push(s); else byReq.set(s.reqId, [s]);
      }
      setSurveys(byReq);
    } catch { /* silencioso: los badges simplemente no aparecen */ }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de encuestas (sistema externo)
  useEffect(() => { loadSurveys(); }, [loadSurveys]);

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const projData = data.proj;
  const projBoards = data.projBoards;

  const projItemBaselines = data.projItemBaselines;
  // SPI/CPI/Scope/EVM salen de la medición única (projectMetrics.ts) — mismo
  // dato que "Ver cálculo" de cada proyecto y que el Control Tower. `ac` sigue
  // viniendo de calcBoardMetrics (no es parte de esa medición).
  const projMetricsByBoard = new Map(
    buildAllProjectMetrics(projBoards, projData, { baselines: projItemBaselines }).map((m) => [m.boardId, m]),
  );
  const boardHealthMap = new Map<string, BoardHealthData>();
  projBoards.forEach((b) => {
    const m = projMetricsByBoard.get(b.id);
    if (!m) return;
    const { ac } = calcBoardMetrics(projData.filter((r) => r.boardId === b.id), projItemBaselines);
    boardHealthMap.set(b.id, boardHealthFromMetrics(m, ac));
  });
  const boardsOffTrack = projBoards.filter((b) => boardHealthMap.get(b.id)?.healthStatus === "off-track").length;
  const boardsInRisk   = projBoards.filter((b) => boardHealthMap.get(b.id)?.healthStatus === "in-risk").length;
  const boardsOnTrack  = projBoards.filter((b) => boardHealthMap.get(b.id)?.healthStatus === "on-track").length;

  // Al abrir un proyecto se confirma su status real contra Monday (por si
  // alguien lo cambió fuera de la app) antes de que el usuario lo edite de
  // nuevo si hace falta — evita quedarse con un status viejo del fetch inicial.
  const toggleAcc = (id: string) => {
    if (!openBoards.has(id)) refreshBoard(id).catch(() => {});
    setOpenBoards((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  // ── Boards visibles ──
  const allBoardsSorted = [...projBoards].sort((a, b) => a.name.localeCompare(b.name));
  const boardOpts = allBoardsSorted.map((b) => ({
    value: b.id, label: b.name,
    count: projData.filter((r) => r.boardId === b.id && PROJ_ACTIVE_STS.has(r.status)).length,
  }));
  const visibleBoards = allBoardsSorted.filter((b) =>
    !boardFilter.length || boardFilter.includes(b.id)
  );

  const handleResetBaseline = async (boardId: string, boardItems: ProjItem[]) => {
    const res = await authedFetch("/api/proj-baselines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boardId,
        items: boardItems.map(({ id, cost }) => ({ id, cost })),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    await refresh();
  };

  return (
    <div>
      {/* Cards */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard value={projBoards.length} label="Total Proyectos" />
        <StatCard value={boardsOffTrack} label="Off Track" color="#ef4444" borderColor="#ef4444" />
        <StatCard value={boardsInRisk}   label="At Risk"   color="#f59e0b" borderColor="#f59e0b" />
        <StatCard value={boardsOnTrack}  label="On Track"  color="#10b981" borderColor="#10b981" />
      </div>

      {/* Filtro de proyecto */}
      {(() => {
        const noDlCount = projData.reduce((acc, r) => acc + r.subitems.filter((s) => s.deadline === null).length, 0);
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
            const items = projData.filter((r) => r.boardId === b.id);
            if (!items.length) return null;
            const bh = boardHealthMap.get(b.id)!;
            // Ya no hay filtro de PM: `items` siempre es el board completo. Se
            // sigue pasando como `allBoardItems` porque BoardAccordion la usa
            // aparte para la medición (buildProjectMetrics) y el reset de baseline.
            return <BoardAccordion key={b.id} board={b} items={items} ev={bh.ev} pv={bh.pv} ac={bh.ac} scope={bh.scope} spi={bh.spi} cpi={bh.cpi} healthIndex={bh.healthIndex} healthStatus={bh.healthStatus} open={openBoards.has(b.id) || filterNoDl} onToggle={() => toggleAcc(b.id)} filterNoDl={filterNoDl} isAdmin={isAdmin} allBoardItems={items} onResetBaseline={() => handleResetBaseline(b.id, items)} surveysByReq={surveys} onOpenSurvey={setSendTarget} canComment={canComment} onOpenBitacora={setBitacoraTarget} />;
          })
          .filter(Boolean);
        return accordions.length ? accordions : <EmptyRow msg="Sin resultados." />;
      })()}

      {sendTarget && (
        <SurveySendModal
          target={sendTarget}
          existing={surveys.get(sendTarget.reqId) ?? []}
          directorio={data.directorio}
          isAdmin={canManageSurveys}
          onClose={() => setSendTarget(null)}
          onChange={(list) => setSurveys((m) => new Map(m).set(sendTarget.reqId, list))}
          onResult={(token) => { setSendTarget(null); setResultToken(token); }}
        />
      )}
      {resultToken && <SurveyResultModal token={resultToken} onClose={() => setResultToken(null)} />}
      {bitacoraTarget && (
        <BitacoraModal itemId={bitacoraTarget.id} itemName={bitacoraTarget.name} itemEmail={bitacoraTarget.email} onClose={() => setBitacoraTarget(null)} />
      )}
    </div>
  );
}

// ── Acordeón por board ─────────────────────────────────────────────────
function dlCell(dl: Date | null, opts?: { isDone?: boolean; redDash?: boolean }) {
  if (!dl) {
    return opts?.redDash
      ? <span style={{ color: "var(--bad)", fontWeight: 600 }}>—</span>
      : <span className="text-[var(--text-disabled)]">—</span>;
  }
  if (opts?.isDone) {
    return <span style={{ color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(dl)}</span>;
  }
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const color = dl < t ? "var(--bad)" : dl.getTime() === t.getTime() ? "var(--warn)" : "var(--ok)";
  return <span style={{ color, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(dl)}</span>;
}

// Celda "Entrega": ✓ a tiempo / ✕ atraso (solo Done). Compara fecha real vs Limit Date.
// SOLO informativa: asignar responsable de atraso se hace en /calidad-cumplimiento.
function entregaCell(entrega: "on-time" | "late" | null, actual: Date | null, limit: Date | null) {
  if (!entrega) return <span className="text-[var(--text-disabled)]">—</span>;
  const title = `Real: ${fmtDate(actual)} · Límite: ${fmtDate(limit)}`;
  return entrega === "late"
    ? <Pill tone="bad" small title={title}>✕ Atraso</Pill>
    : <Pill tone="ok" small title={title}>✓ A tiempo</Pill>;
}

// Celda "Calidad" del ITEM (step) que mide en su fase — ver isDesarrolloPorIteracionesStep
// en lib/dashboard para cuáles steps de la Fase 3 miden. Nota 0/50/100 (ver
// calcItemNota en lib/dashboard): 50% por el responsable asignado (SIEMPRE manual,
// sin bypass automático) + 50% por "recuperado" (ningún hito con Limit Date después
// del fin del CPM del item — ver calcItemCalidad/hitosFueraDeCpm). SOLO la
// calificación final: asignar responsable y ver el detalle de recuperación se
// hace ÚNICAMENTE en /calidad-cumplimiento.
function reprocesoCell(nota: number) {
  const tone = nota === 100 ? "ok" : nota === 0 ? "bad" : "warn";
  const icon = nota === 100 ? "✓" : nota === 0 ? "✕" : "⚠";
  return <Pill tone={tone} small>{icon} {nota}%</Pill>;
}

// Celda "Calidad" de un HITO — SOLO LECTURA: el dropdown vive en el item padre (y ese
// también es solo lectura acá), el hito solo informa si él mismo salió a tiempo (o
// sigue pendiente), y si su Limit Date quedó después del fin del CPM del item
// (fueraDeCpm). Se muestra únicamente bajo un item que mide Calidad (ver
// stepMideCalidad en Row).
function hitoCalidadReadOnly(entrega: "on-time" | "late" | null, fueraDeCpm: boolean) {
  const pill = !entrega
    ? <span className="text-[var(--text-disabled)]">— pendiente</span>
    : entrega === "late" ? <Pill tone="bad" small>✕ Atraso</Pill> : <Pill tone="ok" small>✓ A tiempo</Pill>;
  if (!fueraDeCpm) return pill;
  return (
    <div className="flex flex-col items-start gap-0.5">
      {pill}
      <span title="El Limit Date de este hito quedó después del fin del CPM del item" style={{ color: "var(--bad)", fontSize: ".62rem", fontWeight: 600 }}>⚠ después del CPM</span>
    </div>
  );
}

function BoardAccordion({ board, items, allBoardItems, ev, pv, ac, scope, spi, cpi, healthIndex, healthStatus, open, onToggle, filterNoDl, isAdmin, onResetBaseline, surveysByReq, onOpenSurvey, canComment, onOpenBitacora }: { board: ProjBoard; items: ProjItem[]; allBoardItems: ProjItem[]; ev: number; pv: number; ac: number; scope: number | null; spi: number | null; cpi: number | null; healthIndex: number | null; healthStatus: HealthStatus | null; open: boolean; onToggle: () => void; filterNoDl: boolean; isAdmin?: boolean; onResetBaseline?: () => Promise<void>; surveysByReq: Map<string, SurveyDoc[]>; onOpenSurvey: (t: SurveyTarget) => void; canComment: boolean; onOpenBitacora: (t: { id: string; name: string; email?: string }) => void }) {
  const [showModal, setShowModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const { data: ctx, refreshBoard, refreshingBoards } = useData();
  const [refreshErr, setRefreshErr] = useState(false);
  const refreshingThis = refreshingBoards.has(board.id);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [resetting, setResetting] = useState(false);
  const [resetState, setResetState] = useState<"idle" | "ok" | "error">("idle");
  const spiColor   = spi   === null ? "var(--text-muted)" : spi   >= 1 ? "#10b981" : spi   >= 0.85 ? "#f59e0b" : "#ef4444";
  const cpiColor   = cpi   === null ? "var(--text-muted)" : cpi   >= 1 ? "#10b981" : cpi   >= 0.85 ? "#f59e0b" : "#ef4444";
  const scopeColor = scope === null ? "var(--text-muted)" : scope >= 100 ? "#10b981" : scope >= 85 ? "#f59e0b" : "#ef4444";

  // healthIndex/healthStatus vienen de boardHealthFromMetrics (fuente única) — no se recalculan aquí.
  const badge = healthStatus ? HEALTH_CFG[healthStatus] : null;

  const toggleGroup = (g: string) =>
    setOpenGroups((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });

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
          spi={spi}
          cpi={cpi}
          metrics={buildProjectMetrics({
            board,
            items: allBoardItems,
            baselines: ctx?.projItemBaselines,
            delays: ctx?.delayAttributions,
            reproceso: ctx?.reprocesoAttributions,
            atrasoDetalles: ctx?.atrasoDetalles,
            npsRecords: ctx?.npsRecords,
            devTeamRoster: ctx?.devTeamRoster,
            alcance: ctx?.boardAlcance[board.id]?.alcance ?? "",
          })}
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
                <div className="mt-1.5 text-[0.8rem] font-semibold" style={{ color: badge.color }}>{badge.icon} {badge.label}</div>
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
        {board.benefitType && (
          <span
            className="rounded-full px-2 py-0.5 text-[0.7rem] font-semibold"
            title="Benefit Type (heredado de la Iniciativa)"
            style={{ color: board.benefitType === "HardSaving" ? "#10b981" : "#8b5cf6", background: (board.benefitType === "HardSaving" ? "#10b981" : "#8b5cf6") + "22" }}
          >
            {board.benefitType}
          </span>
        )}
        <span className="rounded-full px-2 py-0.5 text-[0.7rem]" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
          {items.length} items
        </span>
        {badge ? (
          <button
            onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
            className="rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold"
            style={{ color: badge.color, background: badge.bg }}
          >
            {badge.icon} {badge.label}{healthIndex !== null ? ` · ${Math.round(healthIndex * 100)}%` : ""}
          </button>
        ) : (
          <span
            className="rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold"
            title="Falta Cost $ y/o Limit Date en los items del board para calcular el VEM"
            style={{ color: "var(--text-muted)", background: "var(--bg-hover)" }}
          >
            — Sin datos
          </span>
        )}
        {isAdmin && onResetBaseline && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (resetting) return;
              setResetting(true);
              setResetState("idle");
              try {
                await onResetBaseline();
                setResetState("ok");
              } catch {
                setResetState("error");
              } finally {
                setResetting(false);
                setTimeout(() => setResetState("idle"), 3000);
              }
            }}
            title="Sobreescribir costo planificado con los costos actuales de Monday"
            className="rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
            style={{
              borderColor: resetState === "error" ? "#ef4444" : resetState === "ok" ? "#10b981" : "var(--border)",
              color: resetState === "ok" ? "#10b981" : resetState === "error" ? "#ef4444" : "var(--text-muted)",
              opacity: resetting ? 0.6 : 1,
            }}
          >
            {resetting ? "…" : resetState === "ok" ? "✓ Base actualizada" : resetState === "error" ? "✕ Error" : "↺ Costo Inicial"}
          </button>
        )}
        <button
          onClick={async (e) => {
            e.stopPropagation();
            if (refreshingThis) return;
            setRefreshErr(false);
            try {
              await refreshBoard(board.id);
            } catch {
              setRefreshErr(true);
              setTimeout(() => setRefreshErr(false), 3000);
            }
          }}
          title="Trae solo este proyecto de Monday, sin recargar los demás"
          disabled={refreshingThis}
          className="rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-60"
          style={{ borderColor: refreshErr ? "#ef4444" : "var(--border)", color: refreshErr ? "#ef4444" : "var(--text-secondary)" }}
        >
          {refreshingThis ? "…" : refreshErr ? "✕ Error" : "↻ Actualizar"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowReport(true); refreshBoard(board.id).catch(() => {}); }}
          className="rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Report
        </button>
      </div>

      {open && (
        <div className="table-wrap" style={{ margin: 0, borderRadius: 0, border: 0 }}>
          <table className="pmo grouped">
            <thead>
              <tr>
                <th>Tarea</th><th>Responsible</th><th>Status</th><th>Estado</th><th>Deadline</th><th>Entrega</th><th>Calidad</th>
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
                const gOffTrack = gItems.some((r) => isOffTrack(r.status, r.estado, r.deadline) || r.subitems.some((s) => isOffTrack(s.status, s.estado, s.deadline)));
                // Cumplimiento de Entrega mide progresivo (no espera a que la fase cierre):
                // basta un step o hito YA evaluado y atrasado para que la fase entera cuente
                // "con atraso" — un solo responsable decide la excusa de todos a la vez.
                // Calidad (ex-Reproceso): solo en Fase 3. Si la fase tiene un step "Desarrollo
                // por iteraciones..." (plantilla vieja), la unidad de Calidad son SUS hitos —
                // ningún step de la fase (ni ese ni los demás) mide a nivel de step. Si no
                // existe (plantilla nueva), cada step de la fase mide por sí mismo.
                const desarrolloStep = isFase3(grupo) ? allGItems.find((r) => isDesarrolloPorIteracionesStep(r.name)) : undefined;
                return (
                  <React.Fragment key={grupo}>
                    {/* ── Group header row ── */}
                    <tr onClick={() => toggleGroup(grupo)} className="cursor-pointer select-none">
                      <td colSpan={9} style={{ padding: 0, borderTop: "1px solid var(--border)" }}>
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
                          {/* Asignar responsable de atraso/calidad ya NO se hace acá — se hace
                              en /calidad-cumplimiento. Este header solo informa. */}
                          <span
                            className="ml-auto h-2.5 w-2.5 flex-shrink-0 rounded-full"
                            style={{ background: gOffTrack ? "#ef4444" : "#10b981" }}
                            title={gOffTrack ? "Hay items Off Track en esta fase" : "Fase On Track"}
                          />
                          <span
                            className="rounded-full px-2 py-px text-[0.63rem]"
                            style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                          >
                            {gItems.length}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {gOpen && gItems.map((r) => {
                      const [ecls, elbl] = estadoPill(r.status, r.estado, r.deadline);
                      return <Row key={r.id} r={r} ecls={ecls} elbl={elbl} filterNoDl={filterNoDl} pm={board.pm} surveysByReq={surveysByReq} onOpenSurvey={onOpenSurvey} desarrolloStepId={desarrolloStep?.id} canComment={canComment} onOpenBitacora={onOpenBitacora} />;
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

function Row({ r, ecls, elbl, filterNoDl, pm, surveysByReq, onOpenSurvey, desarrolloStepId, canComment, onOpenBitacora }: { r: ProjItem; ecls: string; elbl: string; filterNoDl: boolean; pm: string; surveysByReq: Map<string, SurveyDoc[]>; onOpenSurvey: (t: SurveyTarget) => void; desarrolloStepId?: string; canComment: boolean; onOpenBitacora: (t: { id: string; name: string; email?: string }) => void }) {
  const { data } = useData();
  const [open, setOpen] = useState(false);
  const allSubitems = r.subitems;
  const visibleSubitems = filterNoDl ? allSubitems.filter((s) => s.deadline === null) : allSubitems;
  const hasSubitems = allSubitems.length > 0;
  const subOffTrack = allSubitems.some((s) => isOffTrack(s.status, s.estado, s.deadline));
  const isOpen = (filterNoDl && visibleSubitems.length > 0) || open;

  // Solo los subitems del step "Encuesta para NPS" que estén en Working on it llevan encuesta.
  const isNpsStep = NPS_STEP_RE.test(r.name);

  // Calidad mide a nivel de ITEM (el dropdown vive en el step), de forma
  // progresiva — no espera a que el item entero cierre (ver calcItemCalidad en
  // lib/dashboard). Plantilla vieja (desarrolloStepId definido): SOLO ese step
  // mide; los demás checkpoints de la fase no aportan nada. Plantilla nueva (sin
  // ese step): CADA step de la fase mide. Sus hitos quedan de solo lectura.
  // Acá es SOLO informativa (ver reprocesoCell/hitoCalidadReadOnly): la calificación
  // se hace únicamente en /calidad-cumplimiento.
  const inFase3 = isFase3(r.grupo);
  const stepMideCalidad = inFase3 && (desarrolloStepId ? desarrolloStepId === r.id : true);
  const calc = stepMideCalidad ? calcItemCalidad(r) : null;
  const nota = calc?.qualifies ? calcItemNota(r.id, calc.recuperado, data?.reprocesoAttributions ?? {}) : null;
  const fueraDeCpmIds = new Set((calc?.fueraDeCpm ?? []).map((x) => x.id));

  const SUB_BG = "var(--bg-hover)";

  const commentBtn = (id: string, name: string, email?: string) => canComment && (
    <button
      onClick={(e) => { e.stopPropagation(); onOpenBitacora({ id, name, email }); }}
      className="ml-2 rounded-md border px-1.5 py-0.5 align-middle text-[0.62rem] transition-colors hover:bg-[var(--bg-surface)]"
      style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
      title="Bitácora · ver y agregar comentarios (Monday)"
    >
      💬
    </button>
  );

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
            <span
              className="ml-2 inline-block h-2 w-2 rounded-full align-middle"
              style={{ background: subOffTrack ? "#ef4444" : "#10b981" }}
              title={subOffTrack ? "Hay subitems Off Track" : "Subitems On Track"}
            />
          )}
          {hasSubitems && (
            <span className="ml-1.5 rounded-full px-1.5 py-px text-[0.6rem]" style={{ background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              {allSubitems.length}
            </span>
          )}
          {commentBtn(r.id, r.name, r.email)}
        </td>
        <td style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{r.responsible || <span className="text-[var(--text-disabled)]">—</span>}</td>
        <td style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>
          <StatusSelect boardId={r.boardId} itemId={r.id} columnId={r.statusColId} options={r.statusOptions} current={r.status} />
        </td>
        <td><span className={`pill ${ecls}`} style={{ fontSize: ".68rem" }}>{elbl}</span></td>
        <td>{dlCell(r.deadline, { isDone: r.status === "Done" })}</td>
        <td>{entregaCell(r.entrega, r.endDate, r.deadline)}</td>
        <td>{nota != null && calc
          ? reprocesoCell(nota)
          : <span className="text-[var(--text-disabled)]">—</span>}</td>
        <td style={{ textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.cost ? fmtMoney(r.cost) : "—"}</td>
        <td style={{ textAlign: "right", fontWeight: 600, color: "var(--ok)", whiteSpace: "nowrap" }}>{r.benefit ? fmtMoney(r.benefit) : "—"}</td>
      </tr>
      {/* ── Subitem rows ── */}
      {isOpen && visibleSubitems.map((s, i) => {
        const [secls, selbl] = estadoPill(s.status, s.estado, s.deadline);
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
              {isNpsStep && isWorkingOnIt(s.status) && (() => {
                const list = surveysByReq.get(s.id) ?? [];
                const total = list.length;
                const answered = list.filter((x) => x.answered && !x.invalidated).length;
                const done = total > 0 && answered === total;
                const color = total === 0 ? "var(--accent)" : done ? "#10b981" : "#f59e0b";
                return (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenSurvey({ reqId: s.id, reqCode: s.pmsId, reqName: s.name, pm }); }}
                    className="ml-2 rounded-md border px-2 py-0.5 text-[0.66rem] font-semibold align-middle transition-colors hover:bg-[var(--bg-surface)]"
                    style={{ borderColor: color, color }}
                    title="Encuesta · agregar destinatarios y enviar enlaces"
                  >
                    {total > 0 ? `👥 ${answered}/${total}` : "✉ Encuesta"}
                  </button>
                );
              })()}
              {commentBtn(s.id, s.name, s.email)}
            </td>
            <td style={{ fontSize: ".72rem", color: "var(--text-muted)", background: SUB_BG }}>{s.responsible || <span className="text-[var(--text-disabled)]">—</span>}</td>
            <td style={{ fontSize: ".72rem", color: "var(--text-muted)", background: SUB_BG }}>
              <StatusSelect boardId={s.statusBoardId ?? ""} itemId={s.id} columnId={s.statusColId} options={s.statusOptions} current={s.status} />
            </td>
            <td style={{ background: SUB_BG }}><span className={`pill ${secls}`} style={{ fontSize: ".63rem" }}>{selbl}</span></td>
            <td style={{ background: SUB_BG }}>{dlCell(s.deadline, { isDone: s.status === "Done", redDash: true })}</td>
            <td style={{ background: SUB_BG }}>{entregaCell(s.entrega, s.actualEnd, s.deadline)}</td>
            <td style={{ background: SUB_BG }}>
              {stepMideCalidad ? hitoCalidadReadOnly(s.entrega, fueraDeCpmIds.has(s.id)) : <span className="text-[var(--text-disabled)]">—</span>}
            </td>
            <td style={{ background: SUB_BG, color: "var(--text-disabled)" }}>—</td>
            <td style={{ background: SUB_BG, color: "var(--text-disabled)" }}>—</td>
          </tr>
        );
      })}
    </>
  );
}
