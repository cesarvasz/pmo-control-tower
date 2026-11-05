"use client";
// Pantallas de la cuenta que se muestran ANTES del dashboard (las decide (app)/layout.tsx):
//  · EnEspera: se registró y ningún Admin le ha asignado un rol todavía.
//  · CambiarPasswordForm: formulario para cambiar la propia contraseña. Se usa a pantalla
//    completa cuando la contraseña es temporal, y dentro de un modal desde el Topbar.

import { useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { errorDePassword, PASSWORD_MIN } from "@/lib/password";

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4">
      <div className="w-full max-w-md rounded-2xl border bg-[var(--bg-surface)] p-8 shadow-xl" style={{ borderColor: "var(--border)" }}>
        {children}
      </div>
    </div>
  );
}

function BotonSalir() {
  const { logout } = useAuth();
  return (
    <button
      type="button"
      onClick={() => logout()}
      className="rounded-md border px-3 py-1.5 text-[0.8rem] text-[var(--text-secondary)] transition-colors hover:border-[var(--bad)] hover:text-[var(--bad)]"
      style={{ borderColor: "var(--border)" }}
    >
      Salir
    </button>
  );
}

export function EnEspera() {
  const { me, refreshMe, loading } = useMe();
  return (
    <Tarjeta>
      <div className="mb-3 text-3xl">⏳</div>
      <div className="text-lg font-semibold text-[var(--text-primary)]">Tu cuenta está en espera</div>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Ya quedó creada como <strong className="text-[var(--text-secondary)]">{me?.email}</strong>. Un administrador
        tiene que asignarte un rol para que puedas ver el dashboard. Avísale al equipo PMO.
      </p>
      <div className="mt-6 flex items-center gap-2">
        <button
          type="button"
          onClick={() => refreshMe()}
          disabled={loading}
          className="rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[0.8rem] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {loading ? "Revisando..." : "Ya me aprobaron, revisar"}
        </button>
        <BotonSalir />
      </div>
    </Tarjeta>
  );
}

/** Formulario de cambio de contraseña. `onListo` se llama al guardar con éxito. */
export function CambiarPasswordForm({ onListo }: { onListo?: () => void }) {
  const { refreshMe } = useMe();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const motivo = errorDePassword(p1);
    if (motivo) return setError(motivo);
    if (p1 !== p2) return setError("Las contraseñas no coinciden.");
    setGuardando(true);
    try {
      const res = await authedFetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: p1 }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      await refreshMe();
      onListo?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setGuardando(false);
    }
  };

  const input = "rounded-lg border bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <form onSubmit={guardar} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Nueva contraseña</span>
        <input type="password" required autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} className={input} style={{ borderColor: "var(--border)" }} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Repítela</span>
        <input type="password" required autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} className={input} style={{ borderColor: "var(--border)" }} />
        <span className="text-[0.7rem] text-[var(--text-muted)]">Mínimo {PASSWORD_MIN} caracteres, con letras y números.</span>
      </label>
      {error && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: "var(--pill-atrasado-bg)", borderColor: "var(--pill-atrasado-br)", color: "var(--pill-atrasado-fg)" }}>
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={guardando}
        className="mt-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {guardando ? "Guardando..." : "Guardar contraseña"}
      </button>
    </form>
  );
}

/** Pantalla completa: la contraseña actual es temporal (la puso un Admin) y hay que cambiarla. */
export function CambioObligatorio() {
  return (
    <Tarjeta>
      <div className="mb-1 text-lg font-semibold text-[var(--text-primary)]">Crea tu contraseña</div>
      <p className="mb-5 text-sm text-[var(--text-muted)]">
        Entraste con una contraseña temporal. Elige una nueva para continuar; la temporal deja de servir.
      </p>
      <CambiarPasswordForm />
      <div className="mt-4"><BotonSalir /></div>
    </Tarjeta>
  );
}
