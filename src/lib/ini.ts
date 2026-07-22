// src/lib/ini.ts
// Iniciativas (embudo Meeting 1 / Meeting 2 / aprobación), calendario de
// reuniones y salud por PM. Funciones puras sobre items de Monday.

import {
  addBusinessDays,
  businessDays,
  isToday,
  parseCreation,
  parseYMD,
  today,
} from "@/lib/business";
import { colText, colDisplay } from "@/lib/monday-cols";
import { healthStatusFromIndex, type HealthStatus } from "@/lib/health";
import type { CalMap, CalMeetingRaw, IniItem, MondayItem, ReminderEnvio, ReminderRecord } from "@/types";

// ─────────────────────────────────────────────────────────────────────
// INICIATIVAS
// ─────────────────────────────────────────────────────────────────────
export const INI_LIMITS: Record<string, number> = { New: 5, "Meeting 1": 10 };
export const INI_APPROVED = new Set(["PM Aprobado", "REQ Aprobado"]);
export const INI_SEC_ORDER = ["New", "Meeting 1", "PM Aprobado", "REQ Aprobado", "Sin Valor Def"];
export const INI_SEC_LABEL: Record<string, string> = {
  New: "Meeting 1",
  "Meeting 1": "Meeting 2",
  "PM Aprobado": "PM Aprobado",
  "REQ Aprobado": "REQ Aprobado",
  "Sin Valor Def": "En Espera +Info CKU",
};
export const INI_ACTIVE_STS = new Set(["New", "Meeting 1"]);

const INI_COL = {
  status: "color_mm3a94fr",
  id: "pulse_id_mm3atas7",
  pm: "multiple_person_mm3akwgd",
  benefit: "numeric_mm3ajaxp",
  creRaw: "pulse_log_mm3a84me",
  meet1: "date_mm3aas3p",
  meet2: "date_mm3at176",
  espera: "date_mm3gw8yy",
  planFuturo: "date_mm40dvyn",
  pku: "boolean_mm3gbngt",      // checkbox: marcado → no se envían recordatorios
  ckuMail: "lookup_mm3baydr",   // mirror: email del CKU (destinatario del recordatorio)
};

export function iniProcess(items: MondayItem[]): IniItem[] {
  const t = today();
  return items
    .map((item): IniItem | null => {
      const col = (id: string) => colText(item.column_values, id);
      const status = col(INI_COL.status);
      const id_ini = col(INI_COL.id);
      const pm = col(INI_COL.pm);
      const benefit = col(INI_COL.benefit);
      const creRaw = col(INI_COL.creRaw);
      const grupo = item.group.title;
      const meet1 = col(INI_COL.meet1);
      const meet2 = col(INI_COL.meet2);

      if (INI_APPROVED.has(status)) {
        return {
          id: id_ini, name: item.name, grupo, pm, status, benefit,
          estado: "APROBADA", dias: null, limite: null, deadline: null,
          creacion: parseCreation(creRaw), meet1, meet2,
        };
      }
      if (status === "Sin Valor Def") {
        return {
          id: id_ini, name: item.name, grupo, pm, status, benefit,
          estado: "EN_ESPERA", dias: null, limite: null, deadline: null,
          creacion: parseCreation(creRaw), espera: col(INI_COL.espera), meet1, meet2,
          pku: col(INI_COL.pku),
          ckuMail: colDisplay(item.column_values, INI_COL.ckuMail),
        };
      }
      // Meeting 2: sección "Por Definir". La salud se mide con la fecha de Meet 2 (ver porDefinirStatus).
      if (status === "Meeting 2") {
        return {
          id: id_ini, name: item.name, grupo, pm, status, benefit,
          estado: "POR_DEFINIR", dias: null, limite: null, deadline: null,
          creacion: parseCreation(creRaw), meet1, meet2,
        };
      }
      if (!status) {
        return {
          id: id_ini, name: item.name, grupo, pm, status, benefit,
          estado: "SKIP", dias: null, limite: null, deadline: null, creacion: null,
        };
      }
      if (status === "Plan Futuro") {
        const planFuturo = parseYMD(col(INI_COL.planFuturo));
        const recordatorio = planFuturo ? addBusinessDays(planFuturo, -5, true) : null;
        return {
          id: id_ini, name: item.name, grupo, pm, status, benefit,
          estado: "PLAN_FUTURO", dias: null, limite: null, deadline: null,
          creacion: parseCreation(creRaw), planFuturo, recordatorio, meet1, meet2,
        };
      }
      // Cambio Estrategia: sección informativa al final (sin salud ni impacto en el KPI).
      // Match tolerante a mayúsculas/acentos/espacios (el label de Monday puede variar).
      const ns = status.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      if (ns.includes("cambio") && ns.includes("estrategia")) {
        return {
          id: id_ini, name: item.name, grupo, pm, status, benefit,
          estado: "CAMBIO_ESTRATEGIA", dias: null, limite: null, deadline: null,
          creacion: parseCreation(creRaw), meet1, meet2,
        };
      }
      if (INI_LIMITS[status] !== undefined) {
        const limite = INI_LIMITS[status];
        let dias: number | null = null, estado = "Sin fecha";
        let deadline: Date | null = null, creacion: Date | null = null;
        // Excepción: si la columna Plan Futuro tiene fecha, se usa como base de cálculo
        // (creation log) en lugar de la fecha de creación real; si está vacía, se usa la creación.
        const planFuturo = parseYMD(col(INI_COL.planFuturo));
        const base = planFuturo ?? parseCreation(creRaw);
        if (base) {
          creacion = base;
          dias = businessDays(base, t, true);
          estado = dias > limite ? "ATRASADO" : dias === limite ? "PARA HOY" : "EN TIEMPO";
          deadline = addBusinessDays(base, limite, true);
        }
        return {
          id: id_ini, name: item.name, grupo, pm, status, benefit,
          estado, dias, limite, deadline, creacion, meet1, meet2,
        };
      }
      return null;
    })
    .filter((x): x is IniItem => x !== null);
}

// ─────────────────────────────────────────────────────────────────────
// CALENDARIO (Google Apps Script)
// ─────────────────────────────────────────────────────────────────────
export function buildCalMap(meetings: CalMeetingRaw[]): CalMap {
  const map: CalMap = new Map();
  for (const m of meetings) {
    if (!map.has(m.codigo)) map.set(m.codigo, { M1: [], M2: [] });
    const type = (m.meeting || "").toUpperCase();
    if (type === "M1" || type === "M2") {
      map.get(m.codigo)![type].push({ inicio: new Date(m.inicio), fin: new Date(m.fin) });
    }
  }
  for (const v of map.values()) {
    v.M1.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
    v.M2.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }
  return map;
}

/** Próxima reunión futura, o la última pasada si no hay futuras. */
export function nextOrLatest(arr: { inicio: Date; fin: Date }[] | undefined): { inicio: Date; fin: Date } | null {
  if (!arr || arr.length === 0) return null;
  const now = new Date();
  const upcoming = arr.filter((m) => m.inicio >= now);
  return upcoming.length > 0 ? upcoming[0] : arr[arr.length - 1];
}

// ─────────────────────────────────────────────────────────────────────
// SALUD INI POR PM
// ─────────────────────────────────────────────────────────────────────
export interface IniPMHealth {
  status: "on-track" | "in-risk" | "off-track";
  index: number;
  onTrack: number;
  inRisk: number;
  offTrack: number;
  total: number;
}

/** Estado de salud de una iniciativa activa (New / Meeting 1):
 *  - Vencida (pasó el deadline) → off track, aunque ya tenga reunión agendada.
 *  - Sin reunión del tipo que corresponde: <3 días hábiles → at risk; ≥3 días → off track.
 *  - Con reunión (y no vencida) → on track. */
export function iniItemStatus(r: IniItem, calMap?: CalMap): HealthStatus {
  if (r.estado === "ATRASADO") return "off-track";
  if (calMap && INI_ACTIVE_STS.has(r.status) && r.dias !== null) {
    const cal = calMap.get(r.id) || { M1: [], M2: [] };
    const type = r.status === "New" ? "M1" : r.status === "Meeting 1" ? "M2" : null;
    const sinReunion = type ? cal[type].length === 0 : false;
    if (sinReunion) return r.dias < 3 ? "in-risk" : "off-track";
  }
  return "on-track";
}

// ─────────────────────────────────────────────────────────────────────
// POR DEFINIR (status Meeting 2)
// ─────────────────────────────────────────────────────────────────────
/** Días de calendario transcurridos desde la fecha de Meet 2 hasta hoy.
 *  Positivo = ya pasó; 0 = hoy; negativo = aún futura. null si no hay fecha. */
export function porDefinirDias(r: IniItem): number | null {
  const m = parseYMD(r.meet2);
  if (!m) return null;
  return Math.round((today().getTime() - m.getTime()) / 86_400_000);
}

/** Salud de una iniciativa "Por Definir": off-track si ya pasó más de 1 día
 *  desde la fecha de Meet 2; on-track en caso contrario (incluye sin fecha). */
export function porDefinirStatus(r: IniItem): "on-track" | "off-track" {
  const d = porDefinirDias(r);
  return d !== null && d > 1 ? "off-track" : "on-track";
}

// ─────────────────────────────────────────────────────────────────────
// EN ESPERA — recordatorios "Sin Valor Def" (mismo cadence que el Apps Script)
// ─────────────────────────────────────────────────────────────────────
export const ESPERA_INTERVALO_DIAS = 10;  // días hábiles entre correos
export const ESPERA_MAX_CORREOS = 4;

export interface EsperaReminder {
  enviados: number;          // correos REALMENTE enviados (del registro Apps Script), 0..MAX
  total: number;             // ESPERA_MAX_CORREOS
  proximo: Date | null;      // fecha del próximo correo (último envío +10 días háb., o En Espera +10 si aún no hay ninguno)
  faltanDias: number | null; // días hábiles de hoy al próximo (solo si es futuro)
  vencido: boolean;          // el próximo ya venció → se enviará en la próxima corrida del script
  pausado: boolean;          // PKU marcado → no se envían correos
  sinCorreo: boolean;        // sin CKU Mail → no hay destinatario
}

/** Agrega el registro de correos (Apps Script) por Ini ID → { count, lastSent }. */
export function buildReminderMap(log: ReminderEnvio[]): Map<string, ReminderRecord> {
  const map = new Map<string, ReminderRecord>();
  for (const e of log) {
    const key = (e.iniId || "").trim();
    if (!key) continue;
    const d = parseYMD(e.fecha);
    const rec = map.get(key) ?? { count: 0, lastSent: null };
    rec.count++;
    if (d && (!rec.lastSent || d > rec.lastSent)) rec.lastSent = d;
    map.set(key, rec);
  }
  return map;
}

/** Estado de recordatorios de una iniciativa "En Espera" a partir del registro REAL de envíos.
 *  Cadencia: 1er correo a 10 días háb. de En Espera; los demás a +10 días háb. del último envío (máx. 4). */
export function esperaReminderInfo(r: IniItem, rec?: ReminderRecord): EsperaReminder {
  const pausado = (r.pku || "").trim() !== "";     // checkbox marcado → texto no vacío ("v")
  const sinCorreo = !(r.ckuMail || "").trim();
  const enviados = Math.min(rec?.count ?? 0, ESPERA_MAX_CORREOS);
  const info: EsperaReminder = {
    enviados, total: ESPERA_MAX_CORREOS, proximo: null, faltanDias: null, vencido: false, pausado, sinCorreo,
  };
  if (pausado || sinCorreo || enviados >= ESPERA_MAX_CORREOS) return info;

  // Base del próximo: último envío real, o la fecha En Espera si aún no se ha enviado ninguno.
  const base = rec?.lastSent ?? parseYMD(r.espera);
  if (!base) return info;

  const proximo = addBusinessDays(base, ESPERA_INTERVALO_DIAS, true);
  info.proximo = proximo;
  const hoy = today();
  if (proximo.getTime() <= hoy.getTime()) info.vencido = true;   // ya toca; saldrá en la próxima corrida
  else info.faltanDias = businessDays(hoy, proximo, true);
  return info;
}

export function calcIniPMHealth(pm: string, iniData: IniItem[], calMap?: CalMap): IniPMHealth {
  // Cuentan las iniciativas activas (New / Meeting 1) y las "Por Definir" (Meeting 2).
  const items = iniData.filter((r) => r.pm === pm && (INI_ACTIVE_STS.has(r.status) || r.estado === "POR_DEFINIR"));
  const total = items.length;
  if (total === 0) return { status: "on-track", index: 1, onTrack: 0, inRisk: 0, offTrack: 0, total: 0 };

  let onTrack = 0, inRisk = 0, offTrack = 0;
  items.forEach((r) => {
    // Por Definir usa su propia regla (fecha de Meet 2); el resto, la salud de iniciativa activa.
    const s = r.estado === "POR_DEFINIR" ? porDefinirStatus(r) : iniItemStatus(r, calMap);
    if (s === "on-track") onTrack++;
    else if (s === "in-risk") inRisk++;
    else offTrack++;
  });

  // Índice: on track = 1, in risk = 0.9, off track = 0.
  const index = (onTrack + inRisk * 0.9) / total;
  const status = healthStatusFromIndex(index) ?? "off-track";

  return { status, index, onTrack, inRisk, offTrack, total };
}

/** "Para Hoy" de iniciativas: deadline calculado hoy O reunión agendada hoy. */
export function iniIsParaHoy(r: IniItem, calMap: CalMap): boolean {
  if (isToday(r.deadline)) return true;
  const cal = calMap.get(r.id) || { M1: [], M2: [] };
  const type = r.status === "New" ? "M1" : r.status === "Meeting 1" ? "M2" : null;
  if (type) {
    const m = nextOrLatest(cal[type]);
    if (m && isToday(m.inicio)) return true;
  }
  return false;
}
