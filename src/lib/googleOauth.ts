// src/lib/googleOauth.ts
// SOLO SERVIDOR. OAuth 2.0 de Google por usuario (código de autorización, acceso offline) para agendar reuniones en SU calendario.
// El «state» va firmado (HMAC) y atado a una cookie httpOnly: sin eso, alguien podría hacer que otra persona termine de conectar
// su Google a la cuenta de la app de un tercero.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SCOPES_GOOGLE = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
] as const;
/** Sin estos dos permisos no se puede agendar ni consultar disponibilidad: el usuario pudo desmarcarlos en la pantalla de Google. */
export const SCOPES_OBLIGATORIOS = SCOPES_GOOGLE.filter((s) => s.includes("/calendar."));

export const COOKIE_STATE = "g_oauth_n";
export const VIGENCIA_STATE_MS = 10 * 60 * 1000;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export interface ConfigGoogle { clientId: string; clientSecret: string; stateSecret: string }

/** null = falta configuración (no se puede conectar). */
export function configGoogle(env: Record<string, string | undefined> = process.env): ConfigGoogle | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim(), clientSecret = env.GOOGLE_CLIENT_SECRET?.trim(), stateSecret = env.GOOGLE_STATE_SECRET?.trim();
  return clientId && clientSecret && stateSecret && stateSecret.length >= 32 ? { clientId, clientSecret, stateSecret } : null;
}

export const redirectUri = (origen: string) => `${origen}/api/google/callback`;

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const firmar = (cuerpo: string, secreto: string) => createHmac("sha256", secreto).update(cuerpo).digest("base64url");

/** Crea el state (y el nonce que va también en la cookie). */
export function crearState(usuarioId: string, secreto: string, ahora = Date.now()): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  const cuerpo = b64(JSON.stringify({ u: usuarioId, n: nonce, exp: ahora + VIGENCIA_STATE_MS }));
  return { state: `${cuerpo}.${firmar(cuerpo, secreto)}`, nonce };
}

/** El usuario del state si la firma es válida, no venció y su nonce es el de la cookie; si no, null. */
export function verificarState(state: string | null, nonceCookie: string | null, secreto: string, ahora = Date.now()): { usuarioId: string } | null {
  if (!state || !nonceCookie) return null;
  const [cuerpo, firma, ...resto] = state.split(".");
  if (!cuerpo || !firma || resto.length) return null;
  const esperada = Buffer.from(firmar(cuerpo, secreto)), recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as { u?: unknown; n?: unknown; exp?: unknown };
    if (typeof d.u !== "string" || typeof d.n !== "string" || typeof d.exp !== "number" || d.exp < ahora) return null;
    const a = Buffer.from(d.n), c = Buffer.from(nonceCookie);
    return a.length === c.length && timingSafeEqual(a, c) ? { usuarioId: d.u } : null;
  } catch { return null; }
}

/** La URL a la que se manda al usuario. «consent» + «offline» para que Google SIEMPRE entregue refresh token. */
export function urlAutorizacion(cfg: ConfigGoogle, origen: string, state: string, emailSugerido?: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: redirectUri(origen), response_type: "code", scope: SCOPES_GOOGLE.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  if (emailSugerido) q.set("login_hint", emailSugerido);
  return `${AUTH_URL}?${q}`;
}

export interface TokensGoogle { refreshToken: string | null; scopes: string[]; email: string; sub: string }

/** Decodifica el id_token (viene directo de Google por TLS en el intercambio de código: no hace falta validar firma). */
export function leerIdToken(idToken: string | undefined): { email: string; sub: string } | null {
  try {
    const p = JSON.parse(Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: unknown; sub?: unknown };
    return typeof p.email === "string" && typeof p.sub === "string" ? { email: p.email.toLowerCase(), sub: p.sub } : null;
  } catch { return null; }
}

/** Cambia el código por tokens. Lanza «google-oauth-fallido» (sin detalle del token) si Google lo rechaza. */
export async function intercambiarCodigo(cfg: ConfigGoogle, origen: string, code: string): Promise<TokensGoogle> {
  const r = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri(origen), grant_type: "authorization_code" }),
  });
  const j = (await r.json().catch(() => null)) as { refresh_token?: string; scope?: string; id_token?: string } | null;
  const quien = leerIdToken(j?.id_token);
  if (!r.ok || !j || !quien) throw new Error("google-oauth-fallido");
  return { refreshToken: j.refresh_token ?? null, scopes: (j.scope ?? "").split(" ").filter(Boolean), ...quien };
}

/** Revoca el refresh token en Google (mejor esfuerzo: si falla, igual se desconecta localmente). */
export async function revocarToken(token: string): Promise<boolean> {
  try {
    const r = await fetch(REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
    return r.ok;
  } catch { return false; }
}
