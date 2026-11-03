import { describe, it, expect } from "vitest";
import type { ClaseEntry, ProjBoard, ReqItem } from "@/types";
import { resumenPorClase, type ProyectoTarjeta } from "./claseCard";

const ent = (clase: "A" | "B" | "C"): ClaseEntry => ({ clase, by: "admin@c807.com", at: "2026-11-03T10:00:00.000Z" });
const board = (id: string, name: string): ProjBoard => ({ id, name, pm: "Luis" });
const proy = (id: string, name: string, healthIndex: number | null, visible = true): ProyectoTarjeta =>
  ({ board: board(id, name), healthIndex, visible });
const pml = (id: string, vem: number | null) => ({ id, vem }) as ReqItem;
const cl = (m: Record<string, "A" | "B" | "C">): Record<string, ClaseEntry> =>
  Object.fromEntries(Object.entries(m).map(([id, clase]) => [id, ent(clase)]));

describe("resumenPorClase", () => {
  it("siempre trae A, B y C en ese orden, aunque estén vacías", () => {
    const r = resumenPorClase([], [], {});
    expect(r.map((x) => x.clase)).toEqual(["A", "B", "C"]);
    expect(r.every((x) => !x.hay && x.total === 0 && x.promedio === null && x.estado === null)).toBe(true);
  });

  it("cada proyecto va a su clase (la de la tabla: PM-003 es A, PM-004 es B) y cada PML a la C", () => {
    const r = resumenPorClase([proy("b1", "PM-003 | DUCAfast", 0.97), proy("b2", "PM-004 | MOPA", 0.5)], [pml("PML-1", 0.92)], {});
    const por = Object.fromEntries(r.map((x) => [x.clase, x]));
    expect(por.A).toMatchObject({ total: 1, onTrack: 1, offTrack: 0, inRisk: 0, proyectos: ["PM-003"], pml: [] });
    expect(por.B).toMatchObject({ total: 1, offTrack: 1, proyectos: ["PM-004"] });
    expect(por.C).toMatchObject({ total: 1, inRisk: 1, proyectos: [], pml: ["PML-1"] });
  });

  it("lista los IDs de lo que cuenta en cada clase, con su salud: proyectos primero (por ID) y luego los PML (en orden natural)", () => {
    const r = resumenPorClase(
      [proy("b2", "PM-013 | TDP ADU", 0.5), proy("b1", "PM-003 | DUCAfast 2.0 GT", 0.97), proy("b3", "PM-001 | Tablero", 1, false)],
      [{ id: "PML-10", name: "Diez", vem: 0.92 } as ReqItem, { id: "PML-2", name: "Dos", vem: null } as ReqItem],
      cl({ b1: "A", b2: "A", "PML-10": "A", "PML-2": "A" }),
    );
    const a = r.find((x) => x.clase === "A")!;
    expect(a.items).toEqual([
      { tipo: "proyecto", id: "PM-003", nombre: "PM-003 | DUCAfast 2.0 GT", healthIndex: 0.97, estado: "on-track" },
      { tipo: "proyecto", id: "PM-013", nombre: "PM-013 | TDP ADU", healthIndex: 0.5, estado: "off-track" },
      { tipo: "pml", id: "PML-2", nombre: "Dos", healthIndex: null, estado: null },       // PML sin VEM: se lista, sin % ni color
      { tipo: "pml", id: "PML-10", nombre: "Diez", healthIndex: 0.92, estado: "in-risk" },
    ]);
    expect(a.items).toHaveLength(a.total);   // la lista es exactamente lo que cuenta el total
  });

  it("un proyecto completo u oculto no se lista (no cuenta), aunque su clase siga teniendo algo", () => {
    const c = resumenPorClase([proy("b1", "PM-003 | A", 1, false)], [], {}).find((x) => x.clase === "A")!;
    expect(c.items).toEqual([]);
    expect(c.hay).toBe(true);
    expect(c.proyectos).toEqual(["PM-003"]);   // sigue en el tooltip
  });

  it("la clase asignada a mano manda: un PML puede ir en A y un proyecto en C", () => {
    const r = resumenPorClase([proy("b1", "PM-003 | DUCAfast", 0.97)], [pml("PML-1", 0.97)], { "PML-1": ent("A"), b1: ent("C") });
    const por = Object.fromEntries(r.map((x) => [x.clase, x]));
    expect(por.A).toMatchObject({ total: 1, pml: ["PML-1"], proyectos: [] });
    expect(por.C).toMatchObject({ total: 1, proyectos: ["PM-003"], pml: [] });
  });

  it("cuenta los estados con los mismos umbrales de siempre (95 / 90)", () => {
    const r = resumenPorClase([], [pml("P1", 0.95), pml("P2", 0.94), pml("P3", 0.9), pml("P4", 0.89)], {});
    expect(r.find((x) => x.clase === "C")).toMatchObject({ total: 4, onTrack: 1, inRisk: 2, offTrack: 1 });
  });

  it("un proyecto no visible (completo u oculto) no suma al total ni a los estados, pero sí promedia y marca que hay algo", () => {
    const r = resumenPorClase([proy("b1", "PM-003 | A", 0.5), proy("b2", "PM-001 | B", 1, false)], [], {});
    const a = r.find((x) => x.clase === "A")!;
    expect(a.total).toBe(1);
    expect(a.offTrack).toBe(1);
    expect(a.promedio).toBeCloseTo(0.75, 8);
    expect(a.estado).toBe("off-track");
    expect(a.proyectos).toEqual(["PM-003", "PM-001"]);
    // Una clase con solo proyectos completos: total 0 pero "hay" algo y su promedio.
    const solo = resumenPorClase([proy("b2", "PM-001 | B", 1, false)], [], {}).find((x) => x.clase === "A")!;
    expect(solo).toMatchObject({ hay: true, total: 0, promedio: 1, estado: "on-track" });
  });

  it("un PML sin VEM cuenta en el total pero no en los estados ni en el promedio", () => {
    const c = resumenPorClase([], [pml("P1", 0.97), pml("P2", null)], {}).find((x) => x.clase === "C")!;
    expect(c).toMatchObject({ total: 2, onTrack: 1, inRisk: 0, offTrack: 0, promedio: 0.97 });
  });

  it("promedia proyectos y PML de la clase juntos", () => {
    const a = resumenPorClase([proy("b1", "PM-003 | A", 1)], [pml("PML-1", 0.8)], { "PML-1": ent("A") }).find((x) => x.clase === "A")!;
    expect(a.promedio).toBeCloseTo(0.9, 8);
    expect(a.estado).toBe("in-risk");
  });

  it("un proyecto sin clase sale en «Sin clasificar», al final, y solo cuando existe", () => {
    expect(resumenPorClase([proy("b1", "PM-003 | A", 1)], [], {}).map((x) => x.clase)).toEqual(["A", "B", "C"]);

    const r = resumenPorClase([proy("b9", "PM-010 | AIR & SEA", 0.96)], [], {});
    expect(r.map((x) => x.clase)).toEqual(["A", "B", "C", "Sin clasificar"]);
    expect(r[3]).toMatchObject({ total: 1, onTrack: 1, proyectos: ["PM-010"] });

    // Le asignan una clase: ya no aparece la sección.
    expect(resumenPorClase([proy("b9", "PM-010 | AIR & SEA", 0.96)], [], { b9: ent("B") }).map((x) => x.clase)).toEqual(["A", "B", "C"]);
  });

  it("el ID de un board sin «|» sale entero", () => {
    const r = resumenPorClase([proy("b1", "Sin barra", 1)], [], {});
    expect(r.find((x) => x.clase === "Sin clasificar")!.proyectos).toEqual(["Sin barra"]);
  });
});
