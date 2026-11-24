import { describe, expect, it } from "vitest";
import { datoFoto, leerDatoFoto, rutaFoto } from "./codigo";

describe("códigos de la foto", () => {
  it("ida y vuelta", () => {
    expect(leerDatoFoto(datoFoto("18428984446", 1795469806549))).toEqual({ boardId: "18428984446", emitido: 1795469806549 });
    expect(rutaFoto("18428984446", 1795469806549)).toBe("status-card/18428984446/1795469806549.png");
  });
  it("rechaza lo que no es una foto (p. ej. el código de la hoja) o trae algo raro", () => {
    expect(leerDatoFoto(null)).toBeNull();
    expect(leerDatoFoto("status-card:18428984446")).toBeNull();
    expect(leerDatoFoto("foto:../otro:123")).toBeNull();
    expect(leerDatoFoto("foto:184:abc")).toBeNull();
  });
});
