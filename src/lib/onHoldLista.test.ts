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

import { filasOnHold } from "./onHoldLista";

const ent = { by: "admin@c807.com", at: "2026-10-28T10:00:00.000Z" };

const data = (onHold: DashboardData["onHold"]) => ({
  projBoards: [
    { id: "b1", name: "PM-016 | Segundo", pm: "Luis" },
    { id: "b2", name: "PM-015 | Primero", pm: "Luis" },
    { id: "b3", name: "PM-020 | Terminado", pm: "Ana" },
    { id: "b4", name: "Sin barra", pm: "Ana" },
  ],
  proj: [
    { id: "p1", boardId: "b1", fase: "Aprobación" },
    { id: "p2", boardId: "b2", fase: "Launch" },
    { id: "p3", boardId: "b3", fase: "Revisión", completo: true },
  ],
  req: [
    { id: "PML-2", name: "Dos", pm: "Luis", grupo: "Desarrollo", estado: "EN TIEMPO" },
    { id: "PML-10", name: "Diez", pm: "Luis", grupo: "Valuación", estado: "ATRASADO" },
    { id: "PML-3", name: "Cerrado", pm: "Luis", grupo: "REQ Cerrados", estado: "CERRADO" },
    { id: "PML-4", name: "Sin grupo", pm: "Ana", grupo: "", estado: "EN_ESPERA" },
  ],
  onHold,
}) as unknown as DashboardData;

describe("filasOnHold", () => {
  const filas = filasOnHold(data({ proyectos: {}, pml: {} }));

  it("deja fuera los proyectos completos y los PML cerrados", () => {
    const ids = filas.map((f) => f.id);
    expect(ids).not.toContain("b3");
    expect(ids).not.toContain("PML-3");
    expect(filas).toHaveLength(6);
  });

  it("ordena por PM, proyectos antes que PML, y por código en orden natural (PML-2 antes que PML-10)", () => {
    expect(filas.map((f) => f.codigo)).toEqual(["Sin barra", "PML-4", "PM-015", "PM-016", "PML-2", "PML-10"]);
  });

  it("proyecto: código y nombre salen del nombre del board, y la fase es la actual", () => {
    const f = filas.find((x) => x.id === "b2")!;
    expect(f).toMatchObject({ tipo: "proyecto", codigo: "PM-015", nombre: "Primero", pm: "Luis", fase: "Launch" });
  });

  it("un board sin «|» se muestra entero como código, y uno sin items queda sin fase", () => {
    const f = filas.find((x) => x.id === "b4")!;
    expect(f).toMatchObject({ codigo: "Sin barra", nombre: "", fase: "—" });
  });

  it("PML: el código es su id y la fase su grupo (o «—»)", () => {
    expect(filas.find((x) => x.id === "PML-2")).toMatchObject({ tipo: "pml", codigo: "PML-2", nombre: "Dos", fase: "Desarrollo" });
    expect(filas.find((x) => x.id === "PML-4")!.fase).toBe("—");
  });

  it("marca los que ya están en On Hold, sin sacarlos de la lista", () => {
    const f = filasOnHold(data({ proyectos: { b1: ent }, pml: { "PML-10": ent, noExiste: ent } }));
    expect(f.filter((x) => x.enOnHold).map((x) => x.id).sort()).toEqual(["PML-10", "b1"]);
    expect(f).toHaveLength(6);
  });

  it("un proyecto completo en On Hold tampoco aparece (ya no hay nada que pausar)", () => {
    const f = filasOnHold(data({ proyectos: { b3: ent }, pml: {} }));
    expect(f.map((x) => x.id)).not.toContain("b3");
  });
});
