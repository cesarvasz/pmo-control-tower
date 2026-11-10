"use client";

// Encuesta NPS de un CKU (pública, sin login). Mismo diseño que /encuesta/[token] (la de PM), pero un solo enlace lo
// contestan varias personas: cada una escribe su nombre y correo, y un mismo correo contesta cada encuesta una sola vez.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LIKERT_OPTIONS } from "@/lib/survey";
import {
  CKU_SURVEY_DIMENSIONS_TITLE,
  CKU_SURVEY_QUESTIONS,
  ckuIsComplete,
  esCorreoValido,
  type CkuAnswers,
  type PublicCkuSurvey,
} from "@/lib/surveyCku";

type Phase = "loading" | "ready" | "answered" | "notfound" | "error";

const answered = (v: string | number | undefined) =>
  v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");

export default function EncuestaCkuPage() {
  const { token } = useParams<{ token: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [survey, setSurvey] = useState<PublicCkuSurvey | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [yaContesto, setYaContesto] = useState(false);
  const [answers, setAnswers] = useState<CkuAnswers>({});
  const [errMsg, setErrMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // El cuestionario usa por defecto el tema institucional C807 (verde).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "c807");
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/surveys-cku/${token}`, { cache: "no-store" });
      if (res.status === 404) { setPhase("notfound"); return; }
      if (!res.ok) { setErrMsg((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`); setPhase("error"); return; }
      setSurvey(((await res.json()) as { survey: PublicCkuSurvey }).survey);
      setPhase("ready");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Error al cargar la encuesta");
      setPhase("error");
    }
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial (sistema externo)
  useEffect(() => { load(); }, [load]);

  // Al salir del campo del correo se avisa si ese correo ya contestó, antes de que llene todo.
  const revisarCorreo = async () => {
    setYaContesto(false);
    if (!esCorreoValido(email)) return;
    try {
      const res = await fetch(`/api/surveys-cku/${token}/check`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      if (res.ok) setYaContesto(((await res.json()) as { answered: boolean }).answered);
    } catch { /* se valida de todos modos al enviar */ }
  };

  const datosOk = name.trim() !== "" && esCorreoValido(email);
  const listo = datosOk && ckuIsComplete(answers) && !yaContesto;

  const submit = async () => {
    if (!listo) { setErrMsg("Escribe tu nombre y correo y responde todas las preguntas antes de enviar."); return; }
    setSubmitting(true);
    setErrMsg("");
    try {
      const res = await fetch(`/api/surveys-cku/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, answers }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error || `HTTP ${res.status}`;
        if (res.status === 409) setYaContesto(true);
        setErrMsg(msg);
        setSubmitting(false);
        return;
      }
      setPhase("answered");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Error al enviar");
      setSubmitting(false);
    }
  };

  const total = CKU_SURVEY_QUESTIONS.length;
  const done = CKU_SURVEY_QUESTIONS.filter((q) => answered(answers[q.id])).length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="flex min-h-screen justify-center px-4 py-8 sm:py-12" style={{ background: "var(--bg-base)" }}>
      <div
        className="h-fit w-full max-w-3xl overflow-hidden rounded-2xl border shadow-xl"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div className="border-b px-8 py-6" style={{ borderColor: "var(--border)", background: "var(--bg-accent-soft)" }}>
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pmo-logo.png" alt="PMO" className="h-12 w-12 shrink-0 object-contain" />
            <div className="min-w-0">
              <div className="text-[0.66rem] uppercase tracking-[0.15em] text-[var(--text-muted)]">Encuesta CKU</div>
              <div className="text-[1.25rem] font-bold leading-tight text-[var(--text-primary)]">Tu opinión sobre el apoyo del CKU</div>
            </div>
          </div>
          {survey && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip label="CKU" value={survey.cku} />
              <Chip value={survey.nombre} />
            </div>
          )}
        </div>

        {/* Progreso (solo en el formulario) */}
        {phase === "ready" && (
          <div className="border-b px-8 py-3" style={{ borderColor: "var(--border)" }}>
            <div className="mb-1.5 flex items-center justify-between text-[0.72rem]">
              <span className="text-[var(--text-muted)]">Tu progreso</span>
              <span className="font-semibold text-[var(--text-secondary)]">{done} / {total}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--accent)" }} />
            </div>
          </div>
        )}

        <div className="px-8 py-7">
          {phase === "loading" && <Msg>Cargando…</Msg>}
          {phase === "notfound" && <Msg tone="warn">La encuesta no existe o el enlace no es válido.</Msg>}
          {phase === "error" && <Msg tone="warn">{errMsg || "Ocurrió un error."}</Msg>}

          {phase === "answered" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full text-3xl"
                style={{ background: "var(--health-on-track-bg)", color: "#10b981" }}
              >
                ✓
              </div>
              <div className="text-[1.1rem] font-bold text-[var(--text-primary)]">¡Gracias! Tu respuesta fue registrada.</div>
              <div className="text-[0.85rem] text-[var(--text-muted)]">Con este correo ya no puedes volver a contestar esta encuesta.</div>
            </div>
          )}

          {phase === "ready" && (
            <>
              {/* Quién contesta */}
              <div className="mb-2 grid gap-4 sm:grid-cols-2">
                <Campo label="Tu nombre">
                  <input
                    value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name"
                    placeholder="Nombre y apellido"
                    className="w-full rounded-xl border bg-[var(--bg-hover)] px-4 py-2.5 text-[0.85rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                    style={{ borderColor: "var(--border)" }}
                  />
                </Campo>
                <Campo label="Tu correo">
                  <input
                    type="email" value={email} autoComplete="email" placeholder="nombre@empresa.com"
                    onChange={(e) => { setEmail(e.target.value); setYaContesto(false); }}
                    onBlur={revisarCorreo}
                    className="w-full rounded-xl border bg-[var(--bg-hover)] px-4 py-2.5 text-[0.85rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                    style={{ borderColor: yaContesto ? "var(--bad)" : "var(--border)" }}
                  />
                </Campo>
              </div>
              {yaContesto && (
                <div className="mb-2 rounded-lg px-3 py-2 text-[0.8rem]" style={{ background: "var(--pill-atrasado-bg)", color: "var(--pill-atrasado-fg)" }}>
                  Ese correo ya contestó esta encuesta; no se puede volver a llenar.
                </div>
              )}

              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {CKU_SURVEY_QUESTIONS.map((q, i) => {
                  const first = q.type === "likert" && CKU_SURVEY_QUESTIONS[i - 1]?.type !== "likert";
                  return (
                    <div key={q.id}>
                      {first && (
                        <div className="mt-6 mb-1 flex items-center gap-3">
                          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                          <div className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
                            {CKU_SURVEY_DIMENSIONS_TITLE}
                          </div>
                          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                        </div>
                      )}
                      <div className="flex gap-4 py-6">
                        <span
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.72rem] font-bold"
                          style={answered(answers[q.id])
                            ? { background: "var(--accent)", color: "#fff" }
                            : { background: "var(--bg-hover)", color: "var(--text-muted)" }}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-3 text-[0.9rem] font-medium leading-snug text-[var(--text-primary)]">{q.label}</div>

                          {q.type === "nps" && (
                            <div>
                              <div className="flex gap-1.5">
                                {Array.from({ length: 11 }, (_, n) => n).map((n) => {
                                  const active = answers[q.id] === n;
                                  return (
                                    <button
                                      key={n}
                                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                                      className="h-11 flex-1 rounded-lg border text-[0.85rem] font-bold transition-all"
                                      style={active
                                        ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#fff" }
                                        : { borderColor: "var(--border)", color: "var(--text-secondary)" }}
                                    >
                                      {n}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="mt-2 flex justify-between text-[0.68rem] text-[var(--text-muted)]">
                                <span>0 · Nada probable</span>
                                <span>10 · Muy probable</span>
                              </div>
                            </div>
                          )}

                          {q.type === "text" && (
                            <textarea
                              value={(answers[q.id] as string) ?? ""}
                              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                              rows={4}
                              placeholder="Escribe tu respuesta…"
                              className="w-full rounded-xl border bg-[var(--bg-hover)] px-4 py-3 text-[0.85rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                              style={{ borderColor: "var(--border)" }}
                            />
                          )}

                          {q.type === "likert" && (
                            <div className="flex gap-2">
                              {LIKERT_OPTIONS.map((opt) => {
                                const active = answers[q.id] === opt;
                                return (
                                  <button
                                    key={opt}
                                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                                    className="flex min-h-[3.25rem] flex-1 items-center justify-center rounded-xl border px-2 text-center text-[0.73rem] font-medium leading-tight transition-all"
                                    style={active
                                      ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#fff", boxShadow: "0 1px 6px var(--shadow)" }
                                      : { borderColor: "var(--border)", color: "var(--text-secondary)" }}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {errMsg && (
                <div className="mt-4 rounded-lg px-3 py-2 text-[0.8rem]" style={{ background: "var(--pill-atrasado-bg)", color: "var(--pill-atrasado-fg)" }}>
                  {errMsg}
                </div>
              )}

              <div className="mt-7 border-t pt-6" style={{ borderColor: "var(--border)" }}>
                <button
                  onClick={submit}
                  disabled={submitting || !listo}
                  className="w-full rounded-xl px-5 py-3 text-[0.92rem] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--accent)" }}
                >
                  {submitting ? "Enviando…" : "Enviar respuesta"}
                </button>
                <div className="mt-2 text-center text-[0.68rem] text-[var(--text-muted)]">
                  Solo puedes enviarla una vez con tu correo. No podrás modificarla después.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

function Chip({ label, value }: { label?: string; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.72rem]"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
    >
      {label && <b className="text-[var(--text-muted)]">{label}</b>}
      {value}
    </span>
  );
}

function Msg({ children, tone }: { children: React.ReactNode; tone?: "warn" }) {
  return (
    <div
      className="rounded-lg px-4 py-6 text-center text-[0.85rem]"
      style={tone === "warn"
        ? { background: "var(--pill-atrasado-bg)", color: "var(--pill-atrasado-fg)" }
        : { color: "var(--text-muted)" }}
    >
      {children}
    </div>
  );
}
