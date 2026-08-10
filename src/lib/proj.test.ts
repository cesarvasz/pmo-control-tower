import { describe, it, expect } from "vitest";
import { calcProjEstado, calcProjEntrega, deriveBoardHealth, projProcess, splitBoardName } from "./proj";
import { today } from "./business";
import type { MondayColumnValue, MondayItem, MondaySubitem } from "@/types";

const daysFromToday = (n: number): Date => {
  const d = today();
  d.setDate(d.getDate() + n);
  return d;
};

describe("splitBoardName", () => {
  it("separa el código del nombre", () => {
    expect(splitBoardName("PM-003 | DUCAfast 2.0 GT")).toEqual({ code: "PM-003", name: "DUCAfast 2.0 GT" });
  });
  it("tolera el espaciado irregular de Monday", () => {
    expect(splitBoardName("PM-001 |  Tablero Junta Directiva")).toEqual({ code: "PM-001", name: "Tablero Junta Directiva" });
  });
  it("conserva emojis y separadores dentro del nombre", () => {
    expect(splitBoardName("PM-011 | ROAD 🚛")).toEqual({ code: "PM-011", name: "ROAD 🚛" });
    expect(splitBoardName("PM-012 | A | B")).toEqual({ code: "PM-012", name: "A | B" });
  });
  it("sin '|' devuelve code vacío y el nombre completo", () => {
    expect(splitBoardName("Board suelto")).toEqual({ code: "", name: "Board suelto" });
  });
});

describe("deriveBoardHealth", () => {
  it("normaliza scope 0–100 a fracción y deriva estado", () => {
    const r = deriveBoardHealth({ ev: 10, pv: 10, ac: 10, scope: 100, spi: 1, cpi: 1 });
    expect(r.healthIndex).toBe(1);
    expect(r.healthStatus).toBe("on-track");
  });
  it("índice null cuando falta un componente", () => {
    const r = deriveBoardHealth({ ev: 0, pv: 0, ac: 0, scope: null, spi: null, cpi: null });
    expect(r.healthIndex).toBeNull();
    expect(r.healthStatus).toBeNull();
  });
});

describe("calcProjEstado", () => {
  it("sin deadline → ATRASADO", () => {
    expect(calcProjEstado(null)).toBe("ATRASADO");
  });
  it("pasado / hoy / futuro", () => {
    expect(calcProjEstado(daysFromToday(-3))).toBe("ATRASADO");
    expect(calcProjEstado(today())).toBe("PARA HOY");
    expect(calcProjEstado(daysFromToday(5))).toBe("EN TIEMPO");
  });
});

describe("calcProjEntrega", () => {
  const limit = new Date(2026, 5, 10);
  it("null si no está Done o falta fecha", () => {
    expect(calcProjEntrega("Working on it", new Date(2026, 5, 1), limit)).toBeNull();
    expect(calcProjEntrega("Done", null, limit)).toBeNull();
    expect(calcProjEntrega("Done", new Date(2026, 5, 1), null)).toBeNull();
  });
  it("on-time si cierra ≤ límite; late si lo supera", () => {
    expect(calcProjEntrega("Done", new Date(2026, 5, 10), limit)).toBe("on-time");
    expect(calcProjEntrega("Done", new Date(2026, 5, 1), limit)).toBe("on-time");
    expect(calcProjEntrega("Done", new Date(2026, 5, 11), limit)).toBe("late");
  });
});

// ── projProcess (procesador completo; columnas por TÍTULO) ────────────────
const pcol = (title: string, text: string): MondayColumnValue => ({ id: title, text, column: { title } });
const mkProj = (name: string, cols: MondayColumnValue[], subitems: MondaySubitem[] = []): MondayItem => ({
  id: name, name, group: { title: "Fase 1" }, column_values: cols, subitems,
});

describe("projProcess", () => {
  it("Done a tiempo → entrega on-time; parsea costo/beneficio y metadatos del board", () => {
    const [r] = projProcess("Board X", "b1", [mkProj("Item 1", [
      pcol("Status", "Done"),
      pcol("Limit Date", "2026-06-10"),
      pcol("End Date", "2026-06-05"),
      pcol("Cost $", "1000"),
      pcol("Benefit $", "4000"),
      pcol("PM", "Luis"),
    ])]);
    expect(r.entrega).toBe("on-time");
    expect(r.cost).toBe(1000);
    expect(r.benefit).toBe(4000);
    expect(r.valueNet).toBe(3000);
    expect(r.boardId).toBe("b1");
    expect(r.boardName).toBe("Board X");
    expect(r.pm).toBe("Luis");
  });

  it("Done después del límite → entrega late", () => {
    const [r] = projProcess("B", "b1", [mkProj("I", [
      pcol("Status", "Done"), pcol("Limit Date", "2026-06-10"), pcol("End Date", "2026-06-15"),
    ])]);
    expect(r.entrega).toBe("late");
  });

  it("procesa subitems con su propia entrega (Actual End)", () => {
    const [r] = projProcess("B", "b1", [mkProj("I", [pcol("Status", "Working on it")], [
      { id: "s1", name: "Sub 1", column_values: [
        pcol("Status", "Done"), pcol("Limit Date", "2026-06-10"), pcol("Actual End", "2026-06-01"),
      ] },
    ])]);
    expect(r.entrega).toBeNull(); // el item no está Done
    expect(r.subitems).toHaveLength(1);
    expect(r.subitems[0].name).toBe("Sub 1");
    expect(r.subitems[0].entrega).toBe("on-time");
  });
});
