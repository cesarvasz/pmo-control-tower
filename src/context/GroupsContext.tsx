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
import type { Group } from "@/lib/permissions";

interface GroupsContextValue {
  groups: Group[];
  loading: boolean;
  error: string | null;
  refreshGroups: () => Promise<void>;
}

const GroupsContext = createContext<GroupsContextValue | undefined>(undefined);

export function GroupsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedFor = useRef<string | null>(null);

  const refreshGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/groups");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setGroups((await res.json()) as Group[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar grupos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && fetchedFor.current !== user.uid) {
      fetchedFor.current = user.uid;
      refreshGroups();
    }
    if (!user) {
      fetchedFor.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpieza al cerrar sesión
      setGroups([]);
    }
  }, [user, refreshGroups]);

  return (
    <GroupsContext.Provider value={{ groups, loading, error, refreshGroups }}>
      {children}
    </GroupsContext.Provider>
  );
}

export function useGroups(): GroupsContextValue {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error("useGroups debe usarse dentro de <GroupsProvider>");
  return ctx;
}
