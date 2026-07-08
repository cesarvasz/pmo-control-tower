"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import type { DirectorioEntry } from "@/types";
import type { SurveyDoc } from "@/lib/survey";

interface ReqTarget { reqId: string; reqCode: string; reqName: string; pm: string }

export default function SurveySendModal({
  target, existing, directorio, onClose, onSaved,
}: {
  target: ReqTarget;
  existing: SurveyDoc | null;
  directorio: DirectorioEntry[];
  onClose: () => void;
  onSaved: (s: SurveyDoc) => void;
}) {
  const alreadyAnswered = !!existing?.answered;
  const [email, setEmail] = useState(existing && !existing.answered ? existing.assignedEmail : "");
  const [survey, setSurvey] = useState<SurveyDoc | null>(existing && !existing.answered ? existing : null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const link = survey ? `${window.location.origin}/encuesta/${survey.token}` : "";

  const generate = async () => {
    const entry = directorio.find((d) => d.email === email);
    if (!entry) { setErr("Selecciona un destinatario del Directorio RH."); return; }
    setSaving(true); setErr("");
    try {
      const t = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          reqId: target.reqId, reqCode: target.reqCode, reqName: target.reqName, pm: target.pm,
          assignedEmail: entry.email, assignedName: entry.name,
        }),
      });
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`); setSaving(false); return; }
      const s = (await res.json()) as SurveyDoc;
      setSurvey(s); onSaved(s); setSaving(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al generar la encuesta"); setSaving(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">Enviar Encuesta</div>
            <div className="mt-0.5 text-[1rem] font-bold text-[var(--text-primary)]">{target.reqCode || target.reqName}</div>
            <div className="text-[0.75rem] text-[var(--text-muted)]">{target.reqName} · PM: {target.pm || "—"}</div>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {alreadyAnswered ? (
            <div className="rounded-lg px-4 py-4 text-center text-[0.85rem]" style={{ background: "var(--health-on-track-bg)", color: "var(--text-secondary)" }}>
              ✓ Esta encuesta ya fue contestada por <b>{existing?.assignedName || existing?.assignedEmail}</b>.
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">Destinatario (Directorio RH)</span>
                <select
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-lg border bg-[var(--bg-hover)] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <option value="">Selecciona una persona…</option>
                  {directorio.map((d) => (
                    <option key={d.email} value={d.email}>{d.name} · {d.email}</option>
                  ))}
                </select>
              </label>

              <button
                onClick={generate}
                disabled={saving || !email}
                className="w-full rounded-lg px-4 py-2 text-[0.85rem] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                {saving ? "Generando…" : survey ? "Actualizar destinatario" : "Generar enlace"}
              </button>

              {err && <div className="text-[0.8rem]" style={{ color: "#ef4444" }}>{err}</div>}

              {survey && (
                <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="text-[0.66rem] uppercase tracking-wide text-[var(--text-muted)]">Enlace personalizado</div>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={link}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-lg border bg-[var(--bg-hover)] px-2.5 py-1.5 text-[0.72rem] text-[var(--text-secondary)]"
                      style={{ borderColor: "var(--border)" }}
                    />
                    <button
                      onClick={copy}
                      className="shrink-0 rounded-lg border px-3 py-1.5 text-[0.75rem] font-semibold text-[var(--accent)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {copied ? "¡Copiado!" : "Copiar"}
                    </button>
                  </div>
                  <div className="text-[0.68rem] text-[var(--text-muted)]">
                    Pega este enlace en tu correo personalizado. Solo <b>{survey.assignedEmail}</b> podrá abrirlo y contestarlo una vez.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
