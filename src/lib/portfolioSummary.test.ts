import { describe, it, expect } from "vitest";
import {
  buildPortfolioRows, calcPortfolioTotals, topCriticalProjects, buildCrossRisks, type PortfolioProjectRow,
} from "./portfolioSummary";
import type { ProjBoard, ProjItem } from "@/types";

const board = (o: Partial<ProjBoard>): ProjBoard => o as ProjBoard;
const item = (o: Partial<ProjItem>): ProjItem => ({ subitems: [], estado: "EN TIEMPO", deadline: null, endDate: null, entrega: null, grupo: "Fase", benefit: 0, ...o }) as ProjItem;

const mkRow = (o: Partial<PortfolioProjectRow>): PortfolioProjectRow => ({
  boardId: "x", code: "", name: "Proyecto", pm: "",
  healthStatus: "on-track", healthIndex: 1, spi: 1, cpi: 1, ev: 0, pv: 0,
  isComplete: false, progressPct: 0, plannedPct: 0,
  budgetApproved: 0, budgetSpent: 0, pctConsumed: null,
  worstOverdueDays: 0, overdueCount: 0, avgSlipDays: 0,
  mainRisk: { label: "—", severity: "low" },
  ...o,
});

describe("buildPortfolioRows", () => {
  it("calcula presupuesto aprobado/gastado y detecta proyecto completado", () => {
    const boards = [board({ id: "b1", name: "PM-001 | Alfa", pm: "Luis" })];
    const proj = [
      item({ id: "i1", boardId: "b1", status: "Done", cost: 100 }),
      item({ id: "i2", boardId: "b1", status: "Done", cost: 50 }),
    ];
    const rows = buildPortfolioRows(boards, proj, {});
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.code).toBe("PM-001");
    expect(r.name).toBe("Alfa");
    expect(r.budgetApproved).toBe(150);
    expect(r.budgetSpent).toBe(150);
    expect(r.isComplete).toBe(true);
    expect(r.mainRisk.label).toMatch(/Cerrado/);
  });

  it("detecta atraso activo y lo refleja como riesgo principal", () => {
    const boards = [board({ id: "b1", name: "Beta", pm: "Ana" })];
    const proj = [item({ id: "i1", boardId: "b1", status: "Working on it", estado: "ATRASADO", cost: 200, deadline: new Date(2020, 0, 1) })];
    const rows = buildPortfolioRows(boards, proj, {});
    expect(rows[0].overdueCount).toBe(1);
    expect(rows[0].healthStatus).toBe("off-track");
    expect(rows[0].mainRisk.severity).not.toBe("low");
  });

  it("board sin costos ni deadlines → healthStatus null, sin presupuesto", () => {
    const boards = [board({ id: "b1", name: "Gamma", pm: "Beto" })];
    const proj = [item({ id: "i1", boardId: "b1", status: "Working on it", cost: 0 })];
    const rows = buildPortfolioRows(boards, proj, {});
    expect(rows[0].healthStatus).toBeNull();
    expect(rows[0].pctConsumed).toBeNull();
  });
});

describe("calcPortfolioTotals", () => {
  it("cuenta por balde y suma presupuesto/burn rate", () => {
    const rows = [
      mkRow({ boardId: "a", healthStatus: "on-track", budgetApproved: 100, budgetSpent: 100, ev: 100, pv: 100 }),
      mkRow({ boardId: "b", healthStatus: "off-track", budgetApproved: 200, budgetSpent: 50, ev: 20, pv: 50 }),
      mkRow({ boardId: "c", healthStatus: null, budgetApproved: 0, budgetSpent: 0 }),
      mkRow({ boardId: "d", isComplete: true, healthStatus: "off-track", budgetApproved: 80, budgetSpent: 80, ev: 80, pv: 80 }),
    ];
    const t = calcPortfolioTotals(rows);
    expect(t).toMatchObject({ total: 4, completed: 1, onTrack: 1, offTrack: 1, noData: 1, inRisk: 0 });
    expect(t.budgetApproved).toBe(380);
    expect(t.budgetSpent).toBe(230);
    expect(t.burnRatePct).toBe(Math.round((230 / 380) * 100));
  });
});

describe("topCriticalProjects", () => {
  it("prioriza Off Track sobre In Risk (peor VEM primero) y excluye completados/on-track/sin datos", () => {
    const rows = [
      mkRow({ boardId: "a", healthStatus: "on-track" }),
      mkRow({ boardId: "b", healthStatus: "off-track", healthIndex: 0.5 }),
      mkRow({ boardId: "c", healthStatus: "in-risk", healthIndex: 0.9 }),
      mkRow({ boardId: "d", healthStatus: "off-track", healthIndex: 0.3 }),
      mkRow({ boardId: "e", healthStatus: null }),
      mkRow({ boardId: "f", healthStatus: "off-track", healthIndex: 0.2, isComplete: true }),
    ];
    const top = topCriticalProjects(rows, 3);
    expect(top.map((r) => r.boardId)).toEqual(["d", "b", "c"]);
  });
});

describe("buildCrossRisks", () => {
  it("marca exposición financiera cuando Off Track concentra una porción relevante del gasto", () => {
    const rows = [
      mkRow({ boardId: "a", healthStatus: "off-track", budgetSpent: 300, budgetApproved: 300 }),
      mkRow({ boardId: "b", healthStatus: "on-track", budgetSpent: 100, budgetApproved: 100 }),
    ];
    const totals = calcPortfolioTotals(rows);
    const risks = buildCrossRisks(rows, totals, {});
    expect(risks.some((r) => r.title.includes("Exposición financiera"))).toBe(true);
  });

  it("marca un responsable dominante cuando concentra >=30% de los atrasos atribuidos", () => {
    const rows = [mkRow({ boardId: "a" })];
    const totals = calcPortfolioTotals(rows);
    const risks = buildCrossRisks(rows, totals, { Desarrollador: 6, PM: 2, VPA: 2 });
    const r = risks.find((x) => x.title.includes("Desarrollador"));
    expect(r).toBeDefined();
    expect(r!.severity).toBe("high");
  });

  it("no marca responsable dominante si ninguno concentra 30% o más", () => {
    const rows = [mkRow({ boardId: "a" })];
    const totals = calcPortfolioTotals(rows);
    const risks = buildCrossRisks(rows, totals, { Desarrollador: 2, PM: 2, VPA: 2, CKU: 2, BRM: 2 });
    expect(risks.some((r) => r.title.includes("Concentración de atrasos"))).toBe(false);
  });

  it("marca concentración por PM cuando la mayoría de sus proyectos están en riesgo", () => {
    const rows = [
      mkRow({ boardId: "a", pm: "Carlos", healthStatus: "off-track" }),
      mkRow({ boardId: "b", pm: "Carlos", healthStatus: "in-risk" }),
      mkRow({ boardId: "c", pm: "Carlos", healthStatus: "on-track" }),
    ];
    const totals = calcPortfolioTotals(rows);
    const risks = buildCrossRisks(rows, totals, {});
    expect(risks.some((r) => r.title.includes("Carlos"))).toBe(true);
  });

  it("como máximo devuelve 3 riesgos", () => {
    const rows = [
      mkRow({ boardId: "a", healthStatus: "off-track", budgetSpent: 300, budgetApproved: 300 }),
      mkRow({ boardId: "b", pm: "Carlos", healthStatus: "off-track" }),
      mkRow({ boardId: "c", pm: "Carlos", healthStatus: "in-risk" }),
    ];
    const totals = calcPortfolioTotals(rows);
    const risks = buildCrossRisks(rows, totals, { Desarrollador: 9, PM: 1 });
    expect(risks.length).toBeLessThanOrEqual(3);
  });
});
