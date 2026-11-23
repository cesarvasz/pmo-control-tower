import { describe, expect, it } from "vitest";
import { validarCampoPersona, validarPersonaNueva } from "./personas";

describe("validarCampoPersona", () => {
  it("nombre: obligatorio, sin espacios de más", () => {
    expect(validarCampoPersona("nombre", "  Ana   López ")).toBe("Ana López");
    expect(() => validarCampoPersona("nombre", "  ")).toThrow(/vacío/);
    expect(() => validarCampoPersona("nombre", "x".repeat(121))).toThrow(/120/);
  });
  it("correo: en minúsculas, vacío = null, mal formado = error", () => {
    expect(validarCampoPersona("email", " Ana@C807.com ")).toBe("ana@c807.com");
    expect(validarCampoPersona("email", "")).toBeNull();
    expect(() => validarCampoPersona("email", "ana@")).toThrow(/Correo/);
    expect(() => validarCampoPersona("email", "sin-arroba")).toThrow(/Correo/);
  });
  it("horas al mes: número de 0 a 744 (acepta coma), vacío = null", () => {
    expect(validarCampoPersona("hrsMes", "160,5")).toBe(160.5);
    expect(validarCampoPersona("hrsMes", 0)).toBe(0);
    expect(validarCampoPersona("hrsMes", "")).toBeNull();
    expect(() => validarCampoPersona("hrsMes", -1)).toThrow(/744/);
    expect(() => validarCampoPersona("hrsMes", "mucho")).toThrow(/744/);
  });
  it("activo: solo verdadero o falso", () => {
    expect(validarCampoPersona("activo", false)).toBe(false);
    expect(() => validarCampoPersona("activo", "si")).toThrow();
  });
  it("grupo, rol y TLD: texto opcional", () => {
    expect(validarCampoPersona("rol", "CKU")).toBe("CKU");
    expect(validarCampoPersona("grupo", null)).toBeNull();
    expect(() => validarCampoPersona("tld", 5)).toThrow();
  });
});

describe("validarPersonaNueva", () => {
  it("activa por defecto y con lo opcional vacío", () => {
    expect(validarPersonaNueva({ nombre: "Ana" }, [])).toEqual({ nombre: "Ana", email: null, grupo: null, rol: null, tld: null, hrsMes: null, activo: true });
  });
  it("no deja repetir un correo", () => {
    expect(() => validarPersonaNueva({ nombre: "Ana", email: "ANA@c807.com" }, ["ana@c807.com", null])).toThrow(/correo/);
  });
});
