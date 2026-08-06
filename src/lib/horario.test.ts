import { describe, it, expect } from "vitest";
import {
  segundosHabiles,
  fmtHHMMSS,
  segundosJornada,
  enDiasHabiles,
  SEGUNDOS_SEMANA,
} from "./horario";

// Referencia de calendario usada en las pruebas (2026):
//   lun 5 ene · mar 6 · mié 7 · jue 8 · vie 9 · sáb 10 · dom 11 · lun 12 · vie 16
const d = (iso: string) => new Date(iso);
const H = 3600;

describe("segundosJornada", () => {
  it("lunes a jueves 9 h, viernes 8 h, fin de semana 0", () => {
    expect(segundosJornada(1)).toBe(9 * H);
    expect(segundosJornada(4)).toBe(9 * H);
    expect(segundosJornada(5)).toBe(8 * H);
    expect(segundosJornada(6)).toBe(0);
    expect(segundosJornada(0)).toBe(0);
  });

  it("la semana hábil suma 44 h", () => {
    const semana = [1, 2, 3, 4, 5].reduce((s, x) => s + segundosJornada(x), 0);
    expect(semana).toBe(SEGUNDOS_SEMANA);
    expect(semana).toBe(44 * H);
  });
});

describe("segundosHabiles · mismo día", () => {
  it("dentro de un solo tramo cuenta el tiempo exacto", () => {
    // lunes 09:00 → 11:30 = 2 h 30 min
    expect(segundosHabiles(d("2026-01-05T09:00:00"), d("2026-01-05T11:30:00"))).toBe(2.5 * H);
  });

  it("descuenta la hora de almuerzo al cruzarla", () => {
    // lunes 12:00 → 15:00 = 1 h (12–13) + 1 h (14–15) = 2 h, NO 3 h
    expect(segundosHabiles(d("2026-01-05T12:00:00"), d("2026-01-05T15:00:00"))).toBe(2 * H);
  });

  it("un rango contenido por completo en el almuerzo da 0", () => {
    expect(segundosHabiles(d("2026-01-05T13:10:00"), d("2026-01-05T13:50:00"))).toBe(0);
  });

  it("una jornada completa de lunes son 9 h", () => {
    expect(segundosHabiles(d("2026-01-05T08:00:00"), d("2026-01-05T18:00:00"))).toBe(9 * H);
  });

  it("una jornada completa de viernes son 8 h (cierra a las 17:00)", () => {
    expect(segundosHabiles(d("2026-01-09T08:00:00"), d("2026-01-09T18:00:00"))).toBe(8 * H);
  });
});

describe("segundosHabiles · inicio o fin fuera de horario hábil", () => {
  it("antes de abrir se recorta al inicio de la jornada", () => {
    // lunes 05:00 → 09:00 ⇒ solo 08:00–09:00 = 1 h
    expect(segundosHabiles(d("2026-01-05T05:00:00"), d("2026-01-05T09:00:00"))).toBe(1 * H);
  });

  it("después de cerrar se recorta al fin de la jornada", () => {
    // lunes 17:00 → 23:00 ⇒ solo 17:00–18:00 = 1 h
    expect(segundosHabiles(d("2026-01-05T17:00:00"), d("2026-01-05T23:00:00"))).toBe(1 * H);
  });

  it("ambos extremos fuera del horario del mismo día dan 0", () => {
    expect(segundosHabiles(d("2026-01-05T19:00:00"), d("2026-01-05T22:00:00"))).toBe(0);
    expect(segundosHabiles(d("2026-01-05T04:00:00"), d("2026-01-05T06:00:00"))).toBe(0);
  });

  it("de noche a la mañana siguiente solo cuenta el día siguiente", () => {
    // lunes 20:00 → martes 10:00 ⇒ martes 08:00–10:00 = 2 h
    expect(segundosHabiles(d("2026-01-05T20:00:00"), d("2026-01-06T10:00:00"))).toBe(2 * H);
  });
});

describe("segundosHabiles · cruce de días", () => {
  it("de una tarde a la mañana siguiente", () => {
    // lunes 17:00 → martes 09:00 ⇒ 1 h (lun 17–18) + 1 h (mar 8–9) = 2 h
    expect(segundosHabiles(d("2026-01-05T17:00:00"), d("2026-01-06T09:00:00"))).toBe(2 * H);
  });

  it("dos jornadas completas consecutivas", () => {
    // lunes 08:00 → martes 18:00 = 9 + 9 = 18 h
    expect(segundosHabiles(d("2026-01-05T08:00:00"), d("2026-01-06T18:00:00"))).toBe(18 * H);
  });

  it("de lunes a viernes completo = 44 h", () => {
    expect(segundosHabiles(d("2026-01-05T08:00:00"), d("2026-01-09T17:00:00"))).toBe(44 * H);
  });
});

describe("segundosHabiles · fin de semana de por medio", () => {
  it("el sábado y el domingo no aportan nada", () => {
    // viernes 16:00 → lunes 09:00 ⇒ 1 h (vie 16–17) + 1 h (lun 8–9) = 2 h
    expect(segundosHabiles(d("2026-01-09T16:00:00"), d("2026-01-12T09:00:00"))).toBe(2 * H);
  });

  it("un rango íntegramente en fin de semana da 0", () => {
    // sábado 10:00 → domingo 18:00
    expect(segundosHabiles(d("2026-01-10T10:00:00"), d("2026-01-11T18:00:00"))).toBe(0);
  });

  it("dos semanas completas = 88 h (verifica el atajo de semana entera)", () => {
    // lunes 5 ene 08:00 → viernes 16 ene 17:00 = 44 + 44 = 88 h
    expect(segundosHabiles(d("2026-01-05T08:00:00"), d("2026-01-16T17:00:00"))).toBe(88 * H);
  });

  it("el atajo de semana coincide con el recorrido día a día en un tramo largo", () => {
    // ~3 meses: el resultado debe ser idéntico al conteo directo, sin truncar.
    const ini = d("2026-01-05T09:17:00");
    const fin = d("2026-04-08T15:42:00");
    // Conteo de referencia, día a día, sin atajos.
    let esperado = 0;
    const cur = new Date(2026, 0, 5);
    while (cur <= new Date(2026, 3, 8)) {
      const tramos: [number, number][] =
        cur.getDay() >= 1 && cur.getDay() <= 4 ? [[8, 13], [14, 18]]
        : cur.getDay() === 5 ? [[8, 13], [14, 17]]
        : [];
      for (const [h1, h2] of tramos) {
        const a = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), h1).getTime();
        const b = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), h2).getTime();
        const lo = Math.max(a, ini.getTime());
        const hi = Math.min(b, fin.getTime());
        if (hi > lo) esperado += (hi - lo) / 1000;
      }
      cur.setDate(cur.getDate() + 1);
    }
    expect(segundosHabiles(ini, fin)).toBe(Math.round(esperado));
  });
});

describe("segundosHabiles · no trunca los tramos largos", () => {
  it("125 días calendario devuelven cientos de horas, sin tope", () => {
    // Caso real observado en el origen (GT-2026-37974): ~788 h hábiles.
    const seg = segundosHabiles(d("2026-01-05T08:00:00"), d("2026-05-11T08:00:00"));
    expect(seg / H).toBeGreaterThan(700);
  });

  it("no existe un techo cerca de las 100 h", () => {
    const seg = segundosHabiles(d("2026-01-05T08:00:00"), d("2026-02-05T08:00:00"));
    expect(seg / H).toBeGreaterThan(100);
  });
});

describe("segundosHabiles · casos degenerados", () => {
  it("fin anterior al inicio devuelve 0", () => {
    expect(segundosHabiles(d("2026-01-06T10:00:00"), d("2026-01-05T10:00:00"))).toBe(0);
  });

  it("fin igual al inicio devuelve 0", () => {
    expect(segundosHabiles(d("2026-01-05T10:00:00"), d("2026-01-05T10:00:00"))).toBe(0);
  });

  it("fechas nulas o inválidas devuelven 0", () => {
    expect(segundosHabiles(null, d("2026-01-05T10:00:00"))).toBe(0);
    expect(segundosHabiles(d("2026-01-05T10:00:00"), null)).toBe(0);
    expect(segundosHabiles(undefined, undefined)).toBe(0);
    expect(segundosHabiles(new Date("no-es-fecha"), d("2026-01-05T10:00:00"))).toBe(0);
  });

  it("diferencias de segundos se conservan (T2/T3 son casi instantáneos)", () => {
    expect(segundosHabiles(d("2026-01-05T10:00:00"), d("2026-01-05T10:00:03"))).toBe(3);
  });
});

describe("fmtHHMMSS", () => {
  it("formatea con dos dígitos por campo", () => {
    expect(fmtHHMMSS(0)).toBe("00:00:00");
    expect(fmtHHMMSS(3)).toBe("00:00:03");
    expect(fmtHHMMSS(3600)).toBe("01:00:00");
    expect(fmtHHMMSS(3661)).toBe("01:01:01");
  });

  it("las horas no tienen tope de 24", () => {
    expect(fmtHHMMSS(116045)).toBe("32:14:05");
    expect(fmtHHMMSS(856565)).toBe("237:56:05");
  });

  it("null o no finito → guion", () => {
    expect(fmtHHMMSS(null)).toBe("—");
    expect(fmtHHMMSS(undefined)).toBe("—");
    expect(fmtHHMMSS(NaN)).toBe("—");
  });
});

describe("enDiasHabiles", () => {
  it("una semana hábil son 5 días", () => {
    expect(enDiasHabiles(SEGUNDOS_SEMANA)).toBeCloseTo(5, 5);
  });

  it("una jornada media (8.8 h) es 1 día", () => {
    expect(enDiasHabiles(8.8 * H)).toBeCloseTo(1, 5);
  });

  it("null → null", () => {
    expect(enDiasHabiles(null)).toBeNull();
  });
});
