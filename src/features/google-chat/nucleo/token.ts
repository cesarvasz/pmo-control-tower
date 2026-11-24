// SOLO SERVIDOR. Verifica que una llamada al bot venga de Google Chat: el encabezado Authorization trae un ID token de
// Google (OIDC, RS256) cuyo `aud` es la URL del endpoint y cuyo `email` es la cuenta de servicio del add-on
// (service-NUMERO@gcp-sa-gsuiteaddons.iam.gserviceaccount.com, se ve en la consola: Chat API → Configuración).
// Sin dependencias: llaves públicas de Google (JWKS) + node:crypto.

import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const EMISORES = new Set(["https://accounts.google.com", "accounts.google.com"]);
/** Tolerancia de reloj (s). */
const HOLGURA = 60;

interface Jwk extends JsonWebKey { kid?: string }
let cache: { llaves: Jwk[]; vence: number } | null = null;

async function llaves(forzar = false): Promise<Jwk[]> {
  if (!forzar && cache && cache.vence > Date.now()) return cache.llaves;
  const r = await fetch(JWKS_URL, { cache: "no-store" });
  if (!r.ok) throw new Error(`No se pudieron leer las llaves de Google (${r.status})`);
  const { keys } = (await r.json()) as { keys: Jwk[] };
  // Google publica cuánto se pueden guardar (Cache-Control max-age); si no, 1 h.
  const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  cache = { llaves: keys, vence: Date.now() + maxAge * 1000 };
  return keys;
}

const b64 = (s: string) => Buffer.from(s, "base64url");

export interface ClaimsGoogle { iss?: string; aud?: string; email?: string; email_verified?: boolean; exp?: number; iat?: number; sub?: string }

/** Verifica firma, emisor y vigencia de un ID token de Google. Con `audiencia`, también el `aud`. Lanza si no es válido. */
export async function verificarIdTokenGoogle(token: string, audiencia?: string): Promise<ClaimsGoogle> {
  const partes = token.split(".");
  if (partes.length !== 3) throw new Error("Token mal formado");
  const [h, p, firma] = partes;
  const cabecera = JSON.parse(b64(h).toString("utf8")) as { alg?: string; kid?: string };
  if (cabecera.alg !== "RS256" || !cabecera.kid) throw new Error("Algoritmo de token no admitido");
  let jwk = (await llaves()).find((k) => k.kid === cabecera.kid);
  if (!jwk) jwk = (await llaves(true)).find((k) => k.kid === cabecera.kid); // Google rotó las llaves
  if (!jwk) throw new Error("Llave del token desconocida");
  const ok = verify("RSA-SHA256", Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: "jwk" }), b64(firma));
  if (!ok) throw new Error("Firma inválida");
  const claims = JSON.parse(b64(p).toString("utf8")) as ClaimsGoogle;
  const ahora = Math.floor(Date.now() / 1000);
  if (!claims.iss || !EMISORES.has(claims.iss)) throw new Error("Emisor inválido");
  if (typeof claims.exp !== "number" || claims.exp + HOLGURA < ahora) throw new Error("Token vencido");
  if (typeof claims.iat === "number" && claims.iat - HOLGURA > ahora) throw new Error("Token del futuro");
  if (audiencia !== undefined && claims.aud !== audiencia) throw new Error("Audiencia inválida");
  return claims;
}

/** ¿La llamada viene de Google Chat (la cuenta de servicio de ESTE add-on, para ESTA URL)? */
export async function verificarLlamadaDeChat(authorization: string | null, url: string, cuentaServicio: string): Promise<boolean> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;
  try {
    const c = await verificarIdTokenGoogle(token, url);
    return c.email_verified === true && c.email?.toLowerCase() === cuentaServicio.toLowerCase();
  } catch {
    return false;
  }
}
