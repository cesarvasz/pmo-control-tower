import { randomInt } from "node:crypto";
import { describe, expect, it } from "vitest";
import { errorDePassword, generarPasswordTemporal } from "@/lib/password";

describe("errorDePassword", () => {
  it("acepta letras + números de 8 o más", () => {
    expect(errorDePassword("abcd1234")).toBeNull();
    expect(errorDePassword("Kp7w-Rt2m-Hx9q")).toBeNull();
  });
  it("rechaza corta, sin números, sin letras, o que no es texto", () => {
    expect(errorDePassword("ab12")).toMatch(/al menos 8/);
    expect(errorDePassword("abcdefgh")).toMatch(/letras y números/);
    expect(errorDePassword("12345678")).toMatch(/letras y números/);
    expect(errorDePassword(undefined)).toMatch(/Escribe/);
  });
  it("rechaza más de 72 bytes", () => {
    expect(errorDePassword("a1".repeat(37))).toMatch(/72/);
  });
});

describe("generarPasswordTemporal", () => {
  it("12 caracteres en grupos de 4, válida según las reglas", () => {
    for (let i = 0; i < 200; i++) {
      const p = generarPasswordTemporal(randomInt);
      expect(p).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
      expect(errorDePassword(p)).toBeNull();
    }
  });
  it("sin caracteres ambiguos", () => {
    const p = Array.from({ length: 50 }, () => generarPasswordTemporal(randomInt)).join("");
    expect(p).not.toMatch(/[01OlI]/);
  });
  it("si el azar no trae números, mete uno", () => {
    expect(generarPasswordTemporal(() => 0)).toMatch(/[2-9]/);
  });
});
