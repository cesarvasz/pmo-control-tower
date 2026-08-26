import { describe, it, expect } from "vitest";
import {
  construirRegistros, minutosHabiles, costoClonacion, aplicarFiltros, distribucionRangos,
  FILTROS_VACIOS, TARIFA_CLONACION_DEFECTO,
  type ClonacionRegistro,
} from "./clonaciones";
import type { ClonacionRow } from "@/types";

// 2026-01-05 es lunes (misma semana de referencia que horario.test.ts).
const row = (file: string, usuario: string, cliente: string, solicitud: string, creacion: string): ClonacionRow => ({
  c807_file: file, Solicitud_fecha: solicitud, Creacion_Fecha: creacion, Usuario: usuario, Cliente: cliente,
});

const seg = (solicitud: string, creacion: string): number | null =>
  construirRegistros([row("F", "U", "C", solicitud, creacion)])[0].segHabiles;

describe("D2 · minutos hábiles (a través de construirRegistros)", () => {
  const casos: [string, string, string, number][] = [
    ["Lun 09:00 → Lun 11:30", "2026-01-05T09:00:00", "2026-01-05T11:30:00", 150],
    ["Lun 12:30 → Lun 14:30 (cruza almuerzo)", "2026-01-05T12:30:00", "2026-01-05T14:30:00", 60],
    ["Lun 17:00 → Mar 09:00", "2026-01-05T17:00:00", "2026-01-06T09:00:00", 120],
    ["Vie 16:00 → Lun 09:00 (fin de semana)", "2026-01-09T16:00:00", "2026-01-12T09:00:00", 120],
    ["Lun 08:00 → Vie 17:00", "2026-01-05T08:00:00", "2026-01-09T17:00:00", 2640],
    ["Sáb 10:00 → Sáb 15:00", "2026-01-10T10:00:00", "2026-01-10T15:00:00", 0],
    ["Vie 18:00 → Lun 08:00", "2026-01-09T18:00:00", "2026-01-12T08:00:00", 0],
    ["Lun 07:00 → Lun 08:30 (antes de abrir)", "2026-01-05T07:00:00", "2026-01-05T08:30:00", 30],
    ["Jue 17:00 → Vie 17:30 (viernes cierra 17:00)", "2026-01-08T17:00:00", "2026-01-09T17:30:00", 540],
  ];

  it.each(casos)("%s → %s min", (_label, solicitud, creacion, esperado) => {
    expect(minutosHabiles(seg(solicitud, creacion))).toBe(esperado);
  });
});

describe("D2 · reglas de vacío y anómalo", () => {
  it("sin Solicitud_fecha, las columnas derivadas quedan vacías pero la fila se conserva", () => {
    const [r] = construirRegistros([row("F", "U", "C", "", "2026-01-05T09:00:00")]);
    expect(r).toBeDefined();
    expect(r.segHabiles).toBeNull();
    expect(r.diasAntiguedad).toBeNull();
    expect(r.anomalo).toBe(false);
  });

  it("sin Creacion_Fecha, la fila se descarta (no hay mes al que atribuirla)", () => {
    expect(construirRegistros([row("F", "U", "C", "2026-01-05T09:00:00", "")])).toHaveLength(0);
  });

  it("Solicitud_fecha > Creacion_Fecha: Minutos_Habiles = 0 y Anomalo = TRUE", () => {
    const [r] = construirRegistros([row("F", "U", "C", "2026-01-06T09:00:00", "2026-01-05T09:00:00")]);
    expect(r.segHabiles).toBe(0);
    expect(r.anomalo).toBe(true);
  });
});

describe("D3 · costo — unión de intervalos por usuario (tarifa $6)", () => {
  const H = (n: number) => n; // documenta que las cifras de abajo ya están en horas

  it("un usuario, 3 h seguidas → 3.00 h efectivas · $18.00", () => {
    const regs = construirRegistros([row("F1", "ANA", "C", "2026-01-05T08:00:00", "2026-01-05T11:00:00")]);
    const c = costoClonacion(regs, TARIFA_CLONACION_DEFECTO);
    expect(c.horasEfectivas).toBeCloseTo(H(3), 5);
    expect(c.costoTotal).toBeCloseTo(18, 5);
  });

  it("un usuario, dos files simultáneos de 3 h → 6 h sumadas · 3 h efectivas · $18.00", () => {
    const regs = construirRegistros([
      row("F1", "ANA", "C", "2026-01-05T08:00:00", "2026-01-05T11:00:00"),
      row("F2", "ANA", "C", "2026-01-05T08:00:00", "2026-01-05T11:00:00"),
    ]);
    const c = costoClonacion(regs, TARIFA_CLONACION_DEFECTO);
    expect(c.horasSuma).toBeCloseTo(6, 5);
    expect(c.horasEfectivas).toBeCloseTo(3, 5);
    expect(c.costoTotal).toBeCloseTo(18, 5);
  });

  it("un usuario, files de 09–12 y 11–13 → 5.00 h sumadas · 4.00 h efectivas", () => {
    const regs = construirRegistros([
      row("F1", "ANA", "C", "2026-01-05T09:00:00", "2026-01-05T12:00:00"),
      row("F2", "ANA", "C", "2026-01-05T11:00:00", "2026-01-05T13:00:00"),
    ]);
    const c = costoClonacion(regs, TARIFA_CLONACION_DEFECTO);
    expect(c.horasSuma).toBeCloseTo(5, 5);
    expect(c.horasEfectivas).toBeCloseTo(4, 5);
  });

  it("dos usuarios distintos, 3 h cada uno en paralelo → 6.00 h efectivas · $36.00 (no se unen entre personas)", () => {
    const regs = construirRegistros([
      row("F1", "ANA", "C", "2026-01-05T08:00:00", "2026-01-05T11:00:00"),
      row("F2", "LUIS", "C", "2026-01-05T08:00:00", "2026-01-05T11:00:00"),
    ]);
    const c = costoClonacion(regs, TARIFA_CLONACION_DEFECTO);
    expect(c.horasEfectivas).toBeCloseTo(6, 5);
    expect(c.costoTotal).toBeCloseTo(36, 5);
  });

  it("un usuario, vie 16:00 → lun 09:00 → 120 min (2 h) efectivos", () => {
    const regs = construirRegistros([row("F1", "ANA", "C", "2026-01-09T16:00:00", "2026-01-12T09:00:00")]);
    const c = costoClonacion(regs, TARIFA_CLONACION_DEFECTO);
    expect(c.horasEfectivas).toBeCloseTo(2, 5);
  });

  it("una fila anómala no aporta horas ni costo, aunque el checkbox de incluir anómalos esté en cualquier estado", () => {
    const regs = construirRegistros([row("F1", "ANA", "C", "2026-01-06T09:00:00", "2026-01-05T09:00:00")]);
    const c = costoClonacion(regs, TARIFA_CLONACION_DEFECTO);
    expect(c.horasEfectivas).toBe(0);
    expect(c.costoTotal).toBe(0);
  });
});

describe("D4 · la suma de los meses da exactamente el total", () => {
  it("con tramos que cruzan fin de mes y se traslapan entre files", () => {
    const regs: ClonacionRegistro[] = construirRegistros([
      // ANA: un tramo que cruza de enero a febrero.
      row("F1", "ANA", "C", "2026-01-30T08:00:00", "2026-02-02T18:00:00"),
      // ANA: otro tramo, ya en febrero, que se traslapa con files de LUIS.
      row("F2", "ANA", "C", "2026-02-10T08:00:00", "2026-02-10T13:00:00"),
      // LUIS: varios files traslapados dentro de febrero.
      row("F3", "LUIS", "C", "2026-02-05T08:00:00", "2026-02-05T12:00:00"),
      row("F4", "LUIS", "C", "2026-02-05T10:00:00", "2026-02-05T15:00:00"),
      // Un tercer usuario, solo en marzo.
      row("F5", "PEPE", "C", "2026-03-02T08:00:00", "2026-03-02T17:00:00"),
    ]);
    const c = costoClonacion(regs, TARIFA_CLONACION_DEFECTO);
    const sumaMeses = c.serie.reduce((s, p) => s + p.costo, 0);
    expect(sumaMeses).toBeCloseTo(c.costoTotal, 6);
    const sumaHoras = c.serie.reduce((s, p) => s + p.horas, 0);
    expect(sumaHoras).toBeCloseTo(c.horasEfectivas, 6);
  });
});

describe("C4 · la distribución se calcula sin su propio filtro", () => {
  const base = construirRegistros([
    row("F1", "U", "C", "2026-01-05T08:00:00", "2026-01-05T08:10:00"), // r1
    row("F2", "U", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00"), // r4 (1h)
    row("F3", "U", "C", "2026-01-05T08:00:00", "2026-01-09T17:00:00"), // r8 (44h)
  ]);

  it("las 8 barras siguen mostrando el total sin importar cuál esté seleccionada", () => {
    const sinFiltro = distribucionRangos(base, FILTROS_VACIOS);
    const conR1 = distribucionRangos(base, { ...FILTROS_VACIOS, rango: "r1" });
    expect(sinFiltro.reduce((s, r) => s + r.n, 0)).toBe(3);
    expect(conR1.reduce((s, r) => s + r.n, 0)).toBe(3);
  });

  it("pero el tablero (aplicarFiltros) sí se reduce al bucket elegido", () => {
    const filtrados = aplicarFiltros(base, { ...FILTROS_VACIOS, rango: "r1" });
    expect(filtrados).toHaveLength(1);
    expect(filtrados[0].file).toBe("F1");
  });
});

describe("C1 · filtro de antigüedad máxima de la solicitud", () => {
  const base = construirRegistros([
    // Solicitud pegada de hace más de un año respecto a la creación.
    row("F1", "U", "C", "2024-01-01T08:00:00", "2026-01-05T09:00:00"),
    row("F2", "U", "C", "2026-01-04T08:00:00", "2026-01-05T09:00:00"),
  ]);

  it("por defecto (sin límite) no excluye nada", () => {
    expect(aplicarFiltros(base, FILTROS_VACIOS)).toHaveLength(2);
  });

  it("con 30 días excluye la solicitud vieja", () => {
    const filtrados = aplicarFiltros(base, { ...FILTROS_VACIOS, antiguedadMax: "30" });
    expect(filtrados).toHaveLength(1);
    expect(filtrados[0].file).toBe("F2");
  });
});
