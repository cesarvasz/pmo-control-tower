"use client";

// «✓ Completar» una acción del timeline (la Meeting 1 o la Meeting 2): muestra la fecha y hora que se van a anotar, pide elegir la
// SIGUIENTE acción (y la Clase si es Aprobada) y confirma. Es un panel dentro del pop-up (no otra ventana encima).

import { useState } from "react";
import { Boton, Nota } from "../comun";
import {
  CLASES_APROBADA, fechaValida, recordatorioPlanFuturo, siguientesDe,
  OPCION_COMPLETAR, type AccionCompletable, type ClaseAprobada, type OpcionCompletar,
} from "../../dominio/acciones-iniciativa";
import { ESPERA_INTERVALO_DIAS, ESPERA_MAX_CORREOS } from "@/lib/ini";

/** «16 nov 2026 · 15:42» en hora de Guatemala. */
export const fmtMomento = (d: Date) =>
  `${d.toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Guatemala" })} · ${d.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Guatemala" })}`;

const fmtDia = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric" });
const diaGT = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
const etiquetaCampo = "text-[0.72rem] font-normal uppercase tracking-wide text-[var(--text-secondary)]";

const chip = "cursor-pointer rounded-full border px-3 py-1 text-[0.82rem] font-semibold transition-colors";

export default function CompletarAccion({ accion, onConfirmar, onCancelar }: {
  /** La acción que se completa: de ella depende qué siguientes acciones se ofrecen (tras la Meeting 2 ya no está la Meeting 2). */
  accion: AccionCompletable;
  /** Rechaza con el mensaje si no se pudo guardar. */
  onConfirmar(d: { siguiente: OpcionCompletar; clase?: ClaseAprobada; fecha?: string }): Promise<void>;
  onCancelar(): void;
}) {
  const [ahora] = useState(() => new Date());
  const [siguiente, setSiguiente] = useState<OpcionCompletar | null>(null);
  const [clase, setClase] = useState<ClaseAprobada | null>(null);
  const [fecha, setFecha] = useState("");
  // Plan Futuro: la fecha en que se retoma tiene que ser posterior a hoy (hora de Guatemala)
  const manana = diaGT(new Date(ahora.getTime() + 24 * 3600_000));
  const fechaOk = fechaValida(fecha) !== null && fecha >= manana;
  const recordatorio = fechaOk ? recordatorioPlanFuturo(fecha) : null;
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = !!siguiente && (siguiente !== "Aprobada" || !!clase) && (siguiente !== "Plan Futuro" || fechaOk);

  async function confirmar() {
    if (!siguiente || !listo || enviando) return;
    setEnviando(true); setError(null);
    try {
      await onConfirmar({ siguiente, ...(siguiente === "Aprobada" && clase ? { clase } : {}), ...(siguiente === "Plan Futuro" ? { fecha } : {}) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
      setEnviando(false);
    }
  }

  const opcion = (activa: boolean) => (activa
    ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#fff" }
    : { borderColor: "var(--border)", background: "var(--bg-base)", color: "var(--text-primary)" });

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-3.5" style={{ borderColor: "var(--warn)", background: "var(--bg-base)" }} aria-label={`Completar ${accion}`}>
      <div className="flex flex-col">
        <h3 className="text-[0.95rem] font-bold text-[var(--text-primary)]">Completar «{accion}»</h3>
        <p className="text-[0.78rem] text-[var(--text-muted)]">
          Se anota al confirmar: <strong className="text-[var(--text-secondary)]">{fmtMomento(ahora)}</strong> (hora de Guatemala)
        </p>
      </div>

      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Siguiente acción">
        <span className="text-[0.72rem] font-normal uppercase tracking-wide text-[var(--text-secondary)]">{accion === "Sin Beneficio Definido" ? "¿Cómo se completa?" : "¿Cuál es la siguiente acción?"} <span className="text-[var(--bad)]">*</span></span>
        <div className="flex flex-wrap gap-2">
          {siguientesDe(accion).map((a) => (
            <button
              key={a} type="button" role="radio" aria-checked={siguiente === a} disabled={enviando}
              onClick={() => { setSiguiente(a); if (a !== "Aprobada") setClase(null); if (a !== "Plan Futuro") setFecha(""); }} className={chip} style={opcion(siguiente === a)}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {siguiente === "Aprobada" && (
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Clase con la que se aprueba">
          <span className="text-[0.72rem] font-normal uppercase tracking-wide text-[var(--text-secondary)]">¿Con qué Clase se aprueba? <span className="text-[var(--bad)]">*</span></span>
          <div className="flex flex-wrap gap-2">
            {CLASES_APROBADA.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={clase === c} disabled={enviando} onClick={() => setClase(c)} className={chip} style={opcion(clase === c)}>
                Clase {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {siguiente === "Plan Futuro" && (
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1">
            <span className={etiquetaCampo}>¿Cuándo se va a retomar? <span className="text-[var(--bad)]">*</span></span>
            <input
              type="date" value={fecha} min={manana} disabled={enviando} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha en que se retoma"
              className="w-fit rounded-md border px-2 py-1 text-[0.9rem] font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border-subtle)", background: "var(--bg-surface)" }}
            />
          </label>
          <p className="text-[0.78rem] text-[var(--text-muted)]">
            {recordatorio
              ? <>Recordatorio: <strong className="text-[var(--text-secondary)]">{fmtDia(recordatorio)}</strong> (5 días hábiles antes de retomarla).</>
              : "Se te recordará 5 días hábiles antes de esa fecha."}
          </p>
        </div>
      )}

      {siguiente === OPCION_COMPLETAR && (
        <p className="text-[0.78rem] text-[var(--text-muted)]">
          Se cierra sin aprobar: queda en verde con el mismo status («Sin Valor Def») y ya no se espera ninguna acción más. Se pausan los recordatorios (casilla PKU).
        </p>
      )}

      {siguiente === "Sin Beneficio Definido" && (
        <p className="text-[0.78rem] text-[var(--text-muted)]">
          Usa los mismos recordatorios que «Sin Valor Def»: un correo al CKU cada {ESPERA_INTERVALO_DIAS} días hábiles (máximo {ESPERA_MAX_CORREOS}), contando desde hoy.
          Marcar PKU los pausa.
        </p>
      )}

      {error && <Nota tono="mal">{error}</Nota>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!listo && (
          <span className="mr-auto text-[0.75rem] text-[var(--text-muted)]">
            {!siguiente ? "Elige la siguiente acción para poder completarla." : siguiente === "Plan Futuro" ? "Elige la fecha en que se retoma (posterior a hoy)." : "Elige la Clase para poder completarla."}
          </span>
        )}
        <Boton type="button" onClick={onCancelar} disabled={enviando}>Cancelar</Boton>
        <Boton primario onClick={() => void confirmar()} disabled={!listo || enviando}>{enviando ? "Completando…" : "✓ Completar"}</Boton>
      </div>
    </section>
  );
}
