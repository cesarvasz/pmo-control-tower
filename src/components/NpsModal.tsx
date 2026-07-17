"use client";

import { useState } from "react";
import { npsCfg } from "@/lib/process";
import type { NpsData } from "@/types";
import Modal from "@/components/Modal";

const CAT_CFG = {
  promoter:  { color: "var(--ok)", label: "Promotor" },
  passive:   { color: "var(--warn)", label: "Pasivo" },
  detractor: { color: "var(--bad)", label: "Detractor" },
} as const;

const pctColor = (p: number) => (p >= 80 ? "var(--ok)" : p >= 60 ? "var(--warn)" : "var(--bad)");

function fmtTs(ts: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function NpsModal({ nps, onClose }: { nps: NpsData; onClose: () => void }) {
  const [tab, setTab] = useState<"resumen" | "detalles">("resumen");
  const [idx, setIdx] = useState(0);

  const cfg = npsCfg(nps.nps);
  const color = cfg?.color ?? "#6b7280";
  const pct = (n: number) => (nps.total > 0 ? Math.round((n / nps.total) * 100) : 0);

  const responses = nps.responses;
  const cur = responses[idx];
  const prev = () => setIdx((i) => (i - 1 + responses.length) % responses.length);
  const next = () => setIdx((i) => (i + 1) % responses.length);

  return (
    <Modal open onClose={onClose} width={720}>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 pb-4 pt-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <span className="text-[1.05rem] font-bold text-[var(--text-primary)]">NPS · Encuesta PMO</span>
          {nps.nps !== null && (
            <span className="rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold" style={{ color, background: "var(--bg-hover)" }}>
              {nps.nps} · {cfg?.label}
            </span>
          )}
        </div>
        <button onClick={onClose} className="rounded-md px-1.5 text-xl leading-none text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 gap-1 border-b px-6 pt-3" style={{ borderColor: "var(--border)" }}>
        {(["resumen", "detalles"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="rounded-t-lg px-4 py-2 text-[0.82rem] font-semibold capitalize transition-colors"
            style={
              tab === t
                ? { color, borderBottom: `2px solid ${color}` }
                : { color: "var(--text-muted)" }
            }
          >
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === "resumen" ? (
          <div className="flex flex-col gap-5">
            {/* Nota grande */}
            <div className="rounded-xl border p-5 text-center" style={{ background: "var(--bg-hover)", borderColor: `${color}33` }}>
              <div className="text-[3rem] font-extrabold leading-none" style={{ color }}>{nps.nps !== null ? nps.nps : "—"}</div>
              <div className="mt-1.5 text-[0.85rem] font-bold uppercase tracking-wide" style={{ color }}>{cfg?.label ?? "Sin datos"}</div>
              <div className="mt-1 text-[0.72rem] text-[var(--text-muted)]">{nps.total} respuesta{nps.total !== 1 ? "s" : ""}</div>
            </div>

            {/* Distribución con porcentajes */}
            <div className="grid grid-cols-3 gap-3">
              {([
                ["promoter", "Promotores", nps.promoters, "9-10"],
                ["passive", "Pasivos", nps.passives, "7-8"],
                ["detractor", "Detractores", nps.detractors, "0-6"],
              ] as const).map(([cat, label, count, range]) => (
                <div key={cat} className="rounded-xl border px-3 py-3.5 text-center" style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}>
                  <div className="text-[1.6rem] font-extrabold leading-none" style={{ color: CAT_CFG[cat].color }}>{pct(count)}%</div>
                  <div className="mt-1 text-[0.78rem] font-semibold text-[var(--text-primary)]">{label}</div>
                  <div className="text-[0.68rem] text-[var(--text-muted)]">{count} · puntaje {range}</div>
                </div>
              ))}
            </div>

            {/* Barra apilada */}
            <div className="flex h-3 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <div style={{ width: `${pct(nps.promoters)}%`, background: CAT_CFG.promoter.color }} />
              <div style={{ width: `${pct(nps.passives)}%`, background: CAT_CFG.passive.color }} />
              <div style={{ width: `${pct(nps.detractors)}%`, background: CAT_CFG.detractor.color }} />
            </div>
            <div className="text-center text-[0.72rem] text-[var(--text-muted)]">
              NPS = % Promotores − % Detractores = {pct(nps.promoters)}% − {pct(nps.detractors)}% = {nps.nps ?? "—"}
            </div>

            {/* Promedio total + preguntas (escala Likert 20% por nivel) */}
            {nps.overallAvg !== null && (
              <>
                <div className="rounded-xl border p-4 text-center" style={{ background: "var(--bg-hover)", borderColor: `${pctColor(nps.overallAvg)}33` }}>
                  <div className="mb-1 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Promedio total</div>
                  <div className="text-[2.4rem] font-extrabold leading-none" style={{ color: pctColor(nps.overallAvg) }}>{nps.overallAvg}%</div>
                </div>

                <div>
                  <div className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Preguntas</div>
                  <div className="flex flex-col gap-2">
                    {nps.questions.map((q, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="flex-1 text-[0.78rem] text-[var(--text-secondary)]">{q.question}</span>
                        <div className="h-1.5 w-20 flex-shrink-0 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                          <div className="h-full rounded-full" style={{ width: `${q.avg}%`, background: pctColor(q.avg) }} />
                        </div>
                        <span className="w-10 flex-shrink-0 text-right text-[0.8rem] font-bold tabular-nums" style={{ color: pctColor(q.avg) }}>{q.avg}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {responses.length === 0 || !cur ? (
              <div className="py-10 text-center text-[var(--text-muted)]">No hay respuestas.</div>
            ) : (
              <>
                {/* Navegación */}
                <div className="flex items-center justify-between">
                  <button onClick={prev} className="rounded-lg border px-3 py-1.5 text-[0.9rem] transition-colors hover:bg-[var(--bg-hover)]" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>◀</button>
                  <div className="text-center">
                    <div className="text-[0.72rem] text-[var(--text-muted)]">Respuesta {idx + 1} de {responses.length}</div>
                    <div className="text-[0.78rem] font-semibold text-[var(--text-primary)]">{cur.email || "—"}</div>
                  </div>
                  <button onClick={next} className="rounded-lg border px-3 py-1.5 text-[0.9rem] transition-colors hover:bg-[var(--bg-hover)]" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>▶</button>
                </div>

                {/* Meta */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5" style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}>
                  <span className="text-[0.75rem] text-[var(--text-muted)]">{fmtTs(cur.timestamp)}</span>
                  {cur.score !== null && cur.category && (
                    <span className="rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold" style={{ color: CAT_CFG[cur.category].color, background: "var(--bg-surface)" }}>
                      {cur.score}/10 · {CAT_CFG[cur.category].label}
                    </span>
                  )}
                </div>

                {/* Respuestas Likert */}
                {cur.answers.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {cur.answers.map((a, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 border-b py-1.5 text-[0.8rem]" style={{ borderColor: "var(--border)" }}>
                        <span className="flex-1 text-[var(--text-secondary)]">{a.question}</span>
                        <span className="whitespace-nowrap font-semibold text-[var(--text-primary)]">{a.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Razón */}
                {cur.reason && (
                  <div>
                    <div className="mb-1 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Comentario</div>
                    <div className="rounded-lg border px-3.5 py-3 text-[0.82rem] leading-relaxed text-[var(--text-secondary)]" style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}>
                      {cur.reason}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
