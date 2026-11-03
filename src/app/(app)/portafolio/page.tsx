"use client";

// Dashboard de Portafolio: la salud, el avance, los hitos y los atrasos de todos los Proyectos y PML
// en una sola vista, filtrable por Tipo, PM, Clase y Unidad de Negocio. Toda la cuenta vive en
// lib/portafolio.ts (pura, con pruebas); la salud de cada proyecto es la del Control Tower
// (buildBoardMaps) y, sin filtros, el EVM es exactamente el «EVM · PMO» de allá. Lo que está en
// On Hold no cuenta (`data` ya viene sin eso); solo se muestra cuántos hay.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useData } from "@/context/DataContext";
import { authedFetch } from "@/lib/api";
import { fmtDate, fmtMoney, isoWeekNumber, today } from "@/lib/business";
import { RESPONSIBLE_COLOR } from "@/lib/delay";
import { EVM_WEIGHTS, FUENTE_EVM_LABEL, FUENTES_EVM, HEALTH_CFG, healthStatusFromIndex, vemCfg, weightedEvm, type HealthStatus } from "@/lib/health";
import { metaConfirmacionAcumulada, ratioConfirmacion } from "@/lib/kpi";
import { buildBoardMaps, listPMs } from "@/lib/players";
import { buildDelayRadar, buildPortfolioRows } from "@/lib/portfolioSummary";
import {
  actividadesPortafolio, atrasosAbiertos, avancePorProyecto, conteoGravedad, conteoSalud, curvaPlanReal, elementosPortafolio,
  fechaVigente, hayFiltroPortafolio, partesEvmPortafolio, pasaFiltros, proximosHitos, resumenGerencial, saludIniciativas,
  SIN_FILTROS_PORTAFOLIO, type ActividadPortafolio, type DimensionPortafolio, type FiltrosPortafolio,
  type Gravedad, type TipoPortafolio,
} from "@/lib/portafolio";
import MultiSelect, { type MSOption } from "@/components/MultiSelect";
import { ErrorBox, FilterReset, Loader } from "@/components/ui";
import type { DashboardData, WeeklySnapshotDoc } from "@/types";
import type { EnOnHold } from "@/lib/onHold";

const COLOR_TIPO: Record<TipoPortafolio, string> = { proyecto: "#38bdf8", pml: "#a78bfa" };
const FILTROS_TIPO: [FiltrosPortafolio["tipo"], string][] = [["todos", "Todos"], ["proyecto", "Proyectos"], ["pml", "PML"]];
const GRAVEDAD_CFG: Record<Gravedad, { label: string; color: string }> = {
  alta: { label: "Alta", color: "var(--bad)" },
  media: { label: "Media", color: "var(--warn)" },
  baja: { label: "Baja", color: "var(--info)" },
};
const SIN_DATOS_COLOR = "var(--text-muted)";
const etiquetaClase = (c: string) => (c === "Sin clasificar" ? c : `Clase ${c}`);
const TOOLTIP_STYLE = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-primary)" };

export default function PortafolioPage() {
  const { data, dataTodo, enPausa, loading, error } = useData();
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data || !dataTodo) return null;
  return <Portafolio data={data} dataTodo={dataTodo} enPausa={enPausa} />;
}

function Portafolio({ data, dataTodo, enPausa }: { data: DashboardData; dataTodo: DashboardData; enPausa: EnOnHold }) {
  const [hoy] = useState(today);
  const [filtros, setFiltros] = useState<FiltrosPortafolio>(SIN_FILTROS_PORTAFOLIO);
  const snapshots = useSnapshots();
  const confirmado = useConfirmacionRoi();

  // Todo lo que no depende de los filtros: salud de cada board, elementos y actividades.
  const { elementos, actividades, filasProyecto } = useMemo(() => {
    const { boardHealthMap } = buildBoardMaps(data.proj, data.projBoards, data.projItemBaselines);
    const elementos = elementosPortafolio(data, boardHealthMap);
    return {
      elementos,
      actividades: actividadesPortafolio(elementos, data.proj, data.req),
      filasProyecto: buildPortfolioRows(data.projBoards, data.proj, data.projItemBaselines),
    };
  }, [data]);

  // Lo que está en On Hold, con su PM, clase y Unidad de Negocio para poder filtrarlo igual.
  const pausados = useMemo(
    () => elementosPortafolio({ ...dataTodo, projBoards: enPausa.proyectos, req: enPausa.pml }, new Map()),
    [dataTodo, enPausa],
  );

  const visibles = elementos.filter((e) => pasaFiltros(e, filtros));
  const activos = visibles.filter((e) => !e.completo);
  const ids = new Set(visibles.map((e) => e.id));
  const acts = actividades.filter((a) => ids.has(a.elementoId));

  const salud = conteoSalud(visibles);
  const atrasos = atrasosAbiertos(acts, hoy);
  const gravedad = conteoGravedad(atrasos);
  const nOnHold = pausados.filter((e) => pasaFiltros(e, filtros)).length;

  // Iniciativas no tienen Tipo, Clase ni Unidad de Negocio: con esos filtros el EVM es solo de Proyectos y PML.
  const iniAplica = filtros.tipo === "todos" && !filtros.clase.length && !filtros.uNeg.length;
  const ini = iniAplica ? saludIniciativas(filtros.pm.length ? filtros.pm : listPMs(data.ini, data.req), data.ini, data.calMap) : null;
  const partes = partesEvmPortafolio(ini, visibles);
  const evm = weightedEvm(partes);

  const radar = buildDelayRadar(filasProyecto.filter((r) => ids.has(r.boardId)), data.projBoards, data.proj, data.atrasoDetalles);
  const resumen = resumenGerencial(visibles, acts, hoy);

  const opciones = (d: DimensionPortafolio): MSOption[] => {
    const base = elementos.filter((e) => !e.completo && pasaFiltros(e, filtros, d));
    return [...new Set(elementos.map((e) => e[d]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es"))
      .map((v) => ({ value: v, label: d === "clase" ? etiquetaClase(v) : v, count: base.filter((e) => e[d] === v).length }));
  };
  const toggle = (d: DimensionPortafolio) => (v: string, ch: boolean) =>
    setFiltros((f) => ({ ...f, [d]: ch ? [...f[d].filter((y) => y !== v), v] : f[d].filter((y) => y !== v) }));
  const limpiar = (d: DimensionPortafolio) => () => setFiltros((f) => ({ ...f, [d]: [] }));
  const hayFiltro = hayFiltroPortafolio(filtros);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-2.5">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Portafolio</h1>
        <span className="text-[0.82rem] text-[var(--text-muted)]">
          Visibilidad · Planificación · Seguimiento · datos al {fmtDate(data.fetchedAt)}
        </span>
      </div>
      <p className="mb-4 text-[0.82rem] text-[var(--text-muted)]">
        Proyectos y PML activos. La salud es la nota EVM de cada uno (On Track ≥ 95 %, At Risk ≥ 90 %); lo que está en On Hold no cuenta.
      </p>

      {/* ── Filtros ── */}
      <div className="mb-5 flex flex-wrap items-end gap-3.5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Tipo</span>
          <div role="group" aria-label="Filtrar por tipo" className="inline-flex rounded-lg border p-0.5" style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}>
            {FILTROS_TIPO.map(([v, label]) => (
              <button key={v} type="button" onClick={() => setFiltros((f) => ({ ...f, tipo: v }))} aria-pressed={filtros.tipo === v}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                style={filtros.tipo === v ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}>
                {v !== "todos" && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR_TIPO[v] }} />}
                {label}
              </button>
            ))}
          </div>
        </div>
        <MultiSelect label="PM" options={opciones("pm")} selected={filtros.pm} onToggle={toggle("pm")} onToggleAll={limpiar("pm")} />
        <MultiSelect label="Clase" options={opciones("clase")} selected={filtros.clase} onToggle={toggle("clase")} onToggleAll={limpiar("clase")} />
        <MultiSelect label="Unidad de Negocio" options={opciones("uNeg")} selected={filtros.uNeg} onToggle={toggle("uNeg")} onToggleAll={limpiar("uNeg")} />
        {hayFiltro && <FilterReset onClick={() => setFiltros(SIN_FILTROS_PORTAFOLIO)} />}
      </div>

      {/* ── Fila 1: KPI ── */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
        <Tile label="Activos" accent="var(--accent)" value={activos.length}
          sub={`${activos.filter((e) => e.tipo === "proyecto").length} proyectos · ${activos.filter((e) => e.tipo === "pml").length} PML`}>
          <div className="mt-1.5 flex flex-wrap gap-x-2 text-[0.68rem] font-semibold text-[var(--text-muted)]">
            {(["A", "B", "C", "Sin clasificar"] as const).map((c) => {
              const n = activos.filter((e) => e.clase === c).length;
              return n > 0 && <span key={c}>{c === "Sin clasificar" ? "S/C" : c} {n}</span>;
            })}
          </div>
        </Tile>
        <SaludTile estado="on-track" n={salud.onTrack} total={salud.total} />
        <SaludTile estado="in-risk" n={salud.inRisk} total={salud.total} />
        <SaludTile estado="off-track" n={salud.offTrack} total={salud.total} />
        <EvmTile evm={evm} filtrado={hayFiltro} snapshots={snapshots} />
        <Tile label="Atrasos abiertos" accent={atrasos.length ? "var(--bad)" : "var(--ok)"} value={atrasos.length} sub="actividades vencidas sin cerrar">
          <div className="mt-1.5 flex gap-1">
            {(["alta", "media", "baja"] as const).map((g) => (
              <span key={g} className="flex-1 rounded px-1 py-0.5 text-center text-[0.66rem] font-bold"
                style={{ background: `color-mix(in srgb, ${GRAVEDAD_CFG[g].color} 18%, transparent)`, color: "var(--text-primary)" }}
                title={g === "alta" ? "Más de 10 días hábiles" : g === "media" ? "De 5 a 10 días hábiles" : "Menos de 5 días hábiles"}>
                {gravedad[g]} {GRAVEDAD_CFG[g].label}
              </span>
            ))}
          </div>
        </Tile>
        <BeneficioTile confirmado={confirmado} snapshots={snapshots} />
      </div>

      {/* ── Fila 2: salud, plan vs real, entregables ── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DonutSalud salud={salud} onHold={nOnHold} completos={visibles.filter((e) => e.completo).length} />
        <CurvaPlanReal acts={acts} hoy={hoy} />
        <AvanceEntregables acts={acts} />
      </div>

      {/* ── Fila 3: próximos hitos, registro de atrasos, resumen ── */}
      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ProximosHitos acts={acts} hoy={hoy} />
        <ChartCard title="Registro de atrasos (Launch)" hint="Responsable y plan de acción de cada proyecto atrasado">
          {radar.length === 0 ? <Vacio msg="Ningún proyecto tiene atraso activo en Launch." /> : (
            <div className="table-wrap" style={{ maxHeight: 320 }}>
              <table className="pmo">
                <thead><tr><th>Proyecto</th><th>Días</th><th>Responsable</th><th>Plan de acción</th></tr></thead>
                <tbody>
                  {radar.map((r) => (
                    <tr key={r.boardId}>
                      <td><CodigoProyecto id={r.boardId} codigo={r.code} nombre={r.name} /></td>
                      <td className="whitespace-nowrap font-bold tabular-nums" style={{ color: "var(--bad)" }}>{r.diasAtraso} d</td>
                      <td className="whitespace-nowrap text-[0.75rem] font-semibold">
                        <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: RESPONSIBLE_COLOR[r.responsable] ?? SIN_DATOS_COLOR }} />
                        {r.responsable}
                      </td>
                      <td className="text-[0.75rem] text-[var(--text-secondary)]" style={{ minWidth: 180 }}>{r.actionItem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
        <ResumenCard resumen={resumen} />
      </div>

      {/* ── Fila 4: top atrasos y EVM por clase ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <TopAtrasos atrasos={atrasos} />
        <EvmPorClase partes={partes} iniAplica={iniAplica} />
      </div>
    </div>
  );
}

// ── Datos que vienen aparte ─────────────────────────────────────────────

/** Histórico semanal (para las mini gráficas); [] si falla o no hay. */
function useSnapshots(): WeeklySnapshotDoc[] {
  const [snaps, setSnaps] = useState<WeeklySnapshotDoc[]>([]);
  useEffect(() => {
    let vivo = true;
    authedFetch("/api/weekly-snapshots")
      .then((r) => (r.ok ? r.json() : []))
      .then((l: WeeklySnapshotDoc[]) => { if (vivo) setSnaps(l); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  return snaps;
}

/** Beneficio Confirmado vía ROI (fuente lenta): undefined cargando, null si falló. */
function useConfirmacionRoi(): number | null | undefined {
  const [v, setV] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    authedFetch("/api/dashboard/confirmacion-roi")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { confirmacionBenefit: number }) => { if (vivo) setV(d.confirmacionBenefit); })
      .catch(() => { if (vivo) setV(null); });
    return () => { vivo = false; };
  }, []);
  return v;
}

// ── Piezas ──────────────────────────────────────────────────────────────

function Tile({ label, value, sub, accent, children }: { label: string; value: ReactNode; sub?: string; accent: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <div style={{ height: 4, background: accent }} />
      <div className="flex flex-1 flex-col px-3.5 py-3">
        <div className="text-[0.66rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
        <div className="mt-1 text-[1.7rem] font-extrabold leading-none text-[var(--text-primary)] tabular-nums">{value}</div>
        {sub && <div className="mt-1 text-[0.7rem] text-[var(--text-secondary)]">{sub}</div>}
        {children}
      </div>
    </div>
  );
}

function SaludTile({ estado, n, total }: { estado: HealthStatus; n: number; total: number }) {
  const cfg = HEALTH_CFG[estado];
  return (
    <Tile label={cfg.label} accent={cfg.color} value={<span>{n} <span aria-hidden className="text-[1rem]" style={{ color: cfg.color }}>{cfg.icon}</span></span>}
      sub={total ? `${Math.round((n / total) * 100)} % de los activos` : undefined}>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
        <div className="h-full rounded-full" style={{ width: total ? `${(n / total) * 100}%` : 0, background: cfg.color }} />
      </div>
    </Tile>
  );
}

/** Media dona con la nota EVM; sin filtros, la mini gráfica del histórico semanal. */
function EvmTile({ evm, filtrado, snapshots }: { evm: number | null; filtrado: boolean; snapshots: WeeklySnapshotDoc[] }) {
  const pct = evm !== null ? Math.round(evm * 100) : null;
  const estado = healthStatusFromIndex(evm);
  const color = estado ? HEALTH_CFG[estado].color : SIN_DATOS_COLOR;
  const arco = [{ v: Math.min(pct ?? 0, 100) }, { v: 100 - Math.min(pct ?? 0, 100) }];
  return (
    <Tile label="Avance EVM" accent={color} value="" sub={filtrado ? "de lo filtrado" : "EVM · PMO del portafolio"}>
      <div className="relative -mt-6" style={{ height: 78 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={arco} dataKey="v" startAngle={180} endAngle={0} cy="92%" innerRadius="125%" outerRadius="165%" stroke="none" isAnimationActive={false}>
              <Cell fill={color} />
              <Cell fill="var(--bg-hover)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center text-[1.45rem] font-extrabold leading-none tabular-nums" style={{ color }}>
          {pct !== null ? `${pct}%` : "—"}
        </div>
      </div>
      {!filtrado && <Sparkline snapshots={snapshots} campo="evm" color={color} fmt={(v) => `${Math.round(v)}%`} />}
    </Tile>
  );
}

function BeneficioTile({ confirmado, snapshots }: { confirmado: number | null | undefined; snapshots: WeeklySnapshotDoc[] }) {
  const meta = metaConfirmacionAcumulada();
  const ratio = confirmado != null ? ratioConfirmacion(confirmado) : null;
  const color = ratio === null ? SIN_DATOS_COLOR : ratio >= 1 ? "var(--ok)" : ratio >= 0.8 ? "var(--warn)" : "var(--bad)";
  return (
    <Tile label="Beneficio confirmado" accent={color}
      value={<span className="text-[1.25rem]">{confirmado === undefined ? "…" : confirmado === null ? "N/D" : fmtMoney(confirmado)}</span>}
      sub={ratio !== null ? `${Math.round(ratio * 100)} % de la meta a la fecha (${fmtMoney(meta)})` : confirmado === null ? "No se pudo leer el ROI" : "Leyendo el ROI…"}>
      <Sparkline snapshots={snapshots} campo="beneficioConfirmado" color="var(--ok)" fmt={fmtMoney} />
      <div className="mt-0.5 text-[0.62rem] text-[var(--text-muted)]">Portafolio completo, sin filtros</div>
    </Tile>
  );
}

function Sparkline({ snapshots, campo, color, fmt }: {
  snapshots: WeeklySnapshotDoc[]; campo: "evm" | "beneficioConfirmado"; color: string; fmt: (v: number) => string;
}) {
  const puntos = snapshots.slice(-12).map((s) => ({ semana: s.weekOf, v: s[campo] }));
  if (puntos.filter((p) => p.v != null).length < 2) return null;
  return (
    <div className="mt-1.5" style={{ height: 30 }} aria-label="Últimas semanas">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={puntos} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [fmt(Number(v)), ""]} labelFormatter={(l) => `Semana del ${l}`} separator="" />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <div className="text-[0.88rem] font-bold text-[var(--text-primary)]">{title}</div>
      {hint && <div className="mb-3 text-[0.72rem] text-[var(--text-muted)]">{hint}</div>}
      {children}
    </div>
  );
}

const Vacio = ({ msg }: { msg: string }) => <p className="py-8 text-center text-[0.8rem] text-[var(--text-muted)]">{msg}</p>;

/** Código de un proyecto con enlace a su Status Card; un PML solo muestra su ID. */
function CodigoProyecto({ id, codigo, nombre, tipo = "proyecto" }: { id: string; codigo: string; nombre: string; tipo?: TipoPortafolio }) {
  return (
    <div className="flex flex-col" style={{ maxWidth: 220 }}>
      {tipo === "proyecto" ? (
        <Link href={`/resumen-ejecutivo?board=${id}`} className="text-[0.68rem] font-bold uppercase tracking-wide hover:underline" style={{ color: "var(--accent-light)" }}>{codigo}</Link>
      ) : (
        <span className="text-[0.68rem] font-bold uppercase tracking-wide" style={{ color: COLOR_TIPO.pml }}>{codigo}</span>
      )}
      <span className="truncate text-[0.75rem]" title={nombre}>{nombre}</span>
    </div>
  );
}

// ── Fila 2 ──────────────────────────────────────────────────────────────

function DonutSalud({ salud, onHold, completos }: { salud: ReturnType<typeof conteoSalud>; onHold: number; completos: number }) {
  const rebanadas = [
    { key: "on-track", label: HEALTH_CFG["on-track"].label, n: salud.onTrack, color: HEALTH_CFG["on-track"].color },
    { key: "in-risk", label: HEALTH_CFG["in-risk"].label, n: salud.inRisk, color: HEALTH_CFG["in-risk"].color },
    { key: "off-track", label: HEALTH_CFG["off-track"].label, n: salud.offTrack, color: HEALTH_CFG["off-track"].color },
    { key: "sin", label: "Sin datos", n: salud.sinDatos, color: SIN_DATOS_COLOR },
  ];
  const conValor = rebanadas.filter((r) => r.n > 0);
  return (
    <ChartCard title="Salud del portafolio" hint="Proyectos y PML activos por estado">
      {salud.total === 0 ? <Vacio msg="No hay nada activo con estos filtros." /> : (
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative" style={{ width: 170, height: 170 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={conValor} dataKey="n" nameKey="label" innerRadius="62%" outerRadius="92%" paddingAngle={conValor.length > 1 ? 2 : 0}
                  cornerRadius={4} stroke="var(--bg-surface)" strokeWidth={2} isAnimationActive={false}>
                  {conValor.map((r) => <Cell key={r.key} fill={r.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[1.8rem] font-extrabold leading-none text-[var(--text-primary)]">{salud.total}</span>
              <span className="text-[0.66rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">activos</span>
            </div>
          </div>
          <div className="flex min-w-[150px] flex-1 flex-col gap-1.5 text-[0.78rem]">
            {rebanadas.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.label}
                </span>
                <span className="font-bold tabular-nums text-[var(--text-primary)]">
                  {r.n} <span className="font-normal text-[var(--text-muted)]">· {Math.round((r.n / salud.total) * 100)}%</span>
                </span>
              </div>
            ))}
            <div className="mt-1 border-t pt-1.5 text-[0.72rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
              Fuera de la gráfica: {onHold} en On Hold · {completos} proyecto{completos === 1 ? "" : "s"} completo{completos === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function CurvaPlanReal({ acts, hoy }: { acts: ActividadPortafolio[]; hoy: Date }) {
  const puntos = curvaPlanReal(acts, hoy).map((p) => ({ ...p, label: `S${isoWeekNumber(p.semana)}` }));
  const ultimo = [...puntos].reverse().find((p) => p.real !== null);
  return (
    <ChartCard title="Avance real vs plan" hint="% acumulado de actividades de proyectos: cerradas vs. las que ya debían estar cerradas">
      {puntos.length === 0 ? <Vacio msg="No hay actividades con fecha." /> : (
        <>
          {ultimo && (
            <div className="mb-1 text-[0.75rem] text-[var(--text-secondary)]">
              Esta semana: <b className="text-[var(--text-primary)]">{ultimo.real}%</b> real vs <b className="text-[var(--text-primary)]">{ultimo.plan}%</b> plan
              {ultimo.real! < ultimo.plan && <span style={{ color: "var(--bad)" }}> · brecha {Math.round((ultimo.plan - ultimo.real!) * 10) / 10} pts</span>}
            </div>
          )}
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={puntos} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [v == null ? "—" : `${v}%`, n]} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
              <Line name="Plan" type="monotone" dataKey="plan" stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              <Line name="Real" type="monotone" dataKey="real" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--accent)" }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </ChartCard>
  );
}

const SERIES_AVANCE = [
  { key: "done", label: "Done", color: "var(--ok)" },
  { key: "enCurso", label: "En curso", color: "var(--info)" },
  { key: "pendientes", label: "Pendiente", color: "var(--text-disabled)" },
  { key: "atrasadas", label: "Atrasada", color: "var(--bad)" },
] as const;

function AvanceEntregables({ acts }: { acts: ActividadPortafolio[] }) {
  const filas = avancePorProyecto(acts).map((p) => ({ ...p, label: p.codigo }));
  return (
    <ChartCard title="Hitos y entregables" hint="Actividades de cada proyecto activo por estado">
      {filas.length === 0 ? <Vacio msg="No hay proyectos activos con estos filtros." /> : (
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          <ResponsiveContainer width="100%" height={Math.max(filas.length * 26 + 40, 140)}>
            <BarChart data={filas} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap={5}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" width={62} tick={{ fontSize: 10, fill: "var(--text-secondary)", fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--bg-hover)" }}
                labelFormatter={(_, p) => { const f = p?.[0]?.payload as (typeof filas)[number] | undefined; return f ? `${f.codigo} · ${f.nombre}` : ""; }} />
              <Legend verticalAlign="top" align="left" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingBottom: 6 }} />
              {SERIES_AVANCE.map((s, i) => (
                <Bar key={s.key} name={s.label} dataKey={s.key} stackId="a" fill={s.color} stroke="var(--bg-surface)" strokeWidth={1}
                  radius={i === SERIES_AVANCE.length - 1 ? [0, 4, 4, 0] : 0} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

// ── Fila 3 ──────────────────────────────────────────────────────────────

function ProximosHitos({ acts, hoy }: { acts: ActividadPortafolio[]; hoy: Date }) {
  const lista = proximosHitos(acts, hoy);
  return (
    <ChartCard title="Próximos hitos" hint="Lo que vence en los próximos 14 días, por fecha">
      {lista.length === 0 ? <Vacio msg="Nada vence en los próximos 14 días." /> : (
        <div className="table-wrap" style={{ maxHeight: 320 }}>
          <table className="pmo">
            <thead><tr><th>Proyecto / PML</th><th>Fase</th><th>Actividad</th><th>Fecha</th><th>Status</th></tr></thead>
            <tbody>
              {lista.map((a) => (
                <tr key={`${a.elementoId}:${a.id}`}>
                  <td><CodigoProyecto id={a.elementoId} codigo={a.codigo} nombre={a.elemento} tipo={a.tipo} /></td>
                  <td className="whitespace-nowrap text-[0.72rem] text-[var(--text-secondary)]">{a.fase}</td>
                  <td className="text-[0.75rem]" style={{ minWidth: 140 }}>
                    {a.nombre}
                    {a.responsable && <div className="text-[0.66rem] text-[var(--text-muted)]">{a.responsable}</div>}
                  </td>
                  <td className="whitespace-nowrap text-[0.72rem] tabular-nums">
                    {fmtDate(fechaVigente(a))}
                    {a.nuevaFecha && a.limite && <div className="text-[0.64rem] text-[var(--text-muted)] line-through">{fmtDate(a.limite)}</div>}
                  </td>
                  <td className="whitespace-nowrap text-[0.72rem] text-[var(--text-secondary)]">{a.estado === "PARA HOY" ? "Para hoy" : a.status || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

function Punto({ icono, titulo, children }: { icono: string; titulo: string; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-0.5 text-[0.95rem]">{icono}</span>
      <div>
        <div className="text-[0.78rem] font-bold text-[var(--text-primary)]">{titulo}</div>
        <div className="text-[0.75rem] text-[var(--text-secondary)]">{children}</div>
      </div>
    </li>
  );
}

function ResumenCard({ resumen }: { resumen: ReturnType<typeof resumenGerencial> }) {
  const { logros, riesgos, decisiones, foco } = resumen;
  return (
    <ChartCard title="Resumen gerencial" hint="Se arma solo con los datos de hoy">
      <ul className="flex flex-col gap-3">
        <Punto icono="🏁" titulo="Logros de la semana">
          {logros.cerradas === 0 ? "No se cerró ninguna actividad en los últimos 7 días." : (
            <>{logros.cerradas} actividad{logros.cerradas === 1 ? "" : "es"} cerrada{logros.cerradas === 1 ? "" : "s"}
              {logros.top.length > 0 && <> · sobre todo en {logros.top.map((t) => `${t.codigo} (${t.n})`).join(", ")}</>}.</>
          )}
        </Punto>
        <Punto icono="⚠" titulo="Mayores riesgos">
          {riesgos.length === 0 ? "Nada activo está At Risk ni Off Track." : riesgos.map((e) => (
            <span key={e.id} className="mr-2 inline-block">
              <b style={{ color: e.salud ? HEALTH_CFG[e.salud].color : undefined }}>{e.codigo}</b> {e.healthIndex !== null ? `${Math.round(e.healthIndex * 100)}%` : ""}
            </span>
          ))}
        </Punto>
        <Punto icono="🗳" titulo="Esperan decisión (Aprobación)">
          {decisiones.length === 0 ? "Nada en Aprobación." : (
            <>{decisiones.length}: {decisiones.slice(0, 6).map((e) => e.codigo).join(", ")}{decisiones.length > 6 ? "…" : ""}</>
          )}
        </Punto>
        <Punto icono="🎯" titulo="Foco de la próxima semana">
          {foco === 0 ? "Nada vence en los próximos 7 días." : `${foco} actividad${foco === 1 ? "" : "es"} vence${foco === 1 ? "" : "n"} en los próximos 7 días.`}
        </Punto>
      </ul>
    </ChartCard>
  );
}

// ── Fila 4 ──────────────────────────────────────────────────────────────

function TopAtrasos({ atrasos }: { atrasos: ReturnType<typeof atrasosAbiertos> }) {
  const top = atrasos.slice(0, 12);
  return (
    <ChartCard title="Top atrasos" hint={`Las actividades abiertas más atrasadas${atrasos.length > top.length ? ` (12 de ${atrasos.length})` : ""}`}>
      {top.length === 0 ? <Vacio msg="No hay actividades atrasadas." /> : (
        <div className="table-wrap" style={{ maxHeight: 360 }}>
          <table className="pmo">
            <thead><tr><th>Proyecto / PML</th><th>Fase</th><th>Actividad</th><th>Responsable</th><th>Limit Date</th><th>Atraso</th><th>Gravedad</th></tr></thead>
            <tbody>
              {top.map((a) => (
                <tr key={`${a.elementoId}:${a.id}`}>
                  <td><CodigoProyecto id={a.elementoId} codigo={a.codigo} nombre={a.elemento} tipo={a.tipo} /></td>
                  <td className="whitespace-nowrap text-[0.72rem] text-[var(--text-secondary)]">{a.fase}</td>
                  <td className="text-[0.75rem]" style={{ minWidth: 160 }}>{a.nombre}</td>
                  <td className="whitespace-nowrap text-[0.72rem] text-[var(--text-secondary)]">{a.responsable || "—"}</td>
                  <td className="whitespace-nowrap text-[0.72rem] tabular-nums">{fmtDate(a.limite)}</td>
                  <td className="whitespace-nowrap font-bold tabular-nums text-[var(--text-primary)]">{a.dias} d</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.72rem] font-semibold">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: GRAVEDAD_CFG[a.gravedad].color }} />
                      {GRAVEDAD_CFG[a.gravedad].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

function EvmPorClase({ partes, iniAplica }: { partes: ReturnType<typeof partesEvmPortafolio>; iniAplica: boolean }) {
  const filas = FUENTES_EVM
    .filter((f) => partes[f] !== null)
    .map((f) => ({ label: `${FUENTE_EVM_LABEL[f]} · ${Math.round(EVM_WEIGHTS[f] * 100)}%`, pct: Math.round((partes[f] as number) * 100) }));
  return (
    <ChartCard title="EVM por Clase" hint="Nota de cada fuente y su peso en el EVM">
      {filas.length === 0 ? <Vacio msg="Sin notas EVM con estos filtros." /> : (
        <>
          <ResponsiveContainer width="100%" height={filas.length * 44 + 10}>
            <BarChart data={filas} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
              <XAxis type="number" hide domain={[0, 100]} />
              <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11, fill: "var(--text-secondary)", fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--bg-hover)" }} formatter={(v) => [`${v}%`, "EVM"]} />
              <Bar dataKey="pct" barSize={16} radius={[0, 4, 4, 0]} background={{ fill: "var(--bg-hover)", radius: 4 }} isAnimationActive={false}>
                {filas.map((f) => <Cell key={f.label} fill={vemCfg(f.pct / 100).color} />)}
                <LabelList dataKey="pct" position="right" formatter={(v) => `${v}%`} style={{ fill: "var(--text-primary)", fontSize: 12, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {!iniAplica && <p className="mt-1 text-[0.68rem] text-[var(--text-muted)]">Con filtro de Tipo, Clase o Unidad de Negocio no cuentan las Iniciativas.</p>}
        </>
      )}
    </ChartCard>
  );
}
