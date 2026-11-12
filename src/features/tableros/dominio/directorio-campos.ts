// Campos PROPIOS del directorio: además de los que trae el Directorio RH (nombre, correo, grupo,
// rol, TLD, horas/mes), el PMO puede agregar campos (País, Área…) que se llenan en la app y se
// muestran en los tableros con una columna Espejo sobre una columna Persona. Lógica PURA.

export type TipoCampoDirectorio = "texto" | "numero" | "fecha" | "lista";

export const TIPOS_CAMPO_DIRECTORIO: { clave: TipoCampoDirectorio; etiqueta: string }[] = [
  { clave: "texto", etiqueta: "Texto" },
  { clave: "numero", etiqueta: "Número" },
  { clave: "fecha", etiqueta: "Fecha" },
  { clave: "lista", etiqueta: "Lista de opciones" },
];

export interface CampoDirectorio {
  id: string;
  titulo: string;
  tipo: TipoCampoDirectorio;
  /** Solo «lista»: las opciones que se pueden elegir. */
  opciones: string[];
  orden: number;
}

export const MAX_TITULO_CAMPO = 60;
export const MAX_TEXTO_CAMPO = 500;
export const MAX_OPCIONES = 50;

/** Los campos fijos del directorio (vienen del Directorio RH): un campo propio no puede llamarse así. */
export const TITULOS_FIJOS = ["nombre", "correo", "email", "grupo", "rol", "tld", "hrs/mes", "horas/mes", "usuario", "estado"];

const esTipo = (t: unknown): t is TipoCampoDirectorio => TIPOS_CAMPO_DIRECTORIO.some((x) => x.clave === t);

/** Opciones de una lista: sin vacías ni repetidas (sin importar mayúsculas), en el orden dado. */
export function limpiarOpciones(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const o of v) {
    const t = typeof o === "string" ? o.trim().slice(0, 80) : "";
    if (!t || vistas.has(t.toLowerCase())) continue;
    vistas.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, MAX_OPCIONES);
}

/** Valida lo que se pide para crear o editar un campo. Devuelve el error para el usuario, o el campo limpio. */
export function validarDefinicionCampo(
  d: { titulo?: unknown; tipo?: unknown; opciones?: unknown },
  existentes: { id: string; titulo: string }[],
  propioId: string | null = null,
): { error: string } | { titulo: string; tipo: TipoCampoDirectorio; opciones: string[] } {
  const titulo = typeof d.titulo === "string" ? d.titulo.trim().replace(/\s+/g, " ").slice(0, MAX_TITULO_CAMPO) : "";
  if (!titulo) return { error: "El campo necesita un título" };
  if (TITULOS_FIJOS.includes(titulo.toLowerCase())) return { error: `«${titulo}» ya es un campo del directorio` };
  if (existentes.some((c) => c.id !== propioId && c.titulo.trim().toLowerCase() === titulo.toLowerCase())) {
    return { error: `Ya hay un campo que se llama «${titulo}»` };
  }
  if (!esTipo(d.tipo)) return { error: "Tipo de campo no válido" };
  const opciones = d.tipo === "lista" ? limpiarOpciones(d.opciones) : [];
  if (d.tipo === "lista" && !opciones.length) return { error: "Una lista necesita al menos una opción" };
  return { titulo, tipo: d.tipo, opciones };
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza el valor de un campo para una persona. null = vacío (se borra). Lanza con un mensaje si no es válido. */
export function validarValorCampo(campo: CampoDirectorio, v: unknown): string | number | null {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
  switch (campo.tipo) {
    case "texto": {
      if (typeof v !== "string" && typeof v !== "number") throw new Error(`«${campo.titulo}» espera texto`);
      return String(v).trim().slice(0, MAX_TEXTO_CAMPO);
    }
    case "numero": {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      if (!Number.isFinite(n)) throw new Error(`«${campo.titulo}» espera un número`);
      return n;
    }
    case "fecha": {
      const s = String(v).trim().slice(0, 10);
      if (!FECHA_RE.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) throw new Error(`«${campo.titulo}» espera una fecha (AAAA-MM-DD)`);
      return s;
    }
    case "lista": {
      const s = String(v).trim();
      const opcion = campo.opciones.find((o) => o.toLowerCase() === s.toLowerCase());
      if (!opcion) throw new Error(`«${s}» no es una opción de «${campo.titulo}»`);
      return opcion;
    }
  }
}

/** Cómo se muestra el valor (en el directorio y en un Espejo). */
export function textoValorCampo(campo: Pick<CampoDirectorio, "tipo">, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (campo.tipo === "fecha" && typeof v === "string" && FECHA_RE.test(v)) {
    const [a, m, d] = v.split("-");
    return `${d}/${m}/${a}`;
  }
  return String(v);
}

// En la config de un Espejo, un campo propio se guarda como «campo:<id>» (los fijos, por su clave: «tld», «rol»…).
const PREFIJO = "campo:";
export const claveEspejoDeCampo = (campoId: string) => `${PREFIJO}${campoId}`;
export const campoDeClaveEspejo = (clave: string): string | null => (clave.startsWith(PREFIJO) ? clave.slice(PREFIJO.length) : null);
