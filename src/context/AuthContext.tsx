"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN?.toLowerCase();

/** ¿El correo pertenece al dominio permitido? (sin dominio configurado → todo permitido) */
function isAllowed(email: string | null | undefined): boolean {
  if (!ALLOWED_DOMAIN) return true;
  return !!email && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Suscripción al estado de sesión de Firebase.
    const unsub = onAuthStateChanged(auth, (u) => {
      // Guarda sesiones persistidas de dominios no permitidos.
      if (u && !isAllowed(u.email)) {
        signOut(auth);
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (!isAllowed(cred.user.email)) {
      await signOut(auth);
      throw new Error("auth/domain-not-allowed");
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    // Fuerza el selector de cuenta de Google en cada inicio de sesión.
    provider.setCustomParameters({ prompt: "select_account" });
    const cred = await signInWithPopup(auth, provider);
    if (!isAllowed(cred.user.email)) {
      await signOut(auth);
      throw new Error("auth/domain-not-allowed");
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
