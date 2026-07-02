"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/business";
import { useData } from "@/context/DataContext";
import { calcIniPMHealth, calcBoardMetrics, deriveBoardHealth, healthStatusFromIndex, HEALTH_CFG, INI_ACTIVE_STS, iniIsParaHoy, npsCfg, REQ_ACTIVE_GRUPOS } from "@/lib/process";
import type { BoardHealthData, HealthStatus } from "@/lib/process";
import type { CalMap, IniItem, ProjBoard, ProjItem, ReqItem } from "@/types";
import { ErrorBox, Loader } from "@/components/ui";
import NpsModal from "@/components/NpsModal";
import ValueGateModal, { type VpaAction } from "@/components/ValueGateModal";
import PMValueModal, { type PmValue } from "@/components/PMValueModal";

const PM_PORTFOLIO: Record<string, { prefix: string; name: string }> = {
  "Luis Aguilar": { prefix: "α", name: "Portafolio Alfa" },
  "David Guzmán": { prefix: "β", name: "Portafolio Beta" },
  "Daniela Alvarez": { prefix: "γ", name: "Portafolio Gamma" },
};
const pmLabel = (pm: string) => {
  const p = PM_PORTFOLIO[pm];
  return p ? `${p.prefix} ${p.name}` : pm;
};

const INI_HEALTH_CFG = HEALTH_CFG;

// Fases REQ de la 2 en adelante (Aprobación → Cierre ROI), para sumar costo/beneficio.
const REQ_PHASE2PLUS = new Set(["Aprobación", "Desarrollo", "Operación", "Cierre ROI"]);

// Detección del item "Value Gate (BC) Firmado y aprobado (Sponsor+VPA+PMO Mgr)" en proyectos.
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const isValueGate = (name: string) => {
  const n = norm(name);
  return n.includes("value gate") && n.includes("firmado") && n.includes("aprobado");
};

export default function ControlTowerPage() {
  const { data, loading, error } = useData();
  const router = useRouter();
  const [showNps, setShowNps] = useState(false);
  const [showValueGate, setShowValueGate] = useState(false);

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const { ini, req, proj, projBoards, projItemBaselines, calMap, nps } = data;
  const iniProc = ini.filter((r) => INI_ACTIVE_STS.has(r.status));
  const reqProc = req.filter((r) => REQ_ACTIVE_GRUPOS.has(r.grupo));

  // ── Board health map ──
  const boardHealthMap = new Map<string, BoardHealthData>();
  projBoards.forEach((b) => {
    boardHealthMap.set(b.id, deriveBoardHealth(calcBoardMetrics(proj.filter((r) => r.boardId === b.id), projItemBaselines)));
  });
  const boardsWithHealth = projBoards.filter((b) => boardHealthMap.get(b.id)?.healthStatus !== null);
  const projBoardsOffTrack = boardsWithHealth.filter((b) => boardHealthMap.get(b.id)?.healthStatus === "off-track").length;
  const projBoardsInRisk   = boardsWithHealth.filter((b) => boardHealthMap.get(b.id)?.healthStatus === "in-risk").length;
  const projBoardsOnTrack  = boardsWithHealth.filter((b) => boardHealthMap.get(b.id)?.healthStatus === "on-track").length;

  const PM_ORDER = Object.keys(PM_PORTFOLIO);
  const allPMs = [...new Set([
    ...ini.filter((r) => r.pm && r.estado !== "SKIP").map((r) => r.pm),
    ...req.filter((r) => r.pm && r.estado !== "CERRADO").map((r) => r.pm),
  ])].sort((a, b) => {
    const ia = PM_ORDER.indexOf(a);
    const ib = PM_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  // ── VEM del equipo ──
  const teamIniHIs = allPMs
    .map((pm) => calcIniPMHealth(pm, ini, calMap))
    .filter((h) => h.total > 0)
    .map((h) => h.index);
  const teamIniHealth = teamIniHIs.length > 0 ? teamIniHIs.reduce((a, b) => a + b, 0) / teamIniHIs.length : null;

  const reqVemAll = reqProc.filter((r) => r.vem != null).map((r) => r.vem as number);
  const teamReqHealth = reqVemAll.length > 0 ? reqVemAll.reduce((a, b) => a + b, 0) / reqVemAll.length : null;

  const boardHIs = boardsWithHealth.map((b) => boardHealthMap.get(b.id)?.healthIndex).filter((v): v is number => v != null);
  const teamProjHealth = boardHIs.length > 0 ? boardHIs.reduce((a, b) => a + b, 0) / boardHIs.length : null;

  const vemParts = [teamIniHealth, teamReqHealth, teamProjHealth].filter((v): v is number => v != null);
  const teamVem = vemParts.length > 0 ? vemParts.reduce((a, b) => a + b, 0) / vemParts.length : null;
  const vemPct = teamVem !== null ? Math.round(teamVem * 100) : null;
  // Estado del equipo = peor estado entre los PMs: si un PM está Off Track, el EVM del equipo es Off Track. El % sigue siendo el promedio.
  const pmStatuses = allPMs.map((pm) => pmWorstStatus(pm, ini, req, projBoards, boardHealthMap, calMap));
  const teamStatus: HealthStatus | null = teamVem === null ? null
    : pmStatuses.includes("off-track") ? "off-track"
    : pmStatuses.includes("in-risk") ? "in-risk"
    : "on-track";
  const teamCfg = teamStatus ? HEALTH_CFG[teamStatus] : null;
  const hColor = teamCfg?.color ?? "#6b7280";
  const hBg    = teamCfg?.bg ?? "var(--health-neutral-bg)";
  const hLabel = teamCfg?.label ?? "Sin datos";
  const hIcon  = teamCfg?.icon ?? "—";

  const G = {
    iniTotal:       iniProc.length,
    iniAtrasado:    iniProc.filter((r) => r.estado === "ATRASADO").length,
    iniParaHoy:     ini.filter((r) => iniIsParaHoy(r, calMap)).length,
    iniEnTiempo:    iniProc.filter((r) => r.estado === "EN TIEMPO" && !iniIsParaHoy(r, calMap)).length,
    reqTotal:       reqProc.length,
    reqEvmOffTrack: reqProc.filter((r) => r.vem !== null && (r.vem as number) < 0.85).length,
    reqEvmInRisk:   reqProc.filter((r) => r.vem !== null && (r.vem as number) >= 0.85 && (r.vem as number) < 0.95).length,
    reqEvmOnTrack:  reqProc.filter((r) => r.vem !== null && (r.vem as number) >= 0.95).length,
  };

  // ── Costos y beneficios totales (REQ + Proyectos) ──
  // REQ: solo fases 2 o posteriores (Aprobación → Cierre ROI). Se excluye Valuación, Cerrados y En Espera.
  const reqWithValue = req.filter((r) => REQ_PHASE2PLUS.has(r.grupo));
  const reqCost     = reqWithValue.reduce((s, r) => s + r.costRH + r.costSft, 0);
  const reqBenefit  = reqWithValue.reduce((s, r) => s + r.benefit, 0);

  // Proyectos: se agrupan por board y se mide si el Value Gate (BC) está Done en Aprobación y/o Launch.
  const projAgg = new Map<string, { cost: number; benefit: number; doneAprob: boolean; doneLaunch: boolean }>();
  for (const r of proj) {
    let a = projAgg.get(r.boardId);
    if (!a) { a = { cost: 0, benefit: 0, doneAprob: false, doneLaunch: false }; projAgg.set(r.boardId, a); }
    a.cost += r.cost;
    a.benefit += r.benefit;
    if (r.status === "Done" && isValueGate(r.name)) {
      const g = norm(r.grupo);
      if (g.includes("aprobacion")) a.doneAprob = true;
      if (g.includes("launch")) a.doneLaunch = true;
    }
  }
  const projBoardsAgg = [...projAgg.values()];
  const projAprob = projBoardsAgg.filter((b) => b.doneAprob);
  const projAmbos = projBoardsAgg.filter((b) => b.doneAprob && b.doneLaunch);
  const aprobCost    = projAprob.reduce((s, b) => s + b.cost, 0);
  const aprobBenefit = projAprob.reduce((s, b) => s + b.benefit, 0);
  const ambosCost    = projAmbos.reduce((s, b) => s + b.cost, 0);
  const ambosBenefit = projAmbos.reduce((s, b) => s + b.benefit, 0);
  // Total Proyectos = ambos buckets sumados (Aprobación + Ambos).
  const projCost    = aprobCost + ambosCost;
  const projBenefit = aprobBenefit + ambosBenefit;

  const totalCost    = reqCost + projCost;
  const totalBenefit = reqBenefit + projBenefit;

  // ── Payback (meses) y ROI (%) — REQ y Proyectos ──
  // Payback = costo / (beneficio / 12).   ROI = ((beneficio − costo) / costo) × 100.
  const reqPayback  = reqBenefit  > 0 ? reqCost  / (reqBenefit  / 12) : null;
  const reqRoi      = reqCost     > 0 ? ((reqBenefit  - reqCost)  / reqCost)  * 100 : null;
  const projPayback = projBenefit > 0 ? projCost / (projBenefit / 12) : null;
  const projRoi     = projCost    > 0 ? ((projBenefit - projCost) / projCost) * 100 : null;
  const fmtMonths = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)} meses`);
  const fmtRoi    = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);

  // ── VPA Actions ──
  // Acciones que debe realizar el VPA, con visibilidad de su estado:
  //  · Proyectos: steps "VPA valida Business Case…" (fase 1 y 3) y
  //    "Plan de beneficios acordados con CFO", en Working on it (o Done, en el detalle).
  //  · REQ: ítems en fase 2 (grupo Aprobación).
  const isVgStep = (name: string) => {
    const n = norm(name);
    return n.includes("vpa valida business case") || n.includes("plan de beneficios acordados con cfo");
  };
  const vpaProj: VpaAction[] = proj
    .filter((r) => isVgStep(r.name) && (r.status === "Working on it" || r.status === "Done"))
    .map((r) => ({
      id: `pm-${r.id}`, source: "PM", title: r.boardName,
      subtitle: `${r.name} · ${r.grupo}`, estado: r.estado, deadline: r.deadline,
      done: r.status === "Done",
    }));
  const vpaReq: VpaAction[] = req
    .filter((r) => r.grupo === "Aprobación")
    .map((r) => ({
      id: `req-${r.id}`, source: "REQ", title: r.name,
      subtitle: "REQ · Aprobación (fase 2)", estado: r.estado, deadline: r.deadline,
      done: false,
    }));
  const vpaActions = [...vpaProj, ...vpaReq];
  const vpaPending = vpaActions.filter((a) => !a.done);
  const vgEnTiempo = vpaPending.filter((a) => a.estado === "EN TIEMPO").length;
  const vgHoy      = vpaPending.filter((a) => a.estado === "PARA HOY").length;
  const vgAtrasado = vpaPending.filter((a) => a.estado === "ATRASADO").length;

  return (
    <div>
      {/* Tarjetas de resumen (se irán agregando más en horizontal) */}
      <div className="mb-4 flex flex-wrap gap-4">
        <div className="rounded-xl border-2 p-6 text-center" style={{ background: "var(--bg-surface)", borderColor: hColor, minWidth: 220 }}>
          <div className="mb-3 text-[0.9rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">EVM - PMO</div>
          <div className="mb-2 text-5xl font-extrabold leading-none" style={{ color: hColor }}>
            {vemPct !== null ? `${vemPct}%` : "—"}
          </div>
          <div className="mb-3 flex justify-center">
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.72rem] font-bold" style={{ color: hColor, background: hBg }}>{hIcon} {hLabel}</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[0.82rem] font-semibold text-[var(--text-muted)]">
            {teamIniHealth  !== null && <span>INI {Math.round(teamIniHealth  * 100)}%</span>}
            {teamReqHealth  !== null && <span>REQ {Math.round(teamReqHealth  * 100)}%</span>}
            {teamProjHealth !== null && <span>PM {Math.round(teamProjHealth * 100)}%</span>}
          </div>
        </div>

        {/* NPS — encuesta PMO */}
        {(() => {
          const cfg = npsCfg(nps.nps);
          const npsColor = cfg?.color ?? "#6b7280";
          return (
            <div
              onClick={() => setShowNps(true)}
              className="cursor-pointer rounded-xl border-2 p-6 text-center transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--bg-surface)", borderColor: npsColor, minWidth: 220 }}
            >
              <div className="mb-3 text-[0.9rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">NPS</div>
              <div className="mb-1.5 text-5xl font-extrabold leading-none" style={{ color: npsColor }}>
                {nps.nps !== null ? nps.nps : "—"}
              </div>
              <div className="mb-3 text-[0.85rem] font-bold uppercase tracking-wide" style={{ color: npsColor }}>
                {cfg?.label ?? "Sin datos"}
              </div>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[0.82rem] font-semibold text-[var(--text-muted)]">
                <span style={{ color: "#10b981" }}>{nps.promoters} prom.</span>
                <span style={{ color: "#ef4444" }}>{nps.detractors} detr.</span>
                <span>{nps.total} resp.</span>
              </div>
            </div>
          );
        })()}

        {/* Costo & Beneficio — REQ + Proyectos */}
        <div className="rounded-xl border-2 p-6 text-center" style={{ background: "var(--bg-surface)", borderColor: "#6c63ff", minWidth: 220 }}>
          <div className="mb-3 text-[0.9rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Costo &amp; Beneficio</div>
          <div className="mb-3 flex justify-center gap-6">
            <div>
              <div className="text-[0.6rem] uppercase tracking-wide text-[var(--text-muted)]">Costo</div>
              <div className="text-2xl font-extrabold leading-none" style={{ color: "#0ea5e9" }}>{fmtMoney(totalCost)}</div>
            </div>
            <div>
              <div className="text-[0.6rem] uppercase tracking-wide text-[var(--text-muted)]">Beneficio</div>
              <div className="text-2xl font-extrabold leading-none" style={{ color: "#10b981" }}>{fmtMoney(totalBenefit)}</div>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 text-[0.72rem] font-semibold text-[var(--text-muted)]">
            <span>REQ: <span style={{ color: "#0ea5e9" }}>{fmtMoney(reqCost)}</span> / <span style={{ color: "#10b981" }}>{fmtMoney(reqBenefit)}</span></span>
            <hr className="my-1" style={{ border: "none", borderTop: "1px solid var(--accent)" }} />
            <span>Aprobación: <span style={{ color: "#0ea5e9" }}>{fmtMoney(aprobCost)}</span> / <span style={{ color: "#10b981" }}>{fmtMoney(aprobBenefit)}</span></span>
            <span>Launch: <span style={{ color: "#0ea5e9" }}>{fmtMoney(ambosCost)}</span> / <span style={{ color: "#10b981" }}>{fmtMoney(ambosBenefit)}</span></span>
            <span>Total: <span style={{ color: "#0ea5e9" }}>{fmtMoney(projCost)}</span> / <span style={{ color: "#10b981" }}>{fmtMoney(projBenefit)}</span></span>
          </div>
        </div>

        {/* Payback & ROI — REQ + Proyectos */}
        <div className="rounded-xl border-2 p-6 text-center" style={{ background: "var(--bg-surface)", borderColor: "#0ea5e9", minWidth: 220 }}>
          <div className="mb-3 text-[0.9rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Payback &amp; ROI</div>
          <div className="flex flex-col gap-1 text-[0.8rem] font-semibold">
            <div className="text-[0.62rem] uppercase tracking-wide text-[var(--text-muted)]">Payback</div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">REQ</span><span style={{ color: "#8b5cf6" }}>{fmtMonths(reqPayback)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Proyectos</span><span style={{ color: "#8b5cf6" }}>{fmtMonths(projPayback)}</span></div>
            <hr className="my-1.5" style={{ border: "none", borderTop: "1px solid var(--accent)" }} />
            <div className="text-[0.62rem] uppercase tracking-wide text-[var(--text-muted)]">ROI</div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">REQ</span><span style={{ color: "#0ea5e9" }}>{fmtRoi(reqRoi)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Proyectos</span><span style={{ color: "#0ea5e9" }}>{fmtRoi(projRoi)}</span></div>
          </div>
        </div>

        {/* Value Gates — resumen de los que están en Working on it */}
        <div
          onClick={() => setShowValueGate(true)}
          className="cursor-pointer rounded-xl border-2 p-6 text-center transition-transform hover:-translate-y-0.5"
          style={{ background: "var(--bg-surface)", borderColor: "#8b5cf6", minWidth: 220 }}
        >
          <div className="mb-3 text-[0.9rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">VPA Actions</div>
          <div className="mb-1 text-5xl font-extrabold leading-none" style={{ color: "#8b5cf6" }}>{vpaPending.length}</div>
          <div className="mb-3 text-[0.8rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">Pendientes</div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[0.82rem] font-semibold">
            <span style={{ color: "#10b981" }}>✓ {vgEnTiempo} En Tiempo</span>
            <span style={{ color: "#f59e0b" }}>⚠ {vgHoy} Hoy</span>
            <span style={{ color: "#ef4444" }}>✕ {vgAtrasado} Atrasado</span>
          </div>
        </div>
      </div>

      {/* Bloques globales */}
      <div className="mb-2 flex flex-wrap rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <GlobalBlock title="Iniciativas" onClick={() => router.push("/iniciativas")} stats={[
          [`${G.iniTotal} total`, "var(--text-primary)"],
          [`✕ ${G.iniAtrasado} Off Track`, "#ef4444"],
          [`⚠ ${G.iniParaHoy} At Risk`, "#f59e0b"],
          [`✓ ${G.iniEnTiempo} On Track`, "#10b981"],
        ]} />
        <div className="mx-1 w-px self-stretch" style={{ background: "var(--border)" }} />
        <GlobalBlock title="REQ" onClick={() => router.push("/req")} stats={[
          [`${G.reqTotal} total`, "var(--text-primary)"],
          [`✕ ${G.reqEvmOffTrack} Off Track`, "#ef4444"],
          [`⚠ ${G.reqEvmInRisk} At Risk`, "#f59e0b"],
          [`✓ ${G.reqEvmOnTrack} On Track`, "#10b981"],
        ]} />
        <div className="mx-1 w-px self-stretch" style={{ background: "var(--border)" }} />
        <GlobalBlock title="PM" onClick={() => router.push("/proyectos")} stats={[
          [`${boardsWithHealth.length} total`, "var(--text-primary)"],
          [`${projBoardsOffTrack} off track`, "#ef4444"],
          [`${projBoardsInRisk} in risk`, "#f59e0b"],
          [`${projBoardsOnTrack} on track`, "#10b981"],
        ]} />
      </div>

      {/* Portafolios por PM */}
      <div className="mb-4 mt-6 flex items-center gap-2.5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Portafolios por PM</h2>
        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]">{allPMs.length} PM{allPMs.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {allPMs.map((pm) => {
          const q = encodeURIComponent(pm);
          return (
            <PMPortfolioCard key={pm} pm={pm} ini={ini} req={req} proj={proj} projBoards={projBoards} boardHealthMap={boardHealthMap} calMap={calMap} onGoIni={() => router.push(`/iniciativas?pm=${q}`)} onGoReq={() => router.push(`/req?pm=${q}`)} onGoProj={() => router.push(`/proyectos?pm=${q}`)} />
          );
        })}
      </div>

      {showNps && <NpsModal nps={nps} onClose={() => setShowNps(false)} />}
      {showValueGate && <ValueGateModal items={vpaActions} onClose={() => setShowValueGate(false)} />}
    </div>
  );
}

function GlobalBlock({ title, stats, onClick }: { title: string; stats: [string, string][]; onClick: () => void }) {
  return (
    <div onClick={onClick} className="min-w-[200px] flex-1 cursor-pointer rounded-lg px-5 py-1.5 transition-colors hover:bg-[var(--bg-hover)]">
      <div className="mb-2.5 text-[0.75rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {title} <span className="text-[0.72rem] opacity-50">→ ver dashboard</span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {stats.map(([txt, color], i) => (
          <span key={i} className="text-[0.88rem] font-semibold" style={{ color }}>{txt}</span>
        ))}
      </div>
    </div>
  );
}

function Stat({ n, color, label, showZero }: { n: number; color: string; label: string; showZero?: boolean }) {
  if (n <= 0 && !showZero) return null;
  return (
    <div className="flex items-center gap-1.5 text-[0.82rem] text-[var(--text-secondary)]">
      <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full" style={{ background: color }} />
      {n} {label}
    </div>
  );
}

const PROJ_HEALTH_COLOR: Record<string, string> = {
  "on-track":  "#10b981",
  "in-risk":   "#f59e0b",
  "off-track": "#ef4444",
};

/** Estado general de un PM = peor estado entre Iniciativas, REQ y Proyectos. */
function pmWorstStatus(
  pm: string,
  ini: IniItem[],
  req: ReqItem[],
  projBoards: ProjBoard[],
  boardHealthMap: Map<string, BoardHealthData>,
  calMap: CalMap,
): HealthStatus {
  const iniHealth = calcIniPMHealth(pm, ini, calMap);
  const iniStatus: HealthStatus | null = iniHealth.total > 0
    ? (iniHealth.offTrack > 0 ? "off-track" : iniHealth.inRisk > 0 ? "in-risk" : "on-track")
    : null;

  const reqVemItems = req.filter(
    (r) => r.pm === pm && r.estado !== "CERRADO" && REQ_ACTIVE_GRUPOS.has(r.grupo) && r.vem != null,
  );
  const reqSts = reqVemItems.map((r) => healthStatusFromIndex(r.vem as number));
  const reqStatus: HealthStatus | null = reqSts.includes("off-track") ? "off-track"
    : reqSts.includes("in-risk") ? "in-risk" : reqSts.length ? "on-track" : null;

  const pmBoards = projBoards.filter((b) => b.pm === pm && boardHealthMap.get(b.id)?.healthStatus != null);
  const projStatus: HealthStatus | null = pmBoards.length
    ? (pmBoards.some((b) => boardHealthMap.get(b.id)?.healthStatus === "off-track") ? "off-track"
      : pmBoards.some((b) => boardHealthMap.get(b.id)?.healthStatus === "in-risk") ? "in-risk"
      : "on-track")
    : null;

  const all = [iniStatus, reqStatus, projStatus];
  return all.includes("off-track") ? "off-track" : all.includes("in-risk") ? "in-risk" : "on-track";
}

/** Costo/beneficio por PM: REQ (fase 2+) y Proyectos (Value Gate BC firmado en Aprobación/Launch). */
function calcPmValue(pm: string, req: ReqItem[], proj: ProjItem[], projBoards: ProjBoard[]): PmValue {
  const reqItems   = req.filter((r) => r.pm === pm && REQ_PHASE2PLUS.has(r.grupo));
  const reqCost    = reqItems.reduce((s, r) => s + r.costRH + r.costSft, 0);
  const reqBenefit = reqItems.reduce((s, r) => s + r.benefit, 0);

  const pmBoardIds = new Set(projBoards.filter((b) => b.pm === pm).map((b) => b.id));
  const agg = new Map<string, { cost: number; benefit: number; doneAprob: boolean; doneLaunch: boolean }>();
  for (const r of proj) {
    if (!pmBoardIds.has(r.boardId)) continue;
    let a = agg.get(r.boardId);
    if (!a) { a = { cost: 0, benefit: 0, doneAprob: false, doneLaunch: false }; agg.set(r.boardId, a); }
    a.cost += r.cost;
    a.benefit += r.benefit;
    if (r.status === "Done" && isValueGate(r.name)) {
      const g = norm(r.grupo);
      if (g.includes("aprobacion")) a.doneAprob = true;
      if (g.includes("launch")) a.doneLaunch = true;
    }
  }
  const boards = [...agg.values()];
  const aprob = boards.filter((b) => b.doneAprob);
  const ambos = boards.filter((b) => b.doneAprob && b.doneLaunch);
  const aprobCost    = aprob.reduce((s, b) => s + b.cost, 0);
  const aprobBenefit = aprob.reduce((s, b) => s + b.benefit, 0);
  const ambosCost    = ambos.reduce((s, b) => s + b.cost, 0);
  const ambosBenefit = ambos.reduce((s, b) => s + b.benefit, 0);
  const projCost    = aprobCost + ambosCost;
  const projBenefit = aprobBenefit + ambosBenefit;

  return {
    reqCost, reqBenefit, aprobCost, aprobBenefit, ambosCost, ambosBenefit,
    projCost, projBenefit, totalCost: reqCost + projCost, totalBenefit: reqBenefit + projBenefit,
  };
}

function PMPortfolioCard({
  pm, ini, req, proj, projBoards, boardHealthMap, calMap, onGoIni, onGoReq, onGoProj,
}: {
  pm: string; ini: IniItem[]; req: ReqItem[]; proj: ProjItem[];
  projBoards: ProjBoard[]; boardHealthMap: Map<string, BoardHealthData>; calMap: CalMap;
  onGoIni: () => void; onGoReq: () => void; onGoProj: () => void;
}) {
  const [showValue, setShowValue] = useState(false);
  const iniHealth = calcIniPMHealth(pm, ini, calMap);

  const reqItems = req.filter((r) => r.pm === pm && r.estado !== "CERRADO");
  const reqAct = reqItems.filter((r) => REQ_ACTIVE_GRUPOS.has(r.grupo));
  const reqVemItems = reqAct.filter((r) => r.vem != null);
  const reqAvgVem = reqVemItems.length ? reqVemItems.reduce((s, r) => s + (r.vem as number), 0) / reqVemItems.length : null;
  // El estado REQ del PM es el peor de sus REQs (un Off Track → Off Track; si no, un At Risk → At Risk; si todos On Track → On Track). El % sigue siendo el promedio.
  const reqSts = reqVemItems.map((r) => healthStatusFromIndex(r.vem as number));
  const reqVemStatus = reqSts.includes("off-track") ? "off-track" : reqSts.includes("in-risk") ? "in-risk" : reqSts.length ? "on-track" : null;
  const rvc = reqVemStatus ? HEALTH_CFG[reqVemStatus] : null;

  const rEvmOff  = reqAct.filter((r) => r.vem !== null && (r.vem as number) < 0.85).length;
  const rEvmRisk = reqAct.filter((r) => r.vem !== null && (r.vem as number) >= 0.85 && (r.vem as number) < 0.95).length;
  const rEvmOn   = reqAct.filter((r) => r.vem !== null && (r.vem as number) >= 0.95).length;
  const reqEnEsperaN = reqItems.filter((r) => r.estado === "EN_ESPERA").length;
  const reqHas = reqAct.length > 0 || reqEnEsperaN > 0;

  const pmProjBoards = projBoards
    .filter((b) => b.pm === pm && boardHealthMap.get(b.id)?.healthStatus !== null);
  const projHas = pmProjBoards.length > 0;
  const pmProjHIs = pmProjBoards.map((b) => boardHealthMap.get(b.id)?.healthIndex).filter((v): v is number => v != null);
  const pmProjAvgHI = pmProjHIs.length > 0 ? pmProjHIs.reduce((a, b) => a + b, 0) / pmProjHIs.length : null;
  const pmProjStatus = healthStatusFromIndex(pmProjAvgHI);
  const ppc = pmProjStatus ? HEALTH_CFG[pmProjStatus] : null;

  const ihc = INI_HEALTH_CFG[iniHealth.status];

  const pmEvmParts = ([iniHealth.index, reqAvgVem, pmProjAvgHI] as (number | null)[]).filter((v): v is number => v != null);
  const pmEvmRaw = pmEvmParts.length > 0 ? pmEvmParts.reduce((a, b) => a + b, 0) / pmEvmParts.length : null;
  const pmEvmPct = pmEvmRaw !== null ? Math.round(pmEvmRaw * 100) : null;

  // Estado de la tarjeta = peor estado entre Iniciativas, REQ y Proyectos. El % sigue siendo el promedio.
  const pmHealth: HealthStatus = pmWorstStatus(pm, ini, req, projBoards, boardHealthMap, calMap);
  const hc = HEALTH_CFG[pmHealth];

  return (
    <div className="overflow-hidden rounded-xl border-2" style={{ background: "var(--bg-surface)", borderColor: hc.color }}>
      <div className="flex items-center justify-between border-b px-[18px] py-3.5" style={{ borderColor: "var(--border)" }}>
        <div>
          <span className="text-[0.95rem] font-bold text-[var(--text-primary)]">{pmLabel(pm)}</span>
          <div className="mt-0.5 text-[0.75rem] text-[var(--text-muted)]">PM · {pm}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowValue(true)}
            title="Ver costo y beneficio"
            className="flex h-7 w-7 items-center justify-center rounded-lg border text-[0.9rem] font-bold text-[var(--text-secondary)] transition-colors hover:border-[#0ea5e9] hover:text-[#0ea5e9]"
            style={{ borderColor: "var(--border)" }}
          >
            $
          </button>
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.75rem] font-bold" style={{ color: hc.color, background: hc.bg }}>{hc.icon} {hc.label}{pmEvmPct !== null ? ` · ${pmEvmPct}%` : ""}</span>
        </div>
      </div>
      <div className="flex">
        <Section
          label="Iniciativas"
          has={true}
          onClick={onGoIni}
          badge={
            <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold leading-none" style={{ color: ihc.color, background: ihc.bg }}>
              {ihc.icon} {ihc.label} · {Math.round(iniHealth.index * 100)}%
            </span>
          }
        >
          <Stat n={iniHealth.total} color="#6b7280" label="total" showZero />
          <Stat n={iniHealth.offTrack} color="#ef4444" label="Off Track" />
          <Stat n={iniHealth.inRisk} color="#f59e0b" label="At Risk" />
          <Stat n={iniHealth.onTrack} color="#10b981" label="On Track" />
        </Section>
        <div className="w-px flex-shrink-0" style={{ background: "var(--border)" }} />
        <Section
          label="REQ"
          has={reqHas}
          onClick={onGoReq}
          badge={rvc ? (
            <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold leading-none" style={{ color: rvc.color, background: rvc.bg }}>
              {rvc.icon} {rvc.label} · {Math.round((reqAvgVem as number) * 100)}%
            </span>
          ) : undefined}
        >
          <Stat n={reqAct.length} color="#6b7280" label="total" />
          <Stat n={rEvmOff} color="#ef4444" label="Off Track" />
          <Stat n={rEvmRisk} color="#f59e0b" label="At Risk" />
          <Stat n={rEvmOn} color="#10b981" label="On Track" />
        </Section>
        <div className="w-px flex-shrink-0" style={{ background: "var(--border)" }} />
        <Section label={`PM (${pmProjBoards.length})`} has={projHas} onClick={onGoProj} badge={ppc && pmProjAvgHI !== null ? (
            <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold leading-none" style={{ color: ppc.color, background: ppc.bg }}>
              {ppc.icon} {ppc.label} · {Math.round(pmProjAvgHI * 100)}%
            </span>
          ) : undefined}>
          <div className="flex flex-col gap-1.5 pt-0.5">
            {pmProjBoards.map((b) => {
              const bh = boardHealthMap.get(b.id);
              const hs = bh?.healthStatus;
              const color = hs ? PROJ_HEALTH_COLOR[hs] : "#6b7280";
              const hi = bh?.healthIndex;
              return (
                <div key={b.id} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: color }} />
                  <span className="text-[0.75rem] font-mono text-[var(--text-secondary)]" title={b.name}>{b.name.slice(0, 6)}</span>
                  {hi != null && <span className="ml-auto text-[0.72rem] font-bold tabular-nums" style={{ color }}>{Math.round(hi * 100)}%</span>}
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {showValue && (
        <PMValueModal pm={pm} value={calcPmValue(pm, req, proj, projBoards)} onClose={() => setShowValue(false)} />
      )}
    </div>
  );
}

function Section({ label, has, onClick, children, badge }: { label: string; has: boolean; onClick: () => void; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div onClick={has ? onClick : undefined} className={`min-w-0 flex-1 px-[18px] py-3.5 transition-colors ${has ? "cursor-pointer hover:bg-[var(--bg-hover)]" : ""}`}>
      <div className="mb-2">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
        {badge && <div className="mt-1">{badge}</div>}
      </div>
      {has ? <div className="flex flex-col gap-1.5">{children}</div> : <div className="pt-1 text-[0.8rem] text-[var(--text-disabled)]">Sin datos</div>}
    </div>
  );
}
