import { describe, it, expect } from "vitest";
import { reqProcess, REQ_COLS, REQ_GROUP_LABEL, REQ_ACTIVE_GRUPOS } from "./req";
import type { MondayItem } from "@/types";

// Construye un item de REQ con las columnas por id (REQ_COLS).
const mkReq = (group: string, cols: Record<string, string>): MondayItem => ({
  id: "x", name: "REQ X", group: { title: group },
  column_values: Object.entries(cols).map(([id, text]) => ({ id, text })),
});

describe("REQ_GROUP_LABEL", () => {
  it("mapea el título del grupo de Monday a la etiqueta corta", () => {
    expect(REQ_GROUP_LABEL["Valuación | Req Terminado"]).toBe("Valuación");
    expect(REQ_GROUP_LABEL["REQ Cerrados"]).toBe("Cerrados");
  });
});

describe("reqProcess", () => {
  it("REQ Cerrados → estado CERRADO y sin métricas EVM (grupo no activo)", () => {
    const [r] = reqProcess([mkReq("REQ Cerrados", { [REQ_COLS.id]: "R1" })]);
    expect(r.grupo).toBe("Cerrados");
    expect(r.estado).toBe("CERRADO");
    expect(REQ_ACTIVE_GRUPOS.has(r.grupo)).toBe(false);
    expect(r.spi).toBeNull();
    expect(r.cpi).toBeNull();
    expect(r.scope).toBeNull();
    expect(r.vem).toBeNull();
  });

  it("parsea costos, beneficio y valor neto", () => {
    const [r] = reqProcess([mkReq("REQ Cerrados", {
      [REQ_COLS.costRH]: "1000", [REQ_COLS.costSoft]: "500", [REQ_COLS.benefit]: "3000",
    })]);
    expect(r.costRH).toBe(1000);
    expect(r.costSft).toBe(500);
    expect(r.benefit).toBe(3000);
    expect(r.valueNet).toBe(1500);
  });

  it("Valuación con inicio muy antiguo → ATRASADO, scope 0, deadline y VEM calculados", () => {
    const [r] = reqProcess([mkReq("Valuación | Req Terminado", {
      [REQ_COLS.cpmStart]: "2020-01-01",
      [REQ_COLS.costRH]: "2300", [REQ_COLS.costSoft]: "0", [REQ_COLS.benefit]: "5000",
    })]);
    expect(r.grupo).toBe("Valuación");
    expect(r.estado).toBe("ATRASADO");
    expect(r.scope).toBe(0);              // atrasado ⇒ scope 0
    expect(r.deadline).toBeInstanceOf(Date);
    expect(r.vem).not.toBeNull();
  });

  it("Valuación con Req Terminado (V Done) cuenta la fase en EV", () => {
    const [r] = reqProcess([mkReq("Valuación | Req Terminado", {
      [REQ_COLS.cpmStart]: "2020-01-01",
      [REQ_COLS.vDone]: "2020-01-02",
      [REQ_COLS.costRH]: "2300", [REQ_COLS.costSoft]: "0",
    })]);
    // Con V Done, la fase Valuación está completada → EV > 0.
    expect(r.ev).toBeGreaterThan(0);
  });

  it("marca la entrega como n/a cuando no hay R Done (REQ no cerrado)", () => {
    const [r] = reqProcess([mkReq("Valuación | Req Terminado", {
      [REQ_COLS.cpmStart]: "2020-01-01",
    })]);
    expect(r.onTime.verdict).toBe("n/a");
  });
});
