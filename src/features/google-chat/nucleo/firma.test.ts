import { beforeAll, describe, expect, it } from "vitest";
import { firmar, verificarFirma } from "./firma";

beforeAll(() => { process.env.SUPABASE_SECRET_KEY ??= "llave-de-prueba"; });

describe("firma", () => {
  it("devuelve el dato mientras no venza", () => {
    const t0 = Date.UTC(2026, 10, 23, 12);
    const c = firmar("sc:12345", 120, t0);
    expect(verificarFirma(c, t0 + 60_000)).toBe("sc:12345");
    expect(verificarFirma(c, t0 + 121_000)).toBeNull();
  });
  it("rechaza códigos alterados o mal formados", () => {
    const c = firmar("sc:12345", 120);
    const [dato, vence, firma] = c.split(".");
    expect(verificarFirma(`${Buffer.from("sc:99999").toString("base64url")}.${vence}.${firma}`)).toBeNull();
    expect(verificarFirma(`${dato}.${Number(vence) + 1000}.${firma}`)).toBeNull();
    expect(verificarFirma(`${dato}.${vence}.${firma.slice(0, -2)}xx`)).toBeNull();
    expect(verificarFirma("basura")).toBeNull();
    expect(verificarFirma("")).toBeNull();
  });
});
