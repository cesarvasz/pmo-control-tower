"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { PASSWORD_MIN } from "@/lib/password";

type Modo = "ingresar" | "registrarse";

const DOMINIO = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN?.toLowerCase();

export default function LoginPage() {
  const { user, loading, signIn, signInWithGoogle, signUp, rechazado } = useAuth();
  const router = useRouter();

  const [modo, setModo] = useState<Modo>("ingresar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Si ya hay sesión, no mostrar el login.
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  // Al volver de Google con error (canceló, proveedor apagado…) viene en la URL: se muestra y se
  // limpia la URL. (Se lee de window y no con useSearchParams para no exigir un Suspense.)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search + window.location.hash.replace(/^#/, "&"));
    const desc = p.get("error_description") ?? p.get("error");
    if (!desc) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura inicial de un sistema externo (la URL de vuelta de Google)
    setError(traducirError(p.get("error_code") ?? desc, desc));
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // Sesión de Google de otro dominio: AuthContext ya la cerró; aquí se explica por qué.
  const errorVisible = error || (rechazado
    ? `${rechazado} no es una cuenta @${DOMINIO ?? "c807.com"}. Entra con tu cuenta de la empresa.`
    : "");

  const handleGoogle = async () => {
    setError("");
    setSubmitting(true);
    try {
      await signInWithGoogle(); // redirige a Google; si vuelve aquí es porque falló antes de salir
    } catch (err) {
      setError(err instanceof Error ? traducirError(err.message) : "No se pudo abrir Google");
      setSubmitting(false);
    }
  };

  const cambiarModo = (m: Modo) => {
    setModo(m);
    setError("");
    setPassword("");
    setPassword2("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (modo === "registrarse" && password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    try {
      if (modo === "ingresar") await signIn(email, password);
      else await signUp(name, email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? traducirError(err.message) : "Error al iniciar sesión");
    } finally {
      setSubmitting(false);
    }
  };

  const registrando = modo === "registrarse";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4">
      <div
        className="w-full max-w-sm rounded-2xl border bg-[var(--bg-surface)] p-8 shadow-xl"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="mb-6 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pmo-logo.png" alt="PMO" className="h-11 w-11 object-contain" />
          <div>
            <div className="text-lg font-bold text-[var(--text-primary)]">PMO Suite</div>
            <div className="text-xs text-[var(--text-muted)]">
              {registrando ? "Crea tu cuenta" : "Inicia sesión para continuar"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border bg-[var(--bg-base)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          <GoogleIcon />
          Continuar con Google
        </button>

        <div className="my-5 flex items-center gap-3 text-[0.7rem] uppercase tracking-wide text-[var(--text-muted)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          o con tu correo
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {registrando && (
            <Campo label="Nombre">
              <input
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT}
                style={{ borderColor: "var(--border)" }}
                placeholder="Nombre y apellido"
              />
            </Campo>
          )}

          <Campo label="Email">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT}
              style={{ borderColor: "var(--border)" }}
              placeholder={DOMINIO ? `tu@${DOMINIO}` : "tu@correo.com"}
            />
          </Campo>

          <Campo label="Contraseña">
            <input
              type="password"
              required
              autoComplete={registrando ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
              style={{ borderColor: "var(--border)" }}
              placeholder="••••••••"
            />
          </Campo>

          {registrando && (
            <Campo label="Repite la contraseña">
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className={INPUT}
                style={{ borderColor: "var(--border)" }}
                placeholder="••••••••"
              />
              <span className="text-[0.7rem] text-[var(--text-muted)]">
                Mínimo {PASSWORD_MIN} caracteres, con letras y números.
              </span>
            </Campo>
          )}

          {errorVisible && (
            <div
              className="rounded-lg border px-3 py-2 text-xs"
              style={{ background: "var(--pill-atrasado-bg)", borderColor: "var(--pill-atrasado-br)", color: "var(--pill-atrasado-fg)" }}
            >
              {errorVisible}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? (registrando ? "Creando cuenta..." : "Ingresando...")
              : (registrando ? "Crear cuenta" : "Ingresar")}
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-[var(--text-muted)]">
          {registrando ? (
            <>¿Ya tienes cuenta?{" "}
              <button type="button" onClick={() => cambiarModo("ingresar")} className="font-medium text-[var(--accent-light)] hover:underline">Inicia sesión</button>
            </>
          ) : (
            <>¿No tienes cuenta?{" "}
              <button type="button" onClick={() => cambiarModo("registrarse")} className="font-medium text-[var(--accent-light)] hover:underline">Crea una</button>
              <div className="mt-2">¿Olvidaste tu contraseña? Pídele a un administrador una contraseña temporal.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const INPUT =
  "rounded-lg border bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

/** Logo "G" de Google (colores oficiales de la marca, no del tema: así lo exige su guía). */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Códigos de error de Supabase Auth (error.code) → mensaje para el usuario. `detalle` = texto
 *  original (p. ej. el error_description que manda Google/Supabase al volver del login). */
function traducirError(msg: string, detalle?: string): string {
  if (msg === "provider_disabled" || /provider is not enabled/i.test(detalle ?? msg))
    return "El inicio de sesión con Google aún no está activado en Supabase (Authentication → Sign In / Providers → Google).";
  if (msg === "access_denied") return "Se canceló el inicio de sesión con Google.";
  if (msg.includes("domain-not-allowed"))
    return `Acceso restringido: solo se permiten correos @${DOMINIO ?? "c807.com"}.`;
  if (msg === "invalid_credentials") return "Correo o contraseña incorrectos.";
  if (msg === "user_already_exists" || msg === "email_exists")
    return "Ya existe una cuenta con ese correo. Inicia sesión (o pídele a un administrador una contraseña temporal).";
  if (msg === "weak_password") return `La contraseña es muy débil: mínimo ${PASSWORD_MIN} caracteres, con letras y números.`;
  if (msg === "signup_disabled") return "El registro de cuentas nuevas está deshabilitado.";
  if (msg === "email_not_confirmed") return "Tu correo no está confirmado. Pídele a un administrador que revise tu cuenta.";
  if (msg === "over_request_rate_limit" || msg === "over_email_send_rate_limit")
    return "Demasiados intentos. Espera un momento.";
  if (msg === "email_address_invalid" || msg === "validation_failed") return "Correo inválido.";
  if (msg === "email-confirmation-enabled")
    return "Tu cuenta se creó, pero el proyecto pide confirmar el correo y no hay correo configurado. Un administrador debe desactivar «Confirm email» en Supabase (Authentication → Sign In / Providers → Email).";
  // Mensajes ya en español (validación local de la contraseña).
  if (/[áéíóú]|contraseña/i.test(msg)) return msg;
  // Fallback: muestra el código real para diagnosticar.
  return `Error al iniciar sesión (${msg}).`;
}
