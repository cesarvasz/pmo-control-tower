"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney, today } from "@/lib/business";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { calcIniPMHealth, countPlanFuturoDue } from "@/lib/ini";
import { calcBoardMetrics, type BoardHealthData } from "@/lib/proj";
import { buildAllProjectMetrics, boardHealthFromMetrics, buildUnits, calcEvm, detectPlantilla } from "@/lib/projectMetrics";
import { buildProjectSummary, currentPhaseIndex } from "@/lib/projSummary";
import {
  reqStageAmounts, projStageAmounts, sumStageAmounts, type StageAmounts,
  pmWorstStatus, calcPmValue, calcPmMetrics, calcEntregaStats, calcEntregaStatsRaw, calcReprocesoPct, calcReprocesoStats, calcReprocesoStatsRaw, buildReprocesoRowsRaw, buildLateResponsibleRows, buildLateResponsibleRowsRaw,
  isFase1, isFase2, isFase5,
} from "@/lib/dashboard";
import type { DelayMap } from "@/lib/delay";
import { healthStatusFromIndex, weightedEvm, vemCfg, HEALTH_CFG, type HealthStatus } from "@/lib/health";
import { calcNpsFromRecords, npsCfg } from "@/lib/nps";
import { REQ_ACTIVE_GRUPOS } from "@/lib/req";
import type { CalMap, DashboardData, IniItem, NpsRecord, ProjBoard, ProjItem, ReqItem } from "@/types";
import { ErrorBox, Loader } from "@/components/ui";
import NpsModal from "@/components/NpsModal";
import NpsRangesModal from "@/components/NpsRangesModal";
import ValueGateModal from "@/components/ValueGateModal";
import ValueGatePendingModal from "@/components/ValueGatePendingModal";
import PMValueModal from "@/components/PMValueModal";
import KpiModal from "@/components/KpiModal";
import ReprocesoDetailModal from "@/components/ReprocesoDetailModal";
import EntregaDetailModal from "@/components/EntregaDetailModal";
import { computeKpi, kpiColorFor } from "@/lib/kpi";
import { buildVpaActions } from "@/lib/vpaActions";
import WeeklyProgressChart from "@/components/WeeklyProgressChart";
import NotificationsBell from "@/components/NotificationsBell";

const PM_PORTFOLIO: Record<string, { prefix: string; name: string }> = {
  "Luis Aguilar": { prefix: "α", name: "Portafolio Alfa" },
  "David Guzmán": { prefix: "β", name: "Portafolio Beta" },
  "Daniela Alvarez": { prefix: "γ", name: "Portafolio Gamma" },
};
const pmLabel = (pm: string) => {
  const p = PM_PORTFOLIO[pm];
  return p ? `${p.prefix} ${p.name}` : pm;
};

// Formato compacto de dinero para las celdas de métrica de la tarjeta ($1.2M / $980K).
// El detalle exacto (fmtMoney) sigue disponible en el modal al hacer clic.
const fmtMoneyShort = (n: number | null | undefined): string => {
  if (!n) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
};

const INI_HEALTH_CFG = HEALTH_CFG;

export default function ControlTowerPage() {
  const { data, loading, error } = useData();
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;
  return <ControlTower data={data} />;
}

function ControlTower({ data }: { data: DashboardData }) {
  const router = useRouter();
  const { me } = useMe();
  const greetName = me?.displayName || "";
  const [showNps, setShowNps] = useState(false);
  const [showValueGate, setShowValueGate] = useState(false);
  const [vgPendingRow, setVgPendingRow] = useState<ValueGateRow | null>(null);
  const [showReprocesoDetail, setShowReprocesoDetail] = useState(false);
  const [showEntregaDetail, setShowEntregaDetail] = useState(false);
  const [hardOnly, setHardOnly] = useState(false); // filtro "Solo HardSaving" para Costo & Beneficio
  const [pmView, setPmView] = useState<"tabla" | "tarjetas">("tarjetas"); // vista de Portafolios por PM (default: Tarjetas)

  const { ini, req, proj, projBoards, projItemBaselines, calMap, nps, npsRecords, delayAttributions: delays, reprocesoAttributions: reproceso } = data;

  // Todas las derivaciones dependen solo de los datos (estáticos entre refreshes) y del
  // filtro hardOnly. Se memoizan para no recalcular al abrir modales o cambiar de vista.
  const {
    boardHealthMap, boardCompleteMap,
    allPMs, teamIniHealth, teamReqHealth, teamProjHealth, vemPct, hColor, hBg, hLabel, hIcon,
    totalCost, colValidacionCost, colValidacionBenefit, colAprobacionCost, colAprobacionBenefit, colConfirmacionCost, colConfirmacionBenefit,
    pipelineAgg, boardPhase125, reqPhase125, valueGateAvgHealth,
    vpaActions, vpaPending, vgEnTiempo, vgHoy, vgAtrasado,
    entOn, entLate, entTotal, entPct, entColor, entLateRows,
    mainReprocesoStats, mainReprocesoPct, mainRepColor, mainReprocesoRows,
  } = useMemo(() => {
  const reqProc = req.filter((r) => REQ_ACTIVE_GRUPOS.has(r.grupo));

  // ── Board health map ──
  // SPI/CPI/Scope/EVM de cada board salen de la medición única de proyectos
  // (projectMetrics.ts — misma fórmula que el Status Card/reporte por proyecto
  // y que /proyectos → "Ver cálculo"), vía boardHealthFromMetrics. `ac` (costo
  // actual de Monday) no forma parte de esa medición única — sigue viniendo de
  // calcBoardMetrics, la única fuente de ese dato.
  const projMetricsByBoard = new Map(
    buildAllProjectMetrics(projBoards, proj, { baselines: projItemBaselines }).map((m) => [m.boardId, m]),
  );
  const boardHealthMap = new Map<string, BoardHealthData>();
  // Completado (mismo criterio que Resumen Ejecutivo: llegó a su fase de
  // cierre, ver calcCompletionEstimate) — para ocultar del listado de la
  // tarjeta del PM los proyectos ya terminados, sin tocar su Player/KPI (que
  // siguen usando boardHealthMap/pmProjBoards tal cual, sin filtrar). NO es
  // healthIndex: un proyecto activo y sano también puede mostrar 100% ahí
  // sin haber terminado, y ese no debe ocultarse.
  const boardCompleteMap = new Map<string, boolean>();
  projBoards.forEach((b) => {
    const m = projMetricsByBoard.get(b.id);
    if (!m) return;
    const boardItems = proj.filter((r) => r.boardId === b.id);
    const { ac } = calcBoardMetrics(boardItems, projItemBaselines);
    boardHealthMap.set(b.id, boardHealthFromMetrics(m, ac));
    boardCompleteMap.set(b.id, buildProjectSummary(boardItems).completion.isComplete);
  });
  const boardsWithHealth = projBoards.filter((b) => boardHealthMap.get(b.id)?.healthStatus !== null);

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

  // Nota EVM del equipo: promedio PONDERADO Iniciativas 10% · REQ 20% · Proyectos 70%
  // (ver EVM_WEIGHTS / weightedEvm en lib/health.ts).
  const teamVem = weightedEvm({ ini: teamIniHealth, req: teamReqHealth, proj: teamProjHealth });
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

  // ── Costos y beneficios totales (REQ + Proyectos) ──
  // 3 etapas evaluadas de forma DESCENDENTE (Confirmación VPC > Aprobación VPB >
  // Validación VPA) por reqStage/resolveProjStage. Filtro "Solo HardSaving": limita a
  // los ítems/boards con Benefit Type = HardSaving.
  const hardBoardIds = new Set(projBoards.filter((b) => b.benefitType === "HardSaving").map((b) => b.id));

  const reqStages = req
    .filter((r) => !hardOnly || r.benefitType === "HardSaving")
    .map(reqStageAmounts)
    .filter((s): s is StageAmounts => s != null);

  const projItemsByBoard = new Map<string, ProjItem[]>();
  for (const r of proj) {
    if (hardOnly && !hardBoardIds.has(r.boardId)) continue;
    const arr = projItemsByBoard.get(r.boardId);
    if (arr) arr.push(r); else projItemsByBoard.set(r.boardId, [r]);
  }
  const projStages = [...projItemsByBoard.values()]
    .map(projStageAmounts)
    .filter((s): s is StageAmounts => s != null);

  // Etapas ACUMULATIVAS: Aprobación incluye a los confirmados (a su valor aprobado /
  // Business Case); Confirmación es el subconjunto ya medido. Total = Validación +
  // Aprobación (Confirmación no se re-suma). El Beneficio grande usa Aprobación.
  const colAgg = sumStageAmounts([...reqStages, ...projStages]);
  const colValidacionCost = colAgg.validacion.cost, colValidacionBenefit = colAgg.validacion.benefit;
  const colAprobacionCost = colAgg.aprobacion.cost, colAprobacionBenefit = colAgg.aprobacion.benefit;
  const colConfirmacionCost = colAgg.confirmacion.cost, colConfirmacionBenefit = colAgg.confirmacion.benefit;
  const totalCost = colAgg.totalCost;

  // ── Pipeline (tarjeta fija a Solo HardSaving, independiente del toggle
  // "hardOnly" de la tarjeta Costo & Beneficio de arriba) ──
  const pipelineReqStages = req
    .filter((r) => r.benefitType === "HardSaving")
    .map(reqStageAmounts)
    .filter((s): s is StageAmounts => s != null);
  const pipelineProjItemsByBoard = new Map<string, ProjItem[]>();
  for (const r of proj) {
    if (!hardBoardIds.has(r.boardId)) continue;
    const arr = pipelineProjItemsByBoard.get(r.boardId);
    if (arr) arr.push(r); else pipelineProjItemsByBoard.set(r.boardId, [r]);
  }
  const pipelineProjStages = [...pipelineProjItemsByBoard.values()].map(projStageAmounts).filter((s): s is StageAmounts => s != null);
  const pipelineAgg = sumStageAmounts([...pipelineReqStages, ...pipelineProjStages]);

  // ── Value Gate (Fase 1/2/5): en qué fase está CADA proyecto AHORA MISMO
  // (currentPhaseIndex — la primera fase que aún no está 100% Done), y su
  // salud EVM calculada SOLO con units/items de Valuación+Aprobación+Revisión
  // (buildUnits + calcEvm, misma fórmula única de projectMetrics.ts, pero con
  // el input filtrado a esas 3 fases). Un proyecto cuya fase actual sea Launch
  // (Fase 3) u Operación (Fase 4) no entra en ninguna columna de esta tarjeta.
  // Los proyectos ya completados (cerrados) SÍ se muestran — quedan en
  // Revisión como constancia de que ya pasaron por esa fase.
  const hoy = today();
  const boardPhase125 = new Map<string, { faseKey: "valuacion" | "aprobacion" | "revision"; healthIndex: number | null; healthStatus: HealthStatus | null; pending: ValueGatePendingRow[] }>();
  projBoards.forEach((b) => {
    const boardItems = proj.filter((r) => r.boardId === b.id);
    if (boardItems.length === 0) return;
    const curPhases = buildProjectSummary(boardItems).phases;
    const curIdx = currentPhaseIndex(curPhases);
    let faseKey: "valuacion" | "aprobacion" | "revision" | null;
    if (curIdx === -1) {
      faseKey = "revision"; // proyecto completo — ya pasó por Revisión
    } else {
      const curGrupo = curPhases[curIdx].grupo;
      faseKey = isFase1(curGrupo) ? "valuacion" : isFase2(curGrupo) ? "aprobacion" : isFase5(curGrupo) ? "revision" : null;
    }
    if (!faseKey) return; // fase actual es Launch u Operación → fuera de esta tarjeta

    const plantilla = detectPlantilla(boardItems);
    const units125 = buildUnits(boardItems, plantilla, hoy).filter((u) => isFase1(u.fase) || isFase2(u.fase) || isFase5(u.fase));
    const items125 = boardItems.filter((it) => isFase1(it.grupo) || isFase2(it.grupo) || isFase5(it.grupo));
    const healthIndex = calcEvm(units125, items125, projItemBaselines, hoy).evm;
    // Pendientes = las mismas units125 que ya no están Done — el detalle que
    // se ve al hacer clic en el proyecto (ver ValueGatePendingModal).
    const pending: ValueGatePendingRow[] = units125
      .filter((u) => !u.entregada)
      .map((u) => ({ name: u.name, fase: u.fase, deadline: u.limitDate, status: u.status, atrasada: u.atrasada }));
    boardPhase125.set(b.id, { faseKey, healthIndex, healthStatus: healthStatusFromIndex(healthIndex), pending });
  });

  // PML (Requerimientos) en fase 1/2/5: r.grupo YA es el label corto
  // (reqProcess lo resuelve con REQ_GROUP_LABEL), así que el match es directo.
  // La salud es r.vem, la misma métrica que usa la Sección "PML" de la
  // tarjeta de PM — no hay que recalcular EVM como en proyectos.
  const REQ_FASEKEY_BY_GRUPO: Record<string, "valuacion" | "aprobacion" | "revision"> = {
    "Valuación": "valuacion",
    "Aprobación": "aprobacion",
    "Cierre ROI": "revision",
  };
  const reqPhase125 = new Map<string, { faseKey: "valuacion" | "aprobacion" | "revision"; healthIndex: number | null; healthStatus: HealthStatus | null }>();
  req.forEach((r) => {
    const faseKey = REQ_FASEKEY_BY_GRUPO[r.grupo];
    if (!faseKey) return;
    reqPhase125.set(r.id, { faseKey, healthIndex: r.vem, healthStatus: healthStatusFromIndex(r.vem) });
  });

  // Nota general del EVM de la tarjeta Value Gate: promedio simple de la
  // salud (healthIndex/vem) de TODO lo que aparece en las 3 columnas —
  // proyectos + PML — sin ponderar por tipo, para tener un solo número que
  // resuma el estado de Valuación+Aprobación+Revisión.
  const valueGateHealthValues = [
    ...[...boardPhase125.values()].map((p) => p.healthIndex),
    ...[...reqPhase125.values()].map((p) => p.healthIndex),
  ].filter((v): v is number => v != null);
  const valueGateAvgHealth = valueGateHealthValues.length
    ? valueGateHealthValues.reduce((s, v) => s + v, 0) / valueGateHealthValues.length
    : null;

  // ── VPA Actions ──
  // Acciones que debe realizar el VPA, con visibilidad de su estado — toda la
  // lógica (qué steps de Proyecto / qué fases de REQ cuentan) vive en
  // lib/vpaActions.ts (pura, con test).
  const vpaActions = buildVpaActions(proj, req);
  const vpaPending = vpaActions.filter((a) => !a.done);
  const vgEnTiempo = vpaPending.filter((a) => a.estado === "EN TIEMPO").length;
  const vgHoy      = vpaPending.filter((a) => a.estado === "PARA HOY").length;
  const vgAtrasado = vpaPending.filter((a) => a.estado === "ATRASADO").length;

  // ── Cumplimiento de Entrega (tarjeta principal) ──
  // % REAL sin excusas: REQ cerrados + hitos ÚNICOS de Proyectos (por PMS ID — el
  // mismo hito se repite como subitem en varios steps del ciclo de vida; cada hito
  // pesa 1 unidad, aportando su propio % entre sus ocurrencias ya Done). Cuenta TODO
  // atraso sin importar el responsable asignado. Players/KPI sí excusan por
  // responsable (ver calcEntregaStats, usada en calcPmMetrics y en la tarjeta de PM).
  const { onTime: entOn, late: entLate, total: entTotal, pct: entPct } = calcEntregaStatsRaw(req, proj);
  const entColor = entPct === null ? "#6b7280" : entPct >= 90 ? "var(--ok)" : entPct >= 75 ? "var(--warn)" : "var(--bad)";
  const entLateRows = buildLateResponsibleRowsRaw(req, proj, projBoards, delays);

  // ── Calidad de Entregas (Reproceso) ──
  // % de unidades "limpias" (REQ cerrados + fases de proyecto completadas) sin
  // reproceso imputable al PM. Misma regla de excusa que Cumplimiento de Entrega.
  const reprocesoStats = calcReprocesoStats(req, proj, reproceso);
  const teamReprocesoPct = reprocesoStats.pct;

  // Variante "real, sin filtros" — SOLO para la tarjeta principal del Control Tower
  // (Players/KPI siguen con la regla de excusa de arriba). Cuenta únicamente las
  // unidades con selección ya hecha en el dropdown de Reproceso: "Sin reproceso" = 100,
  // cualquier otra selección = 0; sin selección se ignora.
  const mainReprocesoStats = calcReprocesoStatsRaw(req, proj, reproceso);
  const mainReprocesoPct = mainReprocesoStats.pct;
  const mainRepColor = mainReprocesoPct === null ? "#6b7280" : mainReprocesoPct >= 90 ? "var(--ok)" : mainReprocesoPct >= 75 ? "var(--warn)" : "var(--bad)";
  const mainReprocesoRows = buildReprocesoRowsRaw(req, proj, projBoards, reproceso);

  // ── KPI PMO ──
  // Beneficio HardSaving del KPI: etapas Aprobación VPB y Confirmación VPC por separado
  // (excluye Validación), independiente del toggle "Solo HardSaving" de la tarjeta
  // (siempre HardSaving). Ver computeBenefitKpi en lib/kpi.ts para el reparto 70/30.
  const kpiReqStages = req
    .filter((r) => r.benefitType === "HardSaving")
    .map(reqStageAmounts)
    .filter((s): s is StageAmounts => s != null);
  const kpiProjItemsByBoard = new Map<string, ProjItem[]>();
  for (const r of proj) {
    if (!hardBoardIds.has(r.boardId)) continue;
    const arr = kpiProjItemsByBoard.get(r.boardId);
    if (arr) arr.push(r); else kpiProjItemsByBoard.set(r.boardId, [r]);
  }
  const kpiProjStages = [...kpiProjItemsByBoard.values()]
    .map(projStageAmounts)
    .filter((s): s is StageAmounts => s != null);
  // Acumulativo: Aprobación incluye a los confirmados (a su valor aprobado / BC).
  const kpiAgg = sumStageAmounts([...kpiReqStages, ...kpiProjStages]);
  const kpiBenefitAprobado = kpiAgg.aprobacion.benefit;
  const kpiBenefitConfirmado = kpiAgg.confirmacion.benefit;

  // Reproceso del equipo (5º componente del KPI, peso 20) — ver teamReprocesoPct arriba.
  const kpi = computeKpi({ evm: teamVem, nps: nps.nps, benefitAprobado: kpiBenefitAprobado, benefitConfirmado: kpiBenefitConfirmado, entregasPct: entPct, reprocesoPct: teamReprocesoPct });
  const kpiPct = Math.round(kpi.score);
  const kpiAchievable = kpi.achievable; // 80 hoy (el 5º componente está pendiente)
  const kpiColor = kpiColorFor(kpi.ratio);

  return {
    boardHealthMap, boardCompleteMap,
    allPMs, teamIniHealth, teamReqHealth, teamProjHealth, vemPct, hColor, hBg, hLabel, hIcon,
    totalCost, colValidacionCost, colValidacionBenefit, colAprobacionCost, colAprobacionBenefit, colConfirmacionCost, colConfirmacionBenefit,
    pipelineAgg, boardPhase125, reqPhase125, valueGateAvgHealth,
    vpaActions, vpaPending, vgEnTiempo, vgHoy, vgAtrasado,
    entOn, entLate, entTotal, entPct, entColor, entLateRows,
    mainReprocesoStats, mainReprocesoPct, mainRepColor, mainReprocesoRows,
    kpi, kpiPct, kpiAchievable, kpiColor,
  };
  }, [ini, req, proj, projBoards, projItemBaselines, calMap, nps, hardOnly, delays, reproceso]);

  return (
    <div>
      {/* Saludo + acceso directo a la campanita de notificaciones (arriba de todo). */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <span className="text-xl font-bold text-[var(--text-primary)]">
          Hola{greetName ? `, ${greetName}` : ""} 👋
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[0.85rem] font-semibold text-[var(--text-secondary)]">Mira las acciones pendientes</span>
          <NotificationsBell />
        </div>
      </div>

      {/* ── Resumen: tarjetas núcleo del equipo — mismo orden que las tarjetas de PM
          y la tabla de KPI: EVM, Beneficio, Calidad de Entregas, Cumplimiento de
          Entrega, NPS. VPA Actions (fuera del KPI) queda al final. ── */}
      <div className="mb-4">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">

          {/* EVM */}
          <div className="flex flex-col justify-center rounded-xl border-2 p-5 text-center" style={{ background: "var(--bg-surface)", borderColor: hColor }}>
            <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">EVM · PMO</div>
            <div className="text-5xl font-extrabold leading-none" style={{ color: hColor }}>
              {vemPct !== null ? `${vemPct}%` : "—"}
            </div>
            <div className="mt-2 flex justify-center">
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.72rem] font-bold" style={{ color: hColor, background: hBg }}>{hIcon} {hLabel}</span>
            </div>
            <div
              className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-3 text-[0.78rem] font-semibold text-[var(--text-muted)]"
              title="Nota EVM ponderada: Iniciativas 10% · PML 20% · Proyectos 70%"
            >
              {teamIniHealth  !== null && <span>INI {Math.round(teamIniHealth  * 100)}% <span className="font-normal opacity-70">·10%</span></span>}
              {teamReqHealth  !== null && <span>PML {Math.round(teamReqHealth  * 100)}% <span className="font-normal opacity-70">·20%</span></span>}
              {teamProjHealth !== null && <span>PM {Math.round(teamProjHealth * 100)}% <span className="font-normal opacity-70">·70%</span></span>}
            </div>
          </div>

          {/* Costo & Beneficio — REQ + Proyectos */}
          <div className="flex flex-col justify-center rounded-xl border-2 p-5 text-center" style={{ background: "var(--bg-surface)", borderColor: hardOnly ? "var(--ok)" : "var(--accent)" }}>
            <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Costo &amp; Beneficio</div>
            <div className="text-[2rem] font-extrabold leading-none" style={{ color: "var(--ok)" }} title="Beneficio de la etapa Aprobación VPB">{fmtMoney(colAprobacionBenefit)}</div>
            <div className="mt-1 text-[0.78rem] font-semibold text-[var(--text-muted)]">
              Costo <span style={{ color: "var(--info)" }}>{fmtMoney(totalCost)}</span>
            </div>
            <div className="flex flex-col gap-0.5 pt-3 text-[0.72rem] font-semibold text-[var(--text-muted)]">
              <span>Validación <span style={{ color: "var(--info)" }}>{fmtMoney(colValidacionCost)}</span> / <span style={{ color: "var(--ok)" }}>{fmtMoney(colValidacionBenefit)}</span></span>
              <span>Aprobación <span style={{ color: "var(--info)" }}>{fmtMoney(colAprobacionCost)}</span> / <span style={{ color: "var(--ok)" }}>{fmtMoney(colAprobacionBenefit)}</span></span>
              <span>Confirmación <span style={{ color: "var(--info)" }}>{fmtMoney(colConfirmacionCost)}</span> / <span style={{ color: "var(--ok)" }}>{fmtMoney(colConfirmacionBenefit)}</span></span>
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

          {/* Calidad de Entregas — % REAL sin filtros: solo unidades ya seleccionadas en el
              dropdown de Reproceso ("Sin reproceso" = limpia, cualquier otra selección =
              con reproceso; sin selección se ignora). Regla exclusiva de esta tarjeta —
              Players/KPI siguen con la regla de excusa. */}
          <div
            onClick={() => setShowReprocesoDetail(true)}
            title="% real: solo cuenta unidades con selección ya hecha en el dropdown de Reproceso. 'Sin reproceso' = limpia; cualquier otra selección (incluido PM) = con reproceso. Sin selección se ignora. Click para ver detalle."
            className="flex cursor-pointer flex-col justify-center rounded-xl border-2 p-5 text-center transition-transform hover:-translate-y-0.5" style={{ background: "var(--bg-surface)", borderColor: mainRepColor }}
          >
            <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Calidad de Entregas</div>
            <div className="text-5xl font-extrabold leading-none" style={{ color: mainRepColor }}>
              {mainReprocesoPct !== null ? `${mainReprocesoPct}%` : "—"}
            </div>
            <div className="mt-2 text-[0.8rem] font-bold uppercase tracking-wide" style={{ color: mainRepColor }}>de calidad</div>
            <div className="flex flex-col items-center gap-1 pt-3 text-[0.78rem] font-semibold text-[var(--text-muted)]">
              <span style={{ color: "var(--ok)" }}>{mainReprocesoStats.limpias} sin reproceso</span>
              <span style={{ color: "var(--bad)" }}>{mainReprocesoStats.conReproceso} con reproceso</span>
              <span>{mainReprocesoStats.total} entregados</span>
            </div>
          </div>

          {/* Cumplimiento de Entrega — % real: TODO atraso cuenta, sin excusar por responsable */}
          <div
            onClick={() => setShowEntregaDetail(true)}
            title="% real: cuenta TODO PML/hito atrasado, sin importar el responsable asignado (a diferencia de Players/KPI, que sí excusan por responsable). Click para ver detalle."
            className="flex cursor-pointer flex-col justify-center rounded-xl border-2 p-5 text-center transition-transform hover:-translate-y-0.5" style={{ background: "var(--bg-surface)", borderColor: entColor }}
          >
            <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Cumplimiento de Entrega</div>
            <div className="text-5xl font-extrabold leading-none" style={{ color: entColor }}>
              {entPct !== null ? `${entPct}%` : "—"}
            </div>
            <div className="mt-2 text-[0.8rem] font-bold uppercase tracking-wide" style={{ color: entColor }}>A tiempo</div>
            <div className="flex flex-col items-center gap-1 pt-3 text-[0.78rem] font-semibold text-[var(--text-muted)]">
              <span style={{ color: "var(--ok)" }}>{entOn} a tiempo</span>
              <span style={{ color: "var(--bad)" }}>{entLate} con atraso</span>
              <span>{entTotal} entregas</span>
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
                className="flex cursor-pointer flex-col justify-center rounded-xl border-2 p-5 text-center transition-transform hover:-translate-y-0.5"
                style={{ background: "var(--bg-surface)", borderColor: npsColor }}
              >
                <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">NPS</div>
                <div className="text-5xl font-extrabold leading-none" style={{ color: npsColor }}>
                  {nps.nps !== null ? nps.nps : "—"}
                </div>
                <div className="mt-2 text-[0.8rem] font-bold uppercase tracking-wide" style={{ color: npsColor }}>
                  {cfg?.label ?? "Sin datos"}
                </div>
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-3 text-[0.78rem] font-semibold text-[var(--text-muted)]">
                  <span style={{ color: "var(--ok)" }}>{nps.promoters} prom.</span>
                  <span style={{ color: "var(--bad)" }}>{nps.detractors} detr.</span>
                  <span>{nps.total} resp.</span>
                </div>
              </div>
            );
          })()}

          {/* VPA Actions — subida al bloque de tarjetas de resumen */}
          <div
            onClick={() => setShowValueGate(true)}
            title="Ver acciones del VPA"
            className="flex cursor-pointer flex-col justify-center rounded-xl border-2 p-5 text-center transition-transform hover:-translate-y-0.5"
            style={{ background: "var(--bg-surface)", borderColor: "#8b5cf6" }}
          >
            <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">VPA Actions</div>
            <div className="text-5xl font-extrabold leading-none" style={{ color: "#8b5cf6" }}>{vpaPending.length}</div>
            <div className="mt-2 text-[0.8rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">Pendientes</div>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-3 text-[0.78rem] font-semibold">
              <span style={{ color: "#10b981" }}>✓ {vgEnTiempo} En Tiempo</span>
              <span style={{ color: "#f59e0b" }}>⚠ {vgHoy} Hoy</span>
              <span style={{ color: "#ef4444" }}>✕ {vgAtrasado} Atrasado</span>
            </div>
          </div>

        </div>

      </div>

      {/* Fases 1·2·5 (Valuación/Aprobación/Revisión) + Pipeline HardSaving —
          entre las tarjetas principales y Portafolios por PM. */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Value Gate: en qué fase (Valuación/Aprobación/Revisión) está cada
            proyecto Y cada PML AHORA MISMO, con su salud calculada solo con
            esas 3 fases (boardPhase125 para proyectos vía EVM escalado;
            reqPhase125 para PML vía su propio VEM). Launch (Fase 3) y
            Operación (Fase 4) no entran — ni como columna ni en el cálculo
            de salud. Mismas líneas divisorias verticales que separan las
            secciones (Iniciativas/PML/PM) en las tarjetas de PM, para que
            las 3 columnas no se vean corridas entre sí. */}
        <div className="rounded-xl border-2" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
            <span className="text-[0.82rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Value Gate</span>
            {valueGateAvgHealth != null && (() => {
              const cfg = vemCfg(valueGateAvgHealth);
              return (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold leading-none"
                  style={{ color: cfg.color, background: cfg.bg }}
                  title="EVM promedio de todo lo listado abajo (proyectos + PML en Valuación/Aprobación/Revisión)"
                >
                  {cfg.icon} {cfg.label} · {Math.round(valueGateAvgHealth * 100)}%
                </span>
              );
            })()}
          </div>
          <div className="flex border-t" style={{ borderColor: "var(--border)" }}>
            <ValueGateColumn label="Valuación" rows={valueGateRows("valuacion", projBoards, boardPhase125, req, reqPhase125)} onSelect={setVgPendingRow} />
            <div className="w-px flex-shrink-0" style={{ background: "var(--border)" }} />
            <ValueGateColumn label="Aprobación" rows={valueGateRows("aprobacion", projBoards, boardPhase125, req, reqPhase125)} onSelect={setVgPendingRow} />
            <div className="w-px flex-shrink-0" style={{ background: "var(--border)" }} />
            <ValueGateColumn label="Revisión" rows={valueGateRows("revision", projBoards, boardPhase125, req, reqPhase125)} onSelect={setVgPendingRow} />
          </div>
        </div>

        {/* Pipeline — solo el Beneficio HardSaving de cada etapa, como funnel
            (barras decrecientes): Validación → Aprobación → Confirmación. */}
        <div className="rounded-xl border-2 p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--ok)" }}>
          <div className="mb-3 text-[0.82rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Pipeline · HardSaving</div>
          <div className="flex flex-col gap-3">
            {(() => {
              const stages = [
                { label: "Validación", value: pipelineAgg.validacion.benefit },
                { label: "Aprobación", value: pipelineAgg.aprobacion.benefit },
                { label: "Confirmación", value: pipelineAgg.confirmacion.benefit },
              ];
              const max = Math.max(stages[0].value, 1);
              return stages.map((s) => (
                <div key={s.label} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[0.78rem] font-semibold text-[var(--text-secondary)]">{s.label}</span>
                    <span className="text-[1.05rem] font-extrabold" style={{ color: "var(--ok)" }}>{fmtMoney(s.value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
                    <div className="h-2 rounded-full" style={{ width: `${Math.round((s.value / max) * 100)}%`, background: "var(--ok)" }} />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

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
              className="rounded-md px-2.5 py-1 text-[0.72rem] font-bold transition-colors"
              style={pmView === v ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-muted)" }}
            >
              {v === "tabla" ? "Players" : "Tarjetas"}
            </button>
          ))}
        </div>
      </div>
      {pmView === "tabla" ? (
        <PmScoreboard pms={allPMs} ini={ini} req={req} proj={proj} projBoards={projBoards} boardHealthMap={boardHealthMap} calMap={calMap} npsRecords={npsRecords} delays={delays} reproceso={reproceso} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {allPMs.map((pm) => {
            const q = encodeURIComponent(pm);
            return (
              <PMPortfolioCard key={pm} pm={pm} ini={ini} req={req} proj={proj} projBoards={projBoards} boardHealthMap={boardHealthMap} boardCompleteMap={boardCompleteMap} calMap={calMap} npsRecords={npsRecords} delays={delays} reproceso={reproceso} onGoIni={() => router.push(`/iniciativas?pm=${q}`)} onGoReq={() => router.push(`/req?pm=${q}`)} onGoProj={() => router.push(`/proyectos?pm=${q}`)} />
            );
          })}
        </div>
      )}

      <WeeklyProgressChart />

      {showNps && <NpsModal nps={nps} onClose={() => setShowNps(false)} />}
      {showValueGate && <ValueGateModal items={vpaActions} onClose={() => setShowValueGate(false)} />}
      {vgPendingRow && (
        <ValueGatePendingModal
          code={vgPendingRow.code}
          title={vgPendingRow.title}
          rows={vgPendingRow.pending}
          onClose={() => setVgPendingRow(null)}
        />
      )}
      {showReprocesoDetail && <ReprocesoDetailModal rows={mainReprocesoRows} onClose={() => setShowReprocesoDetail(false)} />}
      {showEntregaDetail && <EntregaDetailModal rows={entLateRows} onClose={() => setShowEntregaDetail(false)} />}
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

// Celda de la fila de métricas del PM (EVM · Beneficio · Calidad · Cumplimiento · NPS).
// La etiqueta tiene altura mínima fija para que los valores queden alineados aunque
// el texto ocupe una o dos líneas.
function MetricCell({ label, value, color, onClick, title, divider, sub }: {
  label: string; value: string; color: string; onClick?: () => void; title?: string; divider?: boolean; sub?: string;
}) {
  const style = divider ? { borderLeft: "1px solid var(--border)" } : undefined;
  const cls = `flex flex-col items-center px-1.5 py-2.5 text-center ${onClick ? "cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" : ""}`;
  const inner = (
    <>
      <span className="flex min-h-[2rem] items-center text-[0.56rem] font-bold uppercase leading-tight tracking-wide text-[var(--text-muted)]">
        {label}
      </span>
      <span className="mt-0.5 text-[0.95rem] font-extrabold leading-none tabular-nums" style={{ color }}>
        {value}
      </span>
      {sub && (
        <span className="mt-0.5 text-[0.56rem] font-bold uppercase leading-tight tracking-wide" style={{ color }}>
          {sub}
        </span>
      )}
    </>
  );
  return onClick ? (
    <button onClick={onClick} title={title} className={cls} style={style}>{inner}</button>
  ) : (
    <div title={title} className={cls} style={style}>{inner}</div>
  );
}

const PROJ_HEALTH_COLOR: Record<string, string> = {
  "on-track":  "#10b981",
  "in-risk":   "#f59e0b",
  "off-track": "#ef4444",
};

/** Un pendiente (unidad/step no Done) de un proyecto o PML del Value Gate —
 *  lo que se ve al hacer clic en una fila (ver ValueGatePendingModal). Para
 *  un PML (que no se descompone en steps) la lista es el ítem mismo. */
export type ValueGatePendingRow = { name: string; fase: string; deadline: Date | null; status: string; atrasada: boolean };

type ValueGateRow = { id: string; code: string; title: string; healthIndex: number | null; healthStatus: HealthStatus | null; pending: ValueGatePendingRow[] };

/** Arma las filas de una columna del Value Gate mezclando proyectos (código =
 *  nombre del board, ej. "PM-002") y PML (código = r.id, ej. "PML-022") que
 *  estén actualmente en esa fase — mismo formato de fila que PMPortfolioCard
 *  usa para listar proyectos (punto de color + código + % de salud). */
function valueGateRows(
  faseKey: "valuacion" | "aprobacion" | "revision",
  projBoards: ProjBoard[],
  boardPhase125: Map<string, { faseKey: string; healthIndex: number | null; healthStatus: HealthStatus | null; pending: ValueGatePendingRow[] }>,
  req: ReqItem[],
  reqPhase125: Map<string, { faseKey: string; healthIndex: number | null; healthStatus: HealthStatus | null }>,
): ValueGateRow[] {
  const projRows: ValueGateRow[] = projBoards
    .filter((b) => boardPhase125.get(b.id)?.faseKey === faseKey)
    .map((b) => {
      const p = boardPhase125.get(b.id)!;
      return { id: b.id, code: b.name.slice(0, 6), title: b.name, healthIndex: p.healthIndex, healthStatus: p.healthStatus, pending: p.pending };
    });
  const reqRows: ValueGateRow[] = req
    .filter((r) => reqPhase125.get(r.id)?.faseKey === faseKey)
    .map((r) => {
      const p = reqPhase125.get(r.id)!;
      // El PML no se descompone en steps — el "pendiente" es el ítem mismo,
      // ya que estar en Valuación/Aprobación/Revisión significa que esa fase
      // todavía no cierra para él.
      const pending: ValueGatePendingRow[] = [{ name: r.name, fase: r.grupo, deadline: r.deadline, status: r.estado, atrasada: r.estado === "ATRASADO" }];
      return { id: r.id, code: r.id, title: r.name, healthIndex: p.healthIndex, healthStatus: p.healthStatus, pending };
    });
  return [...projRows, ...reqRows];
}

/** Una columna del Value Gate — mismo formato de fila que usa PMPortfolioCard
 *  para listar proyectos (punto de color + código + % de salud). Cada fila
 *  es clicable → muestra sus pendientes (ValueGatePendingModal). */
function ValueGateColumn({ label, rows, onSelect }: { label: string; rows: ValueGateRow[]; onSelect: (row: ValueGateRow) => void }) {
  return (
    <div className="min-w-0 flex-1 px-[18px] py-3.5">
      <div className="mb-2 text-[0.7rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {label} <span className="font-normal text-[var(--text-disabled)]">({rows.length})</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.length === 0 ? (
          <span className="text-[0.75rem] text-[var(--text-disabled)]">—</span>
        ) : rows.map((row) => {
          const color = row.healthStatus ? PROJ_HEALTH_COLOR[row.healthStatus] : "#6b7280";
          return (
            <button
              key={row.id}
              onClick={() => onSelect(row)}
              title={`Ver pendientes de ${row.title}`}
              className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: color }} />
              <span className="text-[0.75rem] font-mono text-[var(--text-secondary)]">{row.code}</span>
              {row.healthIndex != null && <span className="ml-auto text-[0.72rem] font-bold tabular-nums" style={{ color }}>{Math.round(row.healthIndex * 100)}%</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PMPortfolioCard({
  pm, ini, req, proj, projBoards, boardHealthMap, boardCompleteMap, calMap, npsRecords, delays, reproceso, onGoIni, onGoReq, onGoProj,
}: {
  pm: string; ini: IniItem[]; req: ReqItem[]; proj: ProjItem[];
  projBoards: ProjBoard[]; boardHealthMap: Map<string, BoardHealthData>; boardCompleteMap: Map<string, boolean>; calMap: CalMap;
  npsRecords: NpsRecord[]; delays: DelayMap; reproceso: DelayMap;
  onGoIni: () => void; onGoReq: () => void; onGoProj: () => void;
}) {
  const [showValue, setShowValue] = useState(false);
  const [showKpi, setShowKpi] = useState(false);
  const [showNpsRanges, setShowNpsRanges] = useState(false);
  const [showEntregaDetail, setShowEntregaDetail] = useState(false);

  const {
    pmValueAll, pmValueHard, pmBenefitDisplay, iniHealth, planFuturoDue, pmNps, npsColor,
    entOn, entLate, entTotal, entPct, entColor, entLateRows,
    reqAct, rvc, reqAvgVem, rEvmOff, rEvmRisk, rEvmOn, reqHas,
    pmProjBoards, projHas, pmProjAvgHI, ppc, ihc, pmEvmPct, pmEvmRaw, pmReprocesoPct,
    pmKpi, pmKpiPct, pmKpiColor, hc,
  } = useMemo(() => {
  const pmValueAll = calcPmValue(pm, req, proj, projBoards, false);
  const pmValueHard = calcPmValue(pm, req, proj, projBoards, true); // el badge $ muestra siempre solo HardSaving
  const iniHealth = calcIniPMHealth(pm, ini, calMap);
  const planFuturoDue = countPlanFuturoDue(pm, ini);

  // NPS personal del PM (mismas fórmulas, filtrando por PM).
  const pmNps = calcNpsFromRecords(npsRecords, pm);
  const npsColor = npsCfg(pmNps.nps)?.color ?? "#6b7280";

  // Cumplimiento de Entrega del PM: REQ cerrados + hitos ÚNICOS de sus proyectos
  // (por PMS ID, 1 unidad c/u — ver calcEntregaStats).
  // Un atraso solo cuenta si su responsable asignado es "PM"; los demás se excluyen.
  const pmBoardIdSet = new Set(projBoards.filter((b) => b.pm === pm).map((b) => b.id));
  const pmReqFiltered = req.filter((r) => r.pm === pm);
  const pmProjFiltered = proj.filter((p) => pmBoardIdSet.has(p.boardId));
  const { onTime: entOn, late: entLate, total: entTotal, pct: entPct } = calcEntregaStats(pmReqFiltered, pmProjFiltered, delays);
  const entColor = entPct === null ? "#6b7280" : entPct >= 90 ? "var(--ok)" : entPct >= 75 ? "var(--warn)" : "var(--bad)";
  const entLateRows = buildLateResponsibleRows(pmReqFiltered, pmProjFiltered, projBoards, delays);

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

  const pmProjBoards = projBoards.filter((b) => b.pm === pm);
  const projHas = pmProjBoards.length > 0;
  const pmProjHIs = pmProjBoards.map((b) => boardHealthMap.get(b.id)?.healthIndex).filter((v): v is number => v != null);
  const pmProjAvgHI = pmProjHIs.length > 0 ? pmProjHIs.reduce((a, b) => a + b, 0) / pmProjHIs.length : null;
  const pmProjStatus = healthStatusFromIndex(pmProjAvgHI);
  const ppc = pmProjStatus ? HEALTH_CFG[pmProjStatus] : null;

  const ihc = INI_HEALTH_CFG[iniHealth.status];

  // Nota EVM del PM: mismo ponderado que el del equipo (Iniciativas 10% · REQ 20%
  // · Proyectos 70%, ver weightedEvm). Sin iniciativas, ese 10% se reparte entre
  // REQ y Proyectos (no un 1.0 gratis).
  const pmEvmRaw = weightedEvm({
    ini: iniHealth.total > 0 ? iniHealth.index : null,
    req: reqAvgVem,
    proj: pmProjAvgHI,
  });
  const pmEvmPct = pmEvmRaw !== null ? Math.round(pmEvmRaw * 100) : null;

  // KPI del PM: mismo cálculo ponderado que el del equipo, con las métricas del PM
  // (EVM propio, NPS propio, beneficio HardSaving confirmado propio, su % de entregas y su % de reproceso).
  const pmReprocesoPct = calcReprocesoPct(
    req.filter((r) => r.pm === pm),
    proj.filter((p) => pmBoardIdSet.has(p.boardId)),
    reproceso,
  );
  // Beneficio mostrado en la tarjeta = solo Aprobación VPB. El del KPI usa Aprobación y
  // Confirmación por separado (70/30 contra la meta mensual acumulada — ver lib/kpi.ts).
  const pmBenefitDisplay = pmValueHard.aprobacionBenefit;
  const pmKpi = computeKpi({
    evm: pmEvmRaw, nps: pmNps.nps,
    benefitAprobado: pmValueHard.aprobacionBenefit, benefitConfirmado: pmValueHard.confirmacionBenefit,
    entregasPct: entPct, reprocesoPct: pmReprocesoPct,
  });
  const pmKpiPct = Math.round(pmKpi.score);
  const pmKpiColor = kpiColorFor(pmKpi.ratio);

  // Estado de la tarjeta = peor estado entre Iniciativas, REQ y Proyectos. El % sigue siendo el promedio.
  const pmHealth: HealthStatus = pmWorstStatus(pm, ini, req, projBoards, boardHealthMap, calMap);
  const hc = HEALTH_CFG[pmHealth];

  return {
    pmValueAll, pmValueHard, pmBenefitDisplay, iniHealth, planFuturoDue, pmNps, npsColor,
    entOn, entLate, entTotal, entPct, entColor, entLateRows,
    reqAct, rvc, reqAvgVem, rEvmOff, rEvmRisk, rEvmOn, reqHas,
    pmProjBoards, projHas, pmProjAvgHI, ppc, ihc, pmEvmPct, pmEvmRaw, pmReprocesoPct,
    pmKpi, pmKpiPct, pmKpiColor, hc,
  };
  }, [pm, ini, req, proj, projBoards, boardHealthMap, calMap, npsRecords, delays, reproceso]);

  // Mismo esquema de color del "Player" que la tabla de KPIs (por rango de %).
  const player = playerPalette(pmKpiPct);

  // Proyectos que se listan en la sección "PM" de la tarjeta: se ocultan los
  // ya Completados (boardCompleteMap) — NO por healthIndex=100%, porque un
  // proyecto activo y sano también puede mostrar 100% ahí sin haber terminado.
  // pmProjBoards SIN filtrar sigue siendo la base de pmProjHIs/pmProjAvgHI/
  // pmKpi más arriba, así que esos proyectos siguen contribuyendo al Player/KPI
  // aunque no aparezcan acá. El encabezado "PM (N)" cuenta lo visible, no el total.
  const visiblePmProjBoards = pmProjBoards.filter((b) => !boardCompleteMap.get(b.id));

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
            title={`Player (KPI) del PM: ${pmKpiPct}/100 · clic para ver el detalle`}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.78rem] font-extrabold transition-transform hover:-translate-y-0.5"
            style={{ color: player.fg, background: player.bg, boxShadow: "inset 0 0 0 1px rgba(128,128,128,0.35)" }}
          >
            Player {pmKpiPct}
          </button>
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.75rem] font-bold" style={{ color: hc.color, background: hc.bg }}>{hc.icon} {hc.label}</span>
        </div>
      </div>

      {/* Fila de métricas (los 5 componentes del KPI): EVM · Beneficio · Calidad · Cumplimiento · NPS */}
      {(() => {
        const evmStatus = healthStatusFromIndex(pmEvmRaw);
        const evmColor = evmStatus ? HEALTH_CFG[evmStatus].color : "#6b7280";
        const repColor = pmReprocesoPct === null ? "#6b7280" : pmReprocesoPct >= 90 ? "var(--ok)" : pmReprocesoPct >= 75 ? "var(--warn)" : "var(--bad)";
        const npsLabel = npsCfg(pmNps.nps)?.label;
        const metrics: { label: string; value: string; color: string; onClick?: () => void; title: string; sub?: string }[] = [
          { label: "EVM", value: pmEvmPct !== null ? `${pmEvmPct}%` : "—", color: evmColor, title: "EVM del PM · ponderado Iniciativas 10% · PML 20% · Proyectos 70%" },
          { label: "Beneficio", value: fmtMoneyShort(pmBenefitDisplay), color: "var(--ok)", onClick: () => setShowValue(true), title: `Beneficio HardSaving (Aprobación VPB): ${fmtMoney(pmBenefitDisplay)} · clic para ver el detalle` },
          { label: "Calidad de Entrega", value: pmReprocesoPct !== null ? `${pmReprocesoPct}%` : "—", color: repColor, title: "Calidad de Entrega · % de unidades limpias sin reproceso imputable al PM" },
          { label: "Cumplimiento de Entrega", value: entPct !== null ? `${entPct}%` : "s/d", color: entColor, onClick: () => setShowEntregaDetail(true), title: `Cumplimiento de Entrega · ${entOn} a tiempo / ${entLate} con atraso de ${entTotal} · clic para ver el detalle` },
          { label: "NPS", value: pmNps.nps !== null ? String(pmNps.nps) : "s/d", color: npsColor, onClick: () => setShowNpsRanges(true), title: `NPS del PM · ${pmNps.total} respuesta${pmNps.total !== 1 ? "s" : ""} · clic para ver cómo se mide`, sub: npsLabel },
        ];
        return (
          <div className="grid grid-cols-5 border-b" style={{ borderColor: "var(--border)" }}>
            {metrics.map((m, i) => (
              <MetricCell key={m.label} {...m} divider={i > 0} />
            ))}
          </div>
        );
      })()}
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
          {planFuturoDue > 0 && (
            <div className="mt-1">
              <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Plan Futuro</div>
              <div className="text-[0.82rem] font-bold" style={{ color: "#6c63ff" }}>{planFuturoDue}</div>
            </div>
          )}
        </Section>
        <div className="w-px flex-shrink-0" style={{ background: "var(--border)" }} />
        <Section
          label="PML"
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
        <Section label={`PM (${visiblePmProjBoards.length})`} has={projHas} onClick={onGoProj} badge={ppc && pmProjAvgHI !== null ? (
            <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold leading-none" style={{ color: ppc.color, background: ppc.bg }}>
              {ppc.icon} {ppc.label} · {Math.round(pmProjAvgHI * 100)}%
            </span>
          ) : undefined}>
          <div className="flex flex-col gap-1.5 pt-0.5">
            {visiblePmProjBoards.map((b) => {
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
        <KpiModal title={`KPI · ${pm}`} pct={pmKpiPct} achievable={pmKpi.achievable} pendingWeight={100 - pmKpi.achievable} color={pmKpiColor} components={pmKpi.components} onClose={() => setShowKpi(false)} />
      )}
      {showNpsRanges && <NpsRangesModal nps={pmNps.nps} onClose={() => setShowNpsRanges(false)} />}
      {showEntregaDetail && <EntregaDetailModal rows={entLateRows} onClose={() => setShowEntregaDetail(false)} />}
    </div>
  );
}

// Paleta por rangos para el número "Player" (KPI) del scoreboard, según lo pedido:
//  >85 negro · 70–85 verde · 60–69.99 amarillo · 50–59.99 rojo · <50 morado.
function playerPalette(pct: number): { bg: string; fg: string } {
  if (pct > 85) return { bg: "#000000", fg: "#ffffff" };   // Mayor que 85
  if (pct >= 70) return { bg: "#3ecf4a", fg: "#06230e" };  // Entre 70 y 85
  if (pct >= 60) return { bg: "#ffd400", fg: "#3a2e00" };  // Entre 60 y 69.99
  if (pct >= 50) return { bg: "#ef4444", fg: "#ffffff" };  // Entre 50 y 59.99
  return { bg: "#9b30d0", fg: "#ffffff" };                 // Menor que 50
}

// Scoreboard comparativo de PMs: tabla ordenada por KPI (desc). KPI y $ abren su detalle.
function PmScoreboard({ pms, ini, req, proj, projBoards, boardHealthMap, calMap, npsRecords, delays, reproceso }: {
  pms: string[]; ini: IniItem[]; req: ReqItem[]; proj: ProjItem[]; projBoards: ProjBoard[];
  boardHealthMap: Map<string, BoardHealthData>; calMap: CalMap; npsRecords: NpsRecord[]; delays: DelayMap; reproceso: DelayMap;
}) {
  const [kpiPm, setKpiPm] = useState<string | null>(null);
  const [valuePm, setValuePm] = useState<string | null>(null);

  const rows = useMemo(
    () => pms
      .map((pm) => calcPmMetrics(pm, ini, req, proj, projBoards, boardHealthMap, calMap, npsRecords, delays, reproceso))
      .sort((a, b) => b.kpi.score - a.kpi.score),
    [pms, ini, req, proj, projBoards, boardHealthMap, calMap, npsRecords, delays, reproceso],
  );

  const openKpi = rows.find((r) => r.pm === kpiPm);
  const openValue = rows.find((r) => r.pm === valuePm);

  const th = "px-3 py-2.5 font-semibold text-[var(--text-secondary)]";
  const td = "px-3 py-2.5";

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <table className="w-full table-fixed text-[0.82rem]">
        <thead>
          <tr className="border-b" style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}>
            <th className={`${th} text-center w-12`}>#</th>
            <th className={`${th} text-left w-48`}>Portafolio · PM</th>
            <th className={`${th} text-center w-32`}>Player</th>
            <th className={`${th} text-center w-32`}>EVM<span className="block text-[0.6rem] font-normal text-[var(--text-muted)]">peso 30</span></th>
            <th className={`${th} text-center w-32`}>Beneficio<span className="block text-[0.6rem] font-normal text-[var(--text-muted)]">peso 25</span></th>
            <th className={`${th} text-center w-32`}>Calidad de Entregas<span className="block text-[0.6rem] font-normal text-[var(--text-muted)]">peso 20</span></th>
            <th className={`${th} text-center w-32`}>Cumplimiento de Entrega<span className="block text-[0.6rem] font-normal text-[var(--text-muted)]">peso 15</span></th>
            <th className={`${th} text-center w-32`}>NPS<span className="block text-[0.6rem] font-normal text-[var(--text-muted)]">peso 10</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const player = playerPalette(r.kpiPct);
            const evmStatus = healthStatusFromIndex(r.evmRaw);
            const evmColor = evmStatus ? HEALTH_CFG[evmStatus].color : "#6b7280";
            const npsColor = npsCfg(r.nps.nps)?.color ?? "#6b7280";
            const entColor = r.entPct === null ? "#6b7280" : r.entPct >= 90 ? "var(--ok)" : r.entPct >= 75 ? "var(--warn)" : "var(--bad)";
            const repColor = r.reprocesoPct === null ? "#6b7280" : r.reprocesoPct >= 90 ? "var(--ok)" : r.reprocesoPct >= 75 ? "var(--warn)" : "var(--bad)";
            // Peso ganado por cada métrica = logro × peso (aporte al KPI del PM).
            const pts = (key: string) => {
              const c = r.kpi.components.find((x) => x.key === key);
              return c ? Math.round(c.logro * c.weight) : 0;
            };
            return (
              <tr key={r.pm} className="border-t transition-colors hover:bg-[var(--bg-hover)]" style={{ borderColor: "var(--border)" }}>
                <td className={`${td} text-center tabular-nums font-bold text-[var(--text-muted)]`}>{i + 1}</td>
                <td className={td}>
                  <div className="font-semibold text-[var(--text-primary)]">{pmLabel(r.pm)}</div>
                  <div className="text-[0.7rem] text-[var(--text-muted)]">{r.pm}</div>
                </td>
                {/* Player (KPI) — número héroe, formato diferenciado (pill con borde) */}
                <td className={`${td} text-center`}>
                  <button
                    onClick={() => setKpiPm(r.pm)}
                    title={`KPI ${r.kpiPct}/100 · ver detalle`}
                    className="inline-flex items-center rounded-full px-3 py-1 text-[0.95rem] font-extrabold transition-transform hover:-translate-y-0.5"
                    style={{ color: player.fg, background: player.bg, boxShadow: "inset 0 0 0 1px rgba(128,128,128,0.35)" }}
                  >
                    {r.kpiPct}
                  </button>
                </td>
                {/* EVM (peso 30) */}
                <td className={`${td} text-center`}>
                  <div className="tabular-nums font-bold" style={{ color: evmColor }}>{r.evmPct !== null ? `${r.evmPct}%` : "—"}</div>
                  {r.evmPct !== null && <div className="text-[0.62rem] font-semibold text-[var(--text-muted)]">{pts("evm")} pts</div>}
                </td>
                {/* Beneficio HardSaving confirmado (peso 25) */}
                <td className={`${td} text-center`}>
                  <button
                    onClick={() => setValuePm(r.pm)}
                    title="Ver costo y beneficio (detalle)"
                    className="tabular-nums font-bold transition-colors hover:underline"
                    style={{ color: "var(--ok)" }}
                  >
                    {fmtMoney(r.benefit)}
                  </button>
                  <div className="text-[0.62rem] font-semibold text-[var(--text-muted)]">{pts("benefit")} pts</div>
                </td>
                {/* Calidad de Entregas — reproceso (peso 20) */}
                <td className={`${td} text-center`} title={r.reprocesoPct === null ? "Sin unidades en scope (no aplica)" : "% de unidades limpias (PML cerrados + fases completadas) sin reproceso imputable al PM"}>
                  <div className="tabular-nums font-bold" style={{ color: repColor }}>{r.reprocesoPct !== null ? `${r.reprocesoPct}%` : "—"}</div>
                  {r.reprocesoPct !== null && <div className="text-[0.62rem] font-semibold text-[var(--text-muted)]">{pts("reproceso")} pts</div>}
                </td>
                {/* Cumplimiento de Entrega — % a tiempo (peso 15) */}
                <td className={`${td} text-center`}>
                  <div className="tabular-nums font-bold" style={{ color: entColor }}>{r.entPct !== null ? `${r.entPct}%` : "—"}</div>
                  {r.entPct !== null && <div className="text-[0.62rem] font-semibold text-[var(--text-muted)]">{pts("entregas")} pts</div>}
                </td>
                {/* NPS (peso 10) */}
                <td className={`${td} text-center`}>
                  <div className="tabular-nums font-bold" style={{ color: npsColor }}>{r.nps.nps !== null ? r.nps.nps : "s/d"}</div>
                  {r.nps.nps !== null && <div className="text-[0.62rem] font-semibold text-[var(--text-muted)]">{pts("nps")} pts</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {openKpi && (
        <KpiModal title={`KPI · ${openKpi.pm}`} pct={openKpi.kpiPct} achievable={openKpi.kpi.achievable} pendingWeight={100 - openKpi.kpi.achievable} color={kpiColorFor(openKpi.kpi.ratio)} components={openKpi.kpi.components} onClose={() => setKpiPm(null)} />
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
