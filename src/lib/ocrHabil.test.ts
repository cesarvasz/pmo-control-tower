import { describe, it, expect } from "vitest";
import {
  segDeFecha, segmentosHabiles, unir, duracion, segundosDeUnion,
  diaSemana, pasoDeReloj, SEG_JORNADA,
} from "./ocrHabil";

const H = 3600;
const seg = (s: string) => segDeFecha(s) as number;

describe("segDeFecha", () => {
  it("parsea reloj de pared sin zona horaria", () => {
    expect(seg("2026-01-05T08:00:00")).toBe(seg("2026-01-05 08:00:00"));
    expect(seg("2026-01-05T09:00:00") - seg("2026-01-05T08:00:00")).toBe(H);
  });
  it("vacío / basura → null", () => {
    expect(segDeFecha("")).toBeNull();
    expect(segDeFecha("No encontrado")).toBeNull();
  });
});

describe("diaSemana", () => {
  it("2026-01-05 es lunes (1), 03 es sábado (6), 04 es domingo (0)", () => {
    expect(diaSemana(seg("2026-01-05T00:00:00"))).toBe(1);
    expect(diaSemana(seg("2026-01-03T12:00:00"))).toBe(6);
    expect(diaSemana(seg("2026-01-04T12:00:00"))).toBe(0);
  });
});

describe("segmentosHabiles — ventana L–V 08:00–18:00 corrido", () => {
  it("dentro de un día hábil: cuenta el intervalo tal cual", () => {
    expect(duracion(segmentosHabiles(seg("2026-01-05T09:00:00"), seg("2026-01-05T11:30:00"))))
      .toBe(2.5 * H);
  });

  it("recorta a 08:00–18:00 (sin descontar almuerzo)", () => {
    expect(duracion(segmentosHabiles(seg("2026-01-05T06:00:00"), seg("2026-01-05T20:00:00"))))
      .toBe(SEG_JORNADA); // 10 h corridas
  });

  it("salta sábado y domingo", () => {
    // viernes 17:00 → lunes 09:00
    const s = segmentosHabiles(seg("2026-01-02T17:00:00"), seg("2026-01-05T09:00:00"));
    expect(s).toHaveLength(2);
    expect(duracion(s)).toBe(1 * H + 1 * H); // vie 17–18 + lun 8–9
  });

  it("varios días laborales completos", () => {
    // lunes 08:00 → miércoles 18:00 = 3 jornadas
    expect(duracion(segmentosHabiles(seg("2026-01-05T08:00:00"), seg("2026-01-07T18:00:00"))))
      .toBe(3 * SEG_JORNADA);
  });

  it("intervalo que cae completo fuera de horario hábil → 0 (pero es un file válido)", () => {
    // sábado entero
    expect(segmentosHabiles(seg("2026-01-03T09:00:00"), seg("2026-01-03T17:00:00"))).toEqual([]);
    // domingo noche → lunes 06:00 (antes de abrir)
    expect(duracion(segmentosHabiles(seg("2026-01-04T22:00:00"), seg("2026-01-05T06:00:00")))).toBe(0);
  });

  it("fin ≤ inicio → []", () => {
    expect(segmentosHabiles(seg("2026-01-05T10:00:00"), seg("2026-01-05T10:00:00"))).toEqual([]);
  });
});

describe("unir / segundosDeUnion", () => {
  it("fusiona segmentos que se solapan o se tocan", () => {
    expect(unir([[0, 100], [50, 150], [200, 300], [300, 350]]))
      .toEqual([[0, 150], [200, 350]]);
  });
  it("cuenta cada instante una sola vez", () => {
    expect(segundosDeUnion([[0, 100], [50, 150]])).toBe(150);
  });
});

describe("pasoDeReloj", () => {
  it("devuelve pasos de reloj, no decimales", () => {
    expect(pasoDeReloj(40)).toBe(10);   // 40 min → paso de 10
    expect(pasoDeReloj(300)).toBe(60);  // 5 h → paso de 1 h
    expect(pasoDeReloj(0)).toBe(5);
  });
});
