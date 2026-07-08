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
import { auth } from "@/lib/firebase";
import {
  buildCalMap,
  calcNps,
  iniProcess,
  buildIniLookup,
  projEnrichBoards,
  projProcess,
  reqProcess,
} from "@/lib/process";
import type { DashboardData, DashboardRaw, DirectorioEntry, ProjItem, ProjItemBaseline } from "@/types";

// Columna Email del board Directorio RH (el nombre del item es el nombre del recurso).
const RH_EMAIL_COL = "email_mkz5qg4v";

interface DataContextValue {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedOnce = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // ID token de Firebase para autenticar la llamada al servidor.
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sesión no válida. Vuelve a iniciar sesión.");
      const res = await fetch("/api/dashboard", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const raw = (await res.json()) as DashboardRaw;

      // Procesamiento en cliente (zona horaria del usuario).
      const ini = iniProcess(raw.iniItems);
      const req = reqProcess(raw.reqItems, raw.baselines ?? {});
      const proj: ProjItem[] = [];
      raw.projRaw.forEach((b) =>
        proj.push(...projProcess(b.name, b.id, b.items_page.items))
      );
      const projBoards = projEnrichBoards(raw.projBoards, proj, buildIniLookup(raw.iniItems, raw.hrItems));
      const projItemBaselines: Record<string, ProjItemBaseline> = raw.projItemBaselines ?? {};
      const calMap = buildCalMap(raw.calData);
      const nps = calcNps(raw.sheetRows ?? []);

      // Directorio RH: nombre del recurso (nombre del item) → email.
      const directorio: DirectorioEntry[] = (raw.hrItems ?? [])
        .map((it) => ({
          name: it.name,
          email: (it.column_values.find((c) => c.id === RH_EMAIL_COL)?.text ?? "").trim(),
        }))
        .filter((d) => d.name && d.email)
        .sort((a, b) => a.name.localeCompare(b.name));

      setData({ ini, req, proj, projBoards, projItemBaselines, calMap, nps, directorio, fetchedAt: new Date(raw.fetchedAt) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga inicial una sola vez, cuando hay sesión.
  useEffect(() => {
    if (user && !fetchedOnce.current) {
      fetchedOnce.current = true;
      refresh();
    }
    // Al cerrar sesión, limpia los datos y permite recargar al volver a entrar.
    if (!user) {
      fetchedOnce.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpieza al cambiar el estado de sesión (sistema externo)
      setData(null);
    }
  }, [user, refresh]);

  return (
    <DataContext.Provider value={{ data, loading, error, refresh }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData debe usarse dentro de <DataProvider>");
  return ctx;
}
