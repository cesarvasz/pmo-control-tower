import { describe, it, expect } from "vitest";
import { construirInforme, aniosConDatos, PRECIO_LICENCIA_BASE, META_LICENCIAS_ANUAL } from "./informe";
import { construirExpedientes } from "./tramites";
import type { RoiRow } from "@/types";

// Base: lunes 5 ene 2026. Un hito por hora → cada etapa mide 3600 s y el tramo
// T1+T2+T3 mide 3 h. Los "con DUCAFAST" se hacen más rápidos acortando hitos.
const fila = (o: Partial<RoiRow>): RoiRow => ({
  c807_file: "F1", Proceso: "Aduana", Cliente: "CLIENTE A",
  Usuario: "ANA", Analista: "BETO", Embarque: "Marítimo",
  Documento: "CONOCIMIENTO DE EMBARQUE", Mesa: "Mesa 1", Docalpha: "No Ducafast",
  Creado: "2026-01-05T08:00:00",
  DPR: "2026-01-05T09:00:00",
  Clasificacion_exacta: "2026-01-05T10:00:00",
  Creacion_Pre_DUCA: "2026-01-05T11:00:00",
  Revision_Analista: "2026-01-05T12:00:00",
  Solicitar_firma_def: "2026-01-05T13:00:00",
  ...o,
} as RoiRow);

/**
 * Un file de DUCAFAST: recorre T1–T3 en 3 minutos en vez de 3 horas y por eso
 * cierra el ciclo entero en 1 h (ANA 08:00–08:30, BETO 08:30–09:00).
 */
const rapido = (o: Partial<RoiRow> = {}): RoiRow => fila({
  Docalpha: "Ducafast",
  DPR: "2026-01-05T08:01:00",
  Clasificacion_exacta: "2026-01-05T08:02:00",
  Creacion_Pre_DUCA: "2026-01-05T08:03:00",
  Revision_Analista: "2026-01-05T08:30:00",
  Solicitar_firma_def: "2026-01-05T09:00:00",
  ...o,
});

const OPC = {
  anio: 2026, tarifa: 6,
  precioLicencia: PRECIO_LICENCIA_BASE, metaLicenciasAnual: META_LICENCIAS_ANUAL,
};

describe("aniosConDatos", () => {
  it("lista los años del más reciente al más antiguo", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "A" }),
      fila({ c807_file: "B", Creado: "2025-03-10T08:00:00" }),
      fila({ c807_file: "C", Creado: "2024-06-03T08:00:00" }),
    ]);
    expect(aniosConDatos(exps)).toEqual([2026, 2025, 2024]);
  });
});

describe("construirInforme", () => {
  it("separa los dos procesos y mide la reducción de tiempo sobre T1–T3", () => {
    const inf = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }),
      rapido({ c807_file: "D1" }),
    ]), OPC);

    const [m] = inf.meses;
    expect(m.clave).toBe("2026-01");
    expect(m.sin.files).toBe(1);
    expect(m.con.files).toBe(1);
    // 3 h a mano contra 3 min automatizado.
    expect(m.sin.segTramo).toBe(3 * 3600);
    expect(m.con.segTramo).toBe(180);
    expect(m.reduccionTiempo).toBeCloseTo(1 - 180 / 10800, 8);
  });

  it("el costo se cobra sobre T1–T3, no sobre el ciclo entero", () => {
    const inf = construirInforme(construirExpedientes([rapido({ c807_file: "D1" })]), OPC);
    // El ciclo dura 1 h, pero T1–T3 son 3 minutos: 0.05 h × $6 = $0.30.
    expect(inf.meses[0].con.segTramo).toBe(180);
    expect(inf.meses[0].con.horas).toBeCloseTo(0.05, 10);
    expect(inf.meses[0].con.costoOperativoFile).toBeCloseTo(0.3, 10);
    // El manual recorre T1–T3 en 3 h: $18.
    const man = construirInforme(construirExpedientes([fila({ c807_file: "M1" })]), OPC);
    expect(man.meses[0].sin.costoOperativoFile).toBe(18);
  });

  it("lo que pasa después de la Pre-DUCA no mueve ninguna cifra", () => {
    // Mismo tramo automatizado; en uno la revisión del analista se alarga
    // cuatro horas. El informe no debe notarlo.
    const base = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }), rapido({ c807_file: "D1" }),
    ]), OPC).meses[0];
    const lento = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }),
      rapido({
        c807_file: "D1",
        Revision_Analista: "2026-01-05T12:00:00", Solicitar_firma_def: "2026-01-05T13:00:00",
      }),
    ]), OPC).meses[0];

    expect(lento.con.segTramo).toBe(base.con.segTramo);
    expect(lento.con.costoFile).toBeCloseTo(base.con.costoFile, 10);
    expect(lento.ahorro).toBeCloseTo(base.ahorro, 10);
  });

  it("no divide entre personas cuando el tiempo humano tiende a cero", () => {
    const inf = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }), rapido({ c807_file: "D1" }),
    ]), OPC);
    const m = inf.meses[0];
    // La tasa por mil siempre existe: el denominador son files, no personas.
    expect(m.con.personasPorMil).toBeCloseTo((m.con.personasNecesarias / m.con.files) * 1000, 10);
    expect(m.sin.personasPorMil).toBeGreaterThan(m.con.personasPorMil);
    // La reducción sale del cociente de tasas y vive acotada en [0,1].
    expect(m.reduccionPersonal).toBeCloseTo(1 - m.con.personasPorMil / m.sin.personasPorMil, 8);
    expect(m.reduccionPersonal!).toBeGreaterThan(0);
    expect(m.reduccionPersonal!).toBeLessThanOrEqual(1);
  });

  it("un robot no consume personal ni rompe la división", () => {
    // Files que solo tocó un ejecutor automatizado: no consumen horas de nadie.
    const inf = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }),
      rapido({ c807_file: "D1", Usuario: "Docalpha OCR (KM)", Analista: "Docalpha OCR (KM)" }),
    ]), OPC);
    const m = inf.meses[0];
    expect(m.con.personasNecesarias).toBe(0);
    expect(m.con.personasPorMil).toBe(0);
    expect(m.con.filesPorPersona).toBeNull();
    // El robot no cobra por hora, así que la reducción es total — y acotada.
    expect(m.reduccionPersonal).toBe(1);
    expect(m.con.costoOperativoFile).toBe(0);
  });

  it("mide también el ciclo completo para poder decir cuánto se devuelve", () => {
    // El tramo vuela, pero la revisión del analista se alarga cuatro horas:
    // el ahorro de T1–T3 es mayor que el de punta a punta.
    const inf = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }),
      rapido({
        c807_file: "D1",
        Revision_Analista: "2026-01-05T12:00:00", Solicitar_firma_def: "2026-01-05T13:00:00",
      }),
    ]), OPC);
    const m = inf.meses[0];
    expect(m.con.segCola).toBe(4 * 3600 + 57 * 60);  // Pre-DUCA 08:03 → firma 13:00
    expect(m.sin.segCola).toBe(2 * 3600);             // Pre-DUCA 11:00 → firma 13:00
    expect(m.ahorro).toBeGreaterThan(m.ahorroCiclo);
    expect(inf.ahorroCiclo).toBe(m.ahorroCiclo);
  });

  it("suma las licencias al costo por file al precio del Business Case", () => {
    const inf = construirInforme(construirExpedientes([
      rapido({ c807_file: "D1", Licencias: "4", Costo: "4.4" }),
    ]), OPC);
    const { con } = inf.meses[0];
    expect(con.licencias).toBe(4);
    expect(con.costoLicenciasFile).toBeCloseTo(4 * 1.25, 8);
    expect(con.costoFile).toBeCloseTo(0.3 + 5, 8);
    // La hoja factura a $1.10: el informe la reporta aparte, sin mezclarla.
    expect(inf.scorecard.inversionHoja).toBeCloseTo(4.4, 8);
    expect(inf.scorecard.inversionReal).toBeCloseTo(5, 8);
  });

  it("el ahorro es la diferencia unitaria por los files automatizados", () => {
    const inf = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }),
      rapido({ c807_file: "D1" }),
      rapido({ c807_file: "D2", Usuario: "CARLA", Analista: "DIEGO" }),
    ]), OPC);
    const m = inf.meses[0];
    expect(m.ahorro).toBeCloseTo((m.sin.costoFile - m.con.costoFile) * m.con.files, 8);
    expect(inf.ahorro).toBe(m.ahorro);
  });

  it("un mes sin contraparte no inventa reducción", () => {
    const inf = construirInforme(construirExpedientes([rapido({ c807_file: "D1" })]), OPC);
    expect(inf.meses[0].sin.files).toBe(0);
    expect(inf.meses[0].reduccionTiempo).toBeNull();
    expect(inf.reduccionPromedio).toBeNull();
  });

  it("deja el último mes fuera de los acumulados por estar a medias", () => {
    const inf = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }),
      rapido({ c807_file: "D1" }),
      // Febrero: el último mes con datos, así que va marcado como parcial.
      fila({ c807_file: "M2", Creado: "2026-02-02T08:00:00", DPR: "2026-02-02T09:00:00",
        Clasificacion_exacta: "2026-02-02T10:00:00", Creacion_Pre_DUCA: "2026-02-02T11:00:00",
        Revision_Analista: "2026-02-02T12:00:00", Solicitar_firma_def: "2026-02-02T13:00:00" }),
    ]), OPC);

    expect(inf.meses).toHaveLength(2);
    expect(inf.meses[0].parcial).toBe(false);
    expect(inf.meses[1].parcial).toBe(true);
    expect(inf.ultimoCompleto).toBe("2026-01");
    // El acumulado y el scorecard solo cuentan enero.
    expect(inf.ahorro).toBe(inf.meses[0].ahorro);
    expect(inf.scorecard.meses).toBe(1);
  });

  it("un año pasado no tiene meses parciales aunque sea el último que dibuja", () => {
    // Los datos siguen hasta 2026: diciembre de 2025 está cerrado.
    const exps = construirExpedientes([
      fila({ c807_file: "V1", Creado: "2025-12-01T08:00:00", DPR: "2025-12-01T09:00:00",
        Clasificacion_exacta: "2025-12-01T10:00:00", Creacion_Pre_DUCA: "2025-12-01T11:00:00",
        Revision_Analista: "2025-12-01T12:00:00", Solicitar_firma_def: "2025-12-01T13:00:00" }),
      fila({ c807_file: "N1" }),
    ]);
    const dic = construirInforme(exps, { ...OPC, anio: 2025 });
    expect(dic.meses.map((m) => m.parcial)).toEqual([false]);
    expect(dic.ultimoCompleto).toBe("2025-12");
    // El mes donde se acaban los datos sí va marcado.
    expect(construirInforme(exps, OPC).meses[0].parcial).toBe(true);
  });

  it("si el año entero es un mes a medias igual acumula", () => {
    const inf = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }),
      rapido({ c807_file: "D1", Licencias: "4", Costo: "4.4" }),
    ]), OPC);
    expect(inf.meses[0].parcial).toBe(true);
    // Sin la salvaguarda el informe saldría en cero y no diría nada.
    expect(inf.scorecard.meses).toBe(1);
    expect(inf.ahorro).toBeGreaterThan(0);
    expect(inf.scorecard.inversionReal).toBeCloseTo(5, 8);
  });

  it("prorratea la línea base a los meses completos medidos", () => {
    const inf = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }),
      rapido({ c807_file: "D1", Licencias: "10", Costo: "11" }),
    ]), OPC);
    // 40,000/12 licencias/mes × 1 mes × $1.25.
    expect(inf.scorecard.inversionBase).toBeCloseTo((40000 / 12) * 1.25, 6);
    expect(inf.scorecard.metaMensual).toBeCloseTo(40000 / 12, 6);
  });

  it("calcula ROI y múltiplo sobre la inversión real", () => {
    const inf = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }),
      rapido({ c807_file: "D1", Licencias: "4", Costo: "4.4" }),
    ]), OPC);
    const { beneficio, inversionReal, roi, multiplo } = inf.scorecard;
    expect(inversionReal).toBeCloseTo(5, 8);
    expect(roi).toBeCloseTo((beneficio - inversionReal) / inversionReal, 8);
    expect(multiplo).toBeCloseTo(beneficio / inversionReal, 8);
  });

  it("sin licencias no divide por cero", () => {
    const inf = construirInforme(construirExpedientes([fila({ c807_file: "M1" })]), OPC);
    expect(inf.scorecard.inversionReal).toBe(0);
    expect(inf.scorecard.roi).toBe(0);
    expect(inf.scorecard.multiplo).toBe(0);
  });

  it("un año sin datos devuelve un informe vacío y no revienta", () => {
    const inf = construirInforme(construirExpedientes([fila({})]), { ...OPC, anio: 2019 });
    expect(inf.meses).toEqual([]);
    expect(inf.ahorro).toBe(0);
    expect(inf.escala).toBeNull();
    expect(inf.ultimoCompleto).toBeNull();
  });

  it("la escala completa proyecta sobre el último mes completo", () => {
    const inf = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }),
      rapido({ c807_file: "D1" }),
      fila({ c807_file: "M2", Creado: "2026-02-02T08:00:00", DPR: "2026-02-02T09:00:00",
        Clasificacion_exacta: "2026-02-02T10:00:00", Creacion_Pre_DUCA: "2026-02-02T11:00:00",
        Revision_Analista: "2026-02-02T12:00:00", Solicitar_firma_def: "2026-02-02T13:00:00" }),
    ]), OPC);
    const e = inf.escala!;
    // Enero, el último completo: 1 file manual + 1 automatizado.
    expect(e.mes).toBe("2026-01");
    expect(e.files).toBe(2);
    expect(e.ahorroMensual).toBeCloseTo(e.files * e.ahorroPorFile, 8);
    expect(e.ahorroAnual).toBeCloseTo(e.ahorroMensual * 12, 8);
  });

  it("la tarifa escala el costo operativo pero no las licencias", () => {
    const exps = construirExpedientes([rapido({ c807_file: "D1", Licencias: "4", Costo: "4.4" })]);
    const a = construirInforme(exps, OPC).meses[0].con;
    const b = construirInforme(exps, { ...OPC, tarifa: 12 }).meses[0].con;
    expect(b.costoOperativoFile).toBeCloseTo(a.costoOperativoFile * 2, 8);
    expect(b.costoLicenciasFile).toBeCloseTo(a.costoLicenciasFile, 8);
  });

  it("la productividad se mide en equivalentes a tiempo completo sin redondear", () => {
    const inf = construirInforme(construirExpedientes([
      fila({ c807_file: "M1" }),
      rapido({ c807_file: "D1" }),
    ]), OPC);
    const { con } = inf.meses[0];
    expect(con.filesPorPersona).toBeCloseTo(con.files / con.personasNecesarias, 8);
    // La plantilla presente es mayor que la necesaria: nadie va al 95%.
    expect(con.personasPresentes).toBeGreaterThanOrEqual(1);
  });
});
