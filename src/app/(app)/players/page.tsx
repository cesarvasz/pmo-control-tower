"use client";

// Players — scoreboard por CKU. Mismas métricas que la vista "Players" del Control
// Tower, pero cada player es un CKU y se mide solo con las Iniciativas, PML y
// Proyectos vinculados a él (ver buildCkuScope).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { calcPmMetrics, confirmacionRoiPorCku, entregablesDelCku, type ConfirmacionRoiPm } from "@/lib/dashboard";
import { KPI_W_CKU, type DucafastKpi } from "@/lib/kpi";
import { esRolCku, hasAction } from "@/lib/permissions";
import { buildBoardMaps, buildCkuScope, ckuDeEmail, CKU_CON_IMPLEMENTACION, claveMesDe, cuentaEnPlayers, etiquetaMesLargo, mesesConActividades, PLAYER_CKUS, proyectosDelMes, sameCku, swapPmCku, type CkuScope } from "@/lib/players";
import { implementacionDelMes, type ResumenImplementacionCku } from "@/lib/implementaciones";
import type { MetaDucafastMesa2 } from "@/lib/ducafastMesa2";
import { today } from "@/lib/business";
import { ErrorBox, Loader } from "@/components/ui";
import CkuMedicion from "@/components/CkuMedicion";
import { CkuEncuestasProvider } from "@/components/CkuEntregableEncuesta";
import PmScoreboard from "@/components/PmScoreboard";
import type { DashboardData } from "@/types";

// Sin Confirmación vía ROI (aún cargando o falló): la de Monday. Referencia estable para no invalidar getRow.
const SIN_ROI: Record<string, ConfirmacionRoiPm> = {};

export default function PlayersPage() {
  // Todo el portafolio, también para un Sponsor: aquí ve a todos los CKUs con sus métricas completas
  // (y su Beneficio vía ROI), no solo lo ligado a su nombre.
  const { dataCompleto: data, loading, error } = useData();
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;
  return <Players data={data} />;
}

function Players({ data }: { data: DashboardData }) {
  const { ini, req, proj, projBoards, projItemBaselines, calMap, npsRecords, directorio, delayAttributions: delays, reprocesoAttributions: reproceso, ckuDelayAttributions, ckuReprocesoAttributions, clases } = data;

  // Un usuario con rol CKU ve SOLO su propia información: su CKU se saca de su correo
  // (Directorio RH). Si el correo no corresponde a ningún player, no ve a nadie (no se
  // le muestran los demás por omisión). Los demás roles ven a todos los CKUs.
  const { me } = useMe();
  const soloMio = esRolCku(me?.roleName);
  // El botón de la encuesta NPS junto a cada entregable completado: un Admin lo ve en todos los CKUs; un CKU, en el suyo.
  const puedeEncuestaNps = hasAction(me?.permissions, "manage_roles") || soloMio;
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
  // que se ofrecen son los que tienen algo que medir en lo que miden los CKUs visibles. Al entrar viene
  // seleccionado el mes en curso (undefined = aún sin elegir; null = «Todos los meses», elegido a mano).
  const [mes, setMes] = useState<string | null | undefined>(undefined);
  const meses = useMemo(
    () => mesesConActividades([...scopes].flatMap(([cku, s]) => entregablesDelCku(s.proj, cku).flatMap((p) => p.subitems))),
    [scopes],
  );
  const elegido = mes === undefined ? claveMesDe(today()) : mes;
  const mesActivo = elegido && meses.includes(elegido) ? elegido : null;   // si el mes no está entre los que se ofrecen (sin actividades que medir, o ya no existe tras un refresh), vuelve a «todos»
  const scopesMes = useMemo(
    () => new Map<string, CkuScope>([...scopes].map(([cku, s]) => [cku, { ...s, proj: proyectosDelMes(s.proj, mesActivo) }])),
    [scopes, mesActivo],
  );

  // Para un CKU, lo que penaliza es el responsable "CKU" (en vez de "PM") — ver swapPmCku.
  // Sobre lo del Control Tower manda el responsable que un Admin eligió para un Incumplido del CKU (ver CkuResponsableSelect):
  // por id de PML, Iniciativa o actividad. Se mezcla ANTES del cambio, así que "CKU" penaliza y cualquier otro excusa.
  const ckuDelays = useMemo(() => swapPmCku({ ...delays, ...ckuDelayAttributions }), [delays, ckuDelayAttributions]);
  const ckuReproceso = useMemo(() => swapPmCku({ ...reproceso, ...ckuReprocesoAttributions }), [reproceso, ckuReprocesoAttributions]);

  // Confirmación vía ROI: Javier toma los tiempos de Luis y Victoria los de David
  // (ver CONFIRMACION_ROI_CKU). Fetch aparte (fuente externa lenta). null = aún cargando: mientras tanto el
  // Beneficio y el Player salen como esqueleto (ver `cargando`) en vez de un valor provisional con la
  // Confirmación de Monday. Si falla, queda {} y la Confirmación sigue siendo la de Monday.
  const [confirmacionRoiCku, setConfirmacionRoiCku] = useState<Record<string, ConfirmacionRoiPm> | null>(null);
  useEffect(() => {
    authedFetch("/api/dashboard/confirmacion-roi")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((d: { porPm?: Record<string, ConfirmacionRoiPm> }) => setConfirmacionRoiCku(confirmacionRoiPorCku(d.porPm ?? {})))
      .catch((err) => {
        console.warn("Confirmación ROI: no se pudo cargar:", err);
        setConfirmacionRoiCku({});
      });
  }, []);

  // Implementación (página ROI) del CKU que la lleva: meta y Profit del mes elegido o, con «Todos los
  // meses», del mes en curso. Fetch aparte como el de ROI; undefined = aún cargando, null = falló (no se suma).
  const [resumenImpl, setResumenImpl] = useState<ResumenImplementacionCku | null | undefined>(undefined);
  useEffect(() => {
    authedFetch("/api/dashboard/implementacion-cku")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((d: ResumenImplementacionCku) => setResumenImpl(d))
      .catch((err) => {
        console.warn("Implementación (Players): no se pudo cargar:", err);
        setResumenImpl(null);
      });
  }, []);
  const implementacionMes = useMemo(
    () => (resumenImpl ? implementacionDelMes(resumenImpl, mesActivo ?? claveMesDe(today())) : null),
    [resumenImpl, mesActivo],
  );

  // Uso de Ducafast por mes en el ROI 003 (Mesa 2): junto con Implementación es el Beneficio de Victoria (lo cumplido ÷ la
  // meta de los dos, ver computeBenefitKpiCku). Fetch aparte; undefined = cargando, null = falló.
  const [metaDucafastPorMes, setMetaDucafastPorMes] = useState<Record<string, MetaDucafastMesa2> | null | undefined>(undefined);
  useEffect(() => {
    authedFetch("/api/dashboard/meta-ducafast")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((d: { meses: Record<string, MetaDucafastMesa2> }) => setMetaDucafastPorMes(d.meses))
      .catch((err) => {
        console.warn("Meta ROI 003 (Players): no se pudo cargar:", err);
        setMetaDucafastPorMes(null);
      });
  }, []);
  // Mes del popup del Beneficio: el del dropdown o, con «Todos los meses», el mes en curso (igual que Implementación).
  const mesBeneficio = mesActivo ?? claveMesDe(today());
  // Ducafast del mes para el Beneficio de Victoria: sin Files de la Mesa 2 (o si falló la carga) → null y promedia solo con Implementación.
  const ducafastKpi = useMemo<DucafastKpi | null>(() => {
    const d = metaDucafastPorMes?.[mesBeneficio];
    return d ? { mes: mesBeneficio, files: d.files, filesCon: d.filesConDucafast, costoCon: d.costoTotalCon, costoSin: d.costoTotalSin,
      // Sin Files con tiempo medido en el grupo no hay costo por File (la lib lo deja en 0): null.
      porFileCon: d.costoTotalCon == null ? null : d.costoPorFileCon, porFileSin: d.costoTotalSin == null ? null : d.costoPorFileSin,
      metaUsd: d.meta, ahorroUsd: d.ahorro } : null;
  }, [metaDucafastPorMes, mesBeneficio]);
  const ckuBeneficio = useMemo(() => ({
    mes: mesBeneficio,
    conImplementacion: (cku: string) => sameCku(cku, CKU_CON_IMPLEMENTACION),
  }), [mesBeneficio]);

  // El Beneficio de un CKU depende del ROI y, en el que lleva Implementación, también de ésta y del ROI 003 (Ducafast);
  // mientras falte alguno su Beneficio y su Player aún no son los finales.
  const cargando = useCallback(
    (cku: string) => confirmacionRoiCku === null
      || (sameCku(cku, CKU_CON_IMPLEMENTACION) && (resumenImpl === undefined || metaDucafastPorMes === undefined)),
    [confirmacionRoiCku, resumenImpl, metaDucafastPorMes],
  );

  const getRow = useCallback((cku: string) => {
    const s = scopesMes.get(cku)!;
    const conImpl = sameCku(cku, CKU_CON_IMPLEMENTACION);
    const impl = conImpl ? implementacionMes ?? undefined : undefined;
    // Solo el CKU que lleva Implementación: su Beneficio es lo cumplido ÷ la meta de Implementación y Ducafast Mesa 2.
    const ducafast = conImpl ? ducafastKpi : undefined;
    return calcPmMetrics(cku, s.ini, s.req, s.proj, s.projBoards, boardHealthMap, calMap, s.npsRecords, ckuDelays, ckuReproceso, KPI_W_CKU, undefined, confirmacionRoiCku ?? SIN_ROI, true, impl, clases, ducafast);
  }, [scopesMes, boardHealthMap, calMap, ckuDelays, ckuReproceso, confirmacionRoiCku, implementacionMes, clases, ducafastKpi]);

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
      </div>
      <PmScoreboard
        pms={ckus} ini={ini} req={req} proj={proj} projBoards={projBoards}
        boardHealthMap={boardHealthMap} calMap={calMap} npsRecords={npsRecords}
        delays={ckuDelays} reproceso={ckuReproceso}
        getRow={getRow} ckuBeneficio={ckuBeneficio} cargando={cargando} weights={KPI_W_CKU} nameHeader="CKU" label={(cku) => cku} subtitle={subtitle} ponderadoPorFuente
      />

      <h2 className="mb-3 mt-8 text-base font-semibold text-[var(--text-primary)]">{soloMio ? "Qué manejas" : "Qué maneja cada CKU"}</h2>
      {(() => {
        const tarjetas = (
      <div className="space-y-4">
        {ckus.map((cku) => (
          <CkuPortfolio
            key={cku} cku={cku}
            nIni={ini.filter((r) => sameCku(r.cku, cku) && cuentaEnPlayers(r)).length}
            nReq={req.filter((r) => sameCku(r.cku, cku)).length}
            nProj={projBoards.filter((b) => sameCku(b.cku, cku)).length}
          >
            <CkuMedicion
              scope={scopesMes.get(cku)!}
              mesLabel={mesActivo ? etiquetaMesLargo(mesActivo) : undefined}
              delays={ckuDelays} delaysOriginal={delays}
              reproceso={ckuReproceso} reprocesoOriginal={reproceso}
              clases={clases}
            />
          </CkuPortfolio>
        ))}
      </div>
        );
        return puedeEncuestaNps ? <CkuEncuestasProvider>{tarjetas}</CkuEncuestasProvider> : tarjetas;
      })()}
      </>)}
    </div>
  );
}

// Tarjeta de un CKU: su nombre, cuántas Iniciativas, PML y Proyectos maneja, y el detalle de qué se mide.
function CkuPortfolio({ cku, nIni, nReq, nProj, children }: {
  cku: string; nIni: number; nReq: number; nProj: number;
  /** El detalle de qué se mide (CkuMedicion). */
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
        <span className="text-[0.95rem] font-bold text-[var(--text-primary)]">{cku}</span>
        <span className="text-[0.75rem] text-[var(--text-muted)]">
          {nIni} Iniciativas · {nReq} PML · {nProj} Proyectos
        </span>
      </div>
      {children}
    </div>
  );
}
