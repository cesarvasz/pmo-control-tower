"use client";

// Quién aceptó, rechazó o no ha respondido la invitación de la Meeting agendada (leído de Google al abrir la iniciativa).
// Compacto: un resumen con contadores y una ficha por invitado (iniciales + nombre + ícono de su respuesta).

import { useState } from "react";
import { Avatar, foco } from "./estilo";

type Respuesta = "aceptada" | "rechazada" | "tal-vez" | "sin-responder";
export interface RespuestasDeReunion { leidasAt: string; porInvitado: { email: string; nombre: string; respuesta: Respuesta }[] }

const ESTILO: Record<Respuesta, { icono: string; texto: string; plural: string; color: string }> = {
  aceptada: { icono: "✓", texto: "Aceptó", plural: "aceptaron", color: "var(--ok)" },
  rechazada: { icono: "✕", texto: "Rechazó", plural: "rechazaron", color: "var(--bad)" },
  "tal-vez": { icono: "?", texto: "Tal vez", plural: "tal vez", color: "var(--warn)" },
  "sin-responder": { icono: "…", texto: "Sin responder", plural: "sin responder", color: "var(--text-muted)" },
};
const ORDEN: Respuesta[] = ["rechazada", "tal-vez", "sin-responder", "aceptada"];

export default function RespuestasReunion({ accion, respuestas, onActualizar }: {
  accion: string;
  /** null = no se pudieron leer de Google (sin conexión del organizador, evento borrado allá…). */
  respuestas: RespuestasDeReunion | null;
  /** Vuelve a leer las respuestas de Google. */
  onActualizar(): Promise<void>;
}) {
  const [cargando, setCargando] = useState(false);
  const actualizar = async () => { setCargando(true); try { await onActualizar(); } finally { setCargando(false); } };
  const lista = respuestas ? [...respuestas.porInvitado].sort((a, b) => ORDEN.indexOf(a.respuesta) - ORDEN.indexOf(b.respuesta) || a.nombre.localeCompare(b.nombre)) : [];
  const cuenta = (r: Respuesta) => lista.filter((x) => x.respuesta === r).length;
  const hora = respuestas ? new Date(respuestas.leidasAt).toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit", timeZone: "America/Guatemala" }) : "";
  // Orden de lectura del resumen: lo bueno primero; «tal vez» solo si hay
  const resumen = (["aceptada", "rechazada", "tal-vez", "sin-responder"] as Respuesta[]).filter((r) => r !== "tal-vez" || cuenta(r) > 0);

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border px-3 py-2.5"
      style={{ borderColor: "var(--border-subtle)", background: "var(--bg-base)" }} aria-label={`Respuestas a la invitación de la ${accion}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[0.78rem] font-semibold text-[var(--text-primary)]">Invitados <span className="font-normal text-[var(--text-muted)]">· {accion}</span></span>
        {respuestas && lista.length > 0 && (
          <span className="flex flex-wrap items-center gap-x-2.5 text-[0.74rem] text-[var(--text-secondary)]">
            {resumen.map((r) => (
              <span key={r} className="inline-flex items-center gap-1 tabular-nums">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: ESTILO[r].color }} />
                {cuenta(r)} {ESTILO[r].plural}
              </span>
            ))}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {respuestas && <span className="text-[0.68rem] text-[var(--text-muted)]">Google Calendar · {hora}</span>}
          <button
            type="button" onClick={() => void actualizar()} disabled={cargando} title="Volver a leer las respuestas de Google"
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.74rem] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-60 ${foco}`}
          >
            <span aria-hidden className={cargando ? "inline-block animate-spin" : "inline-block"}>↻</span>
            {cargando ? "Actualizando…" : "Actualizar"}
          </button>
        </span>
      </div>
      {!respuestas && !cargando && <p className="text-[0.75rem] text-[var(--text-muted)]">No se pudieron leer las respuestas desde Google (la conexión de quien la agendó pudo vencer).</p>}
      {respuestas && !lista.length && <p className="text-[0.75rem] text-[var(--text-muted)]">La reunión no tiene invitados.</p>}
      {lista.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {lista.map((p) => {
            const e = ESTILO[p.respuesta];
            return (
              <li
                key={p.email} title={`${p.email} · ${e.texto}`}
                className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[0.76rem]"
                style={{ borderColor: `color-mix(in srgb, ${e.color} 35%, var(--border))`, background: `color-mix(in srgb, ${e.color} 7%, var(--bg-surface))` }}
              >
                <span className="relative">
                  <Avatar nombre={p.nombre} tamano={20} />
                  <span
                    aria-hidden className="absolute -bottom-0.5 -right-0.5 grid h-3 w-3 place-items-center rounded-full text-[0.5rem] font-bold leading-none text-white"
                    style={{ background: e.color, boxShadow: "0 0 0 1.5px var(--bg-surface)" }}
                  >
                    {e.icono}
                  </span>
                </span>
                <span className="text-[var(--text-primary)]">{p.nombre}</span>
                <span className="sr-only">: {e.texto}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
