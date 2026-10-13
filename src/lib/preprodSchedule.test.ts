import { describe, it, expect } from "vitest";
import { ensurePreprodSchedule, PREPROD_FUTURE_COUNT, PREPROD_HISTORY_COUNT, PREPROD_INTERVAL_BUSINESS_DAYS } from "./preprodSchedule";
import { parseYMD } from "./business";

describe("ensurePreprodSchedule", () => {
  it("completa el futuro hasta 5 fechas, cada 14 días hábiles desde la última conocida", () => {
    const today = new Date(2026, 9, 13); // 2026-10-13
    const result = ensurePreprodSchedule(["2026-10-24", "2026-11-07"], today);
    expect(result).toEqual([
      "2026-10-24", "2026-11-07", "2026-11-26", "2026-12-16", "2027-01-05",
    ]);
    expect(result.length).toBe(PREPROD_FUTURE_COUNT); // sin histórico todavía (ambas son futuras)
  });

  it("recorta el histórico a las 3 fechas pasadas más recientes", () => {
    const today = new Date(2026, 11, 1); // 2026-12-01 — las primeras 6 ya pasaron
    const result = ensurePreprodSchedule(
      ["2026-09-01", "2026-09-15", "2026-09-29", "2026-10-13", "2026-10-27", "2026-11-10"],
      today,
    );
    const past = result.filter((d) => parseYMD(d)!.getTime() < today.getTime());
    const future = result.filter((d) => parseYMD(d)!.getTime() >= today.getTime());
    expect(past.length).toBe(PREPROD_HISTORY_COUNT);
    expect(past).toEqual(["2026-10-13", "2026-10-27", "2026-11-10"]); // las 3 más recientes, no las más viejas
    expect(future.length).toBe(PREPROD_FUTURE_COUNT);
  });

  it("no excluye asuetos del conteo — un feriado cuenta como día hábil normal", () => {
    // 11-dic-2026 (viernes) + 14 días hábiles cae el 31-dic-2026, un asueto
    // (Fin de Año) — y aun así se mantiene, no se corre a otro día.
    const today = new Date(2026, 11, 1);
    const result = ensurePreprodSchedule(["2026-12-11"], today);
    expect(result).toContain("2026-12-31");
  });

  it("sin fechas previas, ancla la generación en `today`", () => {
    const today = new Date(2026, 9, 13);
    const result = ensurePreprodSchedule([], today);
    expect(result.length).toBe(PREPROD_FUTURE_COUNT);
    expect(result[0]).toBe("2026-11-02"); // today + 14 días hábiles
  });

  it("PREPROD_INTERVAL_BUSINESS_DAYS es 14", () => {
    expect(PREPROD_INTERVAL_BUSINESS_DAYS).toBe(14);
  });

  it("ventana deslizante: al pasar una fecha se quita la más vieja del histórico y se agrega una nueva al futuro", () => {
    let dates: string[] = [];
    let today = new Date(2026, 9, 13); // 2026-10-13
    for (let i = 0; i < 10; i++) {
      dates = ensurePreprodSchedule(dates, today);
      const past = dates.filter((d) => parseYMD(d)!.getTime() < today.getTime());
      const future = dates.filter((d) => parseYMD(d)!.getTime() >= today.getTime());
      expect(future.length).toBe(PREPROD_FUTURE_COUNT); // siempre 5 a futuro
      expect(past.length).toBe(Math.min(i, PREPROD_HISTORY_COUNT)); // histórico crece hasta 3, nunca más
      today = new Date(today);
      today.setDate(today.getDate() + 28); // salta varios ciclos a la vez
    }
  });
});
