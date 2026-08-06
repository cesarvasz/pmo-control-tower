import { describe, it, expect } from "vitest";
import { decodificar, fechaDesdeSegundos } from "./roi";
import type { RoiPayload } from "@/types";

const EPOCA = Date.UTC(2024, 0, 1);

/** Empaqueta como lo hace el Apps Script: componentes locales dentro de un UTC. */
const seg = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) =>
  Math.round((Date.UTC(y, m - 1, d, h, mi, s) - EPOCA) / 1000);

const payload = (o: Partial<RoiPayload> = {}): RoiPayload => ({
  epoca: EPOCA,
  libres: ["c807_file"],
  textos: ["Cliente", "Mesa"],
  fechas: ["Creado", "DPR"],
  dicc: { Cliente: ["CLIENTE A", "CLIENTE B"], Mesa: ["Mesa 1", ""] },
  filas: [["GT-2025-1", 0, 0, seg(2026, 1, 5, 8), seg(2026, 1, 5, 9)]],
  ...o,
});

describe("fechaDesdeSegundos", () => {
  it("recupera la hora de pared exacta", () => {
    expect(fechaDesdeSegundos(EPOCA, seg(2026, 1, 5, 14, 30, 45))).toBe("2026-01-05T14:30:45");
  });

  it("no pierde los extremos del día ni el cambio de año", () => {
    expect(fechaDesdeSegundos(EPOCA, seg(2024, 12, 31, 23, 59, 59))).toBe("2024-12-31T23:59:59");
    expect(fechaDesdeSegundos(EPOCA, seg(2025, 7, 1, 0, 0, 0))).toBe("2025-07-01T00:00:00");
  });

  it("un hito que no ocurrió queda vacío, no en la época", () => {
    // Devolver "2024-01-01T00:00:00" haría creer que el hito sí pasó.
    expect(fechaDesdeSegundos(EPOCA, null)).toBe("");
  });
});

describe("decodificar", () => {
  it("reconstruye la fila con todas sus columnas", () => {
    const [r] = decodificar(payload());
    expect(r).toEqual({
      c807_file: "GT-2025-1",
      Cliente: "CLIENTE A",
      Mesa: "Mesa 1",
      Creado: "2026-01-05T08:00:00",
      DPR: "2026-01-05T09:00:00",
    });
  });

  it("resuelve cada índice contra el diccionario de SU columna", () => {
    // Mismo índice 1 en dos columnas distintas: no deben cruzarse.
    const [r] = decodificar(payload({ filas: [["F", 1, 1, null, null]] }));
    expect(r.Cliente).toBe("CLIENTE B");
    expect(r.Mesa).toBe("");
  });

  it("una fecha nula deja la columna vacía", () => {
    const [r] = decodificar(payload({ filas: [["F", 0, 0, seg(2026, 1, 5, 8), null]] }));
    expect(r.Creado).toBe("2026-01-05T08:00:00");
    expect(r.DPR).toBe("");
  });

  it("un índice fuera del diccionario da vacío, no undefined", () => {
    const [r] = decodificar(payload({ filas: [["F", 99, 0, null, null]] }));
    expect(r.Cliente).toBe("");
  });

  it("una columna nueva de la hoja llega como texto libre", () => {
    // El script manda en `libres` lo que no reconoce, para que fluya sola.
    const [r] = decodificar(payload({
      libres: ["c807_file", "ColumnaNueva"],
      filas: [["F", "valor nuevo", 0, 0, null, null]],
    }));
    expect((r as unknown as Record<string, string>).ColumnaNueva).toBe("valor nuevo");
    expect(r.Cliente).toBe("CLIENTE A");
  });

  it("una hoja vacía devuelve lista vacía", () => {
    expect(decodificar(payload({ filas: [] }))).toEqual([]);
  });

  it("es indiferente a la zona horaria de quien decodifica", () => {
    // El número codifica hora de pared, no un instante: el resultado no puede
    // depender del offset del servidor (Vercel corre en UTC, la PC no).
    const tz = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Kiritimati"; // UTC+14
      const a = decodificar(payload())[0].Creado;
      process.env.TZ = "Pacific/Midway"; // UTC-11
      const b = decodificar(payload())[0].Creado;
      expect(a).toBe("2026-01-05T08:00:00");
      expect(b).toBe(a);
    } finally {
      process.env.TZ = tz;
    }
  });
});
