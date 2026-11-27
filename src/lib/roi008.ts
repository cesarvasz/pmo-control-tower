// src/lib/roi008.ts
// SOLO SERVIDOR (trae node:zlib). Hoja ROI, pestaña "008" (Ducafast SV · análisis
// de tiempos) vía Apps Script — fuente independiente de 003: su propio doGet, su
// propia variable de entorno (ROI_008_WEBAPP_URL). Ver apps-script/roi-008-README.md.
// Estructura paralela a roi.ts / implementacion.ts, sin depender de ellos a
// propósito: un cambio en uno no puede romper al otro.
//
// Aquí solo se decodifica el transporte. Las reglas de negocio (Ducafast, tramos,
// horas hábiles) viven en lib/tiempos008.ts y corren en el cliente, como en 003.

import { gunzipSync } from "node:zlib";
import type { Roi008Row, Roi008Payload } from "@/types";

const p2 = (n: number) => String(n).padStart(2, "0");

/** Segundos → "yyyy-MM-ddTHH:mm:ss". El número es hora de pared codificada (ver
 *  roi.ts::fechaDesdeSegundos), así que se lee con getUTC* y el resultado no
 *  depende de la zona horaria del servidor que decodifica (Vercel corre en UTC). */
export function fechaDesdeSegundos(epoca: number, seg: number | null): string {
  if (seg == null) return "";
  const d = new Date(epoca + seg * 1000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` +
    `T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** Reconstruye las filas de la pestaña "008" a partir del payload codificado. */
export function decodificarRoi008(p: Roi008Payload): Roi008Row[] {
  const { epoca, libres = [], textos = [], fechas = [], dicc = {}, filas = [] } = p;
  const nLibres = libres.length, nTextos = textos.length;

  return filas.map((f) => {
    const row: Roi008Row = {};
    libres.forEach((c, i) => {
      const v = f[i];
      row[c] = v == null ? null : typeof v === "number" ? v : String(v);
    });
    textos.forEach((c, i) => {
      const k = f[nLibres + i];
      row[c] = (typeof k === "number" ? dicc[c]?.[k] : undefined) ?? "";
    });
    fechas.forEach((c, i) => {
      const v = f[nLibres + nTextos + i];
      row[c] = fechaDesdeSegundos(epoca, typeof v === "number" ? v : null);
    });
    return row;
  });
}

/** Encabezados de la pestaña, en el orden en que viajan (para validar columnas aunque no haya filas). */
export const columnasDe = (p: Roi008Payload) => [...(p.libres ?? []), ...(p.textos ?? []), ...(p.fechas ?? [])];

/** Apps Script responde HTTP 200 con una página HTML cuando la ejecución falla. */
function diagnosticarHtml(cuerpo: string): string {
  if (/Excedió el tiempo máximo|Exceeded maximum execution time/i.test(cuerpo)) {
    return "El Apps Script de ROI 008 excedió el límite de 6 minutos de Google — ver apps-script/roi-008-README.md.";
  }
  if (/Authorization|autorización|permiso/i.test(cuerpo)) {
    return "El Apps Script de ROI 008 pide autorización. Vuelve a desplegarlo con acceso «Cualquier persona».";
  }
  return "El Apps Script de ROI 008 devolvió una página de error en vez de JSON. Ábrelo en el editor y revisa " +
    "las Ejecuciones para ver el detalle.";
}

// Mismo calibrado que roi.ts (misma familia de fallas: el /exec de Apps Script
// redirige a un endpoint que da 404 intermitente en respuestas lentas).
const INTENTOS = 2;
const ABORTO_MS = 26_000;
const PLAZO_MS = 54_000;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Roi008Resultado {
  rows: Roi008Row[];
  /** Encabezados que trae la pestaña (la app valida que estén las columnas que necesita). */
  columnas: string[];
  /** Cuándo el Apps Script armó el caché que se sirvió. */
  generado?: string;
}

export async function fetchRoi008Rows(): Promise<Roi008Resultado> {
  const url = process.env.ROI_008_WEBAPP_URL;
  if (!url) throw new Error("Falta ROI_008_WEBAPP_URL en .env.local (ver apps-script/roi-008-README.md)");

  const arranque = Date.now();
  let ultimo = "sin respuesta";

  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(ABORTO_MS),
      });

      if (res.ok) {
        const texto = await res.text();
        if (!texto.trimStart().startsWith("<")) return parsearRoi008(texto);
        throw new Error(diagnosticarHtml(texto));
      }

      ultimo = `HTTP ${res.status}`;
      if (!(res.status === 404 || res.status === 429 || res.status >= 500)) break;
    } catch (err) {
      if (err instanceof Error && !/abort|timeout/i.test(err.name + err.message)) throw err;
      ultimo = `sin respuesta en ${ABORTO_MS / 1000} s`;
    }

    if (intento === INTENTOS || Date.now() - arranque > PLAZO_MS - ABORTO_MS) break;
    await esperar(300);
  }

  throw new Error(
    `ROI 008 WebApp: ${ultimo} tras varios intentos. Si se repite, revisa que el caché esté ` +
    `instalado: ejecuta medirDoGet() en el editor del script (ver apps-script/roi-008-README.md).`,
  );
}

/** El Apps Script manda el payload comprimido: {gz: base64(gzip(json))}. Se acepta también sin comprimir. */
function descomprimir(texto: string): string {
  let sobre: { gz?: string };
  try {
    sobre = JSON.parse(texto);
  } catch {
    throw new Error("El Apps Script de ROI 008 devolvió una respuesta que no es JSON válido.");
  }
  if (typeof sobre.gz !== "string") return texto;

  try {
    return gunzipSync(Buffer.from(sobre.gz, "base64")).toString("utf8");
  } catch {
    throw new Error("No se pudo descomprimir el payload de ROI 008. Regenera el caché con regenerarCache().");
  }
}

/** Respuesta cruda del WebApp → filas. Exportada para los tests. */
export function parsearRoi008(recibido: string): Roi008Resultado {
  const texto = descomprimir(recibido);

  let json: Roi008Payload;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error("El Apps Script de ROI 008 devolvió una respuesta que no es JSON válido.");
  }

  if (!Array.isArray(json.filas)) {
    throw new Error("El Apps Script de ROI 008 devolvió un payload sin filas. Revisa que ROI_SHEET_ID apunte a la hoja ROI.");
  }
  // Sin pestaña o sin ID el script deja dicho por qué: mejor mostrar eso que «sin datos».
  if (!json.filas.length && json.aviso) throw new Error(`ROI 008: ${json.aviso}`);
  return { rows: decodificarRoi008(json), columnas: columnasDe(json), generado: json.generado };
}
