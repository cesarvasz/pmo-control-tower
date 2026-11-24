import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { espacioDe, estadoLlave, jwtDeCuentaDeServicio, leerLlave } from "./chat-api";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const llave = { client_email: "bot@proyecto.iam.gserviceaccount.com", private_key: pem };

describe("Chat API como la app", () => {
  it("lee la llave en JSON o en base64; lo demás es null", () => {
    const json = JSON.stringify({ ...llave, type: "service_account" });
    expect(leerLlave(json)).toEqual(llave);
    expect(leerLlave(Buffer.from(json).toString("base64"))).toEqual(llave);
    expect(leerLlave("")).toBeNull();
    expect(leerLlave("{}")).toBeNull();
    expect(leerLlave("no es json")).toBeNull();
  });
  it("tolera errores comunes al pegarla en Vercel: comillas, string JSON, «\\n» literal", () => {
    const json = JSON.stringify({ ...llave, type: "service_account" });
    expect(leerLlave(`'${json}'`)).toEqual(llave);
    expect(leerLlave(JSON.stringify(json))).toEqual(llave);
    const escapado = JSON.stringify({ ...llave, private_key: pem.replace(/\n/g, "\\n") });
    expect(leerLlave(escapado)).toEqual(llave);
    expect(estadoLlave("")).toBe("falta");
    expect(estadoLlave("{roto")).toBe("invalida");
    expect(estadoLlave(json)).toBe("ok");
  });
  it("el JWT va firmado con la llave, con el scope chat.bot y para el endpoint de tokens", () => {
    const [c, cuerpo, firma] = jwtDeCuentaDeServicio(llave, 1000).split(".");
    expect(createVerify("RSA-SHA256").update(`${c}.${cuerpo}`).verify(publicKey, Buffer.from(firma, "base64url"))).toBe(true);
    expect(JSON.parse(Buffer.from(cuerpo, "base64url").toString())).toEqual({
      iss: llave.client_email, scope: "https://www.googleapis.com/auth/chat.bot", aud: "https://oauth2.googleapis.com/token", iat: 1000, exp: 4600,
    });
  });
  it("el espacio de un mensaje", () => {
    expect(espacioDe("spaces/AAA/messages/BBB.CCC")).toBe("spaces/AAA");
  });
});
