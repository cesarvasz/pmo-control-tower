import { describe, it, expect } from "vitest";
import { calcNps, npsCfg } from "./nps";
import type { SheetRow } from "@/types";

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
    expect(npsCfg(75)!.label).toBe("PMO Estratégica");
    expect(npsCfg(60)!.label).toBe("PMO Gobernanza");
    expect(npsCfg(40)!.label).toBe("PMO Táctica");
    expect(npsCfg(10)!.label).toBe("PMO Soporte");
    expect(npsCfg(-5)!.label).toBe("PMO Riesgo");
  });
});
