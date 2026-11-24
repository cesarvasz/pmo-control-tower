// SOLO SERVIDOR. Flujo «Status Card»: la foto PNG de la hoja, idéntica a la app. Chrome sin ventana abre la hoja interna
// (/status-card-imagen/<código firmado>), espera a que termine de acomodarse y le toma la foto; el PNG se guarda en el
// bucket privado «google-chat» y lo entrega /api/google-chat/foto/<código> (el enlace que lleva el mensaje del chat).
// La foto NO se toma dentro de la respuesta al chat (Google Chat corta la espera a los pocos segundos): se empieza justo
// después de responder (after) y, si Google la pide antes de que esté, se espera o se toma en ese momento.
//  · En Vercel: Chrome de @sparticuz/chromium (hecho para funciones serverless).
//  · En local: el Chrome instalado (CHROME_PATH o la ruta de siempre).

import { existsSync } from "node:fs";
import type { Browser } from "puppeteer-core";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { firmar } from "../../nucleo/firma";
import { HOJA_H, HOJA_W, PREFIJO_CODIGO, VIDA_CODIGO_SEG, VIGENCIA_IMAGEN_DIAS, rutaFoto } from "./codigo";

const BUCKET = "google-chat";
/** Nitidez: 2 = el doble de píxeles que la hoja (≈ 2245 × 1587). */
const ESCALA = 2;
const ESPERA_MS = 20_000;

const RUTAS_CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

async function abrirChrome(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  }
  const ruta = process.env.CHROME_PATH || RUTAS_CHROME.find((r) => existsSync(r));
  if (!ruta) throw new Error("No encontré Chrome en este equipo (define CHROME_PATH)");
  return puppeteer.launch({ executablePath: ruta, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
}

/** Dónde abre Chrome la hoja: en local, el propio servidor (sin pasar por el túnel); en Vercel, el dominio de la app. */
function origenParaChrome(origenApp: string): string {
  if (process.env.VERCEL) return origenApp;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/** La foto PNG de la Status Card del proyecto (con los datos de este momento). */
export async function fotoStatusCard(boardId: string, origenApp: string): Promise<Buffer> {
  const codigo = firmar(`${PREFIJO_CODIGO}${boardId}`, VIDA_CODIGO_SEG);
  const url = `${origenParaChrome(origenApp)}/status-card-imagen/${encodeURIComponent(codigo)}`;
  const chrome = await abrirChrome();
  try {
    const pagina = await chrome.newPage();
    await pagina.setViewport({ width: Math.ceil(HOJA_W), height: Math.ceil(HOJA_H), deviceScaleFactor: ESCALA });
    const r = await pagina.goto(url, { waitUntil: "networkidle0", timeout: ESPERA_MS });
    if (!r || !r.ok()) throw new Error(`La hoja de la Status Card respondió ${r?.status() ?? "sin respuesta"}`);
    const hoja = await pagina.waitForSelector('#hoja-status-card[data-lista="1"]', { timeout: ESPERA_MS });
    if (!hoja) throw new Error("La hoja de la Status Card no terminó de cargar");
    // En desarrollo Next pinta su burbuja «N» encima de la página: fuera de la foto.
    await pagina.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    return Buffer.from(await hoja.screenshot({ type: "png" }));
  } finally {
    await chrome.close().catch(() => {});
  }
}

const storage = () => getSupabaseAdmin().storage.from(BUCKET);

async function leerGuardada(ruta: string): Promise<Buffer | null> {
  const { data, error } = await storage().download(ruta);
  return error || !data ? null : Buffer.from(await data.arrayBuffer());
}

/** Fotos tomándose en este proceso (para no abrir dos Chrome por la misma). */
const enCurso = new Map<string, Promise<Buffer>>();

/** Toma la foto y la guarda (si ya se está tomando en este proceso, espera esa). */
export function tomarYGuardar(boardId: string, emitido: number, origenApp: string): Promise<Buffer> {
  const ruta = rutaFoto(boardId, emitido);
  const ya = enCurso.get(ruta);
  if (ya) return ya;
  const p = (async () => {
    const png = await fotoStatusCard(boardId, origenApp);
    const subida = await storage().upload(ruta, png, { contentType: "image/png", upsert: true });
    if (subida.error) throw new Error(`No se pudo guardar la imagen: ${subida.error.message}`);
    await limpiarViejas(`status-card/${boardId}`).catch((e) => console.warn("[google-chat] no se pudieron borrar imágenes viejas", e));
    return png;
  })().finally(() => enCurso.delete(ruta));
  enCurso.set(ruta, p);
  return p;
}

/** La foto para entregarla: la guardada; si no hay, la que se está tomando; si no, se toma ahora.
 *  Recién emitida (< 30 s) se espera un poco a la que empezó `after` en otra instancia antes de tomar otra. */
export async function fotoParaEntregar(boardId: string, emitido: number, origenApp: string): Promise<Buffer> {
  const ruta = rutaFoto(boardId, emitido);
  const guardada = await leerGuardada(ruta);
  if (guardada) return guardada;
  const enEste = enCurso.get(ruta);
  if (enEste) return enEste;
  if (Date.now() - emitido < 30_000) {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 750));
      const lista = await leerGuardada(ruta);
      if (lista) return lista;
    }
  }
  return tomarYGuardar(boardId, emitido, origenApp);
}

/** Las fotos cuyo enlace ya venció (más de 7 días + 1 de holgura) ya no se ven en ningún chat: se borran. */
async function limpiarViejas(carpeta: string) {
  const { data, error } = await storage().list(carpeta, { limit: 1000 });
  if (error || !data) return;
  const limite = Date.now() - (VIGENCIA_IMAGEN_DIAS + 1) * 24 * 3600 * 1000;
  const viejas = data.filter((f) => { const t = parseInt(f.name, 10); return Number.isFinite(t) && t < limite; }).map((f) => `${carpeta}/${f.name}`);
  if (viejas.length) await storage().remove(viejas);
}
