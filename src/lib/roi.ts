// src/lib/roi.ts
// SOLO SERVIDOR. Bitácora ROI (Google Sheets, pestaña "003") vía Apps Script —
// fuente independiente del resto del dashboard: su propio doGet, su propia
// variable de entorno. Ver apps-script/roi-log-README.md.
//
// El Apps Script manda la hoja CODIFICADA (diccionarios + fechas numéricas):
// 27.6 MB de filas crudas bajan a 5.0 MB sin perder un dato. Aquí se decodifica
// a los mismos RoiRow de siempre, así que nada río abajo se entera del cambio.

import { gunzipSync } from "node:zlib";
import type { RoiRow, RoiPayload } from "@/types";

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * Segundos → "yyyy-MM-ddTHH:mm:ss".
 *
 * El script empaqueta los componentes LOCALES de la hoja dentro de un Date.UTC,
 * así que se desempaquetan con getUTC* para recuperar la misma hora de pared.
 * El número nunca fue un instante real: es hora de pared codificada, y por eso
 * el resultado no depende de la zona horaria del servidor que lo decodifique.
 */
export function fechaDesdeSegundos(epoca: number, seg: number | null): string {
  if (seg == null) return "";
  const d = new Date(epoca + seg * 1000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` +
    `T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** Reconstruye las filas de la hoja a partir del payload codificado. */
export function decodificar(p: RoiPayload): RoiRow[] {
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
    return row as unknown as RoiRow;
  });
}

/**
 * Apps Script responde HTTP 200 con una página HTML cuando la ejecución falla
 * (límite de 6 minutos, permisos, script property ausente…). Sin este chequeo el
 * error que llega a la pantalla es "Unexpected token '<'", que no dice nada.
 */
function diagnosticarHtml(cuerpo: string): string {
  if (/Excedió el tiempo máximo|Exceeded maximum execution time/i.test(cuerpo)) {
    return "El Apps Script excedió el límite de 6 minutos de Google. La hoja creció más de lo que " +
      "alcanza a serializar en una sola pasada — ver apps-script/roi-log-README.md.";
  }
  if (/Authorization|autorización|permiso/i.test(cuerpo)) {
    return "El Apps Script pide autorización. Vuelve a desplegarlo con acceso «Cualquier persona».";
  }
  return "El Apps Script devolvió una página de error en vez de JSON. Ábrelo en el editor y revisa " +
    "las Ejecuciones para ver el detalle.";
}

/**
 * Reintentos con aborto rápido.
 *
 * El /exec de Apps Script redirige a script.googleusercontent.com/macros/echo y
 * ESE endpoint devuelve 404 cada tantas peticiones, aunque el script haya
 * corrido bien. Al medirlo apareció una separación limpia por tiempo:
 *
 *   éxitos → 10.5 s y 14.2 s      fallos → 21, 29, 42, 43, 45 y 79 s
 *
 * O sea que una respuesta lenta ya es un 404 en camino. Por eso no se espera a
 * que conteste: pasado ABORTO_MS se corta y se reintenta, que es mucho más
 * barato que aguantar 80 s para recibir un error.
 *
 * Con el caché en Drive del Apps Script el doGet responde en ~1 s y esto casi
 * no se activa; queda como red de seguridad.
 */
const INTENTOS = 4;
const ABORTO_MS = 18_000; // por encima de esto la respuesta ya no llega buena
const PLAZO_MS = 50_000;  // presupuesto total: Vercel corta la función a los 60 s

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RoiResultado {
  rows: RoiRow[];
  /** Cuándo el Apps Script armó el caché que se sirvió. */
  generado?: string;
}

export async function fetchRoiRows(): Promise<RoiResultado> {
  const url = process.env.ROI_WEBAPP_URL;
  if (!url) throw new Error("Falta ROI_WEBAPP_URL en .env.local (ver apps-script/roi-log-README.md)");

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
        // HTML con 200: el script falló de verdad (timeout, permisos). No se reintenta.
        throw new Error(diagnosticarHtml(texto));
      }

      ultimo = `HTTP ${res.status}`;
      // 404 del endpoint de contenido y 429/5xx son transitorios; el resto no.
      if (!(res.status === 404 || res.status === 429 || res.status >= 500)) break;
    } catch (err) {
      if (err instanceof Error && !/abort|timeout/i.test(err.name + err.message)) throw err;
      ultimo = `sin respuesta en ${ABORTO_MS / 1000} s`;
    }

    if (intento === INTENTOS || Date.now() - arranque > PLAZO_MS - ABORTO_MS) break;
    await esperar(300);
  }

  throw new Error(
    `ROI WebApp: ${ultimo} tras varios intentos. Es una falla intermitente de Apps Script al servir ` +
    `respuestas grandes. Si se repite, revisa que el caché esté instalado: ejecuta medirDoGet() en el ` +
    `editor del script (ver apps-script/roi-log-README.md).`,
  );
}

/**
 * El Apps Script manda el payload comprimido: {gz: base64(gzip(json))}.
 *
 * Mover los 5 MB sin comprimir por la redirección de Google fallaba 4 de cada
 * 10 veces; a 1.63 MB el envío es mucho más corto, que es lo que correlaciona
 * con el 404. Se acepta también la forma sin comprimir por compatibilidad.
 */
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

function parsear(recibido: string): RoiResultado {
  const texto = descomprimir(recibido);

  let json: RoiPayload & { rows?: RoiRow[] };
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error("El Apps Script devolvió una respuesta que no es JSON válido.");
  }

  // `rows` es el formato viejo (filas crudas). Se acepta para que la app siga
  // funcionando si el WebApp aún no se ha redesplegado con el script nuevo.
  if (Array.isArray(json.rows)) return { rows: json.rows, generado: json.generado };
  if (!Array.isArray(json.filas)) {
    throw new Error("El Apps Script devolvió un payload sin filas. Revisa que ROI_SHEET_ID apunte a la hoja correcta.");
  }
  return { rows: decodificar(json), generado: json.generado };
}
