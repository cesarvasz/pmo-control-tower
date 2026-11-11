"use client";

// Encuesta NPS de un entregable del CKU (/players). El botón sale junto a cada entregable COMPLETADO (item de la Fase 3 con
// Status Done en Monday) y junto a cada PML ya CERRADO; la encuesta toma su nombre automáticamente: ya no se escribe a mano. Un clic crea la encuesta (o abre la que ya tiene) y
// muestra su enlace, que contesta cualquier persona con su nombre y correo (una vez por correo). Los resultados cuentan en
// el NPS del Player del CKU y se ven en /encuestas (pestaña CKU).
//
// El proveedor se pone solo donde la persona puede mandar encuestas (un Admin, o el propio CKU): sin él, el botón no se pinta.

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import Modal from "@/components/Modal";
import { authedFetch } from "@/lib/api";
import { enlaceEncuestaCku, type CkuSurveyDoc } from "@/lib/surveyCku";

interface Ctx {
  /** La encuesta de un entregable (por id del item) de un CKU, si ya la tiene. */
  de: (cku: string, itemId: string) => CkuSurveyDoc | undefined;
  /** Crea la encuesta del entregable (o devuelve la que ya tiene). */
  crear: (cku: string, itemId: string, nombre: string) => Promise<CkuSurveyDoc>;
}

const EncuestasCtx = createContext<Ctx | null>(null);

export function CkuEncuestasProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<CkuSurveyDoc[]>([]);

  const cargar = useCallback(async () => {
    try {
      const res = await authedFetch("/api/surveys-cku");
      if (res.ok) setLista((await res.json()) as CkuSurveyDoc[]);
    } catch { /* sin la lista el botón solo ofrece crearla */ }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial (sistema externo)
  useEffect(() => { cargar(); }, [cargar]);

  const ctx = useMemo<Ctx>(() => ({
    de: (cku, itemId) => lista.find((s) => s.cku === cku && s.entregableId === itemId),
    crear: async (cku, itemId, nombre) => {
      const res = await authedFetch("/api/surveys-cku", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cku, entregableId: itemId, nombre }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const s = (await res.json()) as CkuSurveyDoc;
      setLista((l) => (l.some((x) => x.token === s.token) ? l : [s, ...l]));
      return s;
    },
  }), [lista]);

  return <EncuestasCtx.Provider value={ctx}>{children}</EncuestasCtx.Provider>;
}

/** El botón junto a un entregable (item de la Fase 3) o un PML: solo si ya está completado (Done / CERRADO) y la persona puede
 *  mandar encuestas. `itemId` es el id del item o del PML (una encuesta por cada uno). El pop-up se abre al instante, con el
 *  nombre del entregable; si la encuesta aún no existe, el enlace aparece en cuanto el servidor la crea. */
export function BotonEncuestaEntregable({ cku, itemId, nombre, completado }: { cku: string; itemId: string; nombre: string; completado: boolean }) {
  const ctx = useContext(EncuestasCtx);
  const [abierto, setAbierto] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState("");
  if (!ctx || !completado) return null;

  const existente = ctx.de(cku, itemId);
  const generar = async () => {
    setErr("");
    try {
      setToken((await ctx.crear(cku, itemId, nombre)).token);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo crear la encuesta");
    }
  };
  const abrir = () => {
    setAbierto(true);
    if (existente) { setErr(""); setToken(existente.token); return; }
    setToken(null);
    generar();
  };

  return (
    <>
      <button
        type="button" onClick={abrir}
        className="rounded-md border px-2 py-0.5 text-[0.65rem] font-semibold whitespace-nowrap text-[var(--accent-light)] hover:bg-[var(--bg-hover)]"
        style={{ borderColor: "var(--border)" }}
        title={existente ? "Ver el enlace de la encuesta NPS de este entregable" : "Crear la encuesta NPS de este entregable y obtener su enlace"}
      >
        {existente ? "Ver encuesta NPS" : "Encuesta NPS"}
      </button>
      {abierto && (
        <EncuestaEntregableModal
          cku={cku} nombre={existente?.nombre ?? nombre} token={token} err={err} respuestas={existente?.respuestas ?? 0}
          onReintentar={generar} onClose={() => setAbierto(false)}
        />
      )}
    </>
  );
}

function EncuestaEntregableModal({ cku, nombre, token, err, respuestas, onReintentar, onClose }: {
  cku: string; nombre: string;
  /** null mientras el servidor crea la encuesta. */
  token: string | null; err: string; respuestas: number;
  onReintentar: () => void; onClose: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const enlace = token ? enlaceEncuestaCku(typeof window === "undefined" ? "" : window.location.origin, token) : "";
  const copiar = async () => {
    if (!enlace) return;
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch { /* el campo se puede copiar a mano */ }
  };

  return (
    <Modal open onClose={onClose} width={560} label="Encuesta NPS del entregable">
      <div className="flex items-start justify-between gap-3 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0">
          <div className="text-[0.66rem] uppercase tracking-widest text-[var(--text-muted)]">Encuesta NPS · {cku}</div>
          <div className="mt-0.5 text-[1.05rem] font-bold text-[var(--text-primary)]">{nombre}</div>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
      </div>
      <div className="px-6 py-5">
        <label className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">Enlace para contestar</label>
        {err ? (
          <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-[0.8rem]" style={{ borderColor: "var(--border)", color: "var(--bad)" }}>
            <span className="min-w-0 flex-1">{err}</span>
            <button onClick={onReintentar} className="shrink-0 rounded-md border px-2.5 py-1 text-[0.72rem] font-semibold text-[var(--accent-light)]" style={{ borderColor: "var(--border)" }}>
              Reintentar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {token ? (
              <input
                readOnly value={enlace} onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border bg-[var(--bg-hover)] px-3 py-2 text-[0.8rem] text-[var(--text-secondary)]"
                style={{ borderColor: "var(--border)" }}
              />
            ) : (
              <div role="status" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-[var(--bg-hover)] px-3 py-2 text-[0.8rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
                <span className="skeleton h-3 w-40 rounded-md" aria-hidden />
                Generando enlace…
              </div>
            )}
            <button
              onClick={copiar} disabled={!token}
              className="shrink-0 rounded-lg px-4 py-2 text-[0.85rem] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {copiado ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
        )}
        <p className="mt-3 text-[0.75rem] text-[var(--text-muted)]">
          Cualquier persona con el enlace puede contestar: pide su nombre y correo, y cada correo contesta una sola vez.
          {token ? ` Lleva ${respuestas} respuesta${respuestas === 1 ? "" : "s"}.` : ""}{" "}
          Las respuestas se ven en <Link href="/encuestas" className="font-semibold text-[var(--accent-light)] hover:underline">Encuestas</Link>.
        </p>
      </div>
    </Modal>
  );
}
