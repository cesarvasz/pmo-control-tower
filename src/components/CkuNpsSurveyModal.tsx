"use client";

// Encuestas NPS de un CKU, desde su tarjeta en /players. El CKU (o un Admin por él) escribe el nombre de lo que se va a
// calificar y se genera UN enlace que varias personas pueden contestar (piden nombre y correo; una vez por correo). Sus
// resultados cuentan en el NPS del Player de ese CKU y se ven en /encuestas (pestaña CKU).

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { authedFetch } from "@/lib/api";
import { enlaceEncuestaCku, type CkuSurveyDoc } from "@/lib/surveyCku";

export default function CkuNpsSurveyModal({ cku, onClose }: { cku: string; onClose: () => void }) {
  const [list, setList] = useState<CkuSurveyDoc[] | null>(null);
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/surveys-cku");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const all = (await res.json()) as CkuSurveyDoc[];
      setList(all.filter((s) => s.cku === cku));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar las encuestas");
      setList([]);
    }
  }, [cku]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial (sistema externo)
  useEffect(() => { load(); }, [load]);

  const crear = async () => {
    if (!nombre.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const res = await authedFetch("/api/surveys-cku", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, cku }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const s = (await res.json()) as CkuSurveyDoc;
      setNuevo(s.token);
      setNombre("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo crear la encuesta");
    }
    setSaving(false);
  };

  const link = (token: string) => enlaceEncuestaCku(typeof window === "undefined" ? "" : window.location.origin, token);
  const copiar = async (token: string) => {
    try {
      await navigator.clipboard.writeText(link(token));
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1800);
    } catch { /* el campo se puede copiar a mano */ }
  };
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <Modal open onClose={onClose} width={640} label="Encuesta NPS del CKU">
      <div className="flex items-start justify-between gap-3 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0">
          <div className="text-[0.66rem] uppercase tracking-widest text-[var(--text-muted)]">Encuesta NPS · CKU</div>
          <div className="mt-0.5 text-[1.05rem] font-bold text-[var(--text-primary)]">{cku}</div>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
      </div>

      <div className="border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <label className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          ¿Qué se va a calificar?
        </label>
        <div className="flex items-center gap-2">
          <input
            value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120}
            onKeyDown={(e) => { if (e.key === "Enter") crear(); }}
            placeholder="Nombre de la encuesta, p. ej. Capacitación de herramientas nov-2026"
            className="min-w-0 flex-1 rounded-lg border bg-[var(--bg-hover)] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          />
          <button
            onClick={crear} disabled={saving || !nombre.trim()}
            className="shrink-0 rounded-lg px-4 py-2 text-[0.85rem] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {saving ? "…" : "Crear encuesta"}
          </button>
        </div>
        <div className="mt-2 text-[0.72rem] text-[var(--text-muted)]">
          Se genera un solo enlace que puede contestar cualquier persona: pide su nombre y correo, y cada correo contesta una sola vez.
        </div>
        {err && <div className="mt-2 text-[0.8rem]" style={{ color: "var(--bad)" }}>{err}</div>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="mb-2 text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">
          Encuestas creadas{list ? ` (${list.length})` : ""}
        </div>
        {list === null ? (
          <div className="py-6 text-center text-[0.82rem] text-[var(--text-muted)]">Cargando…</div>
        ) : list.length === 0 ? (
          <div className="rounded-lg px-4 py-6 text-center text-[0.82rem] text-[var(--text-muted)]">Aún no hay encuestas. Crea la primera con el nombre de lo que se va a calificar.</div>
        ) : (
          <div className="space-y-3">
            {list.map((s) => (
              <div
                key={s.token} className="rounded-xl border p-3"
                style={{ borderColor: s.token === nuevo ? "var(--accent)" : "var(--border)", borderLeft: "3px solid var(--info)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 truncate text-[0.88rem] font-semibold text-[var(--text-primary)]" title={s.nombre}>{s.nombre}</div>
                  <div className="shrink-0 text-[0.72rem] text-[var(--text-muted)]">
                    {s.respuestas} respuesta{s.respuestas === 1 ? "" : "s"} · {fmt(s.createdAt)}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    readOnly value={link(s.token)} onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-lg border bg-[var(--bg-hover)] px-2.5 py-1.5 text-[0.7rem] text-[var(--text-secondary)]"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <button
                    onClick={() => copiar(s.token)}
                    className="shrink-0 rounded-lg border px-3 py-1.5 text-[0.72rem] font-semibold text-[var(--accent)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {copied === s.token ? "¡Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
