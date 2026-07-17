"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/business";
import { useData } from "@/context/DataContext";
import { calcIniPMHealth, INI_ACTIVE_STS, iniIsParaHoy } from "@/lib/ini";
import { calcBoardMetrics, deriveBoardHealth, type BoardHealthData } from "@/lib/proj";
import { healthStatusFromIndex, HEALTH_CFG, type HealthStatus } from "@/lib/health";
import { calcNpsFromRecords, npsCfg } from "@/lib/nps";
import { REQ_ACTIVE_GRUPOS } from "@/lib/req";
import type { CalMap, DashboardData, IniItem, NpsRecord, ProjBoard, ProjItem, ReqItem } from "@/types";
import { ErrorBox, Loader } from "@/components/ui";
import NpsModal from "@/components/NpsModal";
import ValueGateModal, { type VpaAction } from "@/components/ValueGateModal";
import PMValueModal, { type PmValue } from "@/components/PMValueModal";
import KpiModal from "@/components/KpiModal";
import { KPI_W, computeKpi, kpiColorFor, kpiBgFor } from "@/lib/kpi";

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
// Los REQ solo tienen la fase 2 (Aprobación) como gate de valor. Si ya la pasaron
// (fases posteriores) su valor se considera "Confirmación"; si siguen en fase 2, "Aprobación".
const REQ_PASSED_PHASE2 = new Set(["Desarrollo", "Operación", "Cierre ROI"]);

// Detección del item "Value Gate (BC) Firmado y aprobado (Sponsor+VPA+PMO Mgr)" (fase Aprobación).
// Se usa para las acciones del VPA.
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const isValueGate = (name: string) => {
  const n = norm(name);
  return n.includes("value gate") && n.includes("firmado") && n.includes("aprobado");
};
// Cualquier Value Gate (BC) FIRMADO, en cualquier fase. Cubre el de Aprobación
// ("Firmado y aprobado") y el de Launch ("Actualizado y firmado"), para clasificar el
// beneficio en el bucket correcto; el grupo (Aprobación/Launch) desambigua la fase.
const isValueGateSigned = (name: string) => {
  const n = norm(name);
  return n.includes("value gate") && n.includes("firmado");
};

export default function ControlTowerPage() {
  const { data, loading, error } = useData();
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;
  return <ControlTower data={data} />;
}

function ControlTower({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [showNps, setShowNps] = useState(false);
  const [showValueGate, setShowValueGate] = useState(false);
  const [showKpi, setShowKpi] = useState(false);
  const [hardOnly, setHardOnly] = useState(false); // filtro "Solo HardSaving" para Costo & Beneficio
  const [pmView, setPmView] = useState<"tabla" | "tarjetas">("tabla"); // vista de Portafolios por PM

  const { ini, req, proj, projBoards, projItemBaselines, calMap, nps, npsRecords } = data;

  // Todas las derivaciones dependen solo de los datos (estáticos entre refreshes) y del
  // filtro hardOnly. Se memoizan para no recalcular al abrir modales o cambiar de vista.
  const {
    boardHealthMap, boardsWithHealth, projBoardsOffTrack, projBoardsInRisk, projBoardsOnTrack,
    allPMs, teamIniHealth, teamReqHealth, teamProjHealth, vemPct, hColor, hBg, hLabel, hIcon,
    G, totalCost, totalBenefit, colAprobCost, colAprobBenefit, colConfirmCost, colConfirmBenefit,
    vpaActions, vpaPending, vgEnTiempo, vgHoy, vgAtrasado,
    entOn, entLate, entTotal, entPct, entColor,
    kpi, kpiPct, kpiAchievable, kpiColor,
  } = useMemo(() => {
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
  // Filtro "Solo HardSaving": limita costo y beneficio a los ítems con Benefit Type = HardSaving.
  const hardBoardIds = new Set(projBoards.filter((b) => b.benefitType === "HardSaving").map((b) => b.id));
  // REQ: solo fases 2 o posteriores (Aprobación → Cierre ROI). Se excluye Valuación, Cerrados y En Espera.
  const reqWithValue = req.filter((r) => REQ_PHASE2PLUS.has(r.grupo) && (!hardOnly || r.benefitType === "HardSaving"));
  const reqCost     = reqWithValue.reduce((s, r) => s + r.costRH + r.costSft, 0);
  const reqBenefit  = reqWithValue.reduce((s, r) => s + r.benefit, 0);
  // REQ que pasaron la fase 2 → Confirmación; los que siguen en fase 2 (Aprobación) → Aprobación.
  const reqConfirmItems = reqWithValue.filter((r) => REQ_PASSED_PHASE2.has(r.grupo));
  const reqAprobItems   = reqWithValue.filter((r) => !REQ_PASSED_PHASE2.has(r.grupo));
  const reqConfirmCost    = reqConfirmItems.reduce((s, r) => s + r.costRH + r.costSft, 0);
  const reqConfirmBenefit = reqConfirmItems.reduce((s, r) => s + r.benefit, 0);
  const reqAprobCost      = reqAprobItems.reduce((s, r) => s + r.costRH + r.costSft, 0);
  const reqAprobBenefit   = reqAprobItems.reduce((s, r) => s + r.benefit, 0);

  // Proyectos: se agrupan por board y se mide si el Value Gate (BC) está Done en Aprobación y/o Launch.
  const projAgg = new Map<string, { cost: number; benefit: number; doneAprob: boolean; doneLaunch: boolean }>();
  for (const r of proj) {
    if (hardOnly && !hardBoardIds.has(r.boardId)) continue;
    let a = projAgg.get(r.boardId);
    if (!a) { a = { cost: 0, benefit: 0, doneAprob: false, doneLaunch: false }; projAgg.set(r.boardId, a); }
    a.cost += r.cost;
    a.benefit += r.benefit;
    if (r.status === "Done" && isValueGateSigned(r.name)) {
      const g = norm(r.grupo);
      if (g.includes("aprobacion")) a.doneAprob = true;
      if (g.includes("launch")) a.doneLaunch = true;
    }
  }
  const projBoardsAgg = [...projAgg.values()];
  // Buckets mutuamente excluyentes (sin doble conteo):
  //  Aprobación = solo Aprobación Done (Launch aún no).  Ambos = Aprobación y Launch Done.
  const projAprob = projBoardsAgg.filter((b) => b.doneAprob && !b.doneLaunch);
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

  // Columnas combinadas (REQ + Proyectos) para la tarjeta y el pop-up:
  //  Aprobación   = REQ en fase 2 + proyectos con solo el Value Gate de Aprobación.
  //  Confirmación = REQ que pasaron fase 2 + proyectos con el Value Gate de Launch firmado.
  const colAprobCost      = reqAprobCost + aprobCost;
  const colAprobBenefit   = reqAprobBenefit + aprobBenefit;
  const colConfirmCost    = reqConfirmCost + ambosCost;
  const colConfirmBenefit = reqConfirmBenefit + ambosBenefit;

  // ── VPA Actions ──
  // Acciones que debe realizar el VPA, con visibilidad de su estado:
  //  · Proyectos: steps "VPA valida Business Case…" / "Entregable Business Case
  //    validado por VPA" (fase 1 y 3), "Plan de beneficios acordados con CFO" y
  //    "Value Gate (BC) Firmado y aprobado (Sponsor+VPA+PMO Mgr)" (fase 2 y 3),
  //    en Working on it (o Done, en el detalle).
  //  · REQ: ítems en fase 2 (grupo Aprobación).
  const isVgStep = (name: string) => {
    const n = norm(name);
    return n.includes("vpa valida business case")
      || n.includes("business case validado por vpa")
      || n.includes("plan de beneficios acordados con cfo")
      || isValueGate(name);
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

  // ── Compromiso de Entregas ──
  // % de entregas a tiempo combinando la columna "Entrega" de REQ (cerrados), items y subitems.
  let entOn = 0, entLate = 0;
  for (const r of req) {
    if (r.onTime.verdict === "on-time") entOn++;
    else if (r.onTime.verdict === "late") entLate++;
  }
  for (const p of proj) {
    if (p.entrega === "on-time") entOn++; else if (p.entrega === "late") entLate++;
    for (const s of p.subitems) {
      if (s.entrega === "on-time") entOn++; else if (s.entrega === "late") entLate++;
    }
  }
  const entTotal = entOn + entLate;
  const entPct = entTotal > 0 ? Math.round((entOn / entTotal) * 100) : null;
  const entColor = entPct === null ? "#6b7280" : entPct >= 90 ? "var(--ok)" : entPct >= 75 ? "var(--warn)" : "var(--bad)";

  // ── KPI PMO ──
  // Beneficio HardSaving CONFIRMADO (independiente del toggle "Solo HardSaving" de la
  // tarjeta): REQ HardSaving que ya pasaron fase 2 + proyectos HardSaving con ambos
  // Value Gates (Aprobación y Launch) firmados.
  const kpiReqBenefit = req
    .filter((r) => REQ_PASSED_PHASE2.has(r.grupo) && r.benefitType === "HardSaving")
    .reduce((s, r) => s + r.benefit, 0);
  const kpiProjAgg = new Map<string, { benefit: number; doneAprob: boolean; doneLaunch: boolean }>();
  for (const r of proj) {
    if (!hardBoardIds.has(r.boardId)) continue;
    let a = kpiProjAgg.get(r.boardId);
    if (!a) { a = { benefit: 0, doneAprob: false, doneLaunch: false }; kpiProjAgg.set(r.boardId, a); }
    a.benefit += r.benefit;
    if (r.status === "Done" && isValueGateSigned(r.name)) {
      const g = norm(r.grupo);
      if (g.includes("aprobacion")) a.doneAprob = true;
      if (g.includes("launch")) a.doneLaunch = true;
    }
  }
  const kpiProjBenefit = [...kpiProjAgg.values()].filter((b) => b.doneAprob && b.doneLaunch).reduce((s, b) => s + b.benefit, 0);
  const kpiBenefitConfirmed = kpiReqBenefit + kpiProjBenefit;

  const kpi = computeKpi({ evm: teamVem, nps: nps.nps, benefit: kpiBenefitConfirmed, entregasPct: entPct });
  const kpiPct = Math.round(kpi.score);
  const kpiAchievable = kpi.achievable; // 80 hoy (el 5º componente está pendiente)
  const kpiColor = kpiColorFor(kpi.ratio);

  return {
    boardHealthMap, boardsWithHealth, projBoardsOffTrack, projBoardsInRisk, projBoardsOnTrack,
    allPMs, teamIniHealth, teamReqHealth, teamProjHealth, vemPct, hColor, hBg, hLabel, hIcon,
    G, totalCost, totalBenefit, colAprobCost, colAprobBenefit, colConfirmCost, colConfirmBenefit,
    vpaActions, vpaPending, vgEnTiempo, vgHoy, vgAtrasado,
    entOn, entLate, entTotal, entPct, entColor,
    kpi, kpiPct, kpiAchievable, kpiColor,
  };
  }, [ini, req, proj, projBoards, projItemBaselines, calMap, nps, hardOnly]);

  return (
    <div>
      {/* ── Resumen: 4 métricas núcleo (grid uniforme) + KPI héroe a la derecha ── */}
      <div className="mb-4 flex flex-col gap-4 xl:flex-row">
        <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">

          {/* EVM */}
          <div className="flex flex-col rounded-xl border-2 p-5 text-center" style={{ background: "var(--bg-surface)", borderColor: hColor }}>
            <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">EVM · PMO</div>
            <div className="text-5xl font-extrabold leading-none" style={{ color: hColor }}>
              {vemPct !== null ? `${vemPct}%` : "—"}
            </div>
            <div className="mt-2 flex justify-center">
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.72rem] font-bold" style={{ color: hColor, background: hBg }}>{hIcon} {hLabel}</span>
            </div>
            <div className="mt-auto flex flex-wrap justify-center gap-x-3 gap-y-1 pt-3 text-[0.78rem] font-semibold text-[var(--text-muted)]">
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
                title="Ver detalle NPS"
                className="flex cursor-pointer flex-col rounded-xl border-2 p-5 text-center transition-transform hover:-translate-y-0.5"
                style={{ background: "var(--bg-surface)", borderColor: npsColor }}
              >
                <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">NPS</div>
                <div className="text-5xl font-extrabold leading-none" style={{ color: npsColor }}>
                  {nps.nps !== null ? nps.nps : "—"}
                </div>
                <div className="mt-2 text-[0.8rem] font-bold uppercase tracking-wide" style={{ color: npsColor }}>
                  {cfg?.label ?? "Sin datos"}
                </div>
                <div className="mt-auto flex flex-wrap justify-center gap-x-3 gap-y-1 pt-3 text-[0.78rem] font-semibold text-[var(--text-muted)]">
                  <span style={{ color: "var(--ok)" }}>{nps.promoters} prom.</span>
                  <span style={{ color: "var(--bad)" }}>{nps.detractors} detr.</span>
                  <span>{nps.total} resp.</span>
                </div>
              </div>
            );
          })()}

          {/* Costo & Beneficio — REQ + Proyectos */}
          <div className="flex flex-col rounded-xl border-2 p-5 text-center" style={{ background: "var(--bg-surface)", borderColor: hardOnly ? "var(--ok)" : "var(--accent)" }}>
            <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Costo &amp; Beneficio</div>
            <div className="text-[2rem] font-extrabold leading-none" style={{ color: "var(--ok)" }}>{fmtMoney(totalBenefit)}</div>
            <div className="mt-1 text-[0.78rem] font-semibold text-[var(--text-muted)]">
              Costo <span style={{ color: "var(--info)" }}>{fmtMoney(totalCost)}</span>
            </div>
            <div className="mt-auto flex flex-col gap-0.5 pt-3 text-[0.72rem] font-semibold text-[var(--text-muted)]">
              <span>Aprob. <span style={{ color: "var(--info)" }}>{fmtMoney(colAprobCost)}</span> / <span style={{ color: "var(--ok)" }}>{fmtMoney(colAprobBenefit)}</span></span>
              <span>Confirm. <span style={{ color: "var(--info)" }}>{fmtMoney(colConfirmCost)}</span> / <span style={{ color: "var(--ok)" }}>{fmtMoney(colConfirmBenefit)}</span></span>
              <button
                onClick={() => setHardOnly((v) => !v)}
                title="Filtrar Costo y Beneficio a solo HardSaving (afecta también el beneficio por PM)"
                className="mt-1.5 self-center rounded-full border px-3 py-1 text-[0.64rem] font-bold uppercase tracking-wide transition-colors"
                style={hardOnly
                  ? { borderColor: "var(--ok)", color: "var(--ok)", background: "var(--ok-bg)" }
                  : { borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                {hardOnly ? "✓ Solo HardSaving" : "Solo HardSaving"}
              </button>
            </div>
          </div>

          {/* Compromiso de Entregas — % a tiempo (REQ + items + subitems) */}
          <div className="flex flex-col rounded-xl border-2 p-5 text-center" style={{ background: "var(--bg-surface)", borderColor: entColor }}>
            <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Compromiso de Entregas</div>
            <div className="text-5xl font-extrabold leading-none" style={{ color: entColor }}>
              {entPct !== null ? `${entPct}%` : "—"}
            </div>
            <div className="mt-2 text-[0.8rem] font-bold uppercase tracking-wide" style={{ color: entColor }}>A tiempo</div>
            <div className="mt-auto flex flex-wrap justify-center gap-x-3 gap-y-1 pt-3 text-[0.78rem] font-semibold text-[var(--text-muted)]">
              <span style={{ color: "var(--ok)" }}>{entOn} a tiempo</span>
              <span style={{ color: "var(--bad)" }}>{entLate} con atraso</span>
              <span>{entTotal} entregas</span>
            </div>
          </div>

        </div>

        {/* KPI PMO — métrica general ponderada (héroe, pegado a la derecha) */}
        <div
          onClick={() => setShowKpi(true)}
          title="Ver detalle del KPI"
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 p-6 text-center transition-transform hover:-translate-y-0.5 xl:w-64 xl:shrink-0"
          style={{ background: "var(--bg-surface)", borderColor: kpiColor }}
        >
          <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-widest text-[var(--text-secondary)]">KPI PMO</div>
          <div className="leading-none">
            <span className="text-6xl font-extrabold" style={{ color: kpiColor }}>{kpiPct}</span>
            <span className="text-2xl font-bold text-[var(--text-muted)]"> / 100</span>
          </div>
          <div className="mt-2 text-[0.72rem] font-semibold text-[var(--text-muted)]">
            máx. {kpiAchievable} hoy · faltan {KPI_W.pendiente} por definir
          </div>
          <div className="mt-4 rounded-full border px-3.5 py-1 text-[0.66rem] font-bold uppercase tracking-wide" style={{ borderColor: kpiColor, color: kpiColor }}>
            Ver detalle →
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
        <div className="ml-auto flex rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
          {(["tabla", "tarjetas"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setPmView(v)}
              className="rounded-md px-2.5 py-1 text-[0.72rem] font-bold capitalize transition-colors"
              style={pmView === v ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-muted)" }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {pmView === "tabla" ? (
        <PmScoreboard pms={allPMs} ini={ini} req={req} proj={proj} projBoards={projBoards} boardHealthMap={boardHealthMap} calMap={calMap} npsRecords={npsRecords} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {allPMs.map((pm) => {
            const q = encodeURIComponent(pm);
            return (
              <PMPortfolioCard key={pm} pm={pm} ini={ini} req={req} proj={proj} projBoards={projBoards} boardHealthMap={boardHealthMap} calMap={calMap} npsRecords={npsRecords} onGoIni={() => router.push(`/iniciativas?pm=${q}`)} onGoReq={() => router.push(`/req?pm=${q}`)} onGoProj={() => router.push(`/proyectos?pm=${q}`)} />
            );
          })}
        </div>
      )}

      {/* VPA Actions — debajo de los Portafolios por PM */}
      <div className="mt-6 flex flex-wrap gap-4">
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

      {showNps && <NpsModal nps={nps} onClose={() => setShowNps(false)} />}
      {showValueGate && <ValueGateModal items={vpaActions} onClose={() => setShowValueGate(false)} />}
      {showKpi && (
        <KpiModal pct={kpiPct} achievable={kpiAchievable} pendingWeight={KPI_W.pendiente} color={kpiColor} components={kpi.components} onClose={() => setShowKpi(false)} />
      )}
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

/** Costo/beneficio por PM en dos columnas: Aprobación (en fase 2 / gate Aprobación)
 *  y Confirmación (REQ que pasó fase 2 / proyecto con Value Gate de Launch firmado). */
function calcPmValue(pm: string, req: ReqItem[], proj: ProjItem[], projBoards: ProjBoard[], hardOnly = false): PmValue {
  const reqItems = req.filter((r) => r.pm === pm && REQ_PHASE2PLUS.has(r.grupo) && (!hardOnly || r.benefitType === "HardSaving"));
  const hardBoardIds = new Set(projBoards.filter((b) => b.benefitType === "HardSaving").map((b) => b.id));
  const reqCost    = reqItems.reduce((s, r) => s + r.costRH + r.costSft, 0);
  const reqBenefit = reqItems.reduce((s, r) => s + r.benefit, 0);
  // REQ que pasaron fase 2 → Confirmación; los que siguen en fase 2 → Aprobación.
  const reqDetail = reqItems.map((r) => ({
    name: r.name, cost: r.costRH + r.costSft, benefit: r.benefit,
    confirmed: REQ_PASSED_PHASE2.has(r.grupo),
  }));
  const reqAprobCost      = reqDetail.filter((r) => !r.confirmed).reduce((s, r) => s + r.cost, 0);
  const reqAprobBenefit   = reqDetail.filter((r) => !r.confirmed).reduce((s, r) => s + r.benefit, 0);
  const reqConfirmCost    = reqDetail.filter((r) => r.confirmed).reduce((s, r) => s + r.cost, 0);
  const reqConfirmBenefit = reqDetail.filter((r) => r.confirmed).reduce((s, r) => s + r.benefit, 0);

  const pmBoardIds = new Set(projBoards.filter((b) => b.pm === pm).map((b) => b.id));
  const agg = new Map<string, { name: string; cost: number; benefit: number; doneAprob: boolean; doneLaunch: boolean }>();
  for (const r of proj) {
    if (!pmBoardIds.has(r.boardId)) continue;
    if (hardOnly && !hardBoardIds.has(r.boardId)) continue;
    let a = agg.get(r.boardId);
    if (!a) { a = { name: r.boardName, cost: 0, benefit: 0, doneAprob: false, doneLaunch: false }; agg.set(r.boardId, a); }
    a.cost += r.cost;
    a.benefit += r.benefit;
    if (r.status === "Done" && isValueGateSigned(r.name)) {
      const g = norm(r.grupo);
      if (g.includes("aprobacion")) a.doneAprob = true;
      if (g.includes("launch")) a.doneLaunch = true;
    }
  }
  const boards = [...agg.values()];
  // Proyectos: aprob-only = solo Value Gate Aprobación; confirmado = también Launch firmado.
  const aprob = boards.filter((b) => b.doneAprob && !b.doneLaunch);
  const ambos = boards.filter((b) => b.doneAprob && b.doneLaunch);
  const aprobCost    = aprob.reduce((s, b) => s + b.cost, 0);
  const aprobBenefit = aprob.reduce((s, b) => s + b.benefit, 0);
  const ambosCost    = ambos.reduce((s, b) => s + b.cost, 0);
  const ambosBenefit = ambos.reduce((s, b) => s + b.benefit, 0);

  const detail = {
    reqs: reqDetail,
    projects: boards
      .filter((b) => b.doneAprob) // solo los que cuentan (aprob-only o confirmados)
      .map((b) => ({ name: b.name, cost: b.cost, benefit: b.benefit, confirmed: b.doneAprob && b.doneLaunch })),
  };

  return {
    totalCost: reqCost + aprobCost + ambosCost,
    totalBenefit: reqBenefit + aprobBenefit + ambosBenefit,
    aprobCost: reqAprobCost + aprobCost,
    aprobBenefit: reqAprobBenefit + aprobBenefit,
    confirmCost: reqConfirmCost + ambosCost,
    confirmBenefit: reqConfirmBenefit + ambosBenefit,
    detail,
  };
}

function PMPortfolioCard({
  pm, ini, req, proj, projBoards, boardHealthMap, calMap, npsRecords, onGoIni, onGoReq, onGoProj,
}: {
  pm: string; ini: IniItem[]; req: ReqItem[]; proj: ProjItem[];
  projBoards: ProjBoard[]; boardHealthMap: Map<string, BoardHealthData>; calMap: CalMap;
  npsRecords: NpsRecord[];
  onGoIni: () => void; onGoReq: () => void; onGoProj: () => void;
}) {
  const [showValue, setShowValue] = useState(false);
  const [showKpi, setShowKpi] = useState(false);

  const {
    pmValueAll, pmValueHard, pmValue, iniHealth, pmNps, npsColor,
    entOn, entLate, entTotal, entPct, entColor,
    reqAct, rvc, reqAvgVem, rEvmOff, rEvmRisk, rEvmOn, reqHas,
    pmProjBoards, projHas, pmProjAvgHI, ppc, ihc, pmEvmPct,
    pmKpi, pmKpiPct, pmKpiColor, pmKpiBg, hc,
  } = useMemo(() => {
  const pmValueAll = calcPmValue(pm, req, proj, projBoards, false);
  const pmValueHard = calcPmValue(pm, req, proj, projBoards, true);
  const pmValue = pmValueHard; // el badge $ muestra siempre solo HardSaving
  const iniHealth = calcIniPMHealth(pm, ini, calMap);

  // NPS personal del PM (mismas fórmulas, filtrando por PM).
  const pmNps = calcNpsFromRecords(npsRecords, pm);
  const npsColor = npsCfg(pmNps.nps)?.color ?? "#6b7280";

  // Compromiso de Entregas del PM: % a tiempo (REQ + items + subitems de sus proyectos).
  const pmBoardIdSet = new Set(projBoards.filter((b) => b.pm === pm).map((b) => b.id));
  let entOn = 0, entLate = 0;
  for (const r of req) {
    if (r.pm !== pm) continue;
    if (r.onTime.verdict === "on-time") entOn++; else if (r.onTime.verdict === "late") entLate++;
  }
  for (const p of proj) {
    if (!pmBoardIdSet.has(p.boardId)) continue;
    if (p.entrega === "on-time") entOn++; else if (p.entrega === "late") entLate++;
    for (const s of p.subitems) {
      if (s.entrega === "on-time") entOn++; else if (s.entrega === "late") entLate++;
    }
  }
  const entTotal = entOn + entLate;
  const entPct = entTotal > 0 ? Math.round((entOn / entTotal) * 100) : null;
  const entColor = entPct === null ? "#6b7280" : entPct >= 90 ? "var(--ok)" : entPct >= 75 ? "var(--warn)" : "var(--bad)";

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

  // KPI del PM: mismo cálculo ponderado que el del equipo, con las métricas del PM
  // (EVM propio, NPS propio, beneficio HardSaving confirmado propio y su % de entregas).
  const pmKpi = computeKpi({ evm: pmEvmRaw, nps: pmNps.nps, benefit: pmValueHard.confirmBenefit, entregasPct: entPct });
  const pmKpiPct = Math.round(pmKpi.score);
  const pmKpiColor = kpiColorFor(pmKpi.ratio);
  const pmKpiBg = kpiBgFor(pmKpi.ratio);

  // Estado de la tarjeta = peor estado entre Iniciativas, REQ y Proyectos. El % sigue siendo el promedio.
  const pmHealth: HealthStatus = pmWorstStatus(pm, ini, req, projBoards, boardHealthMap, calMap);
  const hc = HEALTH_CFG[pmHealth];

  return {
    pmValueAll, pmValueHard, pmValue, iniHealth, pmNps, npsColor,
    entOn, entLate, entTotal, entPct, entColor,
    reqAct, rvc, reqAvgVem, rEvmOff, rEvmRisk, rEvmOn, reqHas,
    pmProjBoards, projHas, pmProjAvgHI, ppc, ihc, pmEvmPct,
    pmKpi, pmKpiPct, pmKpiColor, pmKpiBg, hc,
  };
  }, [pm, ini, req, proj, projBoards, boardHealthMap, calMap, npsRecords]);

  return (
    <div className="overflow-hidden rounded-xl border-2" style={{ background: "var(--bg-surface)", borderColor: hc.color }}>
      <div className="flex items-center justify-between border-b px-[18px] py-3.5" style={{ borderColor: "var(--border)" }}>
        <div>
          <span className="text-[0.95rem] font-bold text-[var(--text-primary)]">{pmLabel(pm)}</span>
          <div className="mt-0.5 text-[0.75rem] text-[var(--text-muted)]">PM · {pm}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => setShowKpi(true)}
            title={`KPI del PM: ${pmKpiPct}/100 · clic para ver el detalle`}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.78rem] font-extrabold transition-transform hover:-translate-y-0.5"
            style={{ color: pmKpiColor, background: pmKpiBg, boxShadow: `inset 0 0 0 1px ${pmKpiColor}` }}
          >
            KPI {pmKpiPct}
          </button>
          <button
            onClick={() => setShowValue(true)}
            title={`Beneficio HardSaving (Confirmación): ${fmtMoney(pmValue.confirmBenefit)} · clic para ver el detalle (Todo / HardSaving)`}
            className="flex h-7 items-center gap-1 rounded-lg border px-2 text-[0.75rem] font-bold text-[var(--text-secondary)] transition-colors hover:border-[#0ea5e9] hover:text-[#0ea5e9]"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="text-[0.9rem]">$</span>
            <span style={{ color: "#10b981" }}>{fmtMoney(pmValue.confirmBenefit)}</span>
          </button>
          <span
            title={`NPS del PM · ${pmNps.total} respuesta${pmNps.total !== 1 ? "s" : ""}`}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.75rem] font-bold"
            style={{ color: npsColor, background: npsColor + "22" }}
          >
            NPS {pmNps.nps !== null ? pmNps.nps : "s/d"}
          </span>
          <span
            title={`Compromiso de Entregas · ${entOn} a tiempo / ${entLate} con atraso de ${entTotal}`}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.75rem] font-bold"
            style={{ color: entColor, background: entColor + "22" }}
          >
            Entrega {entPct !== null ? `${entPct}%` : "s/d"}
          </span>
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
        <PMValueModal pm={pm} valueAll={pmValueAll} valueHard={pmValueHard} initialHard={true} onClose={() => setShowValue(false)} />
      )}
      {showKpi && (
        <KpiModal title={`KPI · ${pm}`} pct={pmKpiPct} achievable={pmKpi.achievable} pendingWeight={KPI_W.pendiente} color={pmKpiColor} components={pmKpi.components} onClose={() => setShowKpi(false)} />
      )}
    </div>
  );
}

// Métricas de resumen de un PM para el scoreboard (mismas fórmulas que la tarjeta de PM):
// EVM propio, NPS propio, % de entregas, beneficio HardSaving confirmado y KPI ponderado.
function calcPmMetrics(
  pm: string, ini: IniItem[], req: ReqItem[], proj: ProjItem[], projBoards: ProjBoard[],
  boardHealthMap: Map<string, BoardHealthData>, calMap: CalMap, npsRecords: NpsRecord[],
) {
  const iniHealth = calcIniPMHealth(pm, ini, calMap);

  const reqVemItems = req.filter((r) => r.pm === pm && r.estado !== "CERRADO" && REQ_ACTIVE_GRUPOS.has(r.grupo) && r.vem != null);
  const reqAvgVem = reqVemItems.length ? reqVemItems.reduce((s, r) => s + (r.vem as number), 0) / reqVemItems.length : null;

  const pmProjBoards = projBoards.filter((b) => b.pm === pm && boardHealthMap.get(b.id)?.healthStatus !== null);
  const pmProjHIs = pmProjBoards.map((b) => boardHealthMap.get(b.id)?.healthIndex).filter((v): v is number => v != null);
  const pmProjAvgHI = pmProjHIs.length > 0 ? pmProjHIs.reduce((a, b) => a + b, 0) / pmProjHIs.length : null;

  const evmParts = ([iniHealth.index, reqAvgVem, pmProjAvgHI] as (number | null)[]).filter((v): v is number => v != null);
  const evmRaw = evmParts.length > 0 ? evmParts.reduce((a, b) => a + b, 0) / evmParts.length : null;
  const evmPct = evmRaw !== null ? Math.round(evmRaw * 100) : null;

  const nps = calcNpsFromRecords(npsRecords, pm);

  const pmBoardIdSet = new Set(projBoards.filter((b) => b.pm === pm).map((b) => b.id));
  let entOn = 0, entLate = 0;
  for (const r of req) {
    if (r.pm !== pm) continue;
    if (r.onTime.verdict === "on-time") entOn++; else if (r.onTime.verdict === "late") entLate++;
  }
  for (const p of proj) {
    if (!pmBoardIdSet.has(p.boardId)) continue;
    if (p.entrega === "on-time") entOn++; else if (p.entrega === "late") entLate++;
    for (const s of p.subitems) {
      if (s.entrega === "on-time") entOn++; else if (s.entrega === "late") entLate++;
    }
  }
  const entTotal = entOn + entLate;
  const entPct = entTotal > 0 ? Math.round((entOn / entTotal) * 100) : null;

  const pmValueAll = calcPmValue(pm, req, proj, projBoards, false);
  const pmValueHard = calcPmValue(pm, req, proj, projBoards, true);
  const benefit = pmValueHard.confirmBenefit;

  const kpi = computeKpi({ evm: evmRaw, nps: nps.nps, benefit, entregasPct: entPct });
  const health = pmWorstStatus(pm, ini, req, projBoards, boardHealthMap, calMap);

  return { pm, evmRaw, evmPct, nps, entOn, entLate, entTotal, entPct, benefit, pmValueAll, pmValueHard, kpi, kpiPct: Math.round(kpi.score), health };
}

// Scoreboard comparativo de PMs: tabla ordenada por KPI (desc). KPI y $ abren su detalle.
function PmScoreboard({ pms, ini, req, proj, projBoards, boardHealthMap, calMap, npsRecords }: {
  pms: string[]; ini: IniItem[]; req: ReqItem[]; proj: ProjItem[]; projBoards: ProjBoard[];
  boardHealthMap: Map<string, BoardHealthData>; calMap: CalMap; npsRecords: NpsRecord[];
}) {
  const [kpiPm, setKpiPm] = useState<string | null>(null);
  const [valuePm, setValuePm] = useState<string | null>(null);

  const rows = useMemo(
    () => pms
      .map((pm) => calcPmMetrics(pm, ini, req, proj, projBoards, boardHealthMap, calMap, npsRecords))
      .sort((a, b) => b.kpi.score - a.kpi.score),
    [pms, ini, req, proj, projBoards, boardHealthMap, calMap, npsRecords],
  );

  const openKpi = rows.find((r) => r.pm === kpiPm);
  const openValue = rows.find((r) => r.pm === valuePm);

  const th = "px-3 py-2.5 font-semibold text-[var(--text-secondary)]";
  const td = "px-3 py-2.5";

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <table className="w-full text-[0.82rem]">
        <thead>
          <tr className="border-b" style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}>
            <th className={`${th} text-center w-10`}>#</th>
            <th className={`${th} text-left`}>Portafolio · PM</th>
            <th className={`${th} text-center`}>KPI</th>
            <th className={`${th} text-center`}>EVM</th>
            <th className={`${th} text-center`}>NPS</th>
            <th className={`${th} text-center`}>Entregas</th>
            <th className={`${th} text-right`}>$ HardSaving</th>
            <th className={`${th} text-center`}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const kColor = kpiColorFor(r.kpi.ratio);
            const kBg = kpiBgFor(r.kpi.ratio);
            const evmStatus = healthStatusFromIndex(r.evmRaw);
            const evmColor = evmStatus ? HEALTH_CFG[evmStatus].color : "#6b7280";
            const npsColor = npsCfg(r.nps.nps)?.color ?? "#6b7280";
            const entColor = r.entPct === null ? "#6b7280" : r.entPct >= 90 ? "var(--ok)" : r.entPct >= 75 ? "var(--warn)" : "var(--bad)";
            const hc = HEALTH_CFG[r.health];
            return (
              <tr key={r.pm} className="border-t transition-colors hover:bg-[var(--bg-hover)]" style={{ borderColor: "var(--border)" }}>
                <td className={`${td} text-center tabular-nums font-bold text-[var(--text-muted)]`}>{i + 1}</td>
                <td className={td}>
                  <div className="font-semibold text-[var(--text-primary)]">{pmLabel(r.pm)}</div>
                  <div className="text-[0.7rem] text-[var(--text-muted)]">{r.pm}</div>
                </td>
                <td className={`${td} text-center`}>
                  <button
                    onClick={() => setKpiPm(r.pm)}
                    title={`KPI ${r.kpiPct}/100 · ver detalle`}
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[0.82rem] font-extrabold transition-transform hover:-translate-y-0.5"
                    style={{ color: kColor, background: kBg, boxShadow: `inset 0 0 0 1px ${kColor}` }}
                  >
                    {r.kpiPct}
                  </button>
                </td>
                <td className={`${td} text-center tabular-nums font-bold`} style={{ color: evmColor }}>{r.evmPct !== null ? `${r.evmPct}%` : "—"}</td>
                <td className={`${td} text-center tabular-nums font-bold`} style={{ color: npsColor }}>{r.nps.nps !== null ? r.nps.nps : "s/d"}</td>
                <td className={`${td} text-center tabular-nums font-bold`} style={{ color: entColor }}>{r.entPct !== null ? `${r.entPct}%` : "—"}</td>
                <td className={`${td} text-right`}>
                  <button
                    onClick={() => setValuePm(r.pm)}
                    title="Ver costo y beneficio (detalle)"
                    className="tabular-nums font-bold transition-colors hover:underline"
                    style={{ color: "var(--ok)" }}
                  >
                    {fmtMoney(r.benefit)}
                  </button>
                </td>
                <td className={`${td} text-center`}>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.72rem] font-bold" style={{ color: hc.color, background: hc.bg }}>{hc.icon} {hc.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {openKpi && (
        <KpiModal title={`KPI · ${openKpi.pm}`} pct={openKpi.kpiPct} achievable={openKpi.kpi.achievable} pendingWeight={KPI_W.pendiente} color={kpiColorFor(openKpi.kpi.ratio)} components={openKpi.kpi.components} onClose={() => setKpiPm(null)} />
      )}
      {openValue && (
        <PMValueModal pm={openValue.pm} valueAll={openValue.pmValueAll} valueHard={openValue.pmValueHard} initialHard={true} onClose={() => setValuePm(null)} />
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
