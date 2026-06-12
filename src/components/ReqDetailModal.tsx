"use client";

import { businessDays, fmtDate, fmtMoney, today } from "@/lib/business";
import { REQ_GROUP_COLOR, vemCfg } from "@/lib/process";
import type { ReqItem } from "@/types";
import Modal from "@/components/Modal";

const evmColor = (v: number) => (v >= 1 ? "#10b981" : v >= 0.8 ? "#f59e0b" : "#ef4444");
const evmBg = (v: number) => (v >= 1 ? "var(--health-on-track-bg)" : v >= 0.8 ? "var(--health-in-risk-bg)" : "var(--health-off-track-bg)");

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}>
      <div className="mb-1 text-[0.68rem] text-[var(--text-muted)]">{label}</div>
      <div className="text-[0.88rem] font-semibold text-[var(--text-primary)]">{children}</div>
    </div>
  );
}

function EvmCard({ label, value, sub, color, bg }: { label: string; value: string; sub: string; color: string; bg: string }) {
  return (
    <div className="rounded-xl border px-3 py-3.5 text-center" style={{ background: bg, borderColor: `${color}33` }}>
      <div className="mb-1.5 text-[0.68rem] text-[var(--text-muted)]">{label}</div>
      <div className="text-[1.55rem] font-extrabold leading-none" style={{ color }}>{value}</div>
      <div className="mt-1 text-[0.7rem]" style={{ color }}>{sub}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2.5 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{children}</div>;
}

const dash = <span className="text-[var(--text-disabled)]">—</span>;

export default function ReqDetailModal({ req, onClose }: { req: ReqItem | null; onClose: () => void }) {
  const r = req;
  const open = r !== null;
  const t = today();

  return (
    <Modal open={open} onClose={onClose}>
      {r && (
        <>
          {/* Header */}
          <div className="flex items-start gap-3.5 border-b px-6 pb-4 pt-5" style={{ borderColor: "var(--border)" }}>
            <span className="mt-0.5 whitespace-nowrap rounded-md border px-2 py-1 text-[0.72rem] font-bold" style={{ color: "var(--accent)", background: "var(--bg-accent-soft)", borderColor: "#4c4a9a55" }}>
              {r.id || "—"}
            </span>
            <span className="flex-1 text-[1.05rem] font-bold text-[var(--text-primary)]">{r.name}</span>
            <button onClick={onClose} className="rounded-md px-1.5 text-xl leading-none text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">✕</button>
          </div>

          {/* Body */}
          <div className="flex flex-col gap-5 px-6 pb-6 pt-5">
            {/* Estado (derivado del VEM) + grupo */}
            <div className="flex flex-wrap items-center gap-2">
              {r.vem !== null
                ? (() => { const c = vemCfg(r.vem as number); return <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}44`, padding: "2px 10px", borderRadius: 20, fontSize: ".72rem", fontWeight: 700 }}>{c.icon} {c.label}</span>; })()
                : <span style={{ background: "var(--health-neutral-bg)", color: "#6b7280", border: "1px solid #6b728044", padding: "2px 10px", borderRadius: 20, fontSize: ".72rem", fontWeight: 700 }}>— Sin datos</span>}
              <span className="text-[0.75rem] font-bold" style={{ color: REQ_GROUP_COLOR[r.grupo] || "var(--text-muted)" }}>{r.grupo}</span>
              {r.status && <span className="text-[0.72rem] text-[var(--text-secondary)]">{r.status}</span>}
            </div>

            {/* Equipo */}
            <div>
              <SectionLabel>Equipo</SectionLabel>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                <Cell label="PM">{r.pm || dash}</Cell>
                <Cell label="Responsable">{r.resp || dash}</Cell>
                <Cell label="TLD">{r.tld || dash}</Cell>
              </div>
            </div>

            {/* Cronograma */}
            <div>
              <SectionLabel>Cronograma</SectionLabel>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                <Cell label="Inicio REQ">{r.inicioReq ? fmtDate(r.inicioReq) : dash}</Cell>
                <Cell label="Inicio Fase">{r.inicio ? fmtDate(r.inicio) : dash}</Cell>
                <Cell label="Est DEV">{r.estDev ? fmtDate(r.estDev) : dash}</Cell>
                <Cell label="Deadline">{r.deadline ? fmtDate(r.deadline) : dash}</Cell>
                <Cell label="Diferencia">{diffHtml(r, t)}</Cell>
                <Cell label="Días Acum.">{accumHtml(r)}</Cell>
              </div>
            </div>

            {/* Timeline */}
            <Timeline r={r} />

            {/* Financiero */}
            <div>
              <SectionLabel>Financiero</SectionLabel>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                <Cell label="Costo RH">{r.costRH ? fmtMoney(r.costRH) : dash}</Cell>
                <Cell label="Costo Soft">{r.costSft ? fmtMoney(r.costSft) : dash}</Cell>
                <Cell label="Costo Total">{r.costRH + r.costSft > 0 ? fmtMoney(r.costRH + r.costSft) : dash}</Cell>
                <Cell label="Beneficio">{r.benefit ? fmtMoney(r.benefit) : dash}</Cell>
                <Cell label="Valor Neto">
                  {r.valueNet ? <span style={{ color: r.valueNet >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>{fmtMoney(r.valueNet)}</span> : dash}
                </Cell>
              </div>
            </div>

            {/* Costo por Fase (base de EV / PV) */}
            {r.phases.length > 0 && <PhaseCosts r={r} />}

            {/* EVM */}
            <div>
              <SectionLabel>EVM</SectionLabel>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                {r.spi !== null
                  ? <EvmCard label="Cronograma (SPI)" value={r.spi.toFixed(2)} sub={r.spi >= 1 ? "On Track" : "Detrás"} color={evmColor(r.spi)} bg={evmBg(r.spi)} />
                  : <EvmCard label="Cronograma (SPI)" value="—" sub="Sin datos" color="#6b7280" bg="var(--health-neutral-bg)" />}
                {r.cpi !== null
                  ? <EvmCard label="Costo (CPI)" value={r.cpi.toFixed(2)} sub={r.cpi >= 1 ? "On Track" : "Detrás"} color={evmColor(r.cpi)} bg={evmBg(r.cpi)} />
                  : <EvmCard label="Costo (CPI)" value="—" sub="Sin datos" color="#6b7280" bg="var(--health-neutral-bg)" />}
                {r.scope !== null
                  ? <EvmCard label="Alcance" value={r.scope.toFixed(2)} sub={`${(r.scope * 100).toFixed(0)}% completo`} color={evmColor(r.scope >= 0.8 ? 1 : r.scope >= 0.4 ? 0.9 : 0)} bg={evmBg(r.scope >= 0.8 ? 1 : r.scope >= 0.4 ? 0.9 : 0)} />
                  : <EvmCard label="Alcance" value="—" sub="Sin datos" color="#6b7280" bg="var(--health-neutral-bg)" />}
                {r.vem !== null
                  ? (() => { const c = vemCfg(r.vem as number); return <EvmCard label="EVM" value={(r.vem as number).toFixed(2)} sub={`${c.icon} ${c.label}`} color={c.color} bg={c.bg} />; })()
                  : <EvmCard label="EVM" value="—" sub="Sin datos" color="#6b7280" bg="var(--health-neutral-bg)" />}
              </div>
            </div>

            {/* Valores EV / PV / AC */}
            <div>
              <SectionLabel>Valores</SectionLabel>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <Cell label="Valor Ganado (EV)"><span style={{ color: "#10b981" }}>{fmtMoney(r.ev)}</span></Cell>
                <Cell label="Valor Planificado (PV)"><span style={{ color: "#6c63ff" }}>{fmtMoney(r.pv)}</span></Cell>
                <Cell label="Costo Real (AC)">{fmtMoney(r.ac)}</Cell>
              </div>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Desglose de costo por fase (qué cuenta en EV / PV) ──────────────────
function PhaseCosts({ r }: { r: ReqItem }) {
  return (
    <div>
      <SectionLabel>Costo por Fase</SectionLabel>
      <div className="flex flex-col gap-1.5">
        {r.phases.map((p) => {
          // done → completada (EV) · vencida sin cerrar (drag SPI) → roja · futura → neutra
          const st = p.done
            ? { dot: "#10b981", label: "Completada", color: "#10b981", bg: "var(--health-on-track-bg)" }
            : p.inPv
              ? { dot: "#ef4444", label: "Vencida", color: "#ef4444", bg: "var(--health-off-track-bg)" }
              : { dot: "var(--text-disabled)", label: "Pendiente", color: "var(--text-muted)", bg: "var(--bg-hover)" };
          return (
            <div key={p.name} className="flex items-center gap-3 rounded-lg border px-3 py-2" style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}>
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: st.dot }} />
              <span className="flex-1 text-[0.8rem] text-[var(--text-secondary)]">
                {p.name} <span className="text-[0.68rem] text-[var(--text-muted)]">· {p.durDays}d</span>
              </span>
              <span className="text-[0.82rem] font-semibold tabular-nums text-[var(--text-primary)]">{p.cost > 0 ? fmtMoney(p.cost) : dash}</span>
              <span className="w-[88px] flex-shrink-0 rounded-full px-2 py-0.5 text-center text-[0.66rem] font-bold" style={{ color: st.color, background: st.bg }}>{st.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[0.66rem] text-[var(--text-muted)]">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#10b981" }} /> Completada → EV</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#ef4444" }} /> Vencida sin cerrar → baja el SPI</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--text-disabled)" }} /> Pendiente / futura</span>
      </div>
    </div>
  );
}

function diffHtml(r: ReqItem, t: Date) {
  if (!r.deadline) return dash;
  const d = new Date(r.deadline); d.setHours(0, 0, 0, 0);
  if (d.getTime() === t.getTime()) return <span style={{ color: "#f59e0b", fontWeight: 700 }}>Hoy</span>;
  if (d > t) { const n = businessDays(t, d); return <span style={{ color: "#10b981", fontWeight: 700 }}>+{n} día{n !== 1 ? "s" : ""}</span>; }
  const n = businessDays(d, t); return <span style={{ color: "#ef4444", fontWeight: 700 }}>-{n} día{n !== 1 ? "s" : ""}</span>;
}

function accumHtml(r: ReqItem) {
  if (r.elapsed === null || r.expectedDays === null) return dash;
  const diff = r.expectedDays - r.elapsed;
  if (diff === 0) return <span style={{ color: "#f59e0b", fontWeight: 700 }}>Hoy</span>;
  if (diff > 0) return <span style={{ color: "#10b981", fontWeight: 700 }}>+{diff} día{diff !== 1 ? "s" : ""}</span>;
  return <span style={{ color: "#ef4444", fontWeight: 700 }}>-{-diff} día{-diff !== 1 ? "s" : ""}</span>;
}

// ── Timeline visual (barra de fases + marcadores real/esperado) ─────────
const PHASE_NAMES = ["Valuación", "Aprobación", "Desarrollo", "Operación", "Cierre ROI"];
const PHASE_CLRS = ["#6c63ff", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6"];
const PIDX: Record<string, number> = { "Valuación": 0, "Aprobación": 1, "Desarrollo": 2, "Operación": 3, "Cierre ROI": 4 };

function Timeline({ r }: { r: ReqItem }) {
  if (!r.tld || r.elapsed === null) return null;
  const devDays = r.tld === "LM" ? 32 : r.tld === "S/dev" ? 0 : 7;
  const phaseDurs = [1, 2, devDays, 3, 20];
  const totalDays = phaseDurs.reduce((a, b) => a + b, 0);
  const curIdx = PIDX[r.grupo] ?? -1;

  const ap = Math.min(99, Math.max(1, (r.elapsed / totalDays) * 100));
  const ep = r.expectedDays !== null ? Math.min(99, Math.max(1, (r.expectedDays / totalDays) * 100)) : null;

  // Ticks de límite de fase.
  let cum = 0;
  const ticks = phaseDurs.slice(0, -1).map((d) => {
    cum += d;
    return { pct: (cum / totalDays) * 100, label: `${cum}d` };
  });

  const diff = ep !== null ? (r.expectedDays as number) - r.elapsed : null;

  return (
    <div>
      <SectionLabel>Timeline · {r.elapsed}d transcurridos / {totalDays}d totales</SectionLabel>

      {/* Barra + marcadores */}
      <div className="relative" style={{ height: 28, margin: "38px 0 52px", overflow: "visible" }}>
        <div className="absolute inset-0 z-[1] flex overflow-hidden rounded-md">
          {phaseDurs.map((d, i) => {
            const op = i < curIdx ? 0.65 : i === curIdx ? 1 : 0.28;
            const lbl = d >= 3 ? PHASE_NAMES[i].slice(0, 3) : d === 2 ? "A" : "";
            return (
              <div key={i} className="flex flex-shrink-0 items-center justify-center" style={{ width: `${(d / totalDays) * 100}%`, background: PHASE_CLRS[i], opacity: op }} title={`${PHASE_NAMES[i]}: ${d}d hábiles`}>
                <span style={{ fontSize: ".58rem", fontWeight: 800, color: "rgba(255,255,255,.85)", whiteSpace: "nowrap" }}>{lbl}</span>
              </div>
            );
          })}
        </div>

        {/* Marcador real */}
        <div className="absolute top-0 z-[4]" style={{ left: `${ap.toFixed(2)}%`, height: "100%", transform: "translateX(-50%)", pointerEvents: "none" }}>
          <div style={{ width: 2, height: "100%", background: "#fff", margin: "0 auto" }} />
          <div className="absolute" style={{ bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
            <div style={{ background: "#0f1117", border: "1px solid #ffffff55", borderRadius: 5, padding: "2px 8px", fontSize: ".65rem", fontWeight: 700, color: "#fff" }}>▼ {r.elapsed}d real</div>
          </div>
        </div>

        {/* Marcador esperado */}
        {ep !== null && (
          <div className="absolute top-0 z-[3]" style={{ left: `${ep.toFixed(2)}%`, height: "100%", transform: "translateX(-50%)", pointerEvents: "none" }}>
            <div style={{ width: 0, height: "100%", borderLeft: "2px dashed #f59e0b", margin: "0 auto" }} />
            <div className="absolute" style={{ top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
              <div style={{ background: "#0f1117", border: "1px solid #f59e0b55", borderRadius: 5, padding: "2px 8px", fontSize: ".65rem", fontWeight: 700, color: "#f59e0b" }}>▲ {r.expectedDays}d esperado</div>
            </div>
          </div>
        )}
      </div>

      {/* Ticks */}
      <div className="relative" style={{ height: 18, marginTop: -46 }}>
        {ticks.map((tk, i) => (
          <div key={i} className="absolute top-0 text-center" style={{ left: `${tk.pct}%`, transform: "translateX(-50%)", pointerEvents: "none" }}>
            <div style={{ width: 1, height: 5, background: "var(--border-subtle)", margin: "0 auto" }} />
            <div style={{ fontSize: ".6rem", color: "var(--text-muted)", marginTop: 1, whiteSpace: "nowrap" }}>{tk.label}</div>
          </div>
        ))}
      </div>

      {/* Leyenda */}
      <div className="mt-2.5 flex flex-wrap gap-2.5">
        {PHASE_NAMES.map((n, i) => (
          <span key={i} className="flex items-center gap-1 text-[0.68rem] text-[var(--text-secondary)]">
            <span className="inline-block h-[9px] w-[9px] flex-shrink-0 rounded-sm" style={{ background: PHASE_CLRS[i], opacity: i === curIdx ? 1 : 0.5 }} />
            {n}{i === curIdx && <span style={{ color: PHASE_CLRS[i] }}> ← aquí</span>}
          </span>
        ))}
      </div>

      {diff !== null && (
        <div className="mt-2 text-[0.74rem] text-[var(--text-muted)]">
          Hoy vas{" "}
          {diff === 0 ? <span style={{ color: "#f59e0b", fontWeight: 600 }}>exactamente en tiempo</span>
            : diff > 0 ? <><span style={{ color: "#10b981", fontWeight: 600 }}>+{diff}d adelantado</span> en su fase</>
              : <><span style={{ color: "#ef4444", fontWeight: 600 }}>{diff}d atrasado</span> respecto a su fase</>}
        </div>
      )}
    </div>
  );
}
