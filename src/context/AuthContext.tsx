"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { errorDePassword } from "@/lib/password";

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN?.toLowerCase();

/** ¿El correo pertenece al dominio permitido? (sin dominio configurado → todo permitido) */
function isAllowed(email: string | null | undefined): boolean {
  if (!ALLOWED_DOMAIN) return true;
  return !!email && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

/** Lo que la app necesita de la sesión. `uid` = id del usuario en Supabase Auth. */
export interface AuthUser {
  uid: string;
  email: string;
}

const userDe = (s: Session | null): AuthUser | null =>
  s?.user ? { uid: s.user.id, email: (s.user.email ?? "").toLowerCase() } : null;

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Redirige a Google y vuelve a /login con la sesión. Si el correo ya tenía cuenta (con
   *  contraseña o migrada), Supabase la une a esa misma cuenta: conserva su rol. Una cuenta
   *  nueva entra EN ESPERA, igual que con el registro por correo. */
  signInWithGoogle: () => Promise<void>;
  /** Crea la cuenta e inicia sesión. Queda EN ESPERA hasta que un Admin le asigne un rol. */
  signUp: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Correo de una sesión que se cerró por no ser del dominio permitido (p. ej. Google personal). */
  rechazado: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [rechazado, setRechazado] = useState<string | null>(null);

  useEffect(() => {
    const auth = getSupabaseBrowser().auth;
    // Suscripción al estado de sesión (incluye la sesión guardada al recargar).
    const { data } = auth.onAuthStateChange((_event, session) => {
      const u = userDe(session);
      // Guarda sesiones persistidas de dominios no permitidos. (Fuera del callback: llamar a
      // auth desde dentro de onAuthStateChange puede trabar el cliente.)
      if (u && !isAllowed(u.email)) {
        setTimeout(() => void auth.signOut(), 0);
        setRechazado(u.email);
        setUser(null);
      } else {
        // Mismo uid → mismo objeto: la renovación del token no dispara recargas en los contextos.
        setUser((prev) => (prev && u && prev.uid === u.uid && prev.email === u.email ? prev : u));
      }
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!isAllowed(email)) throw new Error("domain-not-allowed");
    const { error } = await getSupabaseBrowser().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw new Error(error.code ?? error.message);
  };

  const signInWithGoogle = async () => {
    setRechazado(null);
    const { error } = await getSupabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login`,
        // hd = sugerencia a Google de mostrar solo cuentas del dominio (no es una garantía: el
        // dominio lo exigen este contexto y el servidor). select_account = siempre deja elegir.
        queryParams: { prompt: "select_account", ...(ALLOWED_DOMAIN ? { hd: ALLOWED_DOMAIN } : {}) },
      },
    });
    if (error) throw new Error(error.code ?? error.message);
  };

  const signUp = async (name: string, email: string, password: string) => {
    const correo = email.trim().toLowerCase();
    if (!isAllowed(correo)) throw new Error("domain-not-allowed");
    const motivo = errorDePassword(password);
    if (motivo) throw new Error(motivo);
    const { data, error } = await getSupabaseBrowser().auth.signUp({
      email: correo,
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) throw new Error(error.code ?? error.message);
    // Sin sesión = el proyecto pide confirmar el correo, y no hay SMTP configurado.
    if (!data.session) throw new Error("email-confirmation-enabled");
  };

  const logout = async () => {
    await getSupabaseBrowser().auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInWithGoogle, signUp, logout, rechazado }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
