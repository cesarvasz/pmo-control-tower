import { describe, it, expect } from "vitest";
import { calcProjEstado, calcProjEntrega, deriveBoardHealth } from "./proj";
import { today } from "./business";

const daysFromToday = (n: number): Date => {
  const d = today();
  d.setDate(d.getDate() + n);
  return d;
};

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
