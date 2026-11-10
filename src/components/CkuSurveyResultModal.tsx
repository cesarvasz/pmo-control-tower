"use client";

// Respuestas de una encuesta NPS de un CKU: una tarjeta por persona que contestó (nombre, correo, NPS, respuesta abierta y
// dimensiones). Un Admin puede invalidar una respuesta (deja de contar en el NPS del Player) o devolverla.

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { authedFetch } from "@/lib/api";
import { CKU_ABIERTA_ID, CKU_SURVEY_QUESTIONS, type CkuSurveyDoc, type CkuSurveyResponseDoc } from "@/lib/surveyCku";

const LIKERT_COLOR: Record<string, string> = {
  "Totalmente de acuerdo": "#10b981",
  "De acuerdo": "#34d399",
  "Neutral": "#f59e0b",
  "En desacuerdo": "#f97316",
  "Totalmente en desacuerdo": "#ef4444",
};
const npsColor = (v: number) => (v >= 9 ? "var(--ok)" : v >= 7 ? "var(--warn)" : "var(--bad)");
const npsLabel = (v: number) => (v >= 9 ? "Promotor" : v >= 7 ? "Pasivo" : "Detractor");

export default function CkuSurveyResultModal({ token, puedeGestionar, onClose, onChanged }: {
  token: string;
  /** Invalidar / validar respuestas: un Admin o el CKU dueño de la encuesta. */
  puedeGestionar: boolean; onClose: () => void;
  /** Se llama tras invalidar o validar una respuesta (para refrescar los números de afuera). */
  onChanged?: () => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [survey, setSurvey] = useState<CkuSurveyDoc | null>(null);
  const [responses, setResponses] = useState<CkuSurveyResponseDoc[]>([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/surveys-cku/${token}/responses`);
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`); setState("error"); return; }
      const data = (await res.json()) as { survey: CkuSurveyDoc; responses: CkuSurveyResponseDoc[] };
      setSurvey(data.survey); setResponses(data.responses); setState("ready");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar"); setState("error");
    }
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial (sistema externo)
  useEffect(() => { load(); }, [load]);

  const invalidar = async (r: CkuSurveyResponseDoc) => {
    setBusyId(r.id);
    try {
      const res = await authedFetch(`/api/surveys-cku/${token}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId: r.id, invalidated: !r.invalidated }),
      });
      if (res.ok) { await load(); onChanged?.(); }
    } catch { /* noop */ }
    setBusyId(null);
  };

  return (
    <Modal open onClose={onClose} width={768}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0">
          <div className="text-[0.66rem] uppercase tracking-widest text-[var(--text-muted)]">Respuestas · Encuesta CKU</div>
          <div className="mt-0.5 text-[1.05rem] font-bold text-[var(--text-primary)]">{survey?.nombre || "—"}</div>
          {survey && <div className="mt-0.5 text-[0.76rem] text-[var(--text-muted)]">CKU {survey.cku} · {responses.length} respuesta{responses.length === 1 ? "" : "s"}</div>}
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {state === "loading" && <div className="py-10 text-center text-[0.85rem] text-[var(--text-muted)]">Cargando…</div>}
        {state === "error" && <div className="py-10 text-center text-[0.85rem]" style={{ color: "var(--bad)" }}>{err}</div>}
        {state === "ready" && responses.length === 0 && (
          <div className="py-10 text-center text-[0.85rem] text-[var(--text-muted)]">Aún nadie ha contestado esta encuesta.</div>
        )}

        {state === "ready" && responses.length > 0 && (
          <div className="space-y-4">
            {responses.map((r) => {
              const nps = Number(r.answers["nps"]);
              const valido = Number.isFinite(nps);
              const abierta = String(r.answers[CKU_ABIERTA_ID] ?? "").trim();
              return (
                <div key={r.id} className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)", opacity: r.invalidated ? 0.6 : 1 }}>
                  <div className="flex items-center gap-3 px-4 py-3" style={{ background: "var(--bg-hover)" }}>
                    {valido && (
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg" style={{ background: npsColor(nps) + "22" }}>
                        <span className="text-[1.15rem] font-extrabold leading-none" style={{ color: npsColor(nps) }}>{nps}</span>
                        <span className="text-[0.55rem] text-[var(--text-muted)]">/ 10</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.88rem] font-semibold text-[var(--text-primary)]">{r.respondentName}</div>
                      <div className="truncate text-[0.7rem] text-[var(--text-muted)]">
                        {r.respondentEmail} · {new Date(r.submittedAt).toLocaleString("es-GT")}
                      </div>
                    </div>
                    {valido && <span className="shrink-0 text-[0.72rem] font-bold" style={{ color: npsColor(nps) }}>{npsLabel(nps)}</span>}
                    {r.invalidated && <span className="shrink-0 text-[0.7rem] font-bold" style={{ color: "var(--bad)" }}>⊘ Invalidada</span>}
                    {puedeGestionar && (
                      <button
                        onClick={() => invalidar(r)} disabled={busyId === r.id}
                        className="shrink-0 rounded-md border px-2.5 py-1 text-[0.7rem] font-semibold disabled:opacity-50"
                        style={{ borderColor: "var(--border)", color: r.invalidated ? "var(--ok)" : "var(--bad)" }}
                      >
                        {r.invalidated ? "Validar" : "Invalidar"}
                      </button>
                    )}
                  </div>

                  <div className="space-y-3 px-4 py-3">
                    <div>
                      <div className="mb-1 text-[0.68rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">¿Qué podría hacer el CKU para apoyarte mejor?</div>
                      <div className="text-[0.82rem] leading-relaxed text-[var(--text-primary)]">{abierta || <span className="text-[var(--text-muted)]">—</span>}</div>
                    </div>
                    <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
                      {CKU_SURVEY_QUESTIONS.filter((q) => q.type === "likert").map((q, i) => {
                        const v = String(r.answers[q.id] ?? "");
                        const color = LIKERT_COLOR[v] ?? "var(--text-muted)";
                        return (
                          <div key={q.id} className="flex items-center gap-3 px-3 py-2" style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                            <span className="min-w-0 flex-1 text-[0.76rem] text-[var(--text-primary)]">
                              {q.code && <span className="mr-1.5 text-[0.66rem] font-bold text-[var(--text-muted)]">{q.code}</span>}
                              {q.label}
                            </span>
                            <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold" style={{ color, background: color + "22" }}>{v || "—"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
