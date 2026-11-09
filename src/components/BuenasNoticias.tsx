"use client";

// «Buenas noticias» (portada, a la izquierda de la próxima restauración de Pre-producción): quién da las buenas noticias
// de la semana. El cuadro solo muestra el nombre el viernes previo y el día en que se dan (lunes, o martes si el lunes es
// asueto); el resto de la semana queda solo el rótulo. Al hacer clic se abre la lista de la semana actual y las 8
// siguientes, donde se puede elegir un suplente. La rotación está en lib/buenasNoticias.ts.

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { authedFetch } from "@/lib/api";
import { fmtDateWithWeekday, today } from "@/lib/business";
import { NOMBRES_BUENAS_NOTICIAS, listaDeSemanas, nombreVisibleHoy } from "@/lib/buenasNoticias";

export default function BuenasNoticias() {
  const [suplentes, setSuplentes] = useState<Record<string, string>>({});
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // «Hoy» se fija al montar y se refresca al abrir el popup: la lista se desliza sola con el calendario.
  const [hoy, setHoy] = useState(() => today());

  useEffect(() => {
    authedFetch("/api/buenas-noticias")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((d: { suplentes: Record<string, string> }) => setSuplentes(d.suplentes))
      .catch((e) => console.warn("Buenas noticias: no se pudieron cargar los suplentes:", e));
  }, []);

  const semanas = useMemo(() => listaDeSemanas(hoy, suplentes), [hoy, suplentes]);
  const visible = nombreVisibleHoy(hoy, suplentes);

  const guardar = async (semana: string, nombre: string | null) => {
    setBusy(true);
    setErr("");
    try {
      const res = await authedFetch("/api/buenas-noticias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semana, nombre }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setSuplentes(((await res.json()) as { suplentes: Record<string, string> }).suplentes);
      setEditando(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar el suplente");
    }
    setBusy(false);
  };

  return (
    <>
      <button
        onClick={() => { setHoy(today()); setAbierto(true); }}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.78rem] whitespace-nowrap"
        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        title="Ver quién da las buenas noticias cada semana"
      >
        <span aria-hidden>🎉</span>
        <span className="font-semibold text-[var(--text-primary)]">Buenas noticias</span>
        {visible && <span>{visible}</span>}
      </button>

      {abierto && (
        <Modal open onClose={() => setAbierto(false)} width={520} label="Buenas noticias">
          <div className="flex items-start justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
            <div className="text-[1rem] font-bold text-[var(--text-primary)]">Buenas noticias · Asignados por semana</div>
            <button onClick={() => setAbierto(false)} className="shrink-0 rounded-lg px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-2">
              {semanas.map((s, i) => (
                <div key={s.semana} className="rounded-lg border px-3 py-2"
                  style={{ borderColor: "var(--border)", borderLeft: `3px solid ${i === 0 ? "var(--ok)" : "var(--info)"}` }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[0.85rem] font-semibold capitalize text-[var(--text-primary)]">{fmtDateWithWeekday(s.dia)}</span>
                        {i === 0 && (
                          <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold uppercase leading-none"
                            style={{ color: "var(--ok)", background: "var(--ok-bg)" }}>Esta semana</span>
                        )}
                      </div>
                      <div className="text-[0.85rem] text-[var(--text-secondary)]">
                        {s.asignado}
                        {s.suplente && <span className="ml-1.5 text-[0.75rem] text-[var(--text-muted)]">(suple a {s.original})</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => setEditando(editando === s.semana ? null : s.semana)}
                      disabled={busy}
                      className="shrink-0 rounded-md border px-2 py-1 text-[0.75rem] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
                      style={{ borderColor: "var(--border)" }}
                      aria-label={`Cambiar al asignado de ${fmtDateWithWeekday(s.dia)}`}
                    >
                      Cambiar ▾
                    </button>
                  </div>
                  {editando === s.semana && (
                    <select
                      autoFocus
                      value={s.asignado}
                      disabled={busy}
                      onChange={(e) => guardar(s.semana, e.target.value === s.original ? null : e.target.value)}
                      className="mt-2 w-full rounded-lg border px-2 py-1.5 text-[0.9rem] outline-none"
                      style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      {NOMBRES_BUENAS_NOTICIAS.map((n) => (
                        <option key={n} value={n}>{n}{n === s.original ? " (según la rotación)" : ""}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
            <div className="text-[0.72rem] text-[var(--text-muted)]">
              Se rota cada lunes (si es asueto, el martes). Si quien toca no puede, elige quién lo suple. El nombre se ve en la portada solo el viernes previo y ese día.
            </div>
            {err && <div className="mt-2 text-[0.8rem]" style={{ color: "var(--bad)" }}>{err}</div>}
          </div>
        </Modal>
      )}
    </>
  );
}
