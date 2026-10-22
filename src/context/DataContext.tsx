"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { useMe } from "@/context/PermissionsContext";
import { auth } from "@/lib/firebase";
import { authedFetch } from "@/lib/api";
import { esRolSponsor } from "@/lib/permissions";
import { calcProjEntrega, projProcess } from "@/lib/proj";
import { buildDashboardData } from "@/lib/dashboardData";
import { nombreDeEmail, scopeToSponsor } from "@/lib/sponsorScope";
import type { BoardRefreshResponse } from "@/app/api/dashboard/board/[boardId]/route";
import type { AtrasoReparto, AttributionKind, DashboardData, DashboardRaw, DelayResponsible, ProjItem } from "@/types";

interface DataContextValue {
  /** Lo que ven las páginas. Para un usuario con rol "Sponsor" ya viene recortado a lo ligado
   *  a su nombre (ver lib/sponsorScope); para los demás roles es el dashboard completo. */
  data: DashboardData | null;
  /** Presente cuando `data` está recortado: de quién es el alcance (nombre null = su correo no
   *  está en el Directorio RH y por eso no se le muestra nada). null = sin recorte. */
  alcance: { rol: "Sponsor"; nombre: string | null } | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Refresca UN SOLO board de Proyectos (carril rápido, no toca Iniciativas/
   *  PML/RH/Estrategia/calendario ni los demás boards). Lanza si falla — el
   *  caller decide cómo mostrarlo. */
  refreshBoard: (boardId: string) => Promise<void>;
  /** ids de boards con un refresco en curso — para deshabilitar su botón. */
  refreshingBoards: Set<string>;
  /** Actualiza localmente (optimista) el status de un item/hito de Proyectos
   *  tras escribirlo en Monday (recalcula Entrega, que es función pura de
   *  status+fechas; el resto de las métricas se recalculan solas al re-renderizar
   *  porque son funciones puras de `data.proj`). La persistencia (mutación a
   *  Monday) la hace el caller vía POST /api/proj-status. */
  setProjStatus: (boardId: string, itemId: string, status: string) => void;
  /** Actualiza localmente (optimista) el responsable de una atribución (atraso o
   *  reproceso). responsible null → quita la asignación. La persistencia la hace el caller. */
  setAttribution: (kind: AttributionKind, itemId: string, responsible: DelayResponsible | null) => void;
  setMetodologiaCalif: (phaseKey: string, score: number | null, comentario?: string) => void;
  /** Actualiza localmente (optimista) el reparto de días / motivo de un atraso
   *  (tabla Atrasos). reparto vacío + motivo vacío → quita el detalle. La
   *  persistencia la hace el caller. */
  setAtrasoDetalle: (itemId: string, patch: { reparto?: AtrasoReparto[]; motivo?: string }) => void;
  /** Actualiza localmente (optimista) el Alcance de un proyecto (Status Card).
   *  alcance vacío → quita el detalle. La persistencia la hace el caller. */
  setBoardAlcance: (boardId: string, alcance: string) => void;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { me } = useMe();
  // Estado COMPLETO: todas las mutaciones optimistas y los refrescos trabajan sobre él.
  const [fullData, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  // Rol "Sponsor": solo ve lo ligado a su nombre, que se saca de su correo (Directorio RH).
  const alcance = useMemo<DataContextValue["alcance"]>(
    () => (fullData && esRolSponsor(me?.roleName)
      ? { rol: "Sponsor", nombre: nombreDeEmail(fullData.directorio, me?.email ?? "") }
      : null),
    [fullData, me?.roleName, me?.email],
  );
  const data = useMemo(
    () => (fullData && alcance ? scopeToSponsor(fullData, alcance.nombre) : fullData),
    [fullData, alcance],
  );
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

      // Procesamiento en cliente (zona horaria del usuario) — misma función
      // que usa el cron del histórico semanal server-side (dashboardData.ts).
      setData(buildDashboardData(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  const [refreshingBoards, setRefreshingBoards] = useState<Set<string>>(new Set());

  // Refresca UN SOLO board: 1 fetch a /api/dashboard/board/[id] (Monday +
  // Firestore, resincroniza solo sus baselines) y mergea el resultado en
  // `data.proj`/`data.projBoards`/`data.projItemBaselines`. Todo lo demás
  // (Iniciativas, PML, calendario, NPS, otros boards) queda intacto — las
  // páginas ya son funciones puras de `data`, así que Control Tower, el
  // scoreboard y el Resumen Ejecutivo se recalculan solos al re-renderizar.
  const refreshBoard = useCallback(async (boardId: string) => {
    setRefreshingBoards((s) => new Set(s).add(boardId));
    try {
      const res = await authedFetch(`/api/dashboard/board/${boardId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body = (await res.json()) as BoardRefreshResponse;
      const items = projProcess(body.projRaw.name, body.projRaw.id, body.projRaw.items_page.items);

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          proj: [...prev.proj.filter((p) => p.boardId !== boardId), ...items],
          projBoards: prev.projBoards.map((b) => (b.id === boardId ? body.projBoard : b)),
          projItemBaselines: { ...prev.projItemBaselines, ...body.projItemBaselines },
        };
      });
    } finally {
      setRefreshingBoards((s) => { const n = new Set(s); n.delete(boardId); return n; });
    }
  }, []);

  // Actualización optimista del status (item o hito) de Proyectos; evita un refetch completo.
  const setProjStatus = useCallback((boardId: string, itemId: string, status: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const proj: ProjItem[] = prev.proj.map((p) => {
        if (p.boardId !== boardId) return p;
        if (p.id === itemId) {
          return { ...p, status, entrega: calcProjEntrega(status, p.endDate, p.deadline) };
        }
        if (p.subitems.some((s) => s.id === itemId)) {
          return {
            ...p,
            subitems: p.subitems.map((s) =>
              s.id === itemId ? { ...s, status, entrega: calcProjEntrega(status, s.actualEnd, s.deadline) } : s
            ),
          };
        }
        return p;
      });
      return { ...prev, proj };
    });
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

  // Actualización optimista de la nota de Metodología VALOR de una fase (y,
  // opcionalmente, su explicación); evita un refetch completo. Sin `comentario`
  // explícito, conserva el que ya hubiera (igual que hace el POST en el server).
  const setMetodologiaCalif = useCallback((phaseKey: string, score: number | null, comentario?: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const map = { ...prev.metodologiaCalifs };
      if (score == null) delete map[phaseKey];
      else map[phaseKey] = { score, at: new Date().toISOString(), comentario: comentario ?? map[phaseKey]?.comentario };
      return { ...prev, metodologiaCalifs: map };
    });
  }, []);

  // Actualización optimista del detalle de un atraso (tabla Atrasos); evita un refetch completo.
  const setAtrasoDetalle = useCallback((itemId: string, patch: { reparto?: AtrasoReparto[]; motivo?: string }) => {
    setData((prev) => {
      if (!prev) return prev;
      const map = { ...prev.atrasoDetalles };
      const cur = map[itemId] ?? {};
      const reparto = patch.reparto ?? cur.reparto ?? [];
      const motivo = patch.motivo ?? cur.motivo ?? "";
      if (reparto.length === 0 && !motivo) delete map[itemId];
      else map[itemId] = { reparto, motivo, at: new Date().toISOString() }; // suelta `responsable` legacy
      return { ...prev, atrasoDetalles: map };
    });
  }, []);

  // Actualización optimista del Alcance de un proyecto (Status Card); evita un refetch completo.
  const setBoardAlcance = useCallback((boardId: string, alcance: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const map = { ...prev.boardAlcance };
      if (!alcance) delete map[boardId];
      else map[boardId] = { alcance, at: new Date().toISOString() };
      return { ...prev, boardAlcance: map };
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
    <DataContext.Provider value={{ data, alcance, loading, error, refresh, refreshBoard, refreshingBoards, setProjStatus, setAttribution, setMetodologiaCalif, setAtrasoDetalle, setBoardAlcance }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData debe usarse dentro de <DataProvider>");
  return ctx;
}
