import { describe, it, expect } from "vitest";
import type { DashboardData } from "@/types";
import { filasClasificacion } from "./clasificacion";

const ent = (clase: "A" | "B" | "C") => ({ clase, by: "admin@c807.com", at: "2026-11-02T10:00:00.000Z" });

const data = (clases: DashboardData["clases"] = {}) => ({
  clases,
  projBoards: [
    { id: "b1", name: "PM-016 | Segundo", pm: "Luis", cku: "Victoria", sponsor: "Ana Sponsor" },
    { id: "b2", name: "PM-004 | Primero", pm: "David" },
    { id: "b3", name: "Sin barra", pm: "Ana", cku: "Javier", sponsor: "Otro" },
    { id: "b4", name: "PM-017 Impala 2.0", pm: "Ana" },
  ],
  req: [
    { id: "PML-10", name: "Diez", pm: "Luis", cku: "Javier", estrategia: "Estrategia Uno" },
    { id: "PML-2", name: "Dos", pm: "David", cku: "", estrategia: "Estrategia sin sponsor" },
    { id: "PML-3", name: "Tres", pm: "", cku: "Victoria", estrategia: "" },
  ],
  estrategiaMap: new Map([
    ["estrategia uno", { uNeg: "UN", pais: "GT", sponsor: "Carlos Sponsor" }],
    ["estrategia sin sponsor", { uNeg: "UN", pais: "GT", sponsor: "" }],
  ]),
}) as unknown as DashboardData;

describe("filasClasificacion", () => {
  const filas = filasClasificacion(data());

  it("lista todos los proyectos y todos los PML, sin descartar ninguno", () => {
    expect(filas).toHaveLength(7);
    expect(filas.filter((f) => f.tipo === "proyecto")).toHaveLength(4);
    expect(filas.filter((f) => f.tipo === "pml")).toHaveLength(3);
  });

  it("primero los proyectos por su ID y luego los PML en orden natural (PML-2 antes que PML-10)", () => {
    expect(filas.map((f) => f.codigo)).toEqual(["PM-004", "PM-016", "PM-017", "Sin barra", "PML-2", "PML-3", "PML-10"]);
  });

  it("proyecto: ID y nombre salen del nombre del board; PM, CKU y Sponsor, del board", () => {
    expect(filas.find((f) => f.id === "b1")).toEqual({
      tipo: "proyecto", id: "b1", codigo: "PM-016", nombre: "Segundo", pm: "Luis", cku: "Victoria", sponsor: "Ana Sponsor", clase: "Sin clasificar",
    });
  });

  it("un board sin «|» se muestra entero como ID y sin nombre", () => {
    expect(filas.find((f) => f.id === "b3")).toMatchObject({ codigo: "Sin barra", nombre: "" });
  });

  it("un board sin «|» pero con ID («PM-017 Impala 2.0») también separa el ID del nombre", () => {
    expect(filas.find((f) => f.id === "b4")).toMatchObject({ codigo: "PM-017", nombre: "Impala 2.0" });
  });

  it("lo que el board no trae queda vacío", () => {
    expect(filas.find((f) => f.id === "b2")).toMatchObject({ cku: "", sponsor: "" });
  });

  it("PML: el ID es su id, y el Sponsor sale de su Estrategia", () => {
    expect(filas.find((f) => f.id === "PML-10")).toEqual({
      tipo: "pml", id: "PML-10", codigo: "PML-10", nombre: "Diez", pm: "Luis", cku: "Javier", sponsor: "Carlos Sponsor", clase: "C",
    });
  });

  it("PML sin Estrategia, o con una Estrategia sin Sponsor, queda sin Sponsor", () => {
    expect(filas.find((f) => f.id === "PML-2")!.sponsor).toBe("");
    expect(filas.find((f) => f.id === "PML-3")!.sponsor).toBe("");
  });

  describe("clase", () => {
    const clase = (fs: typeof filas, id: string) => fs.find((f) => f.id === id)!.clase;

    it("sin nada asignado: la de la tabla para un proyecto (PM-004 es B), «Sin clasificar» si no está, y C para todo PML", () => {
      expect(clase(filas, "b2")).toBe("B");
      expect(clase(filas, "b1")).toBe("Sin clasificar");
      expect(clase(filas, "b3")).toBe("Sin clasificar");
      for (const id of ["PML-10", "PML-2", "PML-3"]) expect(clase(filas, id)).toBe("C");
    });

    it("la asignada a mano reemplaza a la de siempre, en proyectos y en PML", () => {
      const f = filasClasificacion(data({ b2: ent("A"), b1: ent("B"), "PML-2": ent("A") }));
      expect(clase(f, "b2")).toBe("A");
      expect(clase(f, "b1")).toBe("B");
      expect(clase(f, "PML-2")).toBe("A");
      expect(clase(f, "PML-10")).toBe("C"); // sin asignar, sigue en C
      expect(clase(f, "b3")).toBe("Sin clasificar");
    });

    it("una clase asignada a un id que no existe no agrega filas", () => {
      expect(filasClasificacion(data({ fantasma: ent("A") }))).toHaveLength(7);
    });
  });
});
