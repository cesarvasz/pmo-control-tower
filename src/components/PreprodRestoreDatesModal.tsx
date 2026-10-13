"use client";

// Popup "Próximas fechas" de restauración de Pre-producción (banner del
// Control Tower): lista las fechas administradas a mano y permite agregar o
// quitar una. El banner afuera solo muestra la más próxima a futuro — ver
// nextPreprodRestoreDate en page.tsx.

import { useState } from "react";
import Modal from "@/components/Modal";
import { authedFetch } from "@/lib/api";
import { fmtDate, parseYMD, today } from "@/lib/business";

export default function PreprodRestoreDatesModal({ dates, onChange, onClose }: {
  dates: string[];
  onChange: (dates: string[]) => void;
  onClose: () => void;
}) {
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const sorted = [...dates].sort();
  const isPast = (d: string) => {
    const parsed = parseYMD(d);
    return !parsed || parsed.getTime() < today().getTime();
  };

  const add = async () => {
    if (!newDate) return;
    setBusy(true);
    setErr("");
    try {
      const res = await authedFetch("/api/preprod-restore-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newDate }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const body = (await res.json()) as { dates: string[] };
      onChange(body.dates);
      setNewDate("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al agregar la fecha");
    }
    setBusy(false);
  };

  const remove = async (date: string) => {
    setBusy(true);
    setErr("");
    try {
      const res = await authedFetch("/api/preprod-restore-dates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const body = (await res.json()) as { dates: string[] };
      onChange(body.dates);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al quitar la fecha");
    }
    setBusy(false);
  };

  return (
    <Modal open onClose={onClose} width={440} label="Próximas fechas de restauración">
      <div className="flex items-start justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="text-[1rem] font-bold text-[var(--text-primary)]">Próximas fechas · Restauración Pre-producción</div>
        <button onClick={onClose} className="shrink-0 rounded-lg px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {sorted.length === 0 ? (
          <div className="rounded-lg px-4 py-6 text-center text-[0.82rem] text-[var(--text-muted)]">
            Aún no hay fechas agregadas.
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((d) => (
              <div
                key={d}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--border)", opacity: isPast(d) ? 0.5 : 1 }}
              >
                <span className="text-[0.85rem] font-medium text-[var(--text-primary)]">{fmtDate(parseYMD(d))}</span>
                <button
                  onClick={() => remove(d)}
                  disabled={busy}
                  className="rounded-md px-2 py-1 text-[0.75rem] font-semibold text-[var(--text-muted)] hover:text-[var(--bad)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
        {err && <div className="mb-2 text-[0.8rem]" style={{ color: "var(--bad)" }}>{err}</div>}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border bg-[var(--bg-hover)] px-3 py-2 text-[0.82rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          />
          <button
            onClick={add}
            disabled={busy || !newDate}
            className="shrink-0 rounded-lg px-4 py-2 text-[0.82rem] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            Agregar
          </button>
        </div>
      </div>
    </Modal>
  );
}
