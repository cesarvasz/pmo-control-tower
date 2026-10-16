import { describe, it, expect } from "vitest";
import { playerPalette } from "./PmScoreboard";

const VERDE = "#3ecf4a", AMARILLO = "#ffd400", ROJO = "#ef4444", MORADO = "#9b30d0";

describe("playerPalette (rangos de la tabla de pago BPP)", () => {
  it("90 o más es verde, incluido +100%", () => {
    expect(playerPalette(100).bg).toBe(VERDE);
    expect(playerPalette(105).bg).toBe(VERDE);
    expect(playerPalette(99).bg).toBe(VERDE);
    expect(playerPalette(90).bg).toBe(VERDE);
  });

  it("89–80 es amarillo", () => {
    expect(playerPalette(89).bg).toBe(AMARILLO);
    expect(playerPalette(80).bg).toBe(AMARILLO);
  });

  it("79–70 es rojo", () => {
    expect(playerPalette(79).bg).toBe(ROJO);
    expect(playerPalette(70).bg).toBe(ROJO);
  });

  it("menos de 70 es morado", () => {
    expect(playerPalette(69).bg).toBe(MORADO);
    expect(playerPalette(0).bg).toBe(MORADO);
  });
});
