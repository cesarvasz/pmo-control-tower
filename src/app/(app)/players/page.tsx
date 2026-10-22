"use client";

// Players — scoreboard por CKU. Mismas métricas que la vista "Players" del Control
// Tower, pero cada player es un CKU y se mide solo con las Iniciativas, PML y
// Proyectos vinculados a él (ver buildCkuScope).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { authedFetch } from "@/lib/api";
import { calcPmMetrics, confirmacionRoiPorCku, type ConfirmacionRoiPm } from "@/lib/dashboard";
import { KPI_W_CKU } from "@/lib/kpi";
import { buildBoardMaps, buildCkuScope, PLAYER_CKUS, sameCku, swapPmCku } from "@/lib/players";
import { healthStatusFromIndex, HEALTH_CFG } from "@/lib/health";
import { ErrorBox, Loader } from "@/components/ui";
import PmScoreboard from "@/components/PmScoreboard";
import type { BoardHealthData } from "@/lib/proj";
import type { DashboardData, IniItem, ProjBoard, ReqItem } from "@/types";

export default function PlayersPage() {
  const { data, loading, error } = useData();
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;
  return <Players data={data} />;
}

function Players({ data }: { data: DashboardData }) {
  const { ini, req, proj, projBoards, projItemBaselines, calMap, npsRecords, delayAttributions: delays, reprocesoAttributions: reproceso } = data;

  const { boardHealthMap } = useMemo(
    // Players por CKU: el EVM de cada proyecto se mide SOLO con su Fase 3 (plantilla antigua y nueva).
    () => buildBoardMaps(proj, projBoards, projItemBaselines, { soloFase3: true }),
    [proj, projBoards, projItemBaselines],
  );
  const scopes = useMemo(
    () => new Map(PLAYER_CKUS.map((cku) => [cku, buildCkuScope(cku, { ini, req, proj, projBoards, npsRecords })])),
    [ini, req, proj, projBoards, npsRecords],
  );

  // Para un CKU, lo que penaliza es el responsable "CKU" (en vez de "PM") — ver swapPmCku.
  const ckuDelays = useMemo(() => swapPmCku(delays), [delays]);
  const ckuReproceso = useMemo(() => swapPmCku(reproceso), [reproceso]);

  // Confirmación vía ROI: Javier toma los tiempos de Luis y Victoria los de David
  // (ver CONFIRMACION_ROI_CKU). Fetch aparte (fuente externa lenta); vacío mientras
  // carga, y entonces la Confirmación sigue siendo la de Monday.
  const [confirmacionRoiCku, setConfirmacionRoiCku] = useState<Record<string, ConfirmacionRoiPm>>({});
  useEffect(() => {
    authedFetch("/api/dashboard/confirmacion-roi")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((d: { porPm?: Record<string, ConfirmacionRoiPm> }) => setConfirmacionRoiCku(confirmacionRoiPorCku(d.porPm ?? {})))
      .catch((err) => console.warn("Confirmación ROI: no se pudo cargar:", err));
  }, []);

  const getRow = useCallback((cku: string) => {
    const s = scopes.get(cku)!;
    return calcPmMetrics(cku, s.ini, s.req, s.proj, s.projBoards, boardHealthMap, calMap, s.npsRecords, ckuDelays, ckuReproceso, KPI_W_CKU, undefined, confirmacionRoiCku);
  }, [scopes, boardHealthMap, calMap, ckuDelays, ckuReproceso, confirmacionRoiCku]);

  const subtitle = (cku: string) => {
    const s = scopes.get(cku)!;
    return `${s.ini.length} Iniciativas · ${s.req.length} PML · ${s.projBoards.length} Proyectos`;
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Players</h1>
        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]">
          {PLAYER_CKUS.length} CKUs
        </span>
      </div>
      <PmScoreboard
        pms={PLAYER_CKUS} ini={ini} req={req} proj={proj} projBoards={projBoards}
        boardHealthMap={boardHealthMap} calMap={calMap} npsRecords={npsRecords}
        delays={ckuDelays} reproceso={ckuReproceso}
        getRow={getRow} weights={KPI_W_CKU} nameHeader="CKU" label={(cku) => cku} subtitle={subtitle}
      />

      <h2 className="mb-3 mt-8 text-base font-semibold text-[var(--text-primary)]">Qué maneja cada CKU</h2>
      <div className="space-y-4">
        {PLAYER_CKUS.map((cku) => (
          <CkuPortfolio
            key={cku} cku={cku}
            ini={ini.filter((r) => sameCku(r.cku, cku))}
            req={req.filter((r) => sameCku(r.cku, cku))}
            boards={projBoards.filter((b) => sameCku(b.cku, cku))}
            boardHealthMap={boardHealthMap}
          />
        ))}
      </div>
    </div>
  );
}

const ESTADO_LABEL: Record<string, string> = {
  ATRASADO: "Atrasado", "PARA HOY": "Para hoy", "EN TIEMPO": "En tiempo", APROBADA: "Aprobada",
  EN_ESPERA: "En espera", PLAN_FUTURO: "Plan futuro", POR_DEFINIR: "Por definir",
  CAMBIO_ESTRATEGIA: "Cambio estrategia", SKIP: "—", "EN PROCESO": "En proceso", CERRADO: "Cerrado",
};

// Iniciativas, PML y Proyectos vinculados a un CKU (los mismos que alimentan sus métricas).
function CkuPortfolio({ cku, ini, req, boards, boardHealthMap }: {
  cku: string; ini: IniItem[]; req: ReqItem[]; boards: ProjBoard[]; boardHealthMap: Map<string, BoardHealthData>;
}) {
  return (
    <div className="rounded-xl border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <span className="text-[0.95rem] font-bold text-[var(--text-primary)]">{cku}</span>
        <span className="text-[0.75rem] text-[var(--text-muted)]">
          {ini.length} Iniciativas · {req.length} PML · {boards.length} Proyectos
        </span>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 lg:grid-cols-3">
        <PortfolioList title="Iniciativas" count={ini.length}>
          {ini.map((r) => (
            <PortfolioRow key={r.id || r.name} name={r.name} sub={[r.grupo, ESTADO_LABEL[r.estado] ?? r.estado, r.pm && `PM: ${r.pm}`]} />
          ))}
        </PortfolioList>
        <PortfolioList title="PML" count={req.length}>
          {req.map((r) => (
            <PortfolioRow key={r.id} name={r.name} sub={[r.grupo, ESTADO_LABEL[r.estado] ?? r.estado, r.pm && `PM: ${r.pm}`]} />
          ))}
        </PortfolioList>
        <PortfolioList title="Proyectos" count={boards.length}>
          {boards.map((b) => {
            const hi = boardHealthMap.get(b.id)?.healthIndex;
            const st = healthStatusFromIndex(hi ?? null);
            return (
              <PortfolioRow
                key={b.id} name={b.name}
                sub={[b.pm && `PM: ${b.pm}`]}
                badge={hi != null ? { text: `EVM ${Math.round(hi * 100)}%`, color: st ? HEALTH_CFG[st].color : "#6b7280" } : undefined}
              />
            );
          })}
        </PortfolioList>
      </div>
    </div>
  );
}

function PortfolioList({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[0.7rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{title} ({count})</div>
      {count === 0
        ? <div className="text-[0.8rem] text-[var(--text-disabled)]">Sin {title.toLowerCase()}</div>
        : <ul className="space-y-1.5">{children}</ul>}
    </div>
  );
}

function PortfolioRow({ name, sub, badge }: { name: string; sub: (string | false | undefined)[]; badge?: { text: string; color: string } }) {
  const line = sub.filter(Boolean).join(" · ");
  return (
    <li className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--bg-hover)]">
      <div className="min-w-0">
        <div className="truncate text-[0.82rem] font-semibold text-[var(--text-primary)]" title={name}>{name}</div>
        {line && <div className="truncate text-[0.68rem] text-[var(--text-muted)]">{line}</div>}
      </div>
      {badge && <span className="shrink-0 text-[0.72rem] font-bold tabular-nums" style={{ color: badge.color }}>{badge.text}</span>}
    </li>
  );
}
