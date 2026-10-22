// src/lib/sponsorScope.ts
// Alcance de un usuario con rol "Sponsor": solo ve lo ligado a SU nombre. El nombre sale
// de su correo (Directorio RH) y se compara contra el Sponsor de cada Iniciativa, PML
// (el de su Estrategia, igual que Costo $ x Unid Neg) y Proyecto. Módulo PURO.

import { calcNpsFromRecords } from "@/lib/nps";
import { lookupEstrategia } from "@/lib/proj";
import { npsStepIds } from "@/lib/projectMetrics";
import type { DashboardData, DirectorioEntry } from "@/types";

const normName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Nombre que el Directorio RH tiene para este correo (sin importar mayúsculas ni espacios), o null. */
export function nombreDeEmail(directorio: DirectorioEntry[], email: string): string | null {
  const want = email.trim().toLowerCase();
  if (!want) return null;
  return directorio.find((d) => d.email.trim().toLowerCase() === want)?.name ?? null;
}

/** ¿Este valor de Sponsor incluye a `nombre`? El campo puede traer varias personas separadas
 *  por coma; se compara cada una por nombre completo (sin acentos ni mayúsculas), no por parte. */
export function esSponsorDe(sponsor: string | undefined, nombre: string): boolean {
  const want = normName(nombre);
  if (!want) return false;
  return (sponsor ?? "").split(/[,;]/).some((p) => normName(p) === want);
}

/** Recorta el dashboard a lo ligado a este Sponsor: sus Iniciativas, sus PML (Sponsor de su
 *  Estrategia), sus Proyectos (y los items de esos proyectos) y las encuestas de NPS de lo
 *  anterior — el NPS se recalcula. `nombre` null (el correo no está en el Directorio) deja
 *  todo vacío: nunca se muestran los demás por omisión. */
export function scopeToSponsor(data: DashboardData, nombre: string | null): DashboardData {
  const mine = (sponsor: string | undefined) => !!nombre && esSponsorDe(sponsor, nombre);

  const ini = data.ini.filter((i) => mine(i.sponsor));
  const req = data.req.filter((r) => mine(lookupEstrategia(data.estrategiaMap, r.estrategia)?.sponsor));
  const projBoards = data.projBoards.filter((b) => mine(b.sponsor));
  const boardIds = new Set(projBoards.map((b) => b.id));
  const proj = data.proj.filter((p) => boardIds.has(p.boardId));

  const surveyIds = npsStepIds(proj);
  req.forEach((r) => surveyIds.add(r.id));
  const npsRecords = data.npsRecords.filter((r) => r.reqId && surveyIds.has(r.reqId));

  return { ...data, ini, req, projBoards, proj, npsRecords, nps: calcNpsFromRecords(npsRecords) };
}
