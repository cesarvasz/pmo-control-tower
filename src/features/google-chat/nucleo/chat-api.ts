// SOLO SERVIDOR. Bot de Google Chat · núcleo: llamar a la Chat API COMO LA APP (cuenta de servicio, scope chat.bot; no
// requiere aprobación del administrador). Sirve para lo que la respuesta a un evento no puede hacer: descargar los archivos
// que le mandan al bot y escribir un mensaje después (cuando termina un trabajo lento).
// La llave JSON de la cuenta de servicio va en GOOGLE_CHAT_LLAVE (el JSON tal cual, o en base64). Sin ella: apagado.

import { createSign } from "node:crypto";
import type { MensajeChat } from "./eventos";

const API = "https://chat.googleapis.com/v1";
const SCOPE = "https://www.googleapis.com/auth/chat.bot";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface Llave { client_email: string; private_key: string }

/** Un intento de leer la llave de un texto: JSON (aunque venga como string JSON dentro de otro) con client_email y private_key. */
function llaveDeJson(texto: string): Llave | null {
  try {
    let j: unknown = JSON.parse(texto);
    if (typeof j === "string") j = JSON.parse(j); // pegada como string JSON ("{\"type\":…}")
    const l = j as Partial<Llave> | null;
    if (!l?.client_email || !l.private_key) return null;
    // Si los saltos de línea de la llave quedaron como «\n» literal, se arreglan.
    return { client_email: l.client_email, private_key: l.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

/** La llave de GOOGLE_CHAT_LLAVE, o null si falta o no se entiende. Acepta el JSON tal cual, en base64, o envuelto en
 *  comillas (errores comunes al pegarla en Vercel). */
export function leerLlave(texto = process.env.GOOGLE_CHAT_LLAVE): Llave | null {
  let crudo = texto?.trim() ?? "";
  if (crudo.length > 1 && (crudo[0] === "'" || crudo[0] === "`") && crudo.at(-1) === crudo[0]) crudo = crudo.slice(1, -1).trim();
  if (!crudo) return null;
  return llaveDeJson(crudo) ?? llaveDeJson(Buffer.from(crudo, "base64").toString("utf8"));
}

/** Cómo está la cuenta de servicio: ok, falta la variable, o está pero no se entiende. */
export function estadoLlave(texto = process.env.GOOGLE_CHAT_LLAVE): "ok" | "falta" | "invalida" {
  if (!texto?.trim()) return "falta";
  return leerLlave(texto) ? "ok" : "invalida";
}

/** ¿Está configurada la cuenta de servicio? */
export const chatApiDisponible = () => leerLlave() !== null;

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** El JWT firmado que se cambia por un token de acceso (flujo de cuenta de servicio de Google). */
export function jwtDeCuentaDeServicio(llave: Llave, ahoraSeg = Math.floor(Date.now() / 1000)): string {
  const cabecera = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = b64url(JSON.stringify({ iss: llave.client_email, scope: SCOPE, aud: TOKEN_URL, iat: ahoraSeg, exp: ahoraSeg + 3600 }));
  const firma = createSign("RSA-SHA256").update(`${cabecera}.${cuerpo}`).sign(llave.private_key);
  return `${cabecera}.${cuerpo}.${b64url(firma)}`;
}

let cache: { token: string; vence: number } | null = null;

async function token(): Promise<string> {
  if (cache && cache.vence > Date.now() + 60_000) return cache.token;
  const llave = leerLlave();
  if (!llave) throw new Error("Falta GOOGLE_CHAT_LLAVE (llave de la cuenta de servicio del bot)");
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwtDeCuentaDeServicio(llave) }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google no dio token a la cuenta de servicio: ${j.error_description ?? r.status}`);
  cache = { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

async function llamar(ruta: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(`${API}/${ruta}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await token()}` } });
  if (!r.ok) throw new Error(`Chat API ${init.method ?? "GET"} ${ruta.split("?")[0]} → ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return r;
}

/** Un mensaje (con sus archivos y quién lo mandó). `nombre` = spaces/…/messages/… */
export async function leerMensaje(nombre: string): Promise<MensajeChat> {
  return (await (await llamar(encodeURI(nombre))).json()) as MensajeChat;
}

/** Descarga un archivo subido a Chat (attachmentDataRef.resourceName). Corta si pasa de `maximo` bytes. */
export async function descargarAdjunto(recursoDatos: string, maximo: number): Promise<Uint8Array> {
  const r = await llamar(`media/${encodeURI(recursoDatos)}?alt=media`);
  const largo = Number(r.headers.get("content-length") ?? 0);
  if (largo > maximo) throw new ArchivoMuyGrande();
  const datos = new Uint8Array(await r.arrayBuffer());
  if (datos.byteLength > maximo) throw new ArchivoMuyGrande();
  return datos;
}

export class ArchivoMuyGrande extends Error {}

/** Escribe un mensaje de texto en un espacio (spaces/…), p. ej. el DM con quien le escribió al bot. */
export async function enviarMensaje(espacio: string, texto: string): Promise<void> {
  await llamar(`${encodeURI(espacio)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: texto }),
  });
}

/** El espacio de un mensaje: «spaces/AAA/messages/BBB» → «spaces/AAA». */
export const espacioDe = (mensaje: string) => mensaje.split("/").slice(0, 2).join("/");
