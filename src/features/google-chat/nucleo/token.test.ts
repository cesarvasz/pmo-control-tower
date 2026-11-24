import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { verificarIdTokenGoogle, verificarLlamadaDeChat } from "./token";

const URL_BOT = "https://ejemplo.com/api/google-chat";
const CUENTA = "service-123@gcp-sa-gsuiteaddons.iam.gserviceaccount.com";

let privada: KeyObject;
let ajena: KeyObject;

beforeAll(() => {
  const par = generateKeyPairSync("rsa", { modulusLength: 2048 });
  privada = par.privateKey;
  ajena = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  const jwk = { ...par.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { "cache-control": "max-age=60" } })));
});
afterAll(() => { vi.unstubAllGlobals(); });

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(claims: Record<string, unknown>, llave = privada, kid = "k1") {
  const h = b64({ alg: "RS256", kid, typ: "JWT" });
  const p = b64(claims);
  return `${h}.${p}.${sign("RSA-SHA256", Buffer.from(`${h}.${p}`), llave).toString("base64url")}`;
}
const ahora = () => Math.floor(Date.now() / 1000);
const validos = () => ({ iss: "https://accounts.google.com", aud: URL_BOT, email: CUENTA, email_verified: true, iat: ahora(), exp: ahora() + 300 });

describe("verificarLlamadaDeChat", () => {
  it("acepta el token de la cuenta de servicio para esta URL", async () => {
    expect(await verificarLlamadaDeChat(`Bearer ${token(validos())}`, URL_BOT, CUENTA)).toBe(true);
  });
  it("rechaza sin token, otra audiencia, otra cuenta, correo sin verificar, vencido o firma ajena", async () => {
    expect(await verificarLlamadaDeChat(null, URL_BOT, CUENTA)).toBe(false);
    expect(await verificarLlamadaDeChat(`Bearer ${token({ ...validos(), aud: "https://otro.com" })}`, URL_BOT, CUENTA)).toBe(false);
    expect(await verificarLlamadaDeChat(`Bearer ${token({ ...validos(), email: "otro@gmail.com" })}`, URL_BOT, CUENTA)).toBe(false);
    expect(await verificarLlamadaDeChat(`Bearer ${token({ ...validos(), email_verified: false })}`, URL_BOT, CUENTA)).toBe(false);
    expect(await verificarLlamadaDeChat(`Bearer ${token({ ...validos(), exp: ahora() - 600 })}`, URL_BOT, CUENTA)).toBe(false);
    expect(await verificarLlamadaDeChat(`Bearer ${token(validos(), ajena)}`, URL_BOT, CUENTA)).toBe(false);
    expect(await verificarLlamadaDeChat(`Bearer ${token({ ...validos(), iss: "https://malo.com" })}`, URL_BOT, CUENTA)).toBe(false);
  });
});

describe("verificarIdTokenGoogle", () => {
  it("sin audiencia (token del usuario) solo revisa firma, emisor y vigencia", async () => {
    const c = await verificarIdTokenGoogle(token({ ...validos(), aud: "cliente-oauth", email: "pm@c807.com" }));
    expect(c.email).toBe("pm@c807.com");
  });
  it("llave desconocida → error", async () => {
    await expect(verificarIdTokenGoogle(token(validos(), privada, "otra"))).rejects.toThrow("Llave del token desconocida");
  });
});
