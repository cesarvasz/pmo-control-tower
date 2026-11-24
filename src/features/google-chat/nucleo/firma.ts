// SOLO SERVIDOR. Bot de Google Chat · núcleo: códigos firmados de vida corta (HMAC-SHA256), para abrir páginas internas
// sin sesión (p. ej. la hoja de la Status Card que fotografía Chrome). Sin tabla: el código lleva su dato y su
// vencimiento, y la firma prueba que lo emitió el servidor. La llave se deriva de la secret key de Supabase (nunca sale).

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function llave(): Buffer {
  const base = process.env.SUPABASE_SECRET_KEY;
  if (!base) throw new Error("Falta SUPABASE_SECRET_KEY para firmar");
  return createHash("sha256").update(`google-chat/firma:${base}`).digest();
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const firmaDe = (cuerpo: string) => createHmac("sha256", llave()).update(cuerpo).digest("base64url");

/** Un código para `dato` que vence en `segundos`. Formato: base64url(dato).vencimiento.firma */
export function firmar(dato: string, segundos: number, ahora = Date.now()): string {
  const cuerpo = `${b64(dato)}.${Math.floor(ahora / 1000) + segundos}`;
  return `${cuerpo}.${firmaDe(cuerpo)}`;
}

/** El dato del código si la firma es válida y no venció; null si no. */
export function verificarFirma(codigo: string, ahora = Date.now()): string | null {
  const partes = codigo.split(".");
  if (partes.length !== 3) return null;
  const [dato, vence, firma] = partes;
  const esperada = Buffer.from(firmaDe(`${dato}.${vence}`));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  if (!/^\d+$/.test(vence) || Number(vence) < Math.floor(ahora / 1000)) return null;
  try {
    return Buffer.from(dato, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
