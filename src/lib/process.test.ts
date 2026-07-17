import { describe, it, expect } from "vitest";
import {
  calcVem,
  healthStatusFromIndex,
  vemCfg,
  calcProjEstado,
  calcProjEntrega,
  deriveBoardHealth,
  nextOrLatest,
  iniItemStatus,
  calcNps,
  npsCfg,
  INI_ACTIVE_STS,
} from "./process";
import { today } from "./business";
import type { IniItem, CalMap, SheetRow } from "@/types";

const daysFromToday = (n: number): Date => {
  const d = today();
  d.setDate(d.getDate() + n);
  return d;
};

// ── VEM / salud (fuente única) ──────────────────────────────────────────
describe("calcVem", () => {
  it("promedia SPI, CPI y Scope", () => {
    expect(calcVem(1, 1, 1)).toBe(1);
    expect(calcVem(0.9, 1, 1)).toBeCloseTo(0.9667, 3);
  });
  it("null si falta cualquiera de los tres", () => {
    expect(calcVem(null, 1, 1)).toBeNull();
    expect(calcVem(1, null, 1)).toBeNull();
    expect(calcVem(1, 1, null)).toBeNull();
  });
});

describe("healthStatusFromIndex", () => {
  it("umbrales 0.95 (on-track) / 0.85 (in-risk) / resto (off-track)", () => {
    expect(healthStatusFromIndex(0.95)).toBe("on-track");
    expect(healthStatusFromIndex(0.94)).toBe("in-risk");
    expect(healthStatusFromIndex(0.85)).toBe("in-risk");
    expect(healthStatusFromIndex(0.84)).toBe("off-track");
  });
  it("null → null", () => {
    expect(healthStatusFromIndex(null)).toBeNull();
  });
});

describe("vemCfg", () => {
  it("mapea el índice a la config visual de salud", () => {
    expect(vemCfg(1).label).toBe("On Track");
    expect(vemCfg(0.9).label).toBe("At Risk");
    expect(vemCfg(0.5).label).toBe("Off Track");
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

// ── Proyectos ───────────────────────────────────────────────────────────
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

// ── Calendario ──────────────────────────────────────────────────────────
describe("nextOrLatest", () => {
  const mk = (d: Date) => ({ inicio: d, fin: d });
  it("null para vacío o indefinido", () => {
    expect(nextOrLatest(undefined)).toBeNull();
    expect(nextOrLatest([])).toBeNull();
  });
  it("prefiere la próxima futura", () => {
    const past = mk(daysFromToday(-5));
    const future = mk(daysFromToday(5));
    expect(nextOrLatest([past, future])).toBe(future);
  });
  it("si todas son pasadas, devuelve la última", () => {
    const a = mk(daysFromToday(-10));
    const b = mk(daysFromToday(-2));
    expect(nextOrLatest([a, b])).toBe(b);
  });
});

// ── Salud de iniciativas por item ───────────────────────────────────────
const iniItem = (o: Partial<IniItem>): IniItem => ({
  id: "A", name: "Ini", grupo: "New", pm: "PM", status: "New", benefit: "",
  estado: "EN TIEMPO", dias: 1, limite: 10, deadline: null, creacion: null, ...o,
});
const emptyCal: CalMap = new Map();
const calWithM1: CalMap = new Map([["A", { M1: [{ inicio: new Date(), fin: new Date() }], M2: [] }]]);

describe("iniItemStatus", () => {
  it("ATRASADO → off-track", () => {
    expect(iniItemStatus(iniItem({ estado: "ATRASADO" }))).toBe("off-track");
  });
  it("activa sin reunión: <3 días hábiles = in-risk, ≥3 = off-track", () => {
    expect(iniItemStatus(iniItem({ dias: 1 }), emptyCal)).toBe("in-risk");
    expect(iniItemStatus(iniItem({ dias: 5 }), emptyCal)).toBe("off-track");
  });
  it("con reunión agendada → on-track", () => {
    expect(iniItemStatus(iniItem({ dias: 5 }), calWithM1)).toBe("on-track");
  });
  it("estado no activo → on-track", () => {
    expect(INI_ACTIVE_STS.has("PM Aprobado")).toBe(false);
    expect(iniItemStatus(iniItem({ status: "PM Aprobado", dias: 5 }), emptyCal)).toBe("on-track");
  });
});

// ── NPS (encuesta desde Google Sheet) ───────────────────────────────────
describe("calcNps", () => {
  const rows: SheetRow[] = [
    { "Marca temporal": "2026-01-01", "Correo": "a@x.com", "Probabilidad recomiende": 10, "Razón": "top", "[Claridad]": "Totalmente de acuerdo" },
    { "Marca temporal": "2026-01-02", "Correo": "b@x.com", "Probabilidad recomiende": 8, "[Claridad]": "Neutral" },
    { "Marca temporal": "2026-01-03", "Correo": "c@x.com", "Probabilidad recomiende": 5, "[Claridad]": "En desacuerdo" },
  ];

  it("clasifica promotor/pasivo/detractor y calcula el NPS", () => {
    const r = calcNps(rows);
    expect(r.total).toBe(3);
    expect(r.promoters).toBe(1);
    expect(r.passives).toBe(1);
    expect(r.detractors).toBe(1);
    expect(r.nps).toBe(0); // (1 - 1) / 3 * 100
  });

  it("promedia el % Likert por pregunta (20% por nivel)", () => {
    const r = calcNps(rows);
    const q = r.questions.find((x) => x.question === "Claridad")!;
    expect(q.count).toBe(3);
    expect(q.avg).toBe(67); // (100 + 60 + 40) / 3
    expect(r.overallAvg).toBe(67);
  });

  it("excluye filas marcadas con 'X' en Columna 5", () => {
    const withExcluded: SheetRow[] = [
      ...rows,
      { "Marca temporal": "2026-01-04", "Correo": "d@x.com", "Probabilidad recomiende": 10, "Columna 5": "X" },
    ];
    expect(calcNps(withExcluded).total).toBe(3);
  });

  it("sin respuestas válidas → nps null", () => {
    expect(calcNps([]).nps).toBeNull();
  });
});

describe("npsCfg", () => {
  it("clasifica por rango", () => {
    expect(npsCfg(null)).toBeNull();
    expect(npsCfg(75)!.label).toBe("PMO EXCELENTE");
    expect(npsCfg(60)!.label).toBe("PMO BUENA");
    expect(npsCfg(40)!.label).toBe("PMO ACEPTABLE");
    expect(npsCfg(10)!.label).toBe("PMO BÁSICA");
    expect(npsCfg(-5)!.label).toBe("PMO EN RIESGO");
  });
});
