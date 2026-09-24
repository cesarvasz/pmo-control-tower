// src/lib/dashboardData.ts
// Transforma el payload crudo de /api/dashboard (Monday + Firestore) en el
// DashboardData procesado que consume el resto de la app. Extraído de
// DataContext.tsx (donde vivía inline) para reusarlo también server-side —
// el cron del histórico semanal (weeklySnapshot.ts) necesita el mismo
// DashboardData sin pasar por un fetch de navegador. Función pura: sin
// React ni `fetch`, solo transforma lo que ya llegó.

import { buildCalMap, buildReminderMap, iniProcess } from "@/lib/ini";
import { buildDevTeamRoster } from "@/lib/devTimeline";
import { buildBenefitTypeMap, buildEstrategiaMap, buildIniLookup, projEnrichBoards, projProcess } from "@/lib/proj";
import { reqProcess } from "@/lib/req";
import { calcNpsFromRecords } from "@/lib/nps";
import type { DashboardData, DashboardRaw, DirectorioEntry, ProjItem, ProjItemBaseline } from "@/types";

// Columna Email del board Directorio RH (el nombre del item es el nombre del recurso).
const RH_EMAIL_COL = "email_mkz5qg4v";

export function buildDashboardData(raw: DashboardRaw): DashboardData {
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
  const nps = calcNpsFromRecords(npsRecords);
  const estrategiaMap = buildEstrategiaMap(raw.estrategiaItems ?? [], raw.hrItems ?? []);

  const directorio: DirectorioEntry[] = (raw.hrItems ?? [])
    .map((it) => ({
      name: it.name,
      email: (it.column_values.find((c) => c.id === RH_EMAIL_COL)?.text ?? "").trim(),
    }))
    .filter((d) => d.name && d.email)
    .sort((a, b) => a.name.localeCompare(b.name));

  const reminderMap = buildReminderMap(raw.reminderLog ?? []);
  const devTeamRoster = buildDevTeamRoster(raw.hrItems ?? []);

  return {
    ini, req, proj, projBoards, projItemBaselines, calMap, nps, npsRecords,
    delayAttributions: raw.delayAttributions ?? {},
    reprocesoAttributions: raw.reprocesoAttributions ?? {},
    atrasoDetalles: raw.atrasoDetalles ?? {},
    boardAlcance: raw.boardAlcance ?? {},
    directorio, devTeamRoster, estrategiaMap, reminderMap,
    fetchedAt: new Date(raw.fetchedAt),
  };
}
