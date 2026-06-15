"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/context/DataContext";
import { calcIniPMHealth, calcBoardMetrics, deriveBoardHealth, healthStatusFromIndex, HEALTH_CFG, INI_ACTIVE_STS, iniIsParaHoy, npsCfg, REQ_ACTIVE_GRUPOS } from "@/lib/process";
import type { BoardHealthData, HealthStatus } from "@/lib/process";
import type { IniItem, ProjBoard, ProjItem, ReqItem } from "@/types";
import { ErrorBox, Loader } from "@/components/ui";
import NpsModal from "@/components/NpsModal";

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

export default function ControlTowerPage() {
  const { data, loading, error } = useData();
  const router = useRouter();
  const [showNps, setShowNps] = useState(false);

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
  const teamStatus = healthStatusFromIndex(teamVem);
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
            <PMPortfolioCard key={pm} pm={pm} ini={ini} req={req} projBoards={projBoards} boardHealthMap={boardHealthMap} calMap={calMap} onGoIni={() => router.push(`/iniciativas?pm=${q}`)} onGoReq={() => router.push(`/req?pm=${q}`)} onGoProj={() => router.push(`/proyectos?pm=${q}`)} />
          );
        })}
      </div>

      {showNps && <NpsModal nps={nps} onClose={() => setShowNps(false)} />}
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

function PMPortfolioCard({
  pm, ini, req, projBoards, boardHealthMap, calMap, onGoIni, onGoReq, onGoProj,
}: {
  pm: string; ini: IniItem[]; req: ReqItem[];
  projBoards: ProjBoard[]; boardHealthMap: Map<string, BoardHealthData>;
  calMap: import("@/types").CalMap;
  onGoIni: () => void; onGoReq: () => void; onGoProj: () => void;
}) {
  const iniHealth = calcIniPMHealth(pm, ini, calMap);

  const reqItems = req.filter((r) => r.pm === pm && r.estado !== "CERRADO");
  const reqAct = reqItems.filter((r) => REQ_ACTIVE_GRUPOS.has(r.grupo));
  const reqVemItems = reqAct.filter((r) => r.vem != null);
  const reqAvgVem = reqVemItems.length ? reqVemItems.reduce((s, r) => s + (r.vem as number), 0) / reqVemItems.length : null;
  const reqVemStatus = healthStatusFromIndex(reqAvgVem);
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
  const pmHealth: HealthStatus = healthStatusFromIndex(pmEvmRaw) ?? "on-track";
  const hc = HEALTH_CFG[pmHealth];

  return (
    <div className="overflow-hidden rounded-xl border-2" style={{ background: "var(--bg-surface)", borderColor: hc.color }}>
      <div className="flex items-center justify-between border-b px-[18px] py-3.5" style={{ borderColor: "var(--border)" }}>
        <div>
          <span className="text-[0.95rem] font-bold text-[var(--text-primary)]">{pmLabel(pm)}</span>
          <div className="mt-0.5 text-[0.75rem] text-[var(--text-muted)]">PM · {pm}</div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.75rem] font-bold" style={{ color: hc.color, background: hc.bg }}>{hc.icon} {hc.label}{pmEvmPct !== null ? ` · ${pmEvmPct}%` : ""}</span>
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
