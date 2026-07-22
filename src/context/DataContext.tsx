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
import { buildCalMap, buildReminderMap, iniProcess } from "@/lib/ini";
import { buildBenefitTypeMap, buildEstrategiaMap, buildIniLookup, projEnrichBoards, projProcess } from "@/lib/proj";
import { reqProcess } from "@/lib/req";
import { calcNpsFromRecords } from "@/lib/nps";
import type { AttributionKind, DashboardData, DashboardRaw, DelayResponsible, DirectorioEntry, ProjItem, ProjItemBaseline } from "@/types";

// Columna Email del board Directorio RH (el nombre del item es el nombre del recurso).
const RH_EMAIL_COL = "email_mkz5qg4v";

interface DataContextValue {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Actualiza localmente (optimista) el responsable de una atribución (atraso o
   *  reproceso). responsible null → quita la asignación. La persistencia la hace el caller. */
  setAttribution: (kind: AttributionKind, itemId: string, responsible: DelayResponsible | null) => void;
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
      const benefitTypeMap = buildBenefitTypeMap(raw.iniItems);
      const req = reqProcess(raw.reqItems, raw.baselines ?? {}, benefitTypeMap);
      const proj: ProjItem[] = [];
      raw.projRaw.forEach((b) =>
        proj.push(...projProcess(b.name, b.id, b.items_page.items))
      );
      const projBoards = projEnrichBoards(raw.projBoards, proj, buildIniLookup(raw.iniItems, raw.hrItems));
      const projItemBaselines: Record<string, ProjItemBaseline> = raw.projItemBaselines ?? {};
      const calMap = buildCalMap(raw.calData);
      const npsRecords = raw.npsRecords ?? [];
      const nps = calcNpsFromRecords(npsRecords); // NPS global desde Firestore
      const estrategiaMap = buildEstrategiaMap(raw.estrategiaItems ?? [], raw.hrItems ?? []);

      // Directorio RH: nombre del recurso (nombre del item) → email.
      const directorio: DirectorioEntry[] = (raw.hrItems ?? [])
        .map((it) => ({
          name: it.name,
          email: (it.column_values.find((c) => c.id === RH_EMAIL_COL)?.text ?? "").trim(),
        }))
        .filter((d) => d.name && d.email)
        .sort((a, b) => a.name.localeCompare(b.name));

      const reminderMap = buildReminderMap(raw.reminderLog ?? []);

      setData({ ini, req, proj, projBoards, projItemBaselines, calMap, nps, npsRecords, delayAttributions: raw.delayAttributions ?? {}, reprocesoAttributions: raw.reprocesoAttributions ?? {}, directorio, estrategiaMap, reminderMap, fetchedAt: new Date(raw.fetchedAt) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  // Actualización optimista del responsable (atraso o reproceso); evita un refetch completo.
  const setAttribution = useCallback((kind: AttributionKind, itemId: string, responsible: DelayResponsible | null) => {
    const field = kind === "delay" ? "delayAttributions" : "reprocesoAttributions";
    setData((prev) => {
      if (!prev) return prev;
      const map = { ...prev[field] };
      if (responsible) map[itemId] = { responsible, at: new Date().toISOString() };
      else delete map[itemId];
      return { ...prev, [field]: map };
    });
  }, []);

  // Carga inicial una sola vez, cuando hay sesión. Los datos NO se refrescan solos:
  // solo al entrar/recargar la página o con el botón "Actualizar" del Topbar.
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
    <DataContext.Provider value={{ data, loading, error, refresh, setAttribution }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData debe usarse dentro de <DataProvider>");
  return ctx;
}
