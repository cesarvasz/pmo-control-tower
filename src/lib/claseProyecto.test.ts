import { describe, it, expect } from "vitest";
import { claseDeCodigo, PROYECTO_SIN_ID, PAISES_TODOS } from "./claseProyecto";

describe("claseDeCodigo", () => {
  it("acepta PM-003 y PM 003", () => {
    expect(claseDeCodigo("PM-003")).toEqual({ clase: "A", paises: ["GT"] });
    expect(claseDeCodigo("PM 003")?.clase).toBe("A");
  });
  it("PM-005 aplica a todos los países", () => {
    expect(claseDeCodigo("PM-005")?.paises).toEqual(PAISES_TODOS);
  });
  it("Clase B con sus países", () => {
    expect(claseDeCodigo("PM-004")).toEqual({ clase: "B", paises: ["HN", "NI", "CR", "PA"] });
    expect(claseDeCodigo("PM-009")?.paises).toHaveLength(5);
  });
  it("PM-010/014 no están clasificados", () => {
    for (const c of ["PM-010", "PM-014", ""]) expect(claseDeCodigo(c)).toBeUndefined();
  });
  it("PM-006 es Clase A", () => {
    expect(claseDeCodigo("PM-006")?.clase).toBe("A");
  });
  it("el proyecto sin ID es Clase A, todos los países", () => {
    expect(PROYECTO_SIN_ID.info.clase).toBe("A");
    expect(PROYECTO_SIN_ID.info.paises).toEqual(PAISES_TODOS);
  });
});
