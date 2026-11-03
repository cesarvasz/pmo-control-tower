import { describe, it, expect, vi } from "vitest";
import type { DashboardData } from "@/types";

// El resumen de un proyecto (fases, si está completo) se calcula con reglas de Monday que
// tienen sus propias pruebas; aquí solo importa cómo la lista lo usa.
vi.mock("@/lib/projSummary", () => ({
  buildProjectSummary: (items: { boardId: string; fase: string; completo?: boolean }[]) => ({
    completion: { isComplete: items.length > 0 && items.every((i) => i.completo) },
    phases: items.length ? [{ grupo: items[0].fase }] : [],
  }),
  currentPhaseIndex: (phases: unknown[]) => (phases.length ? 0 : -1),
}));

import { filasClasificacion } from "./clasificacion";

const ent = (clase: "A" | "B" | "C") => ({ clase, by: "admin@c807.com", at: "2026-11-02T10:00:00.000Z" });
const pausa = { by: "admin@c807.com", at: "2026-11-02T10:00:00.000Z", motivo: "Esperando al cliente" };

const data = (clases: DashboardData["clases"] = {}, onHold: DashboardData["onHold"] = { proyectos: {}, pml: {} }) => ({
  clases,
  onHold,
  projBoards: [
    { id: "b1", name: "PM-016 | Segundo", pm: "Luis", cku: "Victoria", sponsor: "Ana Sponsor" },
    { id: "b2", name: "PM-004 | Primero", pm: "David" },
    { id: "b3", name: "Sin barra", pm: "Ana", cku: "Javier", sponsor: "Otro" },
    { id: "b4", name: "PM-017 Impala 2.0", pm: "Ana" },
  ],
  proj: [
    { id: "p1", boardId: "b1", fase: "Aprobación", subitems: [] },
    { id: "p2", boardId: "b2", fase: "Launch", subitems: [] },
    { id: "p3", boardId: "b3", fase: "Revisión", completo: true, subitems: [] }, // b3 está completo
    // b4 no tiene items
  ],
  req: [
    { id: "PML-10", name: "Diez", pm: "Luis", cku: "Javier", estrategia: "Estrategia Uno", grupo: "Valuación", estado: "ATRASADO" },
    { id: "PML-2", name: "Dos", pm: "David", cku: "", estrategia: "Estrategia sin sponsor", grupo: "Desarrollo", estado: "EN TIEMPO" },
    { id: "PML-3", name: "Tres", pm: "", cku: "Victoria", estrategia: "", grupo: "REQ Cerrados", estado: "CERRADO" },
  ],
  estrategiaMap: new Map([
    ["estrategia uno", { uNeg: "UN", pais: "GT", sponsor: "Carlos Sponsor" }],
    ["estrategia sin sponsor", { uNeg: "UN", pais: "GT", sponsor: "" }],
  ]),
}) as unknown as DashboardData;

describe("filasClasificacion", () => {
  const filas = filasClasificacion(data());

  it("lista todos los proyectos y todos los PML, sin descartar ninguno (también los completos y cerrados)", () => {
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
      fase: "Aprobación", pausable: true, enOnHold: false, motivo: "",
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
      fase: "Valuación", pausable: true, enOnHold: false, motivo: "",
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

  describe("On Hold", () => {
    const fila = (fs: typeof filas, id: string) => fs.find((f) => f.id === id)!;

    it("se puede pausar un proyecto sin completar (con la fase actual) y un PML no cerrado (con su grupo)", () => {
      expect(fila(filas, "b2")).toMatchObject({ pausable: true, fase: "Launch" });
      expect(fila(filas, "PML-2")).toMatchObject({ pausable: true, fase: "Desarrollo" });
      expect(fila(filas, "b4")).toMatchObject({ pausable: true, fase: "—" }); // sin items: cuenta como no completado
    });

    it("un proyecto completo y un PML cerrado no se pueden pausar y lo dicen en la fase", () => {
      expect(fila(filas, "b3")).toMatchObject({ pausable: false, enOnHold: false, fase: "Completado" });
      expect(fila(filas, "PML-3")).toMatchObject({ pausable: false, enOnHold: false, fase: "Cerrado" });
    });

    it("marca lo que está en On Hold, con su motivo, sin sacarlo de la lista", () => {
      const f = filasClasificacion(data({}, { proyectos: { b1: pausa }, pml: { "PML-10": { ...pausa, motivo: "Sin presupuesto" } } }));
      expect(f).toHaveLength(7);
      expect(fila(f, "b1")).toMatchObject({ enOnHold: true, motivo: "Esperando al cliente" });
      expect(fila(f, "PML-10")).toMatchObject({ enOnHold: true, motivo: "Sin presupuesto" });
      expect(f.filter((x) => x.enOnHold).map((x) => x.id).sort()).toEqual(["PML-10", "b1"]);
    });

    it("un On Hold sin motivo (pausado antes de que existiera) queda con motivo vacío", () => {
      const f = filasClasificacion(data({}, { proyectos: {}, pml: { "PML-2": { ...pausa, motivo: "" } } }));
      expect(fila(f, "PML-2")).toMatchObject({ enOnHold: true, motivo: "" });
    });

    it("un proyecto completo guardado en On Hold no figura como pausado (ya no hay nada que pausar)", () => {
      const f = filasClasificacion(data({}, { proyectos: { b3: pausa }, pml: {} }));
      expect(fila(f, "b3")).toMatchObject({ pausable: false, enOnHold: false });
    });

    it("pausar no cambia la clase", () => {
      const f = filasClasificacion(data({ b2: ent("A") }, { proyectos: { b2: pausa }, pml: {} }));
      expect(fila(f, "b2")).toMatchObject({ clase: "A", enOnHold: true });
    });
  });
});
