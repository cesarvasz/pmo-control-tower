// src/lib/roi.ts
// SOLO SERVIDOR. Bitácora ROI (Google Sheets, pestaña "003") vía Apps Script —
// fuente independiente del resto del dashboard: su propio doGet, su propia
// variable de entorno. Ver apps-script/roi-log-README.md.
//
// El Apps Script manda la hoja CODIFICADA (diccionarios + fechas numéricas):
// 27.6 MB de filas crudas bajan a 5.0 MB sin perder un dato. Aquí se decodifica
// a los mismos RoiRow de siempre, así que nada río abajo se entera del cambio.

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
 * Reintentos: el /exec de Apps Script redirige a
 * script.googleusercontent.com/macros/echo, y ESE endpoint devuelve 404 de vez
 * en cuando aunque el script haya corrido bien. Medido: 1 de cada 3 peticiones
 * con el payload de 5 MB. No es el despliegue ni el script, es infraestructura
 * de Google, y el reintento inmediato funciona.
 *
 * El presupuesto está acotado porque en Vercel la función se corta a los 60 s y
 * cada intento tarda ~15 s: no se empieza uno nuevo pasado el plazo.
 */
const INTENTOS = 3;
const PLAZO_MS = 38_000;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchRoiRows(): Promise<RoiRow[]> {
  const url = process.env.ROI_WEBAPP_URL;
  if (!url) throw new Error("Falta ROI_WEBAPP_URL en .env.local (ver apps-script/roi-log-README.md)");

  const arranque = Date.now();
  let ultimo = "";

  for (let intento = 1; intento <= INTENTOS; intento++) {
    const res = await fetch(url, { redirect: "follow", cache: "no-store" });

    if (res.ok) {
      const texto = await res.text();
      if (!texto.trimStart().startsWith("<")) return parsear(texto);
      // HTML con 200: el script falló de verdad (timeout, permisos). No se reintenta.
      throw new Error(diagnosticarHtml(texto));
    }

    ultimo = `HTTP ${res.status}`;
    // 404 del endpoint de contenido y 429/5xx son transitorios; el resto no.
    const transitorio = res.status === 404 || res.status === 429 || res.status >= 500;
    if (!transitorio || intento === INTENTOS) break;
    if (Date.now() - arranque > PLAZO_MS) break;
    await esperar(400 * intento);
  }

  throw new Error(
    `ROI WebApp: ${ultimo} tras ${INTENTOS} intentos. Es una falla intermitente conocida de Apps ` +
    `Script al servir respuestas grandes; vuelve a intentar en un momento.`,
  );
}

function parsear(texto: string): RoiRow[] {
  let json: RoiPayload & { rows?: RoiRow[] };
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error("El Apps Script devolvió una respuesta que no es JSON válido.");
  }

  // `rows` es el formato viejo (filas crudas). Se acepta para que la app siga
  // funcionando si el WebApp aún no se ha redesplegado con el script nuevo.
  if (Array.isArray(json.rows)) return json.rows;
  if (!Array.isArray(json.filas)) {
    throw new Error("El Apps Script devolvió un payload sin filas. Revisa que ROI_SHEET_ID apunte a la hoja correcta.");
  }
  return decodificar(json);
}
