"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useData } from "@/context/DataContext";
import { businessDays, fmtDate, fmtMoney, today } from "@/lib/business";
import { REQ_ACTIVE_GRUPOS, REQ_GROUP_COLOR, REQ_PIPELINE } from "@/lib/process";
import type { ReqItem } from "@/types";
import MultiSelect from "@/components/MultiSelect";
import ReqDetailModal from "@/components/ReqDetailModal";
import { EmptyRow, ErrorBox, FilterReset, Loader, SectionHeader, StatCard } from "@/components/ui";

function hiCfg(v: number) {
  return v >= 0.95
    ? { color: "#10b981", bg: "#052e1688", label: "On Track", icon: "✓" }
    : v >= 0.85
      ? { color: "#f59e0b", bg: "#451a0388", label: "En Riesgo", icon: "⚠" }
      : { color: "#ef4444", bg: "#450a0a88", label: "Off Track", icon: "✕" };
}

const isActive = (r: ReqItem) => REQ_ACTIVE_GRUPOS.has(r.grupo);

export default function ReqPage() {
  return (
    <Suspense fallback={<Loader />}>
      <ReqInner />
    </Suspense>
  );
}

function ReqInner() {
  const sp = useSearchParams();
  const { data, loading, error } = useData();
  const [pms, setPms] = useState<string[]>(() => {
    const pm = sp.get("pm");
    return pm ? [pm] : [];
  });
  const [statuses, setStatuses] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [estado, setEstado] = useState("");
  const [selected, setSelected] = useState<ReqItem | null>(null);

  const reqData = data?.req ?? [];

  const getFiltered = (p: string[], s: string[], g: string[], est: string) =>
    reqData.filter((r) => {
      if (r.estado === "CERRADO") return false;
      if (r.estado === "EN_ESPERA") return false;
      if (p.length && !p.includes(r.pm)) return false;
      if (s.length && !s.includes(r.status)) return false;
      if (g.length && !g.includes(r.grupo)) return false;
      if (est && r.estado !== est) return false;
      return true;
    });

  const filtered = getFiltered(pms, statuses, groups, estado);

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  // ── Cards ──
  const base = getFiltered(pms, statuses, groups, "");
  const c = { ATRASADO: 0, "PARA HOY": 0, "EN TIEMPO": 0 } as Record<string, number>;
  base.forEach((r) => { if (c[r.estado] !== undefined) c[r.estado]++; });
  const enEspera = reqData.filter((r) => r.estado === "EN_ESPERA").length;
  const totalCost = filtered.reduce((s, r) => s + r.costRH + r.costSft, 0);
  const totalBenefit = filtered.reduce((s, r) => s + r.benefit, 0);

  const togglePm = (v: string, ch: boolean) => setPms((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)));
  const toggleSt = (v: string, ch: boolean) => setStatuses((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)));
  const toggleGrp = (v: string, ch: boolean) => setGroups((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)));
  const toggleEstado = (e: string) => setEstado((cur) => (cur === e ? "" : e));
  const reset = () => { setPms([]); setStatuses([]); setGroups([]); setEstado(""); };

  // ── Filtros (opciones con conteos) ──
  const allPMs = [...new Set(reqData.filter((r) => r.pm).map((r) => r.pm))].sort();
  const allSts = [...new Set(reqData.filter((r) => r.status).map((r) => r.status))].sort();
  const allGrps = REQ_PIPELINE.filter((g) => reqData.some((r) => r.grupo === g));
  const pmOpts = allPMs.map((pm) => ({ value: pm, label: pm, count: getFiltered([pm], statuses, groups, estado).length }));
  const stOpts = allSts.map((st) => ({ value: st, label: st, count: getFiltered(pms, [st], groups, estado).length }));
  const grpOpts = allGrps.map((g) => ({ value: g, label: g, count: getFiltered(pms, statuses, [g], estado).length }));
  const anyFilter = pms.length > 0 || statuses.length > 0 || groups.length > 0 || estado !== "";

  // ── PM Health (HI) ──
  const hpPMs = [...new Set(reqData.filter((r) => r.pm && isActive(r)).map((r) => r.pm))].sort();
  const allHI = reqData.filter((r) => isActive(r) && r.hi !== null);
  const portHI = allHI.length ? allHI.reduce((s, r) => s + (r.hi as number), 0) / allHI.length : null;

  return (
    <div>
      {/* Filtros */}
      <div className="mb-7 flex flex-wrap items-end gap-3.5">
        <MultiSelect label="PM" options={pmOpts} selected={pms} onToggle={togglePm} onToggleAll={() => setPms([])} />
        <MultiSelect label="Status" options={stOpts} selected={statuses} onToggle={toggleSt} onToggleAll={() => setStatuses([])} />
        <MultiSelect label="Fase" options={grpOpts} selected={groups} onToggle={toggleGrp} onToggleAll={() => setGroups([])} />
        {anyFilter && <FilterReset onClick={reset} />}
      </div>

      {/* Cards */}
      <div className="mb-7 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard value={c.ATRASADO + c["PARA HOY"] + c["EN TIEMPO"]} label="En Proceso" />
        <StatCard value={c.ATRASADO} label="Atrasados" color="#ef4444" borderColor="#ef4444" active={estado === "ATRASADO"} onClick={() => toggleEstado("ATRASADO")} />
        <StatCard value={c["PARA HOY"]} label="Para Hoy" color="#f59e0b" borderColor="#f59e0b" active={estado === "PARA HOY"} onClick={() => toggleEstado("PARA HOY")} />
        <StatCard value={c["EN TIEMPO"]} label="En Tiempo" color="#10b981" borderColor="#10b981" active={estado === "EN TIEMPO"} onClick={() => toggleEstado("EN TIEMPO")} />
        <StatCard value={enEspera} label="En Espera" color={REQ_GROUP_COLOR["En Espera"]} borderColor={REQ_GROUP_COLOR["En Espera"]} active={estado === "EN_ESPERA"} onClick={() => toggleEstado("EN_ESPERA")} />
        <StatCard value={fmtMoney(totalCost)} label="Costo Total" color="#ef4444" borderColor="#ef4444" valueSize="1.4rem" />
        <StatCard value={fmtMoney(totalBenefit)} label="Benefit Total" color="#10b981" borderColor="#10b981" valueSize="1.4rem" />
        <StatCard value={fmtMoney(totalBenefit - totalCost)} label="Beneficio Neto" color="#6c63ff" borderColor="#6c63ff" valueSize="1.4rem" />
      </div>

      {/* PM Health */}
      {portHI !== null && (
        <div
          className="mb-3.5 flex flex-wrap items-center gap-5 rounded-xl border px-5 py-3.5"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)", borderLeft: `4px solid ${hiCfg(portHI).color}` }}
        >
          <div>
            <div className="mb-0.5 text-[0.72rem] text-[var(--text-muted)]">Health Index · Portafolio REQ</div>
            <div className="text-2xl font-extrabold leading-none" style={{ color: hiCfg(portHI).color }}>{portHI.toFixed(2)}</div>
          </div>
          <span className="rounded-full px-3 py-1 text-[0.8rem] font-bold" style={{ color: hiCfg(portHI).color, background: hiCfg(portHI).bg }}>
            {hiCfg(portHI).icon} {hiCfg(portHI).label}
          </span>
          <div className="ml-auto flex gap-4 text-[0.78rem]">
            <span style={{ color: "#10b981" }}>✓ {allHI.filter((r) => (r.hi as number) >= 0.95).length} On Track</span>
            <span style={{ color: "#f59e0b" }}>⚠ {allHI.filter((r) => (r.hi as number) >= 0.85 && (r.hi as number) < 0.95).length} En Riesgo</span>
            <span style={{ color: "#ef4444" }}>✕ {allHI.filter((r) => (r.hi as number) < 0.85).length} Off Track</span>
          </div>
        </div>
      )}
      <div className="mb-7 flex flex-wrap gap-4">
        {hpPMs.map((pm) => {
          const items = reqData.filter((r) => r.pm === pm && isActive(r));
          const hiItems = items.filter((r) => r.hi !== null);
          const avg = hiItems.length ? hiItems.reduce((s, r) => s + (r.hi as number), 0) / hiItems.length : null;
          const atrasados = items.filter((r) => r.estado === "ATRASADO").length;
          const cfg = avg !== null ? hiCfg(avg) : { color: "#6b7280", bg: "#1f293788", label: "Sin datos", icon: "—" };
          const selected = pms.length === 1 && pms[0] === pm;
          return (
            <div
              key={pm}
              onClick={() => setPms(selected ? [] : [pm])}
              className="flex min-w-[190px] flex-1 cursor-pointer flex-col gap-1.5 rounded-xl border-2 p-[18px] transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--bg-surface)", borderColor: cfg.color, boxShadow: selected ? "0 0 0 3px var(--accent)" : undefined }}
            >
              <div className="text-[0.9rem] font-semibold text-[var(--text-primary)]">{pm}</div>
              <span className="w-fit rounded-full px-3 py-1 text-[0.78rem] font-bold" style={{ color: cfg.color, background: cfg.bg }}>{cfg.icon} {cfg.label}</span>
              {avg !== null && <div className="text-[1.4rem] font-bold leading-none" style={{ color: cfg.color }}>HI: {avg.toFixed(2)}</div>}
              <div className="text-[0.75rem] text-[var(--text-muted)]">{items.length} en proceso · {atrasados} atrasada{atrasados !== 1 ? "s" : ""}</div>
            </div>
          );
        })}
      </div>

      {/* Tabla */}
      <SectionHeader title="Detalle de Requerimientos" badge={`${filtered.length} items`} />
      <ReqTable rows={filtered} onRowClick={setSelected} />

      {/* Modal de detalle */}
      <ReqDetailModal req={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ReqTable({ rows, onRowClick }: { rows: ReqItem[]; onRowClick: (r: ReqItem) => void }) {
  if (!rows.length) return <EmptyRow />;
  const t = today();
  const sorted = [...rows].sort((a, b) => REQ_PIPELINE.indexOf(a.grupo) - REQ_PIPELINE.indexOf(b.grupo));

  const deadlineCell = (r: ReqItem) => {
    if (!r.deadline) return <span className="text-[var(--text-disabled)]">—</span>;
    const d = new Date(r.deadline); d.setHours(0, 0, 0, 0);
    const color = d < t ? "#ef4444" : d.getTime() === t.getTime() ? "#f59e0b" : "#10b981";
    return <span style={{ color, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(r.deadline)}</span>;
  };
  const diffCell = (r: ReqItem) => {
    if (!r.deadline) return <span className="text-[var(--text-disabled)]">—</span>;
    const d = new Date(r.deadline); d.setHours(0, 0, 0, 0);
    if (d.getTime() === t.getTime()) return <span style={{ color: "#f59e0b", fontWeight: 600 }}>Hoy</span>;
    if (d > t) { const n = businessDays(t, d); return <span style={{ color: "#10b981", fontWeight: 600 }}>+{n} día{n !== 1 ? "s" : ""}</span>; }
    const n = businessDays(d, t); return <span style={{ color: "#ef4444", fontWeight: 600 }}>-{n} día{n !== 1 ? "s" : ""}</span>;
  };
  const accumCell = (r: ReqItem) => {
    if (r.elapsed === null || r.expectedDays === null) return <span className="text-[var(--text-disabled)]">—</span>;
    const diff = r.expectedDays - r.elapsed;
    if (diff === 0) return <span style={{ color: "#f59e0b", fontWeight: 600 }}>Hoy</span>;
    if (diff > 0) return <span style={{ color: "#10b981", fontWeight: 600 }}>+{diff} día{diff !== 1 ? "s" : ""}</span>;
    return <span style={{ color: "#ef4444", fontWeight: 600 }}>-{-diff} día{-diff !== 1 ? "s" : ""}</span>;
  };
  const metric = (v: number | null, good: number, mid: number) => {
    if (v === null) return <span className="text-[var(--text-disabled)]">—</span>;
    const color = v >= good ? "#10b981" : v >= mid ? "#f59e0b" : "#ef4444";
    return <span style={{ fontWeight: 700, color }}>{v.toFixed(2)}</span>;
  };
  const ESTADO_INLINE: Record<string, [string, string]> = {
    ATRASADO: ["pill-atrasado", "✕ Atrasado"],
    "PARA HOY": ["pill-parahoy", "⚠ Para Hoy"],
    "EN TIEMPO": ["pill-entiempo", "✓ En Tiempo"],
    "EN PROCESO": ["pill-skip", "En Proceso"],
  };

  return (
    <div className="table-wrap">
      <table className="pmo">
        <thead>
          <tr>
            <th>REQ ID</th><th>Requerimiento</th><th>PM</th><th>Resp</th><th>Fase</th><th>Estado</th>
            <th style={{ textAlign: "right" }}>Costo</th><th style={{ textAlign: "right" }}>Benefit</th>
            <th>TLD</th><th>Est DEV</th><th>Inicio REQ</th><th>Inicio Fase</th><th>Deadline</th><th>Diferencia</th>
            <th style={{ textAlign: "right" }}>Días Acum.</th><th>SPI</th><th>CPI</th><th>Alcance</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const [cls, lbl] = ESTADO_INLINE[r.estado] ?? ["pill-skip", r.estado];
            return (
              <tr key={r.id || r.name}>
                <td className="ini-id">{r.id || "—"}</td>
                <td className="ini-name" style={{ cursor: "pointer", color: "var(--accent)" }} onClick={() => onRowClick(r)}>{r.name}</td>
                <td className="pm-name">{r.pm || "—"}</td>
                <td style={{ fontSize: ".78rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.resp || "—"}</td>
                <td><span style={{ fontSize: ".72rem", fontWeight: 600, color: REQ_GROUP_COLOR[r.grupo] || "var(--text-muted)" }}>{r.grupo}</span></td>
                <td><span className={`pill ${cls}`} style={{ fontSize: ".68rem" }}>{lbl}</span></td>
                <td style={{ textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.costRH + r.costSft > 0 ? fmtMoney(r.costRH + r.costSft) : "—"}</td>
                <td style={{ textAlign: "right", fontWeight: 600, color: "#10b981", whiteSpace: "nowrap" }}>{r.benefit ? fmtMoney(r.benefit) : "—"}</td>
                <td style={{ color: "var(--text-secondary)", fontSize: ".8rem", whiteSpace: "nowrap" }}>{r.tld || "—"}</td>
                <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.estDev ? fmtDate(r.estDev) : "—"}</td>
                <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.inicioReq ? fmtDate(r.inicioReq) : "—"}</td>
                <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.inicio ? fmtDate(r.inicio) : "—"}</td>
                <td>{deadlineCell(r)}</td>
                <td>{diffCell(r)}</td>
                <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>{accumCell(r)}</td>
                <td>{metric(r.spi, 1, 0.8)}</td>
                <td>{metric(r.cpi, 1, 0.8)}</td>
                <td>{metric(r.scope, 0.8, 0.4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
