"use client";

// Edición de los campos FIJOS de una persona (nombre, correo, grupo, rol, TLD, horas al mes, activo), una vez cortado el
// Directorio RH de Monday. Cada celda se guarda al salir de ella (o con Enter). Y el formulario corto para dar de alta.

import { useState } from "react";
import { Boton, enviar, estiloControl } from "./comun";

const URL_API = "/api/tableros/personas";
type Campo = "nombre" | "email" | "grupo" | "rol" | "tld" | "hrsMes";

/** Una celda de texto o número que se edita en su lugar. `lista` = id del <datalist> con sugerencias (grupos, roles…). */
export function CeldaPersona({ personaId, campo, valor, lista, numero, onError, onGuardado }: {
  personaId: string; campo: Campo; valor: string | number | null; lista?: string; numero?: boolean;
  onError(m: string | null): void; onGuardado(): void;
}) {
  const inicial = valor === null || valor === undefined ? "" : String(valor);
  const [v, setV] = useState(inicial);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (v.trim() === inicial.trim()) return;
    setGuardando(true); onError(null);
    try {
      await enviar(URL_API, "PATCH", { personaId, campo, valor: v.trim() === "" ? null : numero ? v.trim() : v });
      onGuardado();
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo guardar");
      setV(inicial);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <input
      value={v} list={lista} inputMode={numero ? "decimal" : undefined} disabled={guardando}
      onChange={(e) => setV(e.target.value)} onBlur={() => void guardar()}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(inicial); (e.target as HTMLInputElement).blur(); } }}
      aria-label={campo}
      className={`w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-[0.82rem] text-[var(--text-primary)] outline-none hover:border-[var(--border)] focus:border-[var(--accent)] ${numero ? "text-right" : ""}`}
    />
  );
}

/** Activa / Inactiva. Las personas no se borran (pueden estar en tableros): se dejan inactivas. */
export function ActivoPersona({ personaId, activo, onError, onGuardado }: { personaId: string; activo: boolean; onError(m: string | null): void; onGuardado(): void }) {
  const [guardando, setGuardando] = useState(false);
  return (
    <select
      value={activo ? "1" : "0"} disabled={guardando} aria-label="Estado" {...estiloControl}
      onChange={async (e) => {
        setGuardando(true); onError(null);
        try { await enviar(URL_API, "PATCH", { personaId, campo: "activo", valor: e.target.value === "1" }); onGuardado(); }
        catch (err) { onError(err instanceof Error ? err.message : "No se pudo guardar"); }
        finally { setGuardando(false); }
      }}
    >
      <option value="1">Activa</option>
      <option value="0">Inactiva</option>
    </select>
  );
}

/** Alta de una persona: nombre obligatorio; lo demás opcional. Si su correo es el de un usuario de la app, se liga sola. */
export function NuevaPersona({ listaGrupos, listaRoles, onCreada, onCancelar }: {
  listaGrupos: string; listaRoles: string; onCreada(): void; onCancelar(): void;
}) {
  const [d, setD] = useState({ nombre: "", email: "", grupo: "", rol: "", tld: "", hrsMes: "" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campo = (k: keyof typeof d, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[0.72rem] font-medium text-[var(--text-secondary)]">{etiqueta}</span>
      <input value={d[k]} onChange={(e) => setD((s) => ({ ...s, [k]: e.target.value }))} {...estiloControl} {...extra} />
    </label>
  );

  async function crear() {
    if (!d.nombre.trim() || enviando) return;
    setEnviando(true); setError(null);
    try {
      await enviar(URL_API, "POST", { crear: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim() || null])) });
      onCreada();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
      setEnviando(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-base)" }} aria-label="Nueva persona">
      <h3 className="text-[0.92rem] font-semibold text-[var(--text-primary)]">Nueva persona</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {campo("nombre", "Nombre *", { autoFocus: true, maxLength: 120 })}
        {campo("email", "Correo", { type: "email", maxLength: 160 })}
        {campo("grupo", "Grupo", { list: listaGrupos, maxLength: 80 })}
        {campo("rol", "Rol", { list: listaRoles, maxLength: 40 })}
        {campo("tld", "TLD", { maxLength: 40 })}
        {campo("hrsMes", "Horas al mes", { inputMode: "decimal" })}
      </div>
      {error && <p className="text-[0.8rem] text-[var(--bad)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <Boton onClick={onCancelar} disabled={enviando}>Cancelar</Boton>
        <Boton primario onClick={() => void crear()} disabled={!d.nombre.trim() || enviando}>{enviando ? "Creando…" : "Crear persona"}</Boton>
      </div>
    </section>
  );
}
