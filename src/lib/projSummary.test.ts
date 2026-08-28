import { describe, it, expect } from "vitest";
import {
  flattenBoardUnits, calcProgress, calcPlannedProgress, buildPhaseSummaries, calcDelaySummary, calcCompletionEstimate,
} from "./projSummary";
import { today } from "./business";
import type { ProjItem, ProjSubitem } from "@/types";

const sub = (o: Partial<ProjSubitem>): ProjSubitem => ({ status: "", estado: "EN TIEMPO", deadline: null, actualEnd: null, entrega: null, ...o }) as ProjSubitem;
const item = (o: Partial<ProjItem>): ProjItem => ({ subitems: [], status: "", estado: "EN TIEMPO", deadline: null, endDate: null, entrega: null, grupo: "Fase", ...o }) as ProjItem;

const daysFromToday = (n: number): Date => {
  const d = today();
  d.setDate(d.getDate() + n);
  return d;
};

describe("flattenBoardUnits", () => {
  it("usa los subitems (hitos) cuando el item los tiene, no el item mismo", () => {
    const items = [item({ id: "i1", name: "Item con hitos", grupo: "Launch | Desarrollo", subitems: [sub({ id: "s1", name: "Hito 1" }), sub({ id: "s2", name: "Hito 2" })] })];
    const units = flattenBoardUnits(items);
    expect(units.map((u) => u.id)).toEqual(["s1", "s2"]);
    expect(units.every((u) => u.grupo === "Launch | Desarrollo")).toBe(true);
  });

  it("trae el responsable (dueño de la tarea) del hito/item, no una atribución de atraso", () => {
    const items = [
      item({ id: "i1", grupo: "Fase", responsible: "PM Item", subitems: [sub({ id: "s1", responsible: "Dev Hito" })] }),
      item({ id: "i2", grupo: "Fase", responsible: "PM Suelto" }),
    ];
    const units = flattenBoardUnits(items);
    expect(units.find((u) => u.id === "s1")?.responsible).toBe("Dev Hito");
    expect(units.find((u) => u.id === "i2")?.responsible).toBe("PM Suelto");
  });

  it("usa el item mismo cuando no tiene subitems", () => {
    const items = [item({ id: "i1", name: "Item suelto", grupo: "Valuación" })];
    const units = flattenBoardUnits(items);
    expect(units.map((u) => u.id)).toEqual(["i1"]);
  });
});

describe("calcProgress", () => {
  it("calcula % redondeado de unidades Done", () => {
    const units = flattenBoardUnits([
      item({ id: "1", status: "Done" }),
      item({ id: "2", status: "Working on it" }),
      item({ id: "3", status: "Working on it" }),
    ]);
    expect(calcProgress(units)).toEqual({ total: 3, done: 1, pct: 33 });
  });

  it("lista vacía → 0%", () => {
    expect(calcProgress([])).toEqual({ total: 0, done: 0, pct: 0 });
  });
});

describe("calcPlannedProgress", () => {
  it("cuenta Done + vencidos (aunque no estén Done) como 'debería estar hecho'", () => {
    const units = flattenBoardUnits([
      item({ id: "1", status: "Done" }),
      item({ id: "2", status: "Working on it", deadline: daysFromToday(-3) }), // vencido, no Done
      item({ id: "3", status: "Working on it", deadline: daysFromToday(5) }),  // aún no vence
    ]);
    expect(calcPlannedProgress(units)).toBe(67); // 2 de 3
  });

  it("lista vacía → 0", () => {
    expect(calcPlannedProgress([])).toBe(0);
  });
});

describe("buildPhaseSummaries", () => {
  it("agrupa por grupo, en orden de aparición, con done/offTrack/started", () => {
    const units = flattenBoardUnits([
      item({ id: "1", grupo: "Valuación", status: "Done", estado: "EN TIEMPO" }),
      item({ id: "2", grupo: "Aprobación", status: "Working on it", estado: "ATRASADO" }),
      item({ id: "3", grupo: "Aprobación", status: "Future Steps", estado: "EN TIEMPO" }),
    ]);
    const phases = buildPhaseSummaries(units);
    expect(phases.map((p) => p.grupo)).toEqual(["Valuación", "Aprobación"]);
    expect(phases[0]).toMatchObject({ total: 1, done: 1, offTrack: false, started: true });
    expect(phases[1]).toMatchObject({ total: 2, done: 0, offTrack: true, started: true });
  });

  it("fase con todo en Future Steps → started=false", () => {
    const units = flattenBoardUnits([item({ id: "1", grupo: "Operación", status: "Future Steps" })]);
    expect(buildPhaseSummaries(units)[0].started).toBe(false);
  });
});

describe("calcDelaySummary", () => {
  it("cuenta atrasos activos y su peor atraso en días hábiles", () => {
    const units = flattenBoardUnits([
      item({ id: "1", status: "Working on it", estado: "ATRASADO", deadline: daysFromToday(-10) }),
      item({ id: "2", status: "Working on it", estado: "ATRASADO", deadline: daysFromToday(-3) }),
      item({ id: "3", status: "Working on it", estado: "EN TIEMPO", deadline: daysFromToday(5) }),
    ]);
    const d = calcDelaySummary(units);
    expect(d.overdueCount).toBe(2);
    expect(d.worstOverdueDays).toBeGreaterThan(0);
  });

  it("promedia el atraso (días hábiles) de hitos ya entregados con atraso", () => {
    const units = flattenBoardUnits([
      item({ id: "1", status: "Done", entrega: "late", deadline: new Date(2026, 0, 1), endDate: new Date(2026, 0, 6) }), // +3 hábiles
      item({ id: "2", status: "Done", entrega: "late", deadline: new Date(2026, 0, 1), endDate: new Date(2026, 0, 8) }), // +5 hábiles
    ]);
    const d = calcDelaySummary(units);
    expect(d.lateDoneCount).toBe(2);
    expect(d.avgSlipDays).toBe(4);
  });

  it("sin atrasos → todo en cero", () => {
    const units = flattenBoardUnits([item({ id: "1", status: "Done", entrega: "on-time" })]);
    expect(calcDelaySummary(units)).toEqual({ overdueCount: 0, worstOverdueDays: 0, lateDoneCount: 0, avgSlipDays: 0 });
  });
});

describe("calcCompletionEstimate", () => {
  it("todo Done → isComplete=true, estimatedFinish = fecha real más tardía", () => {
    const units = flattenBoardUnits([
      item({ id: "1", status: "Done", endDate: new Date(2026, 0, 10) }),
      item({ id: "2", status: "Done", endDate: new Date(2026, 0, 20) }),
    ]);
    const c = calcCompletionEstimate(units, 0);
    expect(c.isComplete).toBe(true);
    expect(c.actualFinish).toEqual(new Date(2026, 0, 20));
    expect(c.estimatedFinish).toEqual(new Date(2026, 0, 20));
  });

  it("con pendientes y sin atraso histórico → estimatedFinish = plannedFinish", () => {
    const units = flattenBoardUnits([
      item({ id: "1", status: "Done", endDate: daysFromToday(-5) }),
      item({ id: "2", status: "Working on it", deadline: daysFromToday(10) }),
    ]);
    const c = calcCompletionEstimate(units, 0);
    expect(c.plannedFinish).toEqual(daysFromToday(10));
    expect(c.estimatedFinish).toEqual(c.plannedFinish);
    expect(c.scheduleSlipDays).toBe(0);
  });

  it("plan ya vencido → arranca desde hoy y le suma el atraso promedio", () => {
    const units = flattenBoardUnits([item({ id: "1", status: "Working on it", deadline: daysFromToday(-15) })]);
    const c = calcCompletionEstimate(units, 4);
    expect(c.scheduleSlipDays).toBeGreaterThan(0);
    expect(c.estimatedFinish!.getTime()).toBeGreaterThan(today().getTime());
  });

  it("sin ningún deadline pendiente → no hay estimado posible", () => {
    const units = flattenBoardUnits([item({ id: "1", status: "Working on it", deadline: null })]);
    const c = calcCompletionEstimate(units, 0);
    expect(c.plannedFinish).toBeNull();
    expect(c.estimatedFinish).toBeNull();
  });
});
