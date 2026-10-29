"use client";

// Players — scoreboard por CKU. Mismas métricas que la vista "Players" del Control
// Tower, pero cada player es un CKU y se mide solo con las Iniciativas, PML y
// Proyectos vinculados a él (ver buildCkuScope).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { calcPmMetrics, confirmacionRoiPorCku, entregablesDelCku, type ConfirmacionRoiPm } from "@/lib/dashboard";
import { KPI_W_CKU } from "@/lib/kpi";
import { esRolCku } from "@/lib/permissions";
import { buildBoardMaps, buildCkuScope, ckuDeEmail, CKU_CON_IMPLEMENTACION, claveMesDe, cuentaEnPlayers, etiquetaMesLargo, mesesConActividades, PLAYER_CKUS, proyectosDelMes, sameCku, swapPmCku, type CkuScope } from "@/lib/players";
import { implementacionDelMes, type ResumenImplementacionCku } from "@/lib/implementaciones";
import { today } from "@/lib/business";
import { healthStatusFromIndex, HEALTH_CFG } from "@/lib/health";
import { ErrorBox, Loader } from "@/components/ui";
import CkuMedicion from "@/components/CkuMedicion";
import PmScoreboard from "@/components/PmScoreboard";
import { lookupEstrategia, type BoardHealthData } from "@/lib/proj";
import type { DashboardData, EstrategiaInfo, IniItem, ProjBoard, ReqItem } from "@/types";

export default function PlayersPage() {
  const { data, loading, error } = useData();
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;
  return <Players data={data} />;
}

function Players({ data }: { data: DashboardData }) {
  const { ini, req, proj, projBoards, projItemBaselines, calMap, npsRecords, estrategiaMap, directorio, delayAttributions: delays, reprocesoAttributions: reproceso } = data;

  // Un usuario con rol CKU ve SOLO su propia información: su CKU se saca de su correo
  // (Directorio RH). Si el correo no corresponde a ningún player, no ve a nadie (no se
  // le muestran los demás por omisión). Los demás roles ven a todos los CKUs.
  const { me } = useMe();
  const soloMio = esRolCku(me?.roleName);
  const miCku = useMemo(() => (soloMio ? ckuDeEmail(directorio, me?.email ?? "") : null), [soloMio, directorio, me?.email]);
  const ckus = useMemo(() => (soloMio ? (miCku ? [miCku] : []) : PLAYER_CKUS), [soloMio, miCku]);

  const { boardHealthMap } = useMemo(
    // El EVM de cada proyecto es el del proyecto completo, el mismo que ve su PM.
    () => buildBoardMaps(proj, projBoards, projItemBaselines),
    [proj, projBoards, projItemBaselines],
  );
  const scopes = useMemo(
    () => new Map(ckus.map((cku) => [cku, buildCkuScope(cku, { ini, req, proj, projBoards, npsRecords })])),
    [ckus, ini, req, proj, projBoards, npsRecords],
  );

  // Filtro por mes: Cumplimiento y Calidad (y con ellos el Player) miden solo las actividades de Proyectos
  // cuyo Limit Date cae en el mes elegido. EVM, NPS, PML e Iniciativas no se filtran; del Beneficio, solo la
  // Implementación (ver implementacionMes abajo). Los meses
  // que se ofrecen son los que tienen algo que medir en lo que miden los CKUs visibles.
  const [mes, setMes] = useState<string | null>(null);
  const meses = useMemo(
    () => mesesConActividades([...scopes].flatMap(([cku, s]) => entregablesDelCku(s.proj, cku).flatMap((p) => p.subitems))),
    [scopes],
  );
  const mesActivo = mes && meses.includes(mes) ? mes : null;   // si el mes ya no existe tras un refresh, vuelve a «todos»
  const scopesMes = useMemo(
    () => new Map<string, CkuScope>([...scopes].map(([cku, s]) => [cku, { ...s, proj: proyectosDelMes(s.proj, mesActivo) }])),
    [scopes, mesActivo],
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

  // Implementación (página ROI) del CKU que la lleva: meta y Profit del mes elegido o, con «Todos los
  // meses», del mes en curso. Fetch aparte como el de ROI; mientras carga (o si falla) no se suma.
  const [resumenImpl, setResumenImpl] = useState<ResumenImplementacionCku | null>(null);
  useEffect(() => {
    authedFetch("/api/dashboard/implementacion-cku")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((d: ResumenImplementacionCku) => setResumenImpl(d))
      .catch((err) => console.warn("Implementación (Players): no se pudo cargar:", err));
  }, []);
  const implementacionMes = useMemo(
    () => (resumenImpl ? implementacionDelMes(resumenImpl, mesActivo ?? claveMesDe(today())) : null),
    [resumenImpl, mesActivo],
  );

  const getRow = useCallback((cku: string) => {
    const s = scopesMes.get(cku)!;
    const impl = sameCku(cku, CKU_CON_IMPLEMENTACION) ? implementacionMes ?? undefined : undefined;
    return calcPmMetrics(cku, s.ini, s.req, s.proj, s.projBoards, boardHealthMap, calMap, s.npsRecords, ckuDelays, ckuReproceso, KPI_W_CKU, undefined, confirmacionRoiCku, true, impl);
  }, [scopesMes, boardHealthMap, calMap, ckuDelays, ckuReproceso, confirmacionRoiCku, implementacionMes]);

  const subtitle = (cku: string) => {
    const s = scopes.get(cku)!;
    return `${s.ini.length} Iniciativas · ${s.req.length} PML · ${s.projBoards.length} Proyectos`;
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Players</h1>
        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]">
          {soloMio ? "Tu información" : `${ckus.length} CKUs`}
        </span>
      </div>
      {ckus.length === 0 ? (
        <div className="rounded-xl border p-4 text-[0.85rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
          Tu usuario tiene el rol CKU, pero su correo{me?.email ? ` (${me.email})` : ""} no está asociado a ningún CKU en el
          Directorio RH, así que no hay información para mostrarte. Pide a un Admin que lo revise.
        </div>
      ) : (<>
      {/* Mes: acota a las actividades con Limit Date en ese mes y recalcula Cumplimiento, Calidad y el Player. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <label htmlFor="players-mes" className="text-[0.78rem] font-semibold text-[var(--text-secondary)]">Mes:</label>
        <select
          id="players-mes"
          value={mesActivo ?? ""}
          onChange={(e) => setMes(e.target.value || null)}
          className="rounded-lg border px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}
        >
          <option value="">Todos los meses</option>
          {meses.map((m) => <option key={m} value={m}>{etiquetaMesLargo(m)}</option>)}
        </select>
        {mesActivo && (
          <span className="text-[0.72rem] text-[var(--text-muted)]">
            Cumplimiento y Calidad miden solo las actividades con Limit Date en {etiquetaMesLargo(mesActivo)}; EVM, NPS, PML e Iniciativas no se filtran por mes. En el Beneficio, solo la Implementación ({CKU_CON_IMPLEMENTACION}) es la del mes.
          </span>
        )}
      </div>
      <PmScoreboard
        pms={ckus} ini={ini} req={req} proj={proj} projBoards={projBoards}
        boardHealthMap={boardHealthMap} calMap={calMap} npsRecords={npsRecords}
        delays={ckuDelays} reproceso={ckuReproceso}
        getRow={getRow} weights={KPI_W_CKU} nameHeader="CKU" label={(cku) => cku} subtitle={subtitle} ponderadoPorFuente
      />

      <h2 className="mb-3 mt-8 text-base font-semibold text-[var(--text-primary)]">{soloMio ? "Qué manejas" : "Qué maneja cada CKU"}</h2>
      <div className="space-y-4">
        {ckus.map((cku) => (
          <CkuPortfolio
            key={cku} cku={cku}
            ini={ini.filter((r) => sameCku(r.cku, cku) && cuentaEnPlayers(r))}
            req={req.filter((r) => sameCku(r.cku, cku))}
            boards={projBoards.filter((b) => sameCku(b.cku, cku))}
            boardHealthMap={boardHealthMap}
            estrategiaMap={estrategiaMap}
          >
            <CkuMedicion
              scope={scopesMes.get(cku)!}
              mesLabel={mesActivo ? etiquetaMesLargo(mesActivo) : undefined}
              delays={ckuDelays} delaysOriginal={delays}
              reproceso={ckuReproceso} reprocesoOriginal={reproceso}
            />
          </CkuPortfolio>
        ))}
      </div>
      </>)}
    </div>
  );
}

const ESTADO_LABEL: Record<string, string> = {
  ATRASADO: "Atrasado", "PARA HOY": "Para hoy", "EN TIEMPO": "En tiempo", APROBADA: "Aprobada",
  EN_ESPERA: "En espera", PLAN_FUTURO: "Plan futuro", POR_DEFINIR: "Por definir",
  CAMBIO_ESTRATEGIA: "Cambio estrategia", SKIP: "—", "EN PROCESO": "En proceso", CERRADO: "Cerrado",
};

// Iniciativas, PML y Proyectos vinculados a un CKU (los mismos que alimentan sus métricas).
// Sponsor: Iniciativas y Proyectos lo traen propio; el PML lo toma de su Estrategia (igual que Costo $ x Unid Neg).
function CkuPortfolio({ cku, ini, req, boards, boardHealthMap, estrategiaMap, children }: {
  cku: string; ini: IniItem[]; req: ReqItem[]; boards: ProjBoard[]; boardHealthMap: Map<string, BoardHealthData>;
  estrategiaMap: Map<string, EstrategiaInfo>;
  /** Contenido extra al pie de la tarjeta del CKU (el detalle de qué se mide). */
  children?: React.ReactNode;
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
            <PortfolioRow key={r.id || r.name} name={r.name} sub={[r.grupo, ESTADO_LABEL[r.estado] ?? r.estado, r.pm && `PM: ${r.pm}`, r.sponsor && `Sponsor: ${r.sponsor}`]} />
          ))}
        </PortfolioList>
        <PortfolioList title="PML" count={req.length}>
          {req.map((r) => {
            const sponsor = lookupEstrategia(estrategiaMap, r.estrategia)?.sponsor;
            return <PortfolioRow key={r.id} name={r.name} sub={[r.grupo, ESTADO_LABEL[r.estado] ?? r.estado, r.pm && `PM: ${r.pm}`, sponsor && `Sponsor: ${sponsor}`]} />;
          })}
        </PortfolioList>
        <PortfolioList title="Proyectos" count={boards.length}>
          {boards.map((b) => {
            const hi = boardHealthMap.get(b.id)?.healthIndex;
            const st = healthStatusFromIndex(hi ?? null);
            return (
              <PortfolioRow
                key={b.id} name={b.name}
                sub={[b.pm && `PM: ${b.pm}`, b.sponsor && `Sponsor: ${b.sponsor}`]}
                badge={hi != null ? { text: `EVM ${Math.round(hi * 100)}%`, color: st ? HEALTH_CFG[st].color : "#6b7280" } : undefined}
              />
            );
          })}
        </PortfolioList>
      </div>
      {children}
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
        {line && <div className="text-[0.68rem] text-[var(--text-muted)]">{line}</div>}
      </div>
      {badge && <span className="shrink-0 text-[0.72rem] font-bold tabular-nums" style={{ color: badge.color }}>{badge.text}</span>}
    </li>
  );
}
