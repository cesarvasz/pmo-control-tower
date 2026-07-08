"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api";
import { SURVEY_QUESTIONS, type SurveyDoc, type SurveyResponseDoc } from "@/lib/survey";

const LIKERT_COLOR: Record<string, string> = {
  "Totalmente de acuerdo": "#10b981",
  "De acuerdo": "#34d399",
  "Neutral": "#f59e0b",
  "En desacuerdo": "#f97316",
  "Totalmente en desacuerdo": "#ef4444",
};
const npsColor = (v: number) => (v >= 9 ? "#10b981" : v >= 7 ? "#f59e0b" : "#ef4444");
const npsLabel = (v: number) => (v >= 9 ? "Promotor" : v >= 7 ? "Pasivo" : "Detractor");

export default function SurveyResultModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [survey, setSurvey] = useState<SurveyDoc | null>(null);
  const [response, setResponse] = useState<SurveyResponseDoc | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch(`/api/surveys/${token}/response`);
        if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`); setState("error"); return; }
        const data = (await res.json()) as { survey: SurveyDoc; response: SurveyResponseDoc | null };
        setSurvey(data.survey); setResponse(data.response); setState("ready");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error al cargar"); setState("error");
      }
    })();
  }, [token]);

  const nps = response ? Number(response.answers["nps"]) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <div className="text-[0.66rem] uppercase tracking-widest text-[var(--text-muted)]">Resultado de Encuesta</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="text-[1.05rem] font-bold text-[var(--text-primary)]">{survey?.reqCode || survey?.reqName || "—"}</span>
              {survey?.invalidated && (
                <span className="rounded-full px-2 py-0.5 text-[0.64rem] font-bold uppercase" style={{ color: "#ef4444", background: "var(--pill-atrasado-bg)" }}>⊘ Invalidada</span>
              )}
            </div>
            {survey && (
              <div className="mt-0.5 text-[0.76rem] text-[var(--text-muted)]">
                {survey.reqName} · {survey.assignedName || survey.assignedEmail}
              </div>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {state === "loading" && <div className="py-10 text-center text-[0.85rem] text-[var(--text-muted)]">Cargando…</div>}
          {state === "error" && <div className="py-10 text-center text-[0.85rem]" style={{ color: "#ef4444" }}>{err}</div>}

          {state === "ready" && !response && (
            <div className="py-10 text-center text-[0.85rem] text-[var(--text-muted)]">Aún no ha sido contestada.</div>
          )}

          {state === "ready" && response && (
            <div className="space-y-6">
              {/* NPS destacado */}
              {nps !== null && Number.isFinite(nps) && (
                <div className="flex items-center gap-4 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
                  <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl" style={{ background: npsColor(nps) + "22" }}>
                    <span className="text-[1.6rem] font-extrabold leading-none" style={{ color: npsColor(nps) }}>{nps}</span>
                    <span className="text-[0.6rem] text-[var(--text-muted)]">/ 10</span>
                  </div>
                  <div>
                    <div className="text-[0.72rem] uppercase tracking-wide text-[var(--text-muted)]">Recomendación (NPS)</div>
                    <div className="text-[0.95rem] font-bold" style={{ color: npsColor(nps) }}>{npsLabel(nps)}</div>
                  </div>
                </div>
              )}

              {/* Razón */}
              {(() => {
                const razon = String(response.answers["razon"] ?? "").trim();
                return (
                  <div>
                    <div className="mb-1.5 text-[0.72rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">Razón principal</div>
                    <div className="rounded-xl border px-4 py-3 text-[0.85rem] leading-relaxed text-[var(--text-primary)]" style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
                      {razon || <span className="text-[var(--text-muted)]">—</span>}
                    </div>
                  </div>
                );
              })()}

              {/* Dimensiones */}
              <div>
                <div className="mb-2 text-[0.72rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">Dimensiones PMO</div>
                <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
                  {SURVEY_QUESTIONS.filter((q) => q.type === "likert").map((q, i) => {
                    const v = String(response.answers[q.id] ?? "");
                    const color = LIKERT_COLOR[v] ?? "var(--text-muted)";
                    return (
                      <div key={q.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                        <span className="min-w-0 flex-1 text-[0.8rem] text-[var(--text-primary)]">
                          {q.code && <span className="mr-1.5 text-[0.68rem] font-bold text-[var(--text-muted)]">{q.code}</span>}
                          {q.label}
                        </span>
                        <span className="shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold" style={{ color, background: color + "22" }}>
                          {v || "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-[0.68rem] text-[var(--text-muted)]">
                Enviada el {new Date(response.submittedAt).toLocaleString("es-GT")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
