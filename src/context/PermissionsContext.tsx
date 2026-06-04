"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/api";
import type { AppUser } from "@/lib/permissions";

interface PermissionsContextValue {
  me: AppUser | null;
  loading: boolean;
  error: string | null;
  refreshMe: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [me, setMe] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedFor = useRef<string | null>(null);

  const refreshMe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/me");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setMe((await res.json()) as AppUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar permisos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && fetchedFor.current !== user.uid) {
      fetchedFor.current = user.uid;
      refreshMe();
    }
    if (!user) {
      fetchedFor.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpieza al cerrar sesión
      setMe(null);
    }
  }, [user, refreshMe]);

  return (
    <PermissionsContext.Provider value={{ me, loading, error, refreshMe }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function useMe(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("useMe debe usarse dentro de <PermissionsProvider>");
  return ctx;
}
