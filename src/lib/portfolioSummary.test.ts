import { describe, it, expect } from "vitest";
import {
  buildPortfolioRows, calcPortfolioTotals, topCriticalProjects, buildCrossRisks, buildDelayRadar, type PortfolioProjectRow,
} from "./portfolioSummary";
import { businessDays, today } from "./business";
import type { ProjBoard, ProjItem } from "@/types";

const board = (o: Partial<ProjBoard>): ProjBoard => o as ProjBoard;
const item = (o: Partial<ProjItem>): ProjItem => ({ name: "Item", subitems: [], estado: "EN TIEMPO", deadline: null, endDate: null, entrega: null, grupo: "Fase", benefit: 0, ...o }) as ProjItem;

const daysFromToday = (n: number): Date => {
  const d = today();
  d.setDate(d.getDate() + n);
  return d;
};

const mkRow = (o: Partial<PortfolioProjectRow>): PortfolioProjectRow => ({
  boardId: "x", code: "", name: "Proyecto", pm: "",
  healthStatus: "on-track", healthIndex: 1, spi: 1, cpi: 1, ev: 0, pv: 0,
  isComplete: false, progressPct: 0, plannedPct: 0,
  budgetApproved: 0, budgetSpent: 0, pctConsumed: null, valorProyecto: null,
  worstOverdueDays: 0, overdueCount: 0, avgSlipDays: 0,
  mainRisk: { label: "—", severity: "low" },
  ...o,
});

describe("buildPortfolioRows", () => {
  it("calcula presupuesto aprobado/gastado y detecta proyecto completado", () => {
    const boards = [board({ id: "b1", name: "PM-001 | Alfa", pm: "Luis" })];
    const proj = [
      item({ id: "i1", boardId: "b1", status: "Done", cost: 100 }),
      item({ id: "i2", boardId: "b1", grupo: "Operación", status: "Done", cost: 50 }),
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

  it("valorProyecto = Benefit $ del Business Case (primer ítem de Valuación) − Cost $ del board (suma de todos los items)", () => {
    const boards = [board({ id: "b1", name: "PM-005 | Delta", pm: "Ana" })];
    const proj = [
      item({ id: "bc", boardId: "b1", name: "Kick Off Project Meeting", grupo: "Valuación", status: "Done", cost: 10, benefit: 1000 }),
      item({ id: "val", boardId: "b1", name: "VPA valida Business Case", grupo: "Valuación", status: "Done", cost: 5 }),
      item({ id: "dev", boardId: "b1", name: "Desarrollo", grupo: "Launch", status: "Working on it", cost: 200 }),
    ];
    const rows = buildPortfolioRows(boards, proj, {});
    const r = rows[0];
    expect(r.budgetApproved).toBe(215); // 10 + 5 + 200 — TODOS los items, no solo el Business Case
    expect(r.valorProyecto).toBe(1000 - 215); // Benefit $ del Business Case − Cost $ total
  });

  it("valorProyecto NO exige ninguna etapa VALOR alcanzada: basta con que el Business Case tenga Benefit $, aunque siga 'Working on it'", () => {
    const boards = [board({ id: "b1", name: "PM-008 | Theta", pm: "Ana" })];
    const proj = [
      item({ id: "bc", boardId: "b1", name: "Kick Off Project Meeting", grupo: "Valuación", status: "Working on it", cost: 10, benefit: 1000 }),
    ];
    const rows = buildPortfolioRows(boards, proj, {});
    expect(rows[0].valorProyecto).toBe(1000 - 10);
  });

  it("Benefit Type SoftSaving → valorProyecto null, aunque el proyecto tenga benefit y cost", () => {
    const boards = [board({ id: "b1", name: "PM-006 | Epsilon", pm: "Ana", benefitType: "SoftSaving" })];
    const proj = [
      item({ id: "bc", boardId: "b1", name: "Kick Off Project Meeting", grupo: "Valuación", status: "Done", cost: 10, benefit: 1000 }),
      item({ id: "val", boardId: "b1", name: "VPA valida Business Case", grupo: "Valuación", status: "Done", cost: 5 }),
    ];
    const rows = buildPortfolioRows(boards, proj, {});
    expect(rows[0].valorProyecto).toBeNull();
  });

  it("sin Business Case (Kick Off Project Meeting) en el board → valorProyecto null (no se inventa un benefit)", () => {
    const boards = [board({ id: "b1", name: "PM-007 | Zeta", pm: "Ana" })];
    const proj = [item({ id: "i1", boardId: "b1", status: "Working on it", cost: 50 })];
    const rows = buildPortfolioRows(boards, proj, {});
    expect(rows[0].valorProyecto).toBeNull();
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
    const risks = buildCrossRisks(rows, totals, { Desarrollo: 6, PM: 2, VPA: 2 });
    const r = risks.find((x) => x.title.includes("Desarrollo"));
    expect(r).toBeDefined();
    expect(r!.severity).toBe("high");
  });

  it("no marca responsable dominante si ninguno concentra 30% o más", () => {
    const rows = [mkRow({ boardId: "a" })];
    const totals = calcPortfolioTotals(rows);
    const risks = buildCrossRisks(rows, totals, { Desarrollo: 2, PM: 2, VPA: 2, CKU: 2, BRM: 2 });
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
    const risks = buildCrossRisks(rows, totals, { Desarrollo: 9, PM: 1 });
    expect(risks.length).toBeLessThanOrEqual(3);
  });
});

describe("buildDelayRadar", () => {
  const hoy = today();

  it("días de atraso = unión de los atrasos de Fase 3 (el peor, no la suma) — mismo cálculo que el Status Card", () => {
    const boards = [board({ id: "b1", name: "PM-020 | Delta", pm: "Ana" })];
    const proj = [
      item({ id: "i1", boardId: "b1", grupo: "Launch", name: "Step A", status: "Working on it", estado: "ATRASADO", deadline: daysFromToday(-15) }),
      item({ id: "i2", boardId: "b1", grupo: "Launch", name: "Step B", status: "Working on it", estado: "ATRASADO", deadline: daysFromToday(-7) }),
    ];
    // worstOverdueDays deliberadamente distinto: si el radar todavía lo usara, el test fallaría.
    const rows = [mkRow({ boardId: "b1", code: "PM-020", name: "Delta", worstOverdueDays: 999 })];
    const radar = buildDelayRadar(rows, boards, proj, {});
    expect(radar).toHaveLength(1);
    const diasPeor = businessDays(daysFromToday(-15), hoy, true);
    const diasSumaIngenua = diasPeor + businessDays(daysFromToday(-7), hoy, true);
    expect(radar[0].diasAtraso).toBe(diasPeor);
    expect(radar[0].diasAtraso).not.toBe(diasSumaIngenua); // no se suman los días en común
    expect(radar[0].diasAtraso).not.toBe(999);
  });

  it("atraso en Valuación/Aprobación (fuera de Launch/Operación/Revisión): sigue en N/D — no hay dónde atribuirlo", () => {
    const boards = [board({ id: "b2", name: "PM-021 | Epsilon", pm: "Ana" })];
    const proj = [
      item({ id: "i3", boardId: "b2", grupo: "Aprobación", name: "Checkpoint fuera de Launch", status: "Working on it", estado: "ATRASADO", deadline: daysFromToday(-3) }),
    ];
    const rows = [mkRow({ boardId: "b2", code: "PM-021", name: "Epsilon", worstOverdueDays: 42 })];
    const radar = buildDelayRadar(rows, boards, proj, {});
    expect(radar[0].diasAtraso).toBe(42); // cae al fallback, como antes
    expect(radar[0].responsable).toBe("N/D");
  });

  it("Operación (Fase 4) atrasada: cuenta como UNA fila por FASE, no por item — el responsable se asigna a la fase completa", () => {
    const boards = [board({ id: "b3", name: "PM-022 | Zeta", pm: "Ana" })];
    const proj = [
      item({ id: "i4", boardId: "b3", grupo: "Operación", name: "BAT CKU", status: "Working on it", estado: "ATRASADO", deadline: daysFromToday(-5) }),
      item({ id: "i5", boardId: "b3", grupo: "Operación", name: "Cierre Go Live", status: "Working on it", estado: "ATRASADO", deadline: daysFromToday(-2) }),
    ];
    // worstOverdueDays deliberadamente distinto: si el radar todavía cayera a
    // ese fallback, el test lo detectaría.
    const rows = [mkRow({ boardId: "b3", code: "PM-022", name: "Zeta", worstOverdueDays: 999 })];
    const radar = buildDelayRadar(rows, boards, proj, {});
    expect(radar).toHaveLength(1); // una sola fila para toda la fase, no una por item
    expect(radar[0].diasAtraso).toBe(businessDays(daysFromToday(-5), hoy, true)); // el peor de los 2 items
    expect(radar[0].responsable).toBe("Sin asignar"); // sin atrasoDetalles, ya no "N/D": se puede asignar
    expect(radar[0].actionItem).toContain("Operación");
  });

  it("responsable asignado a la FASE (Operación) — no a un item puntual — se refleja en el radar", () => {
    const boards = [board({ id: "b4", name: "PM-023 | Eta", pm: "Ana" })];
    const proj = [
      item({ id: "i6", boardId: "b4", grupo: "Operación", name: "Cierre operativo", status: "Working on it", estado: "ATRASADO", deadline: daysFromToday(-5) }),
    ];
    const rows = [mkRow({ boardId: "b4", code: "PM-023", name: "Eta", worstOverdueDays: 5 })];
    // La atribución se guarda con el id SINTÉTICO de la fase (fase-operacion-<boardId>),
    // no con el id del item real — así lo persiste evaluarFaseAtraso/AtrasoRespReparto.
    const radar = buildDelayRadar(rows, boards, proj, { "fase-operacion-b4": { responsable: "IT" } });
    expect(radar[0].responsable).toBe("IT");
  });

  it("Revisión (Fase 5) atrasada también cuenta como fila por fase", () => {
    const boards = [board({ id: "b5", name: "PM-024 | Theta", pm: "Ana" })];
    const proj = [
      item({ id: "i7", boardId: "b5", grupo: "Revisión", name: "Informe ejecutivo de valor", status: "Working on it", estado: "ATRASADO", deadline: daysFromToday(-12) }),
    ];
    const rows = [mkRow({ boardId: "b5", code: "PM-024", name: "Theta", worstOverdueDays: 12 })];
    const radar = buildDelayRadar(rows, boards, proj, {});
    expect(radar[0].actionItem).toContain("Revisión");
  });
});
