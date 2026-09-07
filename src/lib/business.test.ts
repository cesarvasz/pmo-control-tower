import { describe, it, expect } from "vitest";
import {
  businessDays,
  unionBusinessDays,
  addBusinessDays,
  fmtDate,
  isToday,
  today,
  parseYMD,
  parseCreation,
  fmtMoney,
} from "./business";

// Fechas de referencia 2026 (calendario real):
//   jue 01-ene · lun 05-ene · vie 09-ene · lun 12-ene · mié 31-dic-2025
// Asuetos usados: 2026-01-01 (Año Nuevo).
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("businessDays", () => {
  it("cuenta lun→vie excluyendo el día inicial", () => {
    // lun 5 → vie 9: mar,mié,jue,vie = 4
    expect(businessDays(d(2026, 1, 5), d(2026, 1, 9))).toBe(4);
  });

  it("salta el fin de semana", () => {
    // vie 9 → lun 12: sáb,dom no cuentan → lun = 1
    expect(businessDays(d(2026, 1, 9), d(2026, 1, 12))).toBe(1);
  });

  it("mismo día = 0 (excluye el inicio)", () => {
    expect(businessDays(d(2026, 1, 5), d(2026, 1, 5))).toBe(0);
  });

  it("descuenta asuetos con skipHolidays=true", () => {
    // mié 31-dic-2025 → vie 2-ene: jue 1-ene (asueto), vie 2-ene
    expect(businessDays(d(2025, 12, 31), d(2026, 1, 2), false)).toBe(2);
    expect(businessDays(d(2025, 12, 31), d(2026, 1, 2), true)).toBe(1);
  });
});

describe("unionBusinessDays", () => {
  // hoy fijo para todos los casos: lun 2026-01-12
  const hoy = d(2026, 1, 12);

  it("un solo rango = businessDays normal", () => {
    expect(unionBusinessDays([{ start: d(2026, 1, 5), end: hoy }])).toBe(businessDays(d(2026, 1, 5), hoy));
  });

  it("rangos que terminan el mismo día (ej. varios steps atrasados HOY): la unión = el rango más largo, NO la suma de todos", () => {
    // lun 5 → hoy (12): 5 días hábiles. vie 9 → hoy: 1 día hábil. Se solapan
    // por completo (el segundo cae dentro del primero) — sumar daría 6, la
    // unión real es 5.
    const union = unionBusinessDays([{ start: d(2026, 1, 5), end: hoy }, { start: d(2026, 1, 9), end: hoy }]);
    expect(union).toBe(businessDays(d(2026, 1, 5), hoy)); // 5
    expect(union).not.toBe(businessDays(d(2026, 1, 5), hoy) + businessDays(d(2026, 1, 9), hoy));
  });

  it("rangos disjuntos SÍ se suman (no hay días en común)", () => {
    // vie 9-dic-2025 → mar 30-dic-2025 (3 días hábiles) y otro separado que
    // no toca al primero: mié 31-dic-2025 → hoy (12-ene). Sin solape.
    const r1 = { start: d(2025, 12, 9), end: d(2025, 12, 10) }; // 1 día (mié 10)
    const r2 = { start: d(2025, 12, 31), end: d(2026, 1, 2) };  // 1 día (vie 2, sin skipHolidays cuenta jue+vie=2)
    expect(unionBusinessDays([r1, r2])).toBe(businessDays(r1.start, r1.end) + businessDays(r2.start, r2.end));
  });

  it("rangos parcialmente solapados: cada día en común cuenta una sola vez", () => {
    // A: lun 5 → jue 8 (mar,mié,jue = 3). B: mié 7 → hoy 12 (jue,vie,lun=3,
    // ya que 7 es miércoles: jue8,vie9,lun12 = 3). Unión real: mar6..lun12
    // hábiles = mar,mié,jue,vie,lun = 5 (sáb/dom no cuentan).
    const A = { start: d(2026, 1, 5), end: d(2026, 1, 8) };
    const B = { start: d(2026, 1, 7), end: hoy };
    expect(unionBusinessDays([A, B])).toBe(5);
  });

  it("sin rangos válidos → 0", () => {
    expect(unionBusinessDays([])).toBe(0);
    expect(unionBusinessDays([{ start: hoy, end: hoy }])).toBe(0); // rango vacío (start === end)
  });
});

describe("addBusinessDays", () => {
  it("suma un día hábil", () => {
    expect(addBusinessDays(d(2026, 1, 5), 1)).toEqual(d(2026, 1, 6));
  });

  it("salta el fin de semana al sumar", () => {
    // vie 9 + 1 hábil = lun 12
    expect(addBusinessDays(d(2026, 1, 9), 1)).toEqual(d(2026, 1, 12));
  });

  it("resta días hábiles con n negativo", () => {
    // lun 12 - 1 hábil = vie 9
    expect(addBusinessDays(d(2026, 1, 12), -1)).toEqual(d(2026, 1, 9));
  });

  it("n=0 devuelve la misma fecha normalizada a medianoche", () => {
    const r = addBusinessDays(new Date(2026, 0, 5, 13, 30), 0);
    expect(r).toEqual(d(2026, 1, 5));
    expect(r.getHours()).toBe(0);
  });

  it("salta asuetos con skipHolidays=true", () => {
    // mié 31-dic-2025 + 1 hábil: sin asuetos = jue 1-ene; con asuetos = vie 2-ene
    expect(addBusinessDays(d(2025, 12, 31), 1, false)).toEqual(d(2026, 1, 1));
    expect(addBusinessDays(d(2025, 12, 31), 1, true)).toEqual(d(2026, 1, 2));
  });
});

describe("fmtDate", () => {
  it("null/undefined → guion", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate(undefined)).toBe("—");
  });

  it("incluye día y año de la fecha", () => {
    const s = fmtDate(d(2026, 6, 2));
    expect(s).toContain("2026");
    expect(s).toContain("02");
    expect(s).not.toBe("—");
  });
});

describe("isToday", () => {
  it("true para ahora, false para null y otra fecha", () => {
    expect(isToday(new Date())).toBe(true);
    expect(isToday(null)).toBe(false);
    expect(isToday(d(2000, 1, 1))).toBe(false);
  });
});

describe("today", () => {
  it("devuelve hoy a medianoche local", () => {
    const t = today();
    const now = new Date();
    expect(t.getHours()).toBe(0);
    expect(t.getMinutes()).toBe(0);
    expect(t.getFullYear()).toBe(now.getFullYear());
    expect(t.getMonth()).toBe(now.getMonth());
    expect(t.getDate()).toBe(now.getDate());
  });
});

describe("parseYMD", () => {
  it("parsea YYYY-MM-DD a fecha local", () => {
    const r = parseYMD("2026-01-08");
    expect(r).not.toBeNull();
    expect(r!.getFullYear()).toBe(2026);
    expect(r!.getMonth()).toBe(0);
    expect(r!.getDate()).toBe(8);
  });

  it("toma solo la primera fecha de un rango 'timeline'", () => {
    const r = parseYMD("2026-01-08 - 2026-02-01");
    expect(r!.getDate()).toBe(8);
    expect(r!.getMonth()).toBe(0);
  });

  it("null para vacío o formato inválido", () => {
    expect(parseYMD(null)).toBeNull();
    expect(parseYMD("")).toBeNull();
    expect(parseYMD("   ")).toBeNull();
    expect(parseYMD("no es fecha")).toBeNull();
  });
});

describe("parseCreation", () => {
  it("parsea el formato pulse_log con sufijo UTC", () => {
    const r = parseCreation("2026-01-08 17:17:16 UTC");
    expect(r).not.toBeNull();
    expect(Number.isNaN(r!.getTime())).toBe(false);
    expect(r!.getFullYear()).toBe(2026);
  });

  it("null para null o cadena inválida", () => {
    expect(parseCreation(null)).toBeNull();
    expect(parseCreation("no es fecha")).toBeNull();
  });
});

describe("fmtMoney", () => {
  it("formatea enteros con separador de miles y $", () => {
    expect(fmtMoney(11000)).toBe("$11,000");
    expect(fmtMoney(1234567)).toBe("$1,234,567");
  });

  it("redondea a entero", () => {
    expect(fmtMoney(1234.7)).toBe("$1,235");
  });

  it("0/null/undefined → guion", () => {
    expect(fmtMoney(0)).toBe("—");
    expect(fmtMoney(null)).toBe("—");
    expect(fmtMoney(undefined)).toBe("—");
  });
});
