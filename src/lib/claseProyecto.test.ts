import { describe, it, expect } from "vitest";
import { claseDeBoard, claseDeCodigo, claseDePml, claseDeProyecto, codigoDeBoard, esClaseAsignable, fuenteDeClase, leerClases, PROYECTO_SIN_ID, PAISES_TODOS } from "./claseProyecto";

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

const ent = (clase: "A" | "B" | "C") => ({ clase, by: "admin@c807.com", at: "2026-11-02T10:00:00.000Z" });

describe("clase asignada a mano", () => {
  it("solo A, B y C se pueden asignar", () => {
    for (const c of ["A", "B", "C"]) expect(esClaseAsignable(c)).toBe(true);
    for (const c of ["D", "a", "", "Sin clasificar", null, undefined, 1]) expect(esClaseAsignable(c)).toBe(false);
  });

  it("proyecto: la asignada gana; si no, la de la tabla por su código; si no, «Sin clasificar»", () => {
    expect(claseDeProyecto("PM-003", "b1", {})).toBe("A");                       // tabla
    expect(claseDeProyecto("PM-003", "b1", { b1: ent("C") })).toBe("C");         // asignada
    expect(claseDeProyecto("PM-004", "b2", { b1: ent("C") })).toBe("B");         // la de otro no cuenta
    expect(claseDeProyecto("PM-010", "b3", {})).toBe("Sin clasificar");          // fuera de la tabla
    expect(claseDeProyecto("PM-010", "b3", { b3: ent("B") })).toBe("B");
  });

  it("PML: la asignada gana; si no, Clase C", () => {
    expect(claseDePml("PML-1", {})).toBe("C");
    expect(claseDePml("PML-1", { "PML-1": ent("A") })).toBe("A");
    expect(claseDePml("PML-2", { "PML-1": ent("A") })).toBe("C");
  });

  it("codigoDeBoard saca el ID del nombre del board, con o sin «|», y es vacío si no hay", () => {
    expect(codigoDeBoard("PM-003 | DUCAfast 2.0 GT")).toBe("PM-003");
    expect(codigoDeBoard("PM-017 Impala 2.0☄️")).toBe("PM-017");
    expect(codigoDeBoard("Sin barra")).toBe("");
    expect(codigoDeBoard("PM-017")).toBe("");        // solo el ID, sin nombre: no lo separa
    expect(codigoDeBoard(undefined)).toBe("");
  });

  it("claseDeBoard usa el nombre del board (o la asignada por su id)", () => {
    expect(claseDeBoard({ id: "b1", name: "PM-003 | DUCAfast" }, {})).toBe("A");
    expect(claseDeBoard({ id: "b1", name: "PM-003 | DUCAfast" }, { b1: ent("C") })).toBe("C");
    expect(claseDeBoard({ id: "b2", name: "PM-017 Impala 2.0" }, {})).toBe("Sin clasificar");
    expect(claseDeBoard({ id: "b2", name: undefined }, {})).toBe("Sin clasificar");
  });

  it("fuenteDeClase: A, B y C cuentan en su fuente; «Sin clasificar» en ninguna", () => {
    expect(fuenteDeClase("A")).toBe("A");
    expect(fuenteDeClase("B")).toBe("B");
    expect(fuenteDeClase("C")).toBe("C");
    expect(fuenteDeClase("Sin clasificar")).toBeNull();
  });

  it("leerClases deja solo las entradas con una clase válida", () => {
    expect(leerClases({ b1: ent("A"), b2: { clase: "Z", by: "x", at: "y" }, b3: null, b4: "A", b5: { by: "x" } })).toEqual({ b1: ent("A") });
    expect(leerClases(undefined)).toEqual({});
    expect(leerClases("basura")).toEqual({});
  });
});
