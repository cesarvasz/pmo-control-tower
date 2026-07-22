"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useData } from "@/context/DataContext";
import { businessDays, fmtDate } from "@/lib/business";
import { HEALTH_CFG } from "@/lib/health";
import {
  INI_ACTIVE_STS,
  INI_LIMITS,
  INI_SEC_LABEL,
  INI_SEC_ORDER,
  calcIniPMHealth,
  iniItemStatus,
  iniIsParaHoy,
  nextOrLatest,
  porDefinirDias,
  porDefinirStatus,
} from "@/lib/ini";
import type { CalMap, CalMeeting, IniItem } from "@/types";
import MultiSelect from "@/components/MultiSelect";
import { EmptyRow, ErrorBox, FilterReset, Loader, Pill, StatCard, type Tone } from "@/components/ui";

const VISIBLE_SECTIONS = new Set(["New", "Meeting 1"]);
const estadoOrder = (e: string) =>
  ({ ATRASADO: 0, "PARA HOY": 1, "EN TIEMPO": 2, APROBADA: 3, SKIP: 4 } as Record<string, number>)[e] ?? 99;

export default function IniciativasPage() {
  return (
    <Suspense fallback={<Loader />}>
      <IniciativasInner />
    </Suspense>
  );
}

function IniciativasInner() {
  const sp = useSearchParams();
  const { data, loading, error } = useData();
  const [pms, setPms] = useState<string[]>(() => {
    const pm = sp.get("pm");
    return pm ? [pm] : [];
  });
  const [statuses, setStatuses] = useState<string[]>([]);
  const [estado, setEstado] = useState("");
  const [sinAgendar, setSinAgendar] = useState(false);

  const iniData = data?.ini ?? [];
  const calMap: CalMap = data?.calMap ?? new Map();

  const getFiltered = (p: string[], s: string[], est: string, sa: boolean) =>
    iniData.filter((r) => {
      if (r.estado === "SKIP" || r.estado === "PLAN_FUTURO" || r.estado === "POR_DEFINIR" || r.estado === "CAMBIO_ESTRATEGIA") return false;
      if (p.length && !p.includes(r.pm)) return false;
      if (s.length && !s.includes(r.status)) return false;
      if (est) {
        if (est === "PARA HOY") { if (!iniIsParaHoy(r, calMap)) return false; }
        else if (r.estado !== est) return false;
      }
      if (sa) {
        if (!INI_ACTIVE_STS.has(r.status)) return false;
        const cal = calMap.get(r.id) || { M1: [], M2: [] };
        const type = r.status === "New" ? "M1" : "M2";
        if (cal[type].length > 0) return false;
      }
      return true;
    });

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const filtered = getFiltered(pms, statuses, estado, sinAgendar);
  const base = getFiltered(pms, statuses, "", false);
  const planFuturoItems = iniData.filter((r) => {
    if (r.estado !== "PLAN_FUTURO") return false;
    if (pms.length && !pms.includes(r.pm)) return false;
    return true;
  });
  const porDefinirItems = iniData.filter((r) => {
    if (r.estado !== "POR_DEFINIR") return false;
    if (pms.length && !pms.includes(r.pm)) return false;
    return true;
  });
  const cambioEstrategiaItems = iniData.filter((r) => {
    if (r.estado !== "CAMBIO_ESTRATEGIA") return false;
    if (pms.length && !pms.includes(r.pm)) return false;
    return true;
  });

  // ── Cards ──
  const atrasadas = base.filter((r) => r.estado === "ATRASADO").length;
  const paraHoy = base.filter((r) => iniIsParaHoy(r, calMap)).length;
  const enTiempo = base.filter((r) => r.estado === "EN TIEMPO" && !iniIsParaHoy(r, calMap)).length;
  const enProceso = base.filter((r) => INI_ACTIVE_STS.has(r.status)).length;
  const sinAgendarCount = getFiltered(pms, statuses, "", true).length;

  const toggleEstado = (e: string) => { setEstado((c) => (c === e ? "" : e)); setSinAgendar(false); };
  const toggleSinAgendar = () => { setSinAgendar((v) => !v); setEstado(""); };
  const reset = () => { setPms([]); setStatuses([]); setEstado(""); setSinAgendar(false); };

  // ── Filtros ──
  const allPMs = [...new Set(iniData.filter((r) => r.estado !== "SKIP" && r.pm).map((r) => r.pm))].sort();
  const allSts = INI_SEC_ORDER.filter((s) => iniData.some((r) => r.status === s));
  const pmOpts = allPMs.map((pm) => ({ value: pm, label: pm, count: getFiltered([pm], statuses, estado, false).length }));
  const stOpts = allSts.map((s) => ({ value: s, label: INI_SEC_LABEL[s] || s, count: getFiltered(pms, [s], estado, false).length }));
  const anyFilter = pms.length > 0 || statuses.length > 0 || estado !== "";

  // ── Secciones ──
  const byStatus: Record<string, IniItem[]> = {};
  filtered.forEach((r) => { (byStatus[r.status] ??= []).push(r); });
  const sections = INI_SEC_ORDER.filter((s) => byStatus[s]?.length && VISIBLE_SECTIONS.has(s));

  return (
    <div>
      {/* Filtros */}
      <div className="mb-7 flex flex-wrap items-end gap-3.5">
        <MultiSelect label="PM" options={pmOpts} selected={pms} onToggle={(v, ch) => setPms((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setPms([])} />
        <MultiSelect label="Status" options={stOpts} selected={statuses} onToggle={(v, ch) => setStatuses((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))} onToggleAll={() => setStatuses([])} />
        {anyFilter && <FilterReset onClick={reset} />}
      </div>

      {/* Cards */}
      <div className="mb-7 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard value={enProceso} label="En Proceso" />
        <StatCard value={atrasadas} label="Atrasadas" color="#ef4444" borderColor="#ef4444" active={estado === "ATRASADO"} onClick={() => toggleEstado("ATRASADO")} />
        <StatCard value={paraHoy} label="Para Hoy" color="#f59e0b" borderColor="#f59e0b" active={estado === "PARA HOY"} onClick={() => toggleEstado("PARA HOY")} />
        <StatCard value={enTiempo} label="En Tiempo" color="#10b981" borderColor="#10b981" active={estado === "EN TIEMPO"} onClick={() => toggleEstado("EN TIEMPO")} />
        <StatCard value={planFuturoItems.length} label="Plan Futuro" color="#6c63ff" borderColor="#6c63ff" />
        <StatCard value={sinAgendarCount} label="Sin Agendar" color="#f59e0b" borderColor="#f59e0b" active={sinAgendar} onClick={toggleSinAgendar} />
      </div>

      {/* PM Health */}
      <PMHealth iniData={iniData} calMap={calMap} selectedPm={pms.length === 1 ? pms[0] : null} onSelect={(pm) => setPms((cur) => (cur.length === 1 && cur[0] === pm ? [] : [pm]))} />

      {/* Secciones activas */}
      {sections.length === 0 && planFuturoItems.length === 0 && porDefinirItems.length === 0 && cambioEstrategiaItems.length === 0 ? (
        <EmptyRow />
      ) : (
        sections.map((s) => (
          <IniSection key={s} status={s} rows={byStatus[s]} calMap={calMap} />
        ))
      )}

      {/* Por Definir (Meeting 2) */}
      <PorDefinirSection items={porDefinirItems} />

      {/* Plan Futuro */}
      <PlanFuturoSection items={planFuturoItems} />

      {/* Cambio Estrategia */}
      <CambioEstrategiaSection items={cambioEstrategiaItems} />
    </div>
  );
}

// ── PM Health ──────────────────────────────────────────────────────────

function PMHealth({ iniData, calMap, selectedPm, onSelect }: {
  iniData: IniItem[];
  calMap: CalMap;
  selectedPm: string | null;
  onSelect: (pm: string) => void;
}) {
  const pms = [...new Set(iniData.filter((r) => r.pm && r.estado !== "SKIP").map((r) => r.pm))].sort();
  return (
    <div className="mb-7 flex flex-wrap gap-4">
      {pms.map((pm) => {
        const h = calcIniPMHealth(pm, iniData, calMap);
        const c = HEALTH_CFG[h.status];
        const active = selectedPm === pm;
        return (
          <div
            key={pm}
            onClick={() => onSelect(pm)}
            className="flex min-w-[220px] flex-1 cursor-pointer flex-col gap-1.5 rounded-xl border-2 p-[18px] transition-transform hover:-translate-y-0.5"
            style={{ background: "var(--bg-surface)", borderColor: c.color, boxShadow: active ? "0 0 0 3px var(--accent)" : undefined }}
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <div className="text-[0.9rem] font-semibold text-[var(--text-primary)]">{pm}</div>
              <div className="text-right">
                <div className="text-[1.4rem] font-bold leading-none text-[var(--text-primary)]">{h.total}</div>
                <div className="text-[0.65rem] text-[var(--text-muted)]">total</div>
              </div>
            </div>
            <span className="w-fit rounded-full px-3 py-1 text-[0.78rem] font-bold" style={{ color: c.color, background: c.bg }}>{c.icon} {c.label} · {Math.round(h.index * 100)}%</span>
            <div className="text-[0.75rem] text-[var(--text-muted)]">
              {h.onTrack} on track · {h.inRisk} in risk · {h.offTrack} off track
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Sección por status ─────────────────────────────────────────────────
function CalCell({ arr }: { arr: CalMeeting[] }) {
  const m = nextOrLatest(arr);
  if (!m) return <span className="text-[var(--text-disabled)]">—</span>;
  const now = new Date();
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const mDay = new Date(m.inicio); mDay.setHours(0, 0, 0, 0);
  const isPast = m.inicio < now;
  const today = mDay.getTime() === today0.getTime();
  const color = isPast ? "var(--text-disabled)" : today ? "var(--warn)" : "var(--ok)";
  const dateStr = m.inicio.toLocaleDateString("es-GT", { day: "2-digit", month: "short" });
  const timeStr = m.inicio.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit", hour12: false });
  return <span style={{ color, fontWeight: 600, whiteSpace: "nowrap", fontSize: ".8rem" }}>{isPast ? "✓" : "📅"} {dateStr} {timeStr}</span>;
}

function mondayDateCell(v: string | undefined) {
  if (!v) return <span className="text-[var(--text-disabled)]">—</span>;
  const d = new Date(v); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const color = d < t ? "var(--text-disabled)" : d.getTime() === t.getTime() ? "var(--warn)" : "var(--ok)";
  return <span style={{ color, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(d)}</span>;
}

const ROW_PILL: Record<string, [Tone, string]> = {
  ATRASADO: ["bad", "✕ Off Track"],
  "PARA HOY": ["warn", "⚠ At Risk"],
  "EN TIEMPO": ["ok", "✓ On Track"],
  APROBADA: ["info", "✓ Aprobada"],
  SKIP: ["neutral", "— N/A"],
};

// Pill según el estado de salud (incluye At Risk / Off Track por falta de reunión).
const HEALTH_PILL: Record<string, [Tone, string]> = {
  "on-track":  ["ok",   "✓ On Track"],
  "in-risk":   ["warn", "⚠ At Risk"],
  "off-track": ["bad",  "✕ Off Track"],
};

function IniSection({ status, rows, calMap }: { status: string; rows: IniItem[]; calMap: CalMap }) {
  const limite = INI_LIMITS[status];
  const label = INI_SEC_LABEL[status] || status;
  const calType = status === "New" ? "M1" : status === "Meeting 1" ? "M2" : null;
  const isEspera = status === "Sin Valor Def";
  const atrasados = rows.filter((r) => r.estado === "ATRASADO").length;
  const t = new Date(); t.setHours(0, 0, 0, 0);

  const sorted = [...rows].sort((a, b) => estadoOrder(a.estado) - estadoOrder(b.estado) || (b.dias || 0) - (a.dias || 0));

  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">{label}</h2>
        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]">{rows.length} items</span>
        <span className="rounded-full border px-2 py-0.5 text-[0.72rem] text-[var(--text-muted)]" style={{ background: "var(--code-bg)", borderColor: "var(--code-border)" }}>
          {limite ? `Límite: ${limite} días hábiles desde creación` : "Sin límite de tiempo"}
        </span>
        {atrasados > 0 && <Pill tone="bad" small>{atrasados} atrasado{atrasados > 1 ? "s" : ""}</Pill>}
      </div>
      <div className="table-wrap">
        <table className="pmo">
          <thead>
            <tr>
              <th>ID</th><th>Iniciativa</th><th>PM</th>
              {calType ? (
                <>
                  <th>Creacion</th><th>Deadline</th><th>Diferencia</th><th>Agendado</th><th>Días Háb. / Límite</th>
                </>
              ) : isEspera ? (
                <>
                  <th>Creacion</th><th>Espera</th>
                </>
              ) : (
                <>
                  <th>Creacion</th><th>Meet 1</th><th>Meet 2</th>
                </>
              )}
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              // Con base de cálculo: el pill sigue el estado de salud (On Track / At Risk / Off Track).
              // Sin fecha: cae al pill por estado.
              const [ptone, plbl] = r.dias === null
                ? ROW_PILL[r.estado] ?? (["neutral", r.estado] as [Tone, string])
                : HEALTH_PILL[iniItemStatus(r, calMap)] ?? (["neutral", "—"] as [Tone, string]);
              const pct = r.dias !== null && r.limite ? Math.min((r.dias / r.limite) * 100, 100) : 0;
              const bc = pct > 100 ? "var(--bad)" : pct >= 80 ? "var(--warn)" : "var(--ok)";
              const cal = calMap.get(r.id) || { M1: [], M2: [] };
              return (
                <tr key={r.id || r.name}>
                  <td className="ini-id">{r.id || "—"}</td>
                  <td className="ini-name">{r.name}</td>
                  <td className="pm-name">{r.pm || <span className="text-[var(--text-disabled)]">—</span>}</td>
                  <td style={{ whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{r.creacion ? fmtDate(r.creacion) : "—"}</td>
                  {calType ? (
                    <>
                      <td>{deadlineCell(r, t)}</td>
                      <td>{diffCell(r, t)}</td>
                      <td><CalCell arr={cal[calType]} /></td>
                      <td>
                        {r.dias !== null && r.limite ? (
                          <div className="flex items-center gap-2">
                            <span style={{ minWidth: 28, fontWeight: 600 }}>{r.dias}</span>
                            <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%`, background: bc }} /></div>
                            <span style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>{r.limite}</span>
                          </div>
                        ) : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                    </>
                  ) : isEspera ? (
                    <td>{mondayDateCell(r.espera)}</td>
                  ) : (
                    <>
                      <td>{mondayDateCell(r.meet1)}</td>
                      <td>{mondayDateCell(r.meet2)}</td>
                    </>
                  )}
                  <td><Pill tone={ptone}>{plbl}</Pill></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function deadlineCell(r: IniItem, t: Date) {
  if (!r.deadline) return <span className="text-[var(--text-disabled)]">—</span>;
  const color = r.deadline < t ? "var(--bad)" : r.deadline.getTime() === t.getTime() ? "var(--warn)" : "var(--ok)";
  return <span style={{ color, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(r.deadline)}</span>;
}

function diffCell(r: IniItem, t: Date) {
  if (!r.deadline) return <span className="text-[var(--text-disabled)]">—</span>;
  const d = new Date(r.deadline); d.setHours(0, 0, 0, 0);
  if (d.getTime() === t.getTime()) return <span style={{ color: "var(--warn)", fontWeight: 600 }}>Hoy</span>;
  if (d > t) { const n = businessDays(t, d, true); return <span style={{ color: "var(--ok)", fontWeight: 600 }}>+{n} día{n !== 1 ? "s" : ""}</span>; }
  const n = businessDays(d, t, true); return <span style={{ color: "var(--bad)", fontWeight: 600 }}>-{n} día{n !== 1 ? "s" : ""}</span>;
}

function pfDateCell(date: Date | null | undefined, t: Date) {
  if (!date) return <span className="text-[var(--text-disabled)]">—</span>;
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const color = d < t ? "var(--bad)" : d.getTime() === t.getTime() ? "var(--warn)" : "var(--ok)";
  return <span style={{ color, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(d)}</span>;
}

function porDefinirDiffCell(dias: number | null) {
  if (dias === null) return <span className="text-[var(--text-disabled)]">—</span>;
  if (dias === 0) return <span style={{ color: "var(--warn)", fontWeight: 600 }}>Hoy</span>;
  if (dias < 0) { const n = -dias; return <span style={{ color: "var(--ok)", fontWeight: 600 }}>en {n} día{n !== 1 ? "s" : ""}</span>; }
  const color = dias > 1 ? "var(--bad)" : "var(--ok)";
  return <span style={{ color, fontWeight: 600 }}>hace {dias} día{dias !== 1 ? "s" : ""}</span>;
}

function PorDefinirSection({ items }: { items: IniItem[] }) {
  if (items.length === 0) return null;
  const offTrack = items.filter((r) => porDefinirStatus(r) === "off-track").length;
  const sorted = [...items].sort((a, b) => (porDefinirDias(b) ?? -Infinity) - (porDefinirDias(a) ?? -Infinity));
  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Por Definir</h2>
        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]">{items.length} items</span>
        <span className="rounded-full border px-2 py-0.5 text-[0.72rem] text-[var(--text-muted)]" style={{ background: "var(--code-bg)", borderColor: "var(--code-border)" }}>
          Off track si pasó más de 1 día desde Meet 2
        </span>
        {offTrack > 0 && <Pill tone="bad" small>{offTrack} off track</Pill>}
      </div>
      <div className="table-wrap">
        <table className="pmo">
          <thead>
            <tr>
              <th>ID</th><th>Iniciativa</th><th>PM</th><th>Meet 2</th><th>Diferencia</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const [ptone, plbl] = HEALTH_PILL[porDefinirStatus(r)];
              return (
                <tr key={r.id || r.name}>
                  <td className="ini-id">{r.id || "—"}</td>
                  <td className="ini-name">{r.name}</td>
                  <td className="pm-name">{r.pm || <span className="text-[var(--text-disabled)]">—</span>}</td>
                  <td>{mondayDateCell(r.meet2)}</td>
                  <td>{porDefinirDiffCell(porDefinirDias(r))}</td>
                  <td><Pill tone={ptone}>{plbl}</Pill></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Fecha de Meet 2; si no tiene, la de Meet 1 (con etiqueta del origen).
function meet2OrMeet1Cell(r: IniItem) {
  const v = r.meet2 || r.meet1;
  if (!v) return <span className="text-[var(--text-disabled)]">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {mondayDateCell(v)}
      <span className="text-[0.65rem] text-[var(--text-muted)]">{r.meet2 ? "M2" : "M1"}</span>
    </span>
  );
}

function CambioEstrategiaSection({ items }: { items: IniItem[] }) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Cambio Estrategia</h2>
        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]">{items.length} items</span>
      </div>
      <div className="table-wrap">
        <table className="pmo">
          <thead>
            <tr>
              <th>ID</th><th>Iniciativa</th><th>PM</th><th>Meet 2 / Meet 1</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id || r.name}>
                <td className="ini-id">{r.id || "—"}</td>
                <td className="ini-name">{r.name}</td>
                <td className="pm-name">{r.pm || <span className="text-[var(--text-disabled)]">—</span>}</td>
                <td>{meet2OrMeet1Cell(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanFuturoSection({ items }: { items: IniItem[] }) {
  if (items.length === 0) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const sorted = [...items].sort((a, b) => {
    const da = a.planFuturo?.getTime() ?? Infinity;
    const db = b.planFuturo?.getTime() ?? Infinity;
    return da - db;
  });
  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Plan Futuro</h2>
        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]">{items.length} items</span>
        <span className="rounded-full border px-2 py-0.5 text-[0.72rem] text-[var(--text-muted)]" style={{ background: "var(--code-bg)", borderColor: "var(--code-border)" }}>
          Recordatorio = Plan Futuro − 5 días hábiles
        </span>
      </div>
      <div className="table-wrap">
        <table className="pmo">
          <thead>
            <tr>
              <th>ID</th><th>Iniciativa</th><th>PM</th><th>Plan Futuro</th><th>Recordatorio</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id || r.name}>
                <td className="ini-id">{r.id || "—"}</td>
                <td className="ini-name">{r.name}</td>
                <td className="pm-name">{r.pm || <span className="text-[var(--text-disabled)]">—</span>}</td>
                <td>{pfDateCell(r.planFuturo, t)}</td>
                <td>{pfDateCell(r.recordatorio, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
