import { describe, it, expect } from "vitest";
import {
  flattenBoardUnits, calcProgress, calcPlannedProgress, buildPhaseSummaries, groupFase3Units, calcDelaySummary, calcCompletionEstimate,
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

  it("stepId/stepName: los hitos de un item apuntan al item padre; un item sin subitems apunta a sí mismo", () => {
    const items = [
      item({ id: "i1", name: "Desarrollo por iteraciones", grupo: "Launch", subitems: [sub({ id: "s1", name: "Hito 1" }), sub({ id: "s2", name: "Hito 2" })] }),
      item({ id: "i2", name: "Item suelto", grupo: "Valuación" }),
    ];
    const units = flattenBoardUnits(items);
    expect(units.find((u) => u.id === "s1")).toMatchObject({ stepId: "i1", stepName: "Desarrollo por iteraciones" });
    expect(units.find((u) => u.id === "s2")).toMatchObject({ stepId: "i1", stepName: "Desarrollo por iteraciones" });
    expect(units.find((u) => u.id === "i2")).toMatchObject({ stepId: "i2", stepName: "Item suelto" });
  });

  it("startDate/stepStartDate: startDate es el de la propia unidad (hito o item suelto); stepStartDate es el del item padre", () => {
    const iniHito = daysFromToday(-30), iniItem = daysFromToday(-20), iniSuelto = daysFromToday(-10);
    const items = [
      item({ id: "i1", name: "Desarrollo por iteraciones", grupo: "Launch", startDate: iniItem, subitems: [sub({ id: "s1", name: "Hito 1", startDate: iniHito })] }),
      item({ id: "i2", name: "Item suelto", grupo: "Valuación", startDate: iniSuelto }),
    ];
    const units = flattenBoardUnits(items);
    expect(units.find((u) => u.id === "s1")).toMatchObject({ startDate: iniHito, stepStartDate: iniItem });
    expect(units.find((u) => u.id === "i2")).toMatchObject({ startDate: iniSuelto, stepStartDate: iniSuelto });
  });
});

describe("groupFase3Units (Fase 3: steps o hitos según la plantilla)", () => {
  it("plantilla vieja: un grupo POR HITO del step \"Desarrollo por iteraciones...\", ignorando los demás checkpoints de la fase", () => {
    const items = [
      item({ id: "analisis", name: "Analisis técnico", grupo: "Launch | Desarrollo", status: "Done" }),
      item({ id: "desarrollo", name: "Desarrollo por iteraciones (Hitos)", grupo: "Launch | Desarrollo", status: "Working on it",
        subitems: [sub({ id: "h1", name: "Hito 1", status: "Done" }), sub({ id: "h2", name: "Hito 2", status: "Working on it" })] }),
    ];
    const units = flattenBoardUnits(items);
    const groups = groupFase3Units(units, "Launch | Desarrollo");
    expect(groups.map((g) => g.name)).toEqual(["Hito 1", "Hito 2"]);
    expect(groups.every((g) => g.units.length === 1)).toBe(true);
  });

  it("plantilla nueva: un grupo POR ITEM (step) de la fase, con sus hitos agrupados", () => {
    const items = [
      item({ id: "poc", name: "POC", grupo: "Launch | Lanzamiento", subitems: [sub({ id: "h1", status: "Done" }), sub({ id: "h2", status: "Working on it" })] }),
      item({ id: "xd", name: "xDocking", grupo: "Launch | Lanzamiento", subitems: [sub({ id: "h3", status: "Done" })] }),
    ];
    const units = flattenBoardUnits(items);
    const groups = groupFase3Units(units, "Launch | Lanzamiento");
    expect(groups.map((g) => g.name)).toEqual(["POC", "xDocking"]);
    expect(groups.find((g) => g.name === "POC")?.units.length).toBe(2);
  });
});

describe("calcProgress (avance ponderado: cada FASE pesa 1 unidad; Fase 3 se abre en sus steps/hitos, ver groupFase3Units)", () => {
  it("sin Fase 3: cada fase pesa 1 unidad con su propia fracción done/total — no cuenta hitos sueltos", () => {
    const items = [
      item({ id: "1", grupo: "Valuación", status: "Done" }),
      item({ id: "2", grupo: "Aprobación", status: "Working on it" }),
    ];
    const units = flattenBoardUnits(items);
    const phases = buildPhaseSummaries(units);
    // Valuación 1/1 (100%) · Aprobación 0/1 (0%) → promedio 50%, 1 de 2 unidades 100% completa
    expect(calcProgress(units, phases)).toEqual({ total: 2, done: 1, pct: 50 });
  });

  it("una fase A MEDIAS aporta su fracción real (no binaria: ni 0% ni 100%)", () => {
    const items = [
      item({ id: "a", grupo: "Aprobación", subitems: [sub({ id: "h1", status: "Done" }), sub({ id: "h2" }), sub({ id: "h3" }), sub({ id: "h4" })] }),
    ];
    const units = flattenBoardUnits(items);
    const phases = buildPhaseSummaries(units);
    // 1 fase, 1/4 hitos Done → esa fase pesa 1 unidad con 25% de avance (no 0%)
    expect(calcProgress(units, phases)).toEqual({ total: 1, done: 0, pct: 25 });
  });

  it("Fase 3 con 4 items (plantilla nueva): pesan como 4 unidades cada uno, no 1 sola para toda la fase — combinado con las otras 4 fases da 8 unidades en total", () => {
    const items = [
      item({ id: "v", grupo: "Valuación", status: "Done" }),
      item({ id: "a", grupo: "Aprobación", status: "Done" }),
      item({ id: "poc", name: "POC", grupo: "Launch | Lanzamiento", status: "Done" }),
      item({ id: "xd", name: "xDocking", grupo: "Launch | Lanzamiento", status: "Done" }),
      item({ id: "gps", name: "GPS", grupo: "Launch | Lanzamiento", status: "Working on it" }),
      item({ id: "vid", name: "Video", grupo: "Launch | Lanzamiento", status: "Working on it" }),
      item({ id: "o", grupo: "Operación", status: "Working on it" }),
      item({ id: "r", grupo: "Revisión", status: "Working on it" }),
    ];
    const units = flattenBoardUnits(items);
    const phases = buildPhaseSummaries(units);
    // 4 fases (Valuación/Aprobación/Operación/Revisión) + 4 items de Fase 3 = 8 unidades
    const result = calcProgress(units, phases);
    expect(result.total).toBe(8);
    expect(result.done).toBe(4); // Valuación, Aprobación, POC, xDocking → 100% completas
    expect(result.pct).toBe(50); // (1+1+1+1+0+0+0+0)/8
  });

  it("lista vacía → 0%", () => {
    expect(calcProgress([], [])).toEqual({ total: 0, done: 0, pct: 0 });
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
