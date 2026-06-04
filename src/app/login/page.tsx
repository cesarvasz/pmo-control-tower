"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { user, loading, signIn, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  // Si ya hay sesión, no mostrar el login.
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof Error ? traducirError(err.message) : "Error al iniciar sesión"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof Error ? traducirError(err.message) : "Error al iniciar sesión"
      );
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4">
      <div
        className="w-full max-w-sm rounded-2xl border bg-[var(--bg-surface)] p-8 shadow-xl"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-base font-bold text-white">
            P
          </div>
          <div>
            <div className="text-lg font-bold text-[var(--text-primary)]">PMO Suite</div>
            <div className="text-xs text-[var(--text-muted)]">Inicia sesión para continuar</div>
          </div>
        </div>

        {/* Google Sign-In — método principal */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleSubmitting}
          className="flex w-full items-center justify-center gap-3 rounded-lg border bg-[var(--bg-base)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
          </svg>
          {googleSubmitting ? "Conectando..." : "Continuar con Google"}
        </button>

        {error && (
          <div
            className="mt-4 rounded-lg border px-3 py-2 text-xs"
            style={{ background: "#450a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}
          >
            {error}
          </div>
        )}

        {/* Separador */}
        <div className="my-5 flex items-center gap-3 text-[0.7rem] text-[var(--text-muted)]">
          <span className="h-px flex-1" style={{ background: "var(--border)" }} />
          o con email
          <span className="h-px flex-1" style={{ background: "var(--border)" }} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
              placeholder="tu@correo.com"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Contraseña
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function traducirError(msg: string): string {
  if (msg.includes("domain-not-allowed"))
    return "Acceso restringido: solo se permiten correos @c807.com.";
  if (msg.includes("invalid-credential") || msg.includes("wrong-password"))
    return "Credenciales incorrectas.";
  if (msg.includes("user-not-found")) return "Usuario no encontrado.";
  if (msg.includes("too-many-requests")) return "Demasiados intentos. Espera un momento.";
  if (msg.includes("invalid-email")) return "Email inválido.";
  if (msg.includes("popup-closed-by-user") || msg.includes("cancelled-popup-request"))
    return "Cerraste la ventana de Google antes de terminar.";
  if (msg.includes("popup-blocked"))
    return "El navegador bloqueó el popup. Permítelo e intenta de nuevo.";
  if (msg.includes("unauthorized-domain"))
    return "Dominio no autorizado en Firebase (Authentication → Settings → Authorized domains).";
  if (msg.includes("operation-not-allowed") || msg.includes("configuration-not-found"))
    return "El proveedor de Google no está habilitado en Firebase (Authentication → Sign-in method → Google → Enable).";
  if (msg.includes("api-key-not-valid") || msg.includes("invalid-api-key"))
    return "La API key de Firebase es inválida. Revisa NEXT_PUBLIC_FIREBASE_API_KEY en .env.local y reinicia el servidor.";
  // Fallback: muestra el código real de Firebase para diagnosticar.
  return `Error al iniciar sesión (${msg}).`;
}
