// SOLO SERVIDOR. Bot de Google Chat · Drive: copiar a la bitácora los archivos de Google Drive que le mandan al bot.
// Cada persona autoriza UNA vez (OAuth por correo, drive.readonly) con el botón «Conectar mi Drive» del chat:
//   enlace firmado (1 día, con su correo) → /api/google-chat/drive/conectar → Google → /api/google-chat/drive/callback
// El callback solo guarda la autorización si la cuenta con la que entró a Google es la MISMA del enlace. El refresh token
// va cifrado en el Vault (google_drive_guardar / google_drive_leer_token, migración 20261124150000).
// Usa el mismo cliente OAuth de Google que Calendar (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_STATE_SECRET).

import { configGoogle, crearState, leerIdToken, verificarState, type ConfigGoogle } from "@/lib/googleOauth";
import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import { firmar, verificarFirma } from "./firma";
import { ArchivoMuyGrande } from "./chat-api";
import {
  comoBajar, PREFIJO_DRIVE, RUTA_CALLBACK, RUTA_CONECTAR, SCOPE_DRIVE, urlAutorizacionDrive, VIDA_ENLACE_SEG,
} from "./drive-formato";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

/** ¿Se puede ofrecer «Conectar mi Drive»? (cliente OAuth configurado) */
export const driveDisponible = () => configGoogle() !== null;

/** El enlace «Conectar mi Drive» para este correo (lo abre la persona desde el chat). */
export function enlaceConectarDrive(origen: string, email: string): string {
  return `${origen}${RUTA_CONECTAR}?c=${encodeURIComponent(firmar(`${PREFIJO_DRIVE}${email.toLowerCase()}`, VIDA_ENLACE_SEG))}`;
}

/** ¿Este correo ya autorizó su Drive (y sigue vigente)? */
export async function driveConectado(email: string): Promise<boolean> {
  const r = unwrap(await getSupabaseAdmin().from("google_drive_conexiones").select("estado").eq("email", email.toLowerCase()).maybeSingle());
  return r?.estado === "activa";
}

// ── El paso por Google ────────────────────────────────────────────────────────────────────────

export type InicioDrive = { tipo: "redirigir"; url: string; nonce: string } | { tipo: "error"; motivo: string };

/** Del enlace del chat a Google: verifica el código y arma la URL de autorización (con el state atado a una cookie). */
export function iniciarConexionDrive(codigo: string | null, origen: string): InicioDrive {
  const cfg = configGoogle();
  if (!cfg) return { tipo: "error", motivo: "La conexión con Google todavía no está configurada. Avísale al PMO." };
  const dato = codigo ? verificarFirma(codigo) : null;
  if (!dato?.startsWith(PREFIJO_DRIVE)) return { tipo: "error", motivo: "El enlace venció o no es válido. Vuelve a mandarle el archivo al bot para recibir uno nuevo." };
  const email = dato.slice(PREFIJO_DRIVE.length);
  const { state, nonce } = crearState(`${PREFIJO_DRIVE}${email}`, cfg.stateSecret);
  return { tipo: "redirigir", url: urlAutorizacionDrive({ clientId: cfg.clientId, origen, state, email }), nonce };
}

async function cambiarCodigo(cfg: ConfigGoogle, origen: string, code: string) {
  const r = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: `${origen}${RUTA_CALLBACK}`, grant_type: "authorization_code" }),
  });
  const j = (await r.json().catch(() => null)) as { refresh_token?: string; scope?: string; id_token?: string } | null;
  const quien = leerIdToken(j?.id_token);
  if (!r.ok || !j || !quien) throw new Error("google-oauth-fallido");
  return { refreshToken: j.refresh_token ?? null, scopes: (j.scope ?? "").split(" ").filter(Boolean), ...quien };
}

/** La vuelta de Google: guarda la autorización. Devuelve el texto para la persona (ok = se conectó). */
export async function terminarConexionDrive(p: { state: string | null; code: string | null; error: string | null; nonce: string | null; origen: string }): Promise<{ ok: boolean; texto: string }> {
  const cfg = configGoogle();
  if (!cfg) return { ok: false, texto: "La conexión con Google todavía no está configurada. Avísale al PMO." };
  if (p.error) return { ok: false, texto: "No se conectó tu Drive (cancelaste en Google). Si quieres, vuelve a intentarlo desde el chat." };
  const st = verificarState(p.state, p.nonce, cfg.stateSecret);
  if (!st || !p.code || !st.usuarioId.startsWith(PREFIJO_DRIVE)) return { ok: false, texto: "El enlace venció. Vuelve a mandarle el archivo al bot para recibir uno nuevo." };
  const email = st.usuarioId.slice(PREFIJO_DRIVE.length);
  const t = await cambiarCodigo(cfg, p.origen, p.code);
  if (t.email !== email) return { ok: false, texto: `Entraste a Google con ${t.email}, pero el enlace es para ${email}. Vuelve a intentarlo con tu cuenta de la empresa.` };
  if (!t.scopes.includes(SCOPE_DRIVE)) return { ok: false, texto: "Falta el permiso para ver tus archivos de Drive (se desmarcó en Google). Vuelve a intentarlo y déjalo marcado." };
  if (!t.refreshToken) return { ok: false, texto: "Google no entregó el permiso permanente. Vuelve a intentarlo." };
  unwrap(await getSupabaseAdmin().rpc("google_drive_guardar", { p_email: email, p_google_sub: t.sub, p_scopes: t.scopes, p_refresh_token: t.refreshToken }));
  return { ok: true, texto: "✅ Listo: tu Drive quedó conectado. Vuelve a Google Chat y mándale otra vez el archivo al bot." };
}

// ── Leer archivos ─────────────────────────────────────────────────────────────────────────────

/** No tiene la autorización (o Google la revocó). */
export class DriveSinConectar extends Error {}
/** El archivo no se puede copiar (sin acceso, borrado, o un tipo de Google que no se exporta). */
export class DriveNoCopiable extends Error {}

const cacheAcceso = new Map<string, { token: string; vence: number }>();

async function tokenDeAcceso(email: string): Promise<string> {
  const c = cacheAcceso.get(email);
  if (c && c.vence > Date.now() + 60_000) return c.token;
  const cfg = configGoogle();
  const refresh = unwrap(await getSupabaseAdmin().rpc("google_drive_leer_token", { p_email: email }));
  if (!cfg || !refresh) throw new DriveSinConectar();
  const r = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !j.access_token) {
    if (j.error === "invalid_grant") {
      // La persona quitó el permiso en su cuenta de Google: hay que volver a conectar.
      await getSupabaseAdmin().from("google_drive_conexiones").update({ estado: "reconectar", ultimo_error: "invalid_grant", actualizado_at: new Date().toISOString() }).eq("email", email);
      throw new DriveSinConectar();
    }
    throw new Error(`Google no dio token de Drive: ${j.error ?? r.status}`);
  }
  cacheAcceso.set(email, { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

/** Baja un archivo de Drive con el permiso de esa persona (los de Google se exportan: Docs → PDF, Sheets → Excel…). */
export async function descargarDeDrive(email: string, driveId: string, maximo: number): Promise<{ nombre: string; tipoMime: string; datos: Uint8Array }> {
  const auth = { Authorization: `Bearer ${await tokenDeAcceso(email)}` };
  const id = encodeURIComponent(driveId);
  const meta = await fetch(`${DRIVE}/${id}?fields=name,mimeType,size&supportsAllDrives=true`, { headers: auth });
  if (meta.status === 401) throw new DriveSinConectar();
  if (!meta.ok) throw new DriveNoCopiable(meta.status === 404 || meta.status === 403 ? "no tienes acceso a ese archivo en Drive" : `Drive respondió ${meta.status}`);
  const m = (await meta.json()) as { name?: string; mimeType?: string; size?: string };
  if (Number(m.size ?? 0) > maximo) throw new ArchivoMuyGrande();
  const como = comoBajar(m.mimeType ?? "", m.name ?? "archivo");
  if (como.modo === "no-se-puede") throw new DriveNoCopiable("ese tipo de archivo de Google no se puede copiar");
  const r = como.modo === "exportar"
    ? await fetch(`${DRIVE}/${id}/export?mimeType=${encodeURIComponent(como.mime)}`, { headers: auth })
    : await fetch(`${DRIVE}/${id}?alt=media&supportsAllDrives=true`, { headers: auth });
  // Google no exporta archivos de más de 10 MB (exportSizeLimitExceeded, 403).
  if (!r.ok) throw new DriveNoCopiable(como.modo === "exportar" && r.status === 403 ? "es muy grande para convertirlo (Google exporta hasta 10 MB)" : `Drive respondió ${r.status}`);
  const datos = new Uint8Array(await r.arrayBuffer());
  if (datos.byteLength > maximo) throw new ArchivoMuyGrande();
  return como.modo === "exportar"
    ? { nombre: como.nombre, tipoMime: como.mime, datos }
    : { nombre: m.name ?? "archivo", tipoMime: m.mimeType ?? "application/octet-stream", datos };
}
