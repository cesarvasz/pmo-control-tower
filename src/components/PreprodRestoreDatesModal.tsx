"use client";

// Popup "Próximas fechas" de restauración de Pre-producción (banner del
// Control Tower): el calendario se calcula solo (ver ensurePreprodSchedule
// en lib/preprodSchedule.ts) — siempre 5 fechas a futuro, cada 14 días
// hábiles, y un histórico de las 3 más recientes. Este popup es de solo
// lectura salvo "Quitar" (p. ej. para cancelar un ciclo puntual; el que
// sigue se vuelve a generar solo). No hay opción de agregar fechas a mano.
// El banner afuera solo muestra la más próxima a futuro — ver nextPreprodDate
// en page.tsx.

import { useState } from "react";
import Modal from "@/components/Modal";
import { authedFetch } from "@/lib/api";
import { fmtDate, parseYMD, today } from "@/lib/business";

export default function PreprodRestoreDatesModal({ dates, onChange, onClose }: {
  dates: string[];
  onChange: (dates: string[]) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const sorted = [...dates].sort();
  const todayMs = today().getTime();
  // Próxima (primera fecha a futuro) en verde; pasadas en amarillo; futuras
  // después de la próxima en azul.
  const nextDate = sorted.find((d) => (parseYMD(d)?.getTime() ?? 0) >= todayMs);
  const colorFor = (d: string): string => {
    const t = parseYMD(d)?.getTime() ?? 0;
    if (t < todayMs) return "var(--warn)";
    if (d === nextDate) return "var(--ok)";
    return "var(--info)";
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
            Aún no hay fechas calculadas.
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((d) => {
              const color = colorFor(d);
              const isNext = d === nextDate;
              return (
                <div
                  key={d}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                  style={{
                    borderColor: "var(--border)",
                    borderLeft: `3px solid ${color}`,
                    background: isNext ? "var(--ok-bg)" : undefined,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[0.85rem] font-semibold" style={{ color }}>{fmtDate(parseYMD(d))}</span>
                    {isNext && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold uppercase leading-none"
                        style={{ color: "var(--ok)", background: "var(--ok-bg)" }}
                      >
                        Próxima
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => remove(d)}
                    disabled={busy}
                    className="rounded-md px-2 py-1 text-[0.75rem] font-semibold text-[var(--text-muted)] hover:text-[var(--bad)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="text-[0.72rem] text-[var(--text-muted)]">
          El calendario se completa solo cada 14 días hábiles, siempre con 5 fechas a futuro.
        </div>
        {err && <div className="mt-2 text-[0.8rem]" style={{ color: "var(--bad)" }}>{err}</div>}
      </div>
    </Modal>
  );
}
