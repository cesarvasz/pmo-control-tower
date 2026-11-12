import { describe, expect, it } from "vitest";
import {
  campoDeClaveEspejo, claveEspejoDeCampo, limpiarOpciones, textoValorCampo, validarDefinicionCampo, validarValorCampo, type CampoDirectorio,
} from "./directorio-campos";

const campo = (tipo: CampoDirectorio["tipo"], opciones: string[] = []): CampoDirectorio => ({ id: "c1", titulo: "País", tipo, opciones, orden: 0 });

describe("Directorio · campos propios", () => {
  it("valida la definición: título, tipo, nombres repetidos o fijos y opciones de una lista", () => {
    const existentes = [{ id: "a", titulo: "Área" }];
    expect(validarDefinicionCampo({ titulo: "  País  ", tipo: "texto" }, existentes)).toEqual({ titulo: "País", tipo: "texto", opciones: [] });
    expect(validarDefinicionCampo({ titulo: "", tipo: "texto" }, existentes)).toEqual({ error: "El campo necesita un título" });
    expect(validarDefinicionCampo({ titulo: "área", tipo: "texto" }, existentes)).toEqual({ error: "Ya hay un campo que se llama «área»" });
    expect(validarDefinicionCampo({ titulo: "Área", tipo: "texto" }, existentes, "a")).toMatchObject({ titulo: "Área" });
    expect(validarDefinicionCampo({ titulo: "Correo", tipo: "texto" }, [])).toEqual({ error: "«Correo» ya es un campo del directorio" });
    expect(validarDefinicionCampo({ titulo: "X", tipo: "otro" }, [])).toEqual({ error: "Tipo de campo no válido" });
    expect(validarDefinicionCampo({ titulo: "País", tipo: "lista", opciones: [] }, [])).toEqual({ error: "Una lista necesita al menos una opción" });
  });

  it("las opciones de una lista quedan sin vacías ni repetidas", () => {
    expect(limpiarOpciones([" GT", "SV", "gt", "", 3, "CR"])).toEqual(["GT", "SV", "CR"]);
    expect(limpiarOpciones("GT")).toEqual([]);
  });

  it("normaliza el valor según el tipo (vacío = se borra)", () => {
    expect(validarValorCampo(campo("texto"), "  Guatemala ")).toBe("Guatemala");
    expect(validarValorCampo(campo("texto"), "  ")).toBeNull();
    expect(validarValorCampo(campo("numero"), "12,5")).toBe(12.5);
    expect(() => validarValorCampo(campo("numero"), "doce")).toThrow("espera un número");
    expect(validarValorCampo(campo("fecha"), "2026-11-12")).toBe("2026-11-12");
    expect(() => validarValorCampo(campo("fecha"), "12/11/2026")).toThrow("espera una fecha");
    expect(validarValorCampo(campo("lista", ["GT", "SV"]), "sv")).toBe("SV");
    expect(() => validarValorCampo(campo("lista", ["GT", "SV"]), "MX")).toThrow("no es una opción");
  });

  it("muestra la fecha como día/mes/año y lo demás tal cual", () => {
    expect(textoValorCampo({ tipo: "fecha" }, "2026-11-12")).toBe("12/11/2026");
    expect(textoValorCampo({ tipo: "numero" }, 40)).toBe("40");
    expect(textoValorCampo({ tipo: "texto" }, null)).toBe("");
  });

  it("en un Espejo, el campo propio se guarda como «campo:<id>»", () => {
    expect(claveEspejoDeCampo("abc")).toBe("campo:abc");
    expect(campoDeClaveEspejo("campo:abc")).toBe("abc");
    expect(campoDeClaveEspejo("tld")).toBeNull();
  });
});
