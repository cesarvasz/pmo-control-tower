// src/lib/clonacion.ts
// SOLO SERVIDOR. Bitácora de Clonación de Files — archivo de Google Sheets
// "Clonacion files" (pestaña "clonacion"), DISTINTO al de la hoja ROI de 003 —
// vía Apps Script, fuente independiente (ver apps-script/roi-clonacion-README.md):
// su propio doGet, su propia variable de entorno. Estructura paralela a
// src/lib/roi.ts, pero sin depender de él a propósito: un cambio en uno no
// puede romper al otro.
//
// El Apps Script manda la hoja CODIFICADA (diccionarios + fechas numéricas),
// igual que 003. Aquí se decodifica a ClonacionRow[].

import { gunzipSync } from "node:zlib";
import type { ClonacionRow, ClonacionPayload } from "@/types";

const p2 = (n: number) => String(n).padStart(2, "0");

/** Segundos → "yyyy-MM-ddTHH:mm:ss". Ver roi.ts::fechaDesdeSegundos para el
 *  porqué de empacar/desempacar con getUTC*: el número es hora de pared
 *  codificada, no un instante real, así que no depende de la zona horaria de
 *  quien decodifica. */
export function fechaDesdeSegundos(epoca: number, seg: number | null): string {
  if (seg == null) return "";
  const d = new Date(epoca + seg * 1000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` +
    `T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** Reconstruye las filas de la pestaña "clonacion" a partir del payload codificado. */
export function decodificarClonacion(p: ClonacionPayload): ClonacionRow[] {
  const { epoca, libres = [], textos = [], fechas = [], dicc = {}, filas = [] } = p;
  const nLibres = libres.length, nTextos = textos.length;

  return filas.map((f) => {
    const row: Record<string, string> = {};
    libres.forEach((c, i) => { row[c] = String(f[i] ?? ""); });
    textos.forEach((c, i) => {
      const k = f[nLibres + i];
      row[c] = (typeof k === "number" ? dicc[c]?.[k] : undefined) ?? "";
    });
    fechas.forEach((c, i) => {
      const v = f[nLibres + nTextos + i];
      row[c] = fechaDesdeSegundos(epoca, typeof v === "number" ? v : null);
    });
    return row as unknown as ClonacionRow;
  });
}

/** Apps Script responde HTTP 200 con una página HTML cuando la ejecución falla. */
function diagnosticarHtml(cuerpo: string): string {
  if (/Excedió el tiempo máximo|Exceeded maximum execution time/i.test(cuerpo)) {
    return "El Apps Script excedió el límite de 6 minutos de Google — ver apps-script/roi-clonacion-README.md.";
  }
  if (/Authorization|autorización|permiso/i.test(cuerpo)) {
    return "El Apps Script pide autorización. Vuelve a desplegarlo con acceso «Cualquier persona».";
  }
  return "El Apps Script devolvió una página de error en vez de JSON. Ábrelo en el editor y revisa " +
    "las Ejecuciones para ver el detalle.";
}

// Mismo calibrado que roi.ts (misma familia de fallas: el /exec de Apps
// Script redirige a un endpoint que da 404 intermitente en respuestas lentas).
const INTENTOS = 2;
const ABORTO_MS = 26_000;
const PLAZO_MS = 54_000;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ClonacionResultado {
  rows: ClonacionRow[];
  /** Cuándo el Apps Script armó el caché que se sirvió. */
  generado?: string;
}

export async function fetchClonacionRows(): Promise<ClonacionResultado> {
  const url = process.env.ROI_CLONACION_WEBAPP_URL;
  if (!url) throw new Error("Falta ROI_CLONACION_WEBAPP_URL en .env.local (ver apps-script/roi-clonacion-README.md)");

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
        if (!texto.trimStart().startsWith("<")) return parsear(texto);
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
    `ROI Clonación WebApp: ${ultimo} tras varios intentos. Si se repite, revisa que el caché esté ` +
    `instalado: ejecuta medirDoGet() en el editor del script (ver apps-script/roi-clonacion-README.md).`,
  );
}

/** El Apps Script manda el payload comprimido: {gz: base64(gzip(json))}. */
function descomprimir(texto: string): string {
  let sobre: { gz?: string };
  try {
    sobre = JSON.parse(texto);
  } catch {
    throw new Error("El Apps Script devolvió una respuesta que no es JSON válido.");
  }
  if (typeof sobre.gz !== "string") return texto;

  try {
    return gunzipSync(Buffer.from(sobre.gz, "base64")).toString("utf8");
  } catch {
    throw new Error("No se pudo descomprimir el payload del Apps Script. Regenera el caché con regenerarCache().");
  }
}

function parsear(recibido: string): ClonacionResultado {
  const texto = descomprimir(recibido);

  let json: ClonacionPayload;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error("El Apps Script devolvió una respuesta que no es JSON válido.");
  }

  if (!Array.isArray(json.filas)) {
    throw new Error("El Apps Script devolvió un payload sin filas. Revisa que ROI_SHEET_ID apunte a la hoja correcta.");
  }
  return { rows: decodificarClonacion(json), generado: json.generado };
}
