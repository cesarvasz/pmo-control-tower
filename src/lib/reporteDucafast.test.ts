import { describe, it, expect } from "vitest";
import { construirExpedientes } from "./tramites";
import { construirReporteDucafast, MESA_REPORTE, HORAS_MES_REPORTE } from "./reporteDucafast";
import type { RoiRow } from "@/types";

// Fila del origen (formato ANCHO). Base: lunes 5 ene 2026, jornada 08–13 y
// 14–18. Un hito por hora: T1, T2 y T3 miden 3600 s cada uno (1 h hábil).
const fila = (o: Partial<RoiRow>): RoiRow => ({
  c807_file: "F1", Proceso: "Aduana", Cliente: "CLIENTE A",
  Usuario: "ANA", Analista: "BETO", Embarque: "Marítimo",
  Documento: "CONOCIMIENTO DE EMBARQUE", Mesa: MESA_REPORTE, Docalpha: "No Ducafast",
  Creado: "2026-01-05T08:00:00",
  DPR: "2026-01-05T09:00:00",
  Clasificacion_exacta: "2026-01-05T10:00:00",
  Creacion_Pre_DUCA: "2026-01-05T11:00:00",
  Revision_Analista: "2026-01-05T12:00:00",
  Solicitar_firma_def: "2026-01-05T13:00:00",
  "Documents Count": "1", "Pages Count": "1", Licencias: "0", Costo: "0",
  ...o,
} as RoiRow);

const HOY = new Date(2026, 5, 15); // 15 jun 2026 — junio queda "en curso"

describe("construirReporteDucafast — alcance (Mesa 2, meses, con/sin Ducafast)", () => {
  it("descarta expedientes de otras mesas", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "A", Mesa: "Mesa 2" }),
      fila({ c807_file: "B", Mesa: "Mesa 1" }),
    ]);
    const r = construirReporteDucafast(exps, HOY);
    const total = r.meses.reduce((s, m) => s + m.totalFiles, 0);
    expect(total).toBe(1);
  });

  it("excluye el mes en curso (va a medias) y conserva como mucho los últimos 6", () => {
    const meses = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
    const exps = construirExpedientes(
      meses.map((m, i) => fila({ c807_file: `F${i}`, Creado: `${m}-05T08:00:00` })),
    );
    const r = construirReporteDucafast(exps, HOY);
    expect(r.meses).toHaveLength(6);
    expect(r.meses.map((m) => m.clave)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);
  });

  it("separa Ducafast de no-Ducafast dentro del mismo mes", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "A", Docalpha: "Ducafast" }),
      fila({ c807_file: "B", Docalpha: "No Ducafast" }),
      fila({ c807_file: "C", Docalpha: "No Ducafast" }),
    ]);
    const [m] = construirReporteDucafast(exps, HOY).meses;
    expect(m.duca.files).toBe(1);
    expect(m.nod.files).toBe(2);
    expect(m.totalFiles).toBe(3);
    expect(m.pctDucafast).toBeCloseTo(1 / 3);
  });
});

describe("construirReporteDucafast — fórmulas derivadas de un mes", () => {
  // Un solo file por grupo: la mediana ES su propio tiempo, y el costo por
  // file es directo — así las fórmulas derivadas quedan fáciles de predecir.
  const exps = construirExpedientes([
    fila({ c807_file: "D1", Docalpha: "Ducafast", Usuario: "ANA", Analista: "BETO" }),
    fila({ c807_file: "N1", Docalpha: "No Ducafast", Usuario: "CARLA", Analista: "DIEGO",
      DPR: "2026-01-05T10:00:00", Clasificacion_exacta: "2026-01-05T12:00:00", Creacion_Pre_DUCA: "2026-01-05T15:00:00" }),
  ]);
  const [m] = construirReporteDucafast(exps, HOY).meses;

  it("capacidad instalada = personal real (Usuario ∪ Analista) del mes", () => {
    expect(m.capacidadInstalada).toBe(4); // ANA, BETO, CARLA, DIEGO
  });

  it("brechaCosto, brechaTiempo, costoMezclado y filesPorCapacidad son consistentes con duca/nod", () => {
    expect(m.brechaCosto).toBeCloseTo(m.nod.costoFile - m.duca.costoFile);
    expect(m.brechaTiempo).toBeCloseTo(m.nod.minutosFile - m.duca.minutosFile);
    expect(m.costoMezclado).toBeCloseTo(
      (m.duca.files * m.duca.costoFile + m.nod.files * m.nod.costoFile) / m.totalFiles,
    );
    expect(m.filesPorCapacidad).toBeCloseTo(m.totalFiles / m.capacidadInstalada);
  });

  it("ahorroGenerado y metaPorCapturar aplican la brecha a los files de cada lado", () => {
    expect(m.ahorroGenerado).toBeCloseTo(m.brechaCosto * m.duca.files);
    expect(m.metaPorCapturar).toBeCloseTo(m.brechaCosto * m.nod.files);
  });

  it("horasDuca/horasNod y el FTE usan la mediana en minutos sobre HORAS_MES_REPORTE", () => {
    expect(m.horasDuca).toBeCloseTo((m.duca.files * m.duca.minutosFile) / 60);
    expect(m.horasNod).toBeCloseTo((m.nod.files * m.nod.minutosFile) / 60);
    expect(m.fteHoy).toBeCloseTo((m.horasDuca + m.horasNod) / HORAS_MES_REPORTE);
    expect(m.fteEscenario).toBeCloseTo((m.totalFiles * m.duca.minutosFile) / 60 / HORAS_MES_REPORTE);
  });

  it("nod tardó más que duca en este fixture (nod tiene un T1-T3 más largo)", () => {
    expect(m.nod.minutosFile).toBeGreaterThan(m.duca.minutosFile);
    expect(m.brechaTiempo).toBeGreaterThan(0);
  });
});

describe("construirReporteDucafast — totales del período (ponderados por volumen)", () => {
  it("promedia costo/tiempo ponderando por files, no como promedio simple de los meses", () => {
    // Mes 1: 1 file Ducafast barato. Mes 2: 3 files Ducafast caros. Un promedio
    // simple daría (barato+caro)/2; ponderado por volumen se acerca más al caro.
    const exps = construirExpedientes([
      fila({ c807_file: "A1", Docalpha: "Ducafast", Creado: "2026-01-05T08:00:00", DPR: "2026-01-05T08:30:00" }),
      fila({ c807_file: "B1", Docalpha: "Ducafast", Creado: "2026-02-05T08:00:00" }),
      fila({ c807_file: "B2", Docalpha: "Ducafast", Creado: "2026-02-05T08:00:00" }),
      fila({ c807_file: "B3", Docalpha: "Ducafast", Creado: "2026-02-05T08:00:00" }),
    ]);
    const t = construirReporteDucafast(exps, HOY).totales;
    const promedioSimple = (30 + 180) / 2; // minutos: mes 1 medio-hito, mes 2 tres horas completas
    // El ponderado por volumen (1 vs 3 files) pesa mucho más el mes 2 (180 min).
    expect(t.minutosDuca).not.toBeCloseTo(promedioSimple, 0);
    expect(t.minutosDuca).toBeGreaterThan(promedioSimple);
  });

  it("pctDucafastPrimero/Ultimo leen el primer y el último mes del rango", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "A", Docalpha: "Ducafast", Creado: "2026-01-05T08:00:00" }),
      fila({ c807_file: "B", Docalpha: "No Ducafast", Creado: "2026-01-05T08:00:00" }),
      fila({ c807_file: "C", Docalpha: "No Ducafast", Creado: "2026-01-05T08:00:00" }),
      fila({ c807_file: "D", Docalpha: "Ducafast", Creado: "2026-02-05T08:00:00" }),
    ]);
    const t = construirReporteDucafast(exps, HOY).totales;
    expect(t.pctDucafastPrimero).toBeCloseTo(1 / 3);
    expect(t.pctDucafastUltimo).toBeCloseTo(1);
  });

  it("horasAhorradas sobre 0 meses (sin datos) no revienta y da 0 en todo", () => {
    const t = construirReporteDucafast([], HOY).totales;
    expect(t).toMatchObject({ files: 0, duca: 0, nod: 0, ahorroGenerado: 0, metaPorCapturar: 0, horasAhorradas: 0, fteHoy: 0, fteEscenario: 0 });
  });
});
