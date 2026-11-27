import { describe, it, expect } from "vitest";
import {
  fechaPared, segundosHabilesEntre, segundosHabilesAcumulados, leerFecha, fmtHabil, fmtFechaHora, claveMes,
} from "./horario008";

/** "yyyy-mm-dd hh:mm[:ss]" → segundos de hora de pared. */
const t = (s: string) => {
  const v = leerFecha(s);
  if (v == null) throw new Error(`fecha inválida en el test: ${s}`);
  return v;
};
const entre = (a: string, b: string) => fmtHabil(segundosHabilesEntre(t(a), t(b)));

describe("horas hábiles L–V 8:00–18:00 corrido", () => {
  it("vie 17:00 → lun 09:00 = 02:00:00", () => {
    expect(entre("2026-11-20 17:00", "2026-11-23 09:00")).toBe("02:00:00");
  });

  it("sábado completo no cuenta: sáb 10:00 → sáb 15:00 = 00:00:00", () => {
    expect(entre("2026-11-21 10:00", "2026-11-21 15:00")).toBe("00:00:00");
  });

  it("antes de las 8:00 cuenta desde las 8:00: lun 07:00 → lun 08:30 = 00:30:00", () => {
    expect(entre("2026-11-23 07:00", "2026-11-23 08:30")).toBe("00:30:00");
  });

  it("después de las 18:00 cuenta hasta las 18:00: mié 20:00 → jue 08:15 = 00:15:00", () => {
    expect(entre("2026-11-25 20:00", "2026-11-26 08:15")).toBe("00:15:00");
  });

  it("una semana completa son 50 h: lun 09:00 → lun 09:00 = 50:00:00", () => {
    expect(entre("2026-11-23 09:00", "2026-11-30 09:00")).toBe("50:00:00");
  });

  it("sale negativo si el fin es anterior al inicio", () => {
    expect(entre("2026-11-23 09:00", "2026-11-20 17:00")).toBe("−02:00:00");
  });

  it("no hay hora de almuerzo ni viernes corto", () => {
    expect(entre("2026-11-27 12:00", "2026-11-27 18:00")).toBe("06:00:00"); // viernes
    expect(entre("2026-11-23 08:00", "2026-11-23 18:00")).toBe("10:00:00");
  });

  it("F(t) es monótona y vale lo mismo en todo un fin de semana", () => {
    const vie18 = segundosHabilesAcumulados(t("2026-11-20 18:00"));
    expect(segundosHabilesAcumulados(t("2026-11-21 03:00"))).toBe(vie18);
    expect(segundosHabilesAcumulados(t("2026-11-22 23:59:59"))).toBe(vie18);
    expect(segundosHabilesAcumulados(t("2026-11-23 08:00"))).toBe(vie18);
  });

  it("fechas anteriores a la base (1970) también funcionan", () => {
    expect(fmtHabil(segundosHabilesEntre(fechaPared(1969, 12, 31, 9), fechaPared(1970, 1, 2, 9)))).toBe("20:00:00");
  });
});

describe("leerFecha", () => {
  it("número de serie 46352.626748 = 2026-11-26 15:02:31", () => {
    expect(fmtFechaHora(leerFecha(46352.626748), true)).toBe("2026-11-26 15:02:31");
    expect(fmtFechaHora(leerFecha("46352.626748"), true)).toBe("2026-11-26 15:02:31");
  });

  it("texto con espacio o con T, con o sin segundos", () => {
    expect(leerFecha("2026-01-01 23:59:16")).toBe(fechaPared(2026, 1, 1, 23, 59, 16));
    expect(leerFecha("2026-01-01T23:59:16")).toBe(fechaPared(2026, 1, 1, 23, 59, 16));
    expect(leerFecha("2026-01-01 23:59")).toBe(fechaPared(2026, 1, 1, 23, 59));
  });

  it("no aplica zona horaria: un sufijo Z o -06:00 se ignora", () => {
    expect(leerFecha("2026-11-26T15:02:31.000Z")).toBe(fechaPared(2026, 11, 26, 15, 2, 31));
    expect(leerFecha("2026-11-26T15:02:31-06:00")).toBe(fechaPared(2026, 11, 26, 15, 2, 31));
  });

  it("dd/mm/yyyy con día primero", () => {
    expect(leerFecha("12/02/2026 10:23:27")).toBe(fechaPared(2026, 2, 12, 10, 23, 27));
  });

  it("objeto Date: toma sus componentes locales, sin pasar a UTC", () => {
    expect(leerFecha(new Date(2026, 0, 2, 0, 8, 12))).toBe(fechaPared(2026, 1, 2, 0, 8, 12));
  });

  it("vacíos y basura → null", () => {
    for (const v of [null, undefined, "", "   ", "pendiente", 0, -5, new Date(NaN), "2026-13-01"]) {
      expect(leerFecha(v)).toBeNull();
    }
  });
});

describe("formato", () => {
  it("hh:mm:ss sin tope de horas y con signo", () => {
    expect(fmtHabil(942 * 3600 + 22 * 60 + 16)).toBe("942:22:16");
    expect(fmtHabil(-(255 * 3600 + 29 * 60 + 10))).toBe("−255:29:10");
    expect(fmtHabil(0)).toBe("00:00:00");
    expect(fmtHabil(0.4)).toBe("00:00:00");
    expect(fmtHabil(null)).toBe("—");
  });

  it("clave de mes", () => {
    expect(claveMes(fechaPared(2026, 1, 31, 23, 59, 59))).toBe("2026-01");
  });
});
