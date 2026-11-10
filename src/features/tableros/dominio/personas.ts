// Directorio de personas: de dónde sale cada persona (Directorio RH de Monday, mientras exista)
// y cómo se liga con el usuario que inicia sesión (por correo). Lógica PURA.

import type { MondayItem } from "@/types";

export interface Persona {
  id: string;
  nombre: string;
  email: string | null;
  grupo: string | null;
  rol: string | null;
  tld: string | null;
  hrsMes: number | null;
  activo: boolean;
  appUserId: string | null;
  mondayItemId: string | null;
}

/** Lo que se toma de una fila del Directorio RH (sin id ni liga a usuario). */
export type PersonaImportada = Omit<Persona, "id" | "appUserId">;

export function normalizarEmail(e: string | null | undefined): string | null {
  const s = (e ?? "").trim().toLowerCase();
  return s.includes("@") ? s : null;
}

/** Valor de una columna por su TÍTULO (los ids de columna de Monday son aleatorios). */
function porTitulo(item: MondayItem, titulo: string): string | null {
  const t = titulo.toLowerCase();
  const v = item.column_values.find((c) => c.column?.title?.trim().toLowerCase() === t);
  const s = (v?.text ?? "").trim();
  return s || null;
}

/** Fila del Directorio RH (Monday) → persona. Columnas: Email, Hrs Mes, Role, TLD, Status. */
export function personaDesdeRh(item: MondayItem): PersonaImportada {
  const hrs = Number(porTitulo(item, "Hrs Mes"));
  return {
    nombre: item.name.trim(),
    email: normalizarEmail(porTitulo(item, "Email")),
    grupo: item.group?.title?.trim() || null,
    rol: porTitulo(item, "Role"),
    tld: porTitulo(item, "TLD"),
    hrsMes: porTitulo(item, "Hrs Mes") !== null && Number.isFinite(hrs) ? hrs : null,
    activo: (porTitulo(item, "Status") ?? "").toLowerCase() !== "inactive",
    mondayItemId: item.id,
  };
}

/** persona.email → app_users.id (comparando correos en minúsculas). */
export function ligarPorEmail(
  personas: { email: string | null }[],
  usuarios: { id: string; email: string }[],
): Map<string, string> {
  const porEmail = new Map(usuarios.map((u) => [u.email.trim().toLowerCase(), u.id]));
  const out = new Map<string, string>();
  for (const p of personas) {
    const e = normalizarEmail(p.email);
    const uid = e ? porEmail.get(e) : undefined;
    if (e && uid) out.set(e, uid);
  }
  return out;
}

/** Normaliza un nombre para buscarlo (sin acentos, mayúsculas ni espacios de más). */
export function claveNombre(n: string): string {
  return n.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}
