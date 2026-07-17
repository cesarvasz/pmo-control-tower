"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import type { DirectorioEntry } from "@/types";
import type { SurveyDoc } from "@/lib/survey";
import Modal from "@/components/Modal";

interface ReqTarget { reqId: string; reqCode: string; reqName: string; pm: string }

export default function SurveySendModal({
  target, existing, directorio, isAdmin, onClose, onChange, onResult,
}: {
  target: ReqTarget;
  existing: SurveyDoc[];
  directorio: DirectorioEntry[];
  isAdmin: boolean;
  onClose: () => void;
  onChange: (list: SurveyDoc[]) => void;
  onResult: (token: string) => void;
}) {
  const [list, setList] = useState<SurveyDoc[]>(existing);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const update = (next: SurveyDoc[]) => { setList(next); onChange(next); };

  // Correos que ya tienen un link en este REQ → no se ofrecen de nuevo en el desplegable.
  const usedEmails = new Set(list.map((s) => s.assignedEmail.toLowerCase()));
  const options = directorio.filter((d) => !usedEmails.has(d.email.toLowerCase()));

  const linkOf = (token: string) => `${window.location.origin}/encuesta/${token}`;

  const add = async () => {
    const entry = directorio.find((d) => d.email === email);
    if (!entry) { setErr("Selecciona una persona del Directorio RH."); return; }
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
      const next = list.some((x) => x.token === s.token)
        ? list.map((x) => (x.token === s.token ? s : x))
        : [...list, s];
      update(next);
      setEmail("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al generar el enlace");
    }
    setSaving(false);
  };

  const cancel = async (token: string) => {
    if (!window.confirm("Se eliminará este enlace pendiente. ¿Continuar?")) return;
    setBusyToken(token); setErr("");
    try {
      const t = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/surveys/${token}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) update(list.filter((s) => s.token !== token));
      else setErr((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cancelar");
    }
    setBusyToken(null);
  };

  const copy = async (token: string) => {
    try { await navigator.clipboard.writeText(linkOf(token)); setCopiedToken(token); setTimeout(() => setCopiedToken(null), 1500); } catch {}
  };

  const answeredCount = list.filter((s) => s.answered).length;

  return (
    <Modal open onClose={onClose} width={512}>
        {/* Header */}
        <div className="flex items-start justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">Encuestas del REQ</div>
            <div className="mt-0.5 text-[1rem] font-bold text-[var(--text-primary)]">{target.reqCode || target.reqName}</div>
            <div className="text-[0.75rem] text-[var(--text-muted)]">{target.reqName} · PM: {target.pm || "—"}</div>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
        </div>

        {/* Agregar persona */}
        <div className="border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <div className="text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">Agregar destinatario (Directorio RH)</div>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border bg-[var(--bg-hover)] px-3 py-2 text-[0.82rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">Selecciona una persona…</option>
              {options.map((d) => (
                <option key={d.email} value={d.email}>{d.name} · {d.email}</option>
              ))}
            </select>
            <button
              onClick={add}
              disabled={saving || !email}
              className="shrink-0 rounded-lg px-4 py-2 text-[0.85rem] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--accent)" }}
              title="Generar un enlace para esta persona"
            >
              {saving ? "…" : "＋ Agregar"}
            </button>
          </div>
          {err && <div className="mt-2 text-[0.8rem]" style={{ color: "var(--bad)" }}>{err}</div>}
        </div>

        {/* Lista de destinatarios */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">
              Destinatarios ({list.length})
            </div>
            {list.length > 0 && (
              <div className="text-[0.68rem] text-[var(--text-muted)]">{answeredCount} contestada{answeredCount !== 1 ? "s" : ""}</div>
            )}
          </div>

          {list.length === 0 ? (
            <div className="rounded-lg px-4 py-6 text-center text-[0.82rem] text-[var(--text-muted)]">
              Aún no hay destinatarios. Agrega personas con ＋ para generar un enlace por cada una.
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((s) => (
                <div key={s.token} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[0.85rem] font-semibold text-[var(--text-primary)]">{s.assignedName || s.assignedEmail}</div>
                      <div className="truncate text-[0.7rem] text-[var(--text-muted)]">{s.assignedEmail}</div>
                    </div>
                    {s.invalidated
                      ? <span className="shrink-0 text-[0.72rem] font-semibold" style={{ color: "var(--bad)" }}>⊘ Invalidada</span>
                      : s.answered
                        ? <span className="shrink-0 text-[0.72rem] font-semibold" style={{ color: "var(--ok)" }}>✓ Contestada</span>
                        : <span className="shrink-0 text-[0.72rem] font-semibold" style={{ color: "var(--warn)" }}>⏳ Pendiente</span>}
                  </div>

                  {s.answered ? (
                    <div className="mt-2">
                      <button
                        onClick={() => onResult(s.token)}
                        className="rounded-md border px-2.5 py-1 text-[0.7rem] font-semibold"
                        style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                      >
                        Ver respuestas
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        readOnly
                        value={linkOf(s.token)}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-lg border bg-[var(--bg-hover)] px-2.5 py-1.5 text-[0.7rem] text-[var(--text-secondary)]"
                        style={{ borderColor: "var(--border)" }}
                      />
                      <button
                        onClick={() => copy(s.token)}
                        className="shrink-0 rounded-lg border px-3 py-1.5 text-[0.72rem] font-semibold text-[var(--accent)]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {copiedToken === s.token ? "¡Copiado!" : "Copiar"}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => cancel(s.token)}
                          disabled={busyToken === s.token}
                          className="shrink-0 rounded-lg border px-2.5 py-1.5 text-[0.72rem] font-semibold disabled:opacity-50"
                          style={{ borderColor: "var(--border)", color: "var(--bad)" }}
                          title="Eliminar este enlace pendiente"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </Modal>
  );
}
