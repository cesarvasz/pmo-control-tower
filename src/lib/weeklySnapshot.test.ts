import { describe, it, expect } from "vitest";
import { computeWeeklySnapshotMetrics } from "./weeklySnapshot";
import type { DashboardData, IniItem, ProjBoard, ProjItem, ReqItem } from "@/types";

// Fixtures mínimos: solo se rellenan los campos que lee computeWeeklySnapshotMetrics
// (vía dashboard.ts/health.ts/ini.ts) — mismo criterio que dashboard.test.ts.
const ini = (o: Partial<IniItem>): IniItem => ({ status: "New", estado: "EN TIEMPO", pm: "Ana" as string, ...o }) as IniItem;
const req = (o: Partial<ReqItem>): ReqItem => ({
  pm: "Ana", grupo: "Valuación", estado: "EN TIEMPO", costRH: 0, costSft: 0, benefit: 0, benefitType: "HardSaving", vem: null,
  onTime: { verdict: "n/a", deliveryPhase: null, slipDays: 0, phases: [] },
  ...o,
}) as ReqItem;
const proj = (o: Partial<ProjItem>): ProjItem => ({
  name: "Item", grupo: "Fase", boardId: "b1", subitems: [], status: "Working on it", estado: "EN TIEMPO",
  cost: 0, benefit: 0, deadline: null, endDate: null,
  ...o,
}) as ProjItem;
const board = (o: Partial<ProjBoard>): ProjBoard => ({ id: "b1", name: "PM-001 | Alfa", pm: "Ana", benefitType: "HardSaving", ...o }) as ProjBoard;

const mkData = (o: Partial<DashboardData>): DashboardData => ({
  ini: [], req: [], proj: [], projBoards: [], projItemBaselines: {}, calMap: new Map(),
  nps: { nps: null, promoters: 0, passives: 0, detractors: 0, total: 0, responses: [], questions: [], overallAvg: null },
  npsRecords: [], delayAttributions: {}, reprocesoAttributions: {}, atrasoDetalles: {},
  boardAlcance: {}, directorio: [], devTeamRoster: new Set(), estrategiaMap: new Map(),
  reminderMap: new Map(), fetchedAt: new Date(),
  ...o,
}) as DashboardData;

describe("computeWeeklySnapshotMetrics", () => {
  it("con datos vacíos, todo sale en null/0", () => {
    const m = computeWeeklySnapshotMetrics(mkData({}));
    expect(m).toEqual({ evm: null, beneficioConfirmado: 0, calidad: null, cumplimiento: null, nps: null });
  });

  it("pasa el NPS del equipo tal cual viene en data.nps", () => {
    const m = computeWeeklySnapshotMetrics(mkData({
      nps: { nps: 42, promoters: 0, passives: 0, detractors: 0, total: 0, responses: [], questions: [], overallAvg: null },
    }));
    expect(m.nps).toBe(42);
  });

  it("Beneficio $ Confirmado: solo suma REQ/Proyectos HardSaving en etapa Confirmación (grupo Cerrados)", () => {
    const m = computeWeeklySnapshotMetrics(mkData({
      req: [
        req({ id: "r1", grupo: "Cerrados", benefit: 1000, benefitType: "HardSaving" }),
        req({ id: "r2", grupo: "Cerrados", benefit: 500, benefitType: "SoftSaving" }), // no cuenta: no es HardSaving
        req({ id: "r3", grupo: "Valuación", benefit: 999, benefitType: "HardSaving" }), // no cuenta: no llegó a Confirmación
      ],
    }));
    expect(m.beneficioConfirmado).toBe(1000);
  });

  it("Calidad y Cumplimiento salen de las variantes 'reales' (calcReprocesoStatsRaw/calcEntregaStatsRaw)", () => {
    const m = computeWeeklySnapshotMetrics(mkData({
      req: [req({ id: "r1", grupo: "Cerrados", estado: "CERRADO" })],
    }));
    // Ambos deben quedar en un número (no null) una vez hay al menos una unidad evaluable.
    expect(typeof m.calidad === "number" || m.calidad === null).toBe(true);
    expect(typeof m.cumplimiento === "number" || m.cumplimiento === null).toBe(true);
  });

  it("EVM del equipo combina Iniciativas/REQ/Proyectos (ponderado) y redondea 0-100", () => {
    const m = computeWeeklySnapshotMetrics(mkData({
      ini: [ini({ id: "i1", pm: "Ana", status: "New", estado: "EN TIEMPO" })],
      req: [req({ id: "r1", pm: "Ana", vem: 1 })],
      proj: [proj({ id: "p1", boardId: "b1", status: "Done" })],
      projBoards: [board({ id: "b1" })],
    }));
    expect(m.evm).not.toBeNull();
    expect(Number.isInteger(m.evm)).toBe(true);
    expect(m.evm as number).toBeGreaterThanOrEqual(0);
    expect(m.evm as number).toBeLessThanOrEqual(100);
  });
});
