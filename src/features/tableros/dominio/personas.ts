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

// ── Edición en la app (después del corte del Directorio RH) ──────────────────

/** Los campos fijos de una persona que se editan en la app una vez cortado el Directorio RH de Monday. */
export interface DatosPersona {
  nombre: string;
  email: string | null;
  grupo: string | null;
  rol: string | null;
  tld: string | null;
  hrsMes: number | null;
  activo: boolean;
}

export const CAMPOS_PERSONA = ["nombre", "email", "grupo", "rol", "tld", "hrsMes", "activo"] as const;
export type CampoPersona = (typeof CAMPOS_PERSONA)[number];

const texto = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new Error("Valor no válido");
  const s = v.replace(/\s+/g, " ").trim();
  if (s.length > max) throw new Error(`Máximo ${max} caracteres`);
  return s || null;
};

/** Valida y normaliza UN campo. Lanza Error con un mensaje para la persona si no sirve. */
export function validarCampoPersona(campo: CampoPersona, v: unknown): DatosPersona[CampoPersona] {
  switch (campo) {
    case "nombre": {
      const s = texto(v, 120);
      if (!s) throw new Error("El nombre no puede quedar vacío");
      return s;
    }
    case "email": {
      const s = texto(v, 160);
      if (!s) return null;
      const e = normalizarEmail(s);
      if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("Correo no válido");
      return e;
    }
    case "grupo": return texto(v, 80);
    case "rol": return texto(v, 40);
    case "tld": return texto(v, 40);
    case "hrsMes": {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 744) throw new Error("Horas al mes: un número entre 0 y 744");
      return Math.round(n * 100) / 100;
    }
    case "activo":
      if (typeof v !== "boolean") throw new Error("Valor no válido");
      return v;
  }
}

/** Una persona nueva: nombre obligatorio; lo demás opcional (activa por defecto). Correo repetido = error. */
export function validarPersonaNueva(d: Record<string, unknown>, correosExistentes: Iterable<string | null>): DatosPersona {
  const p: DatosPersona = {
    nombre: validarCampoPersona("nombre", d.nombre) as string,
    email: validarCampoPersona("email", d.email) as string | null,
    grupo: validarCampoPersona("grupo", d.grupo) as string | null,
    rol: validarCampoPersona("rol", d.rol) as string | null,
    tld: validarCampoPersona("tld", d.tld) as string | null,
    hrsMes: validarCampoPersona("hrsMes", d.hrsMes) as number | null,
    activo: d.activo === undefined ? true : (validarCampoPersona("activo", d.activo) as boolean),
  };
  if (p.email && [...correosExistentes].some((e) => normalizarEmail(e) === p.email)) throw new Error("Ya hay una persona con ese correo");
  return p;
}
