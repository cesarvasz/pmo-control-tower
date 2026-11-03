import { describe, it, expect } from "vitest";
import type { ClaseEntry, ProjBoard, ReqItem } from "@/types";
import { notasPorClase, partesEvm } from "./evmClase";

const cl = (m: Record<string, "A" | "B" | "C">): Record<string, ClaseEntry> =>
  Object.fromEntries(Object.entries(m).map(([id, clase]) => [id, { clase, by: "", at: "" }]));
const board = (id: string, name: string) => ({ id, name, pm: "Luis" }) as ProjBoard;
const pml = (id: string, vem: number | null) => ({ id, vem }) as ReqItem;

describe("partesEvm", () => {
  it("las Iniciativas van tal cual y cada clase vale el promedio de sus notas", () => {
    const p = partesEvm(0.9, [
      { clase: "A", valor: 1 }, { clase: "A", valor: 0.5 },
      { clase: "B", valor: 0.8 },
    ]);
    expect(p).toEqual({ ini: 0.9, A: 0.75, B: 0.8, C: null });
  });

  it("lo «Sin clasificar» no cuenta en ninguna fuente", () => {
    expect(partesEvm(null, [{ clase: "Sin clasificar", valor: 0 }, { clase: "C", valor: 1 }])).toEqual({ ini: null, A: null, B: null, C: 1 });
  });

  it("sin notas, todo queda en null", () => {
    expect(partesEvm(null, [])).toEqual({ ini: null, A: null, B: null, C: null });
  });
});

describe("notasPorClase", () => {
  it("junta los PML (por su VEM) y los proyectos (por su índice) con su clase, y se salta los que no tienen nota", () => {
    const notas = notasPorClase(
      [pml("PML-1", 0.5), pml("PML-2", null)],
      [{ board: board("b1", "PM-003 | A"), healthIndex: 1 }, { board: board("b2", "PM-004 | B"), healthIndex: undefined }, { board: board("b3", "Sin ID"), healthIndex: 0.2 }],
      {},
    );
    expect(notas).toEqual([
      { clase: "C", valor: 0.5 },                 // PML sin clase asignada: C
      { clase: "A", valor: 1 },                   // PM-003: A en la tabla
      { clase: "Sin clasificar", valor: 0.2 },    // fuera de la tabla y sin asignar
    ]);
  });

  it("la clase asignada manda sobre la de siempre", () => {
    const notas = notasPorClase([pml("PML-1", 1)], [{ board: board("b1", "PM-003 | A"), healthIndex: 0.4 }], cl({ "PML-1": "A", b1: "C" }));
    expect(notas).toEqual([{ clase: "A", valor: 1 }, { clase: "C", valor: 0.4 }]);
  });
});
