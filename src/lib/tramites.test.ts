import { describe, it, expect } from "vitest";
import {
  esAutomatizado, ordenarMesas, parseFecha,
  construirExpedientes, calcularIndicadores, composicionCiclo,
  filtrarExpedientes, coberturaHitos, serieTemporal, cargaYCapacidad,
  contarPersonas, exportarCSV, agruparPor, opcionesDeFiltro,
  mediana, promedio, percentil90,
  mismaPersona, etapasAtribuidas, tiempoAtribuido, agruparPorPersona, costoTiempo,
  unirIntervalos, costoPorPersona, ventanaDe, contarLicencias, costoUnitario, proyectarAnio,
  etiquetaAlcance, recorridoAlcance, hitosDelAlcance,
  rangoEtapas, interseccionAlcance, totalEnAlcance,
  SIN_MESA, SIN_DATO, FILTROS_VACIOS, ETAPA_KEYS, ALCANCE_UNITARIO,
  type Filtros,
} from "./tramites";
import { segundosHabiles } from "./horario";
import type { RoiRow } from "@/types";

// Fila del origen (formato ANCHO). Base: lunes 5 ene 2026, jornada 08–13 y 14–18.
const fila = (o: Partial<RoiRow>): RoiRow => ({
  c807_file: "F1", Proceso: "Aduana", Cliente: "CLIENTE A",
  Usuario: "ANA", Analista: "BETO", Embarque: "Marítimo",
  Documento: "CONOCIMIENTO DE EMBARQUE", Mesa: "Mesa 1", Docalpha: "No Ducafast",
  // Un hito por hora: cada una de las 5 etapas mide exactamente 3600 s.
  Creado: "2026-01-05T08:00:00",
  DPR: "2026-01-05T09:00:00",
  Clasificacion_exacta: "2026-01-05T10:00:00",
  Creacion_Pre_DUCA: "2026-01-05T11:00:00",
  Revision_Analista: "2026-01-05T12:00:00",
  Solicitar_firma_def: "2026-01-05T13:00:00",
  ...o,
} as RoiRow);

describe("esAutomatizado", () => {
  it("detecta ejecutores automatizados por token", () => {
    expect(esAutomatizado("Docalpha OCR (KM)")).toBe(true);
    expect(esAutomatizado("CLASIFICACION IA")).toBe(true);
    expect(esAutomatizado("AUTOMATIZACION 2")).toBe(true);
  });

  it("NO marca personas cuyo nombre contiene esas letras", () => {
    // Casos reales del origen: BOTELLO/BOTEO contienen "BOT", GARCIA contiene "IA".
    expect(esAutomatizado("JUAN JOSE SOLIS BOTELLO")).toBe(false);
    expect(esAutomatizado("STEFANEE DENISSE LOPEZ BOTEO")).toBe(false);
    expect(esAutomatizado("MARIA JOSE GARCIA")).toBe(false);
    expect(esAutomatizado("ANA LUCÍA LÓPEZ PORRAS")).toBe(false);
  });

  it("acepta una lista configurable", () => {
    expect(esAutomatizado("MOTOR X", ["MOTOR"])).toBe(true);
    expect(esAutomatizado("Docalpha OCR (KM)", ["MOTOR"], [])).toBe(false);
  });
});

describe("ordenarMesas", () => {
  it("orden natural: Mesa 10 después de Mesa 9", () => {
    expect(ordenarMesas(["Mesa 10", "Mesa 2", "Mesa 9", "Mesa 1"]))
      .toEqual(["Mesa 1", "Mesa 2", "Mesa 9", "Mesa 10"]);
  });

  it("mantiene los sufijos en su posición numérica y (sin mesa) al final", () => {
    expect(ordenarMesas([SIN_MESA, "Servicio int export", "Mesa 9 (digital)", "Mesa 8"]))
      .toEqual(["Mesa 8", "Mesa 9 (digital)", "Servicio int export", SIN_MESA]);
  });
});

describe("parseFecha", () => {
  it("acepta los dos formatos que trae el origen", () => {
    // Unas columnas vienen con "T" y otras con espacio.
    expect(parseFecha("2026-01-05T08:40:26")?.getHours()).toBe(8);
    expect(parseFecha("2026-01-05 08:40:26")?.getMinutes()).toBe(40);
  });

  it("rechaza vacío y basura", () => {
    expect(parseFecha("")).toBeNull();
    expect(parseFecha(null)).toBeNull();
    expect(parseFecha("no es fecha")).toBeNull();
  });
});

describe("construirExpedientes", () => {
  it("calcula las 5 etapas de la cadena", () => {
    const [e] = construirExpedientes([fila({})]);
    expect(e.etapas.t1).toBe(3600); // Creado 08 → DPR 09
    expect(e.etapas.t2).toBe(3600); // DPR 09 → Clasificación 10
    expect(e.etapas.t3).toBe(3600); // Clasificación 10 → Pre-DUCA 11
    expect(e.etapas.t4).toBe(3600); // Pre-DUCA 11 → Revisión 12
    expect(e.etapas.t5).toBe(3600); // Revisión 12 → Firma 13
    expect(e.total).toBe(5 * 3600);
  });

  it("los tiempos coinciden al segundo con segundosHabiles", () => {
    const [e] = construirExpedientes([fila({})]);
    expect(e.etapas.t1).toBe(segundosHabiles(new Date(2026, 0, 5, 8), new Date(2026, 0, 5, 9)));
  });

  it("un hito faltante deja sin calcular solo SUS etapas y anula el Total", () => {
    const [e] = construirExpedientes([fila({ Clasificacion_exacta: "" })]);
    expect(e.etapas.t1).toBe(3600);
    expect(e.etapas.t2).toBeUndefined(); // DPR → Clasificación
    expect(e.etapas.t3).toBeUndefined(); // Clasificación → Pre-DUCA
    expect(e.etapas.t4).toBe(3600);      // Pre-DUCA → Revisión sí se puede
    expect(e.etapas.t5).toBe(3600);      // Revisión → Firma también
    expect(e.total).toBeNull();
  });

  it("fusiona un c807_file repetido conservando TODOS los valores", () => {
    // Caso real: 3,104 expedientes duplicados que solo difieren en Proceso.
    const exps = construirExpedientes([
      fila({ c807_file: "DUP", Proceso: "Aduana" }),
      fila({ c807_file: "DUP", Proceso: "Importación" }),
    ]);
    expect(exps).toHaveLength(1);
    expect(exps[0].procesos).toEqual(["Aduana", "Importación"]);
  });

  it("ante fechas distintas del mismo hito vale la más temprana", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "D", DPR: "2026-01-05T11:00:00" }),
      fila({ c807_file: "D", DPR: "2026-01-05T09:00:00" }),
    ]);
    expect(exps[0].etapas.t1).toBe(3600); // 08 → 09, no hasta las 11
  });

  it("Mesa vacía va como categoría propia; el resto de dimensiones como (sin dato)", () => {
    const [e] = construirExpedientes([fila({ Mesa: "", Cliente: "" })]);
    expect(e.mesas).toEqual([SIN_MESA]);
    expect(e.clientes).toEqual([SIN_DATO]);
  });

  it("marca Ducafast solo con el valor exacto", () => {
    expect(construirExpedientes([fila({ Docalpha: "Ducafast" })])[0].ducafast).toBe(true);
    expect(construirExpedientes([fila({ Docalpha: "No Ducafast" })])[0].ducafast).toBe(false);
  });

  it("no trunca los tramos largos", () => {
    const [e] = construirExpedientes([fila({ DPR: "2026-05-11T08:00:00" })]);
    expect((e.etapas.t1 as number) / 3600).toBeGreaterThan(700);
  });

  it("una etapa cuyo hito final precede al inicial da 0, no negativo", () => {
    // Hitos fuera de orden: pasa en miles de expedientes reales.
    const [e] = construirExpedientes([fila({
      Clasificacion_exacta: "2026-01-05T11:30:00", // después de Pre-DUCA (11:00)
    })]);
    expect(e.etapas.t3).toBe(0);
    expect(e.etapas.t3).toBeGreaterThanOrEqual(0);
  });
});

describe("calcularIndicadores", () => {
  it("el Total se calcula POR EXPEDIENTE, no sumando las medianas de las etapas", () => {
    // La etapa lenta es distinta en cada expediente: sumar medianas subestima.
    const t = (min: number) => {
      const d = new Date(2026, 0, 5, 8, min);
      return `2026-01-05T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
    };
    const exp = (file: string, h: number[]) => fila({
      c807_file: file, Creado: t(0),
      DPR: t(h[0]), Clasificacion_exacta: t(h[1]), Creacion_Pre_DUCA: t(h[2]),
      Revision_Analista: t(h[3]), Solicitar_firma_def: t(h[4]),
    });
    const exps = construirExpedientes([
      exp("F1", [10, 20, 25, 30, 40]),    // total  40 min
      exp("F2", [50, 60, 65, 70, 80]),    // total  80 min
      exp("F3", [10, 60, 85, 110, 160]),  // total 160 min
    ]);
    const ind = calcularIndicadores(exps, "mediana");
    const total = ind.find((i) => i.key === "total")!;
    expect(total.valor).toBe(80 * 60); // mediana de 40, 80, 160

    const suma = ind.filter((i) => i.key !== "total").reduce((s, i) => s + (i.valor ?? 0), 0);
    expect(suma).toBeLessThan(total.valor as number);
  });

  it("reporta la cobertura de cada etapa", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "F1" }),
      fila({ c807_file: "F2", Solicitar_firma_def: "" }),
    ]);
    const ind = calcularIndicadores(exps, "mediana");
    expect(ind.find((i) => i.key === "t1")!.cobertura).toBe(1);
    expect(ind.find((i) => i.key === "t5")!.cobertura).toBe(0.5); // Pre-DUCA → Firma
    expect(ind.find((i) => i.key === "total")!.cobertura).toBe(0.5);
  });

  it("sin datos devuelve nulos, no ceros engañosos", () => {
    expect(calcularIndicadores([], "mediana").every((i) => i.valor === null && i.n === 0)).toBe(true);
  });
});

describe("composicionCiclo (barra apilada)", () => {
  it("las cuotas suman 100 y los aportes suman EXACTAMENTE el total de la barra", () => {
    const exps = construirExpedientes([fila({ c807_file: "F1" }), fila({ c807_file: "F2" })]);
    const c = composicionCiclo(exps, "mediana");
    expect(c.segmentos.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 8);
    expect(c.segmentos.reduce((s, x) => s + x.aporte, 0)).toBeCloseTo(c.total as number, 6);
  });

  it("reparte según el peso real de cada etapa", () => {
    // T1 = 3 h y el resto suma 3 h  ⇒  T1 debe ser el 50% de un ciclo de 6 h.
    const exps = construirExpedientes([fila({
      Creado: "2026-01-05T08:00:00",
      DPR: "2026-01-05T11:00:00",             // T1 = 3 h
      Clasificacion_exacta: "2026-01-05T12:00:00", // T2 = 1 h
      Creacion_Pre_DUCA: "2026-01-05T12:30:00",    // T3 = 30 min
      Revision_Analista: "2026-01-05T14:30:00",    // T4: cruza el almuerzo, 12:30→14:30 = 1 h
      Solicitar_firma_def: "2026-01-05T15:00:00",  // T5 = 30 min
    })]);
    const c = composicionCiclo(exps, "mediana");
    expect(c.segmentos.find((s) => s.key === "t1")!.pct).toBeCloseTo(50, 5);
    expect(c.total).toBe(6 * 3600);
  });

  it("la barra encabeza el Total REAL por expediente, no la suma de medianas", () => {
    // Etapa lenta distinta en cada expediente: la suma de medianas por etapa
    // (regla #3) queda por debajo del ciclo real. La barra debe mostrar el real.
    const t = (min: number) => {
      const d = new Date(2026, 0, 5, 8, min);
      return `2026-01-05T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
    };
    const exp = (file: string, h: number[]) => fila({
      c807_file: file, Creado: t(0),
      DPR: t(h[0]), Clasificacion_exacta: t(h[1]), Creacion_Pre_DUCA: t(h[2]),
      Revision_Analista: t(h[3]), Solicitar_firma_def: t(h[4]),
    });
    const exps = construirExpedientes([
      exp("F1", [10, 20, 25, 30, 40]), exp("F2", [50, 60, 65, 70, 80]), exp("F3", [10, 60, 85, 110, 160]),
    ]);
    const c = composicionCiclo(exps, "mediana");
    expect(c.total).toBe(80 * 60); // mediana de los totales por expediente

    // Sumar las medianas de cada etapa daría menos: por eso no se usa para la barra.
    const sumaMedianas = c.segmentos.reduce((s, x) => s + (x.valor ?? 0), 0);
    expect(sumaMedianas).toBeLessThan(c.total as number);
    // Los aportes, en cambio, sí cuadran con el total.
    expect(c.segmentos.reduce((s, x) => s + x.aporte, 0)).toBeCloseTo(c.total as number, 6);
  });

  it("se calcula solo sobre expedientes de ciclo completo", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "F1" }),
      fila({ c807_file: "F2", Solicitar_firma_def: "" }), // incompleto
    ]);
    const c = composicionCiclo(exps, "mediana");
    expect(c.n).toBe(1);
    expect(c.cobertura).toBe(0.5);
  });

  it("el grupo Ducafast abarca T1 a T3 y arranca al inicio de la barra", () => {
    const c = composicionCiclo(construirExpedientes([fila({})]), "mediana");
    const g = c.grupos.find((x) => x.key === "ducafast")!;
    expect(g.label).toBe("Ducafast");
    expect(g.etapas).toEqual(["t1", "t2", "t3"]);
    expect(g.desdePct).toBeCloseTo(0, 8); // empieza en T1
    expect(g.anchoPct).toBeCloseTo(60, 8); // 3 de 5 etapas iguales
  });

  it("el tiempo del grupo es la métrica del tramo por expediente, no la suma de medianas", () => {
    // T1 lento en uno y T3 lento en otro: la suma de medianas subestima el tramo.
    const t = (min: number) =>
      `2026-01-05T${String(8 + Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;
    // Con solo dos expedientes la mediana promedia y ambas cuentas coinciden por
    // aritmética; hacen falta tres para que el sesgo se note.
    const exps = construirExpedientes([
      // T1=60 T2=10 T3=10 → 80 min
      fila({ c807_file: "A", Creado: t(0), DPR: t(60), Clasificacion_exacta: t(70), Creacion_Pre_DUCA: t(80), Revision_Analista: t(90), Solicitar_firma_def: t(100) }),
      // T1=10 T2=60 T3=10 → 80 min
      fila({ c807_file: "B", Creado: t(0), DPR: t(10), Clasificacion_exacta: t(70), Creacion_Pre_DUCA: t(80), Revision_Analista: t(90), Solicitar_firma_def: t(100) }),
      // T1=10 T2=10 T3=100 → 120 min
      fila({ c807_file: "C", Creado: t(0), DPR: t(10), Clasificacion_exacta: t(20), Creacion_Pre_DUCA: t(120), Revision_Analista: t(130), Solicitar_firma_def: t(140) }),
    ]);
    const g = composicionCiclo(exps, "mediana").grupos[0];
    expect(g.valor).toBe(80 * 60); // mediana de 80, 80 y 120 min
    // Sumar las medianas de T1, T2 y T3 daría menos.
    const sum = composicionCiclo(exps, "mediana").segmentos.slice(0, 3)
      .reduce((s, x) => s + (x.valor ?? 0), 0);
    expect(sum).toBeLessThan(g.valor as number);
  });

  it("la cuota del grupo es la suma de las de sus etapas", () => {
    const c = composicionCiclo(construirExpedientes([fila({})]), "mediana");
    const g = c.grupos[0];
    const suma = c.segmentos.slice(0, 3).reduce((s, x) => s + x.pct, 0);
    expect(g.pct).toBeCloseTo(suma, 8);
    expect(g.aporte).toBeCloseTo(c.segmentos.slice(0, 3).reduce((s, x) => s + x.aporte, 0), 8);
  });

  it("sin expedientes completos no divide por cero", () => {
    const c = composicionCiclo(construirExpedientes([fila({ Solicitar_firma_def: "" })]), "mediana");
    expect(c.n).toBe(0);
    expect(c.total).toBeNull();
    expect(c.segmentos.every((s) => s.pct === 0 && s.aporte === 0)).toBe(true);
  });
});

describe("métricas", () => {
  it("mediana, promedio y P90 sobre una distribución sesgada", () => {
    const v = [1, 1, 2, 2, 3, 3, 4, 100, 200, 900];
    expect(mediana(v)).toBe(3);
    expect(promedio(v)).toBe(121.6);
    expect(percentil90(v)).toBe(200);
  });

  it("sobre lista vacía devuelven null", () => {
    expect(mediana([])).toBeNull();
    expect(promedio([])).toBeNull();
    expect(percentil90([])).toBeNull();
  });
});

describe("filtrarExpedientes", () => {
  const exps = construirExpedientes([
    fila({ c807_file: "F1", Creado: "2026-01-05T08:00:00", Mesa: "Mesa 1", Usuario: "ANA", Analista: "BETO", Cliente: "C1", Proceso: "Aduana", Docalpha: "Ducafast" }),
    fila({ c807_file: "F2", Creado: "2026-02-05T08:00:00", Mesa: "Mesa 2", Usuario: "CARLA", Analista: "DIEGO", Cliente: "C2", Proceso: "Importación", Docalpha: "No Ducafast" }),
  ]);
  const f = (o: Partial<Filtros>): Filtros => ({ ...FILTROS_VACIOS, ...o });

  it("sin filtros devuelve todo", () => {
    expect(filtrarExpedientes(exps, FILTROS_VACIOS)).toHaveLength(2);
  });

  it("filtra por mes, mesa, cliente, proceso y Ducafast", () => {
    expect(filtrarExpedientes(exps, f({ meses: ["2026-01"] })).map((e) => e.file)).toEqual(["F1"]);
    expect(filtrarExpedientes(exps, f({ mesas: ["Mesa 2"] })).map((e) => e.file)).toEqual(["F2"]);
    expect(filtrarExpedientes(exps, f({ clientes: ["C1"] })).map((e) => e.file)).toEqual(["F1"]);
    expect(filtrarExpedientes(exps, f({ procesos: ["Importación"] })).map((e) => e.file)).toEqual(["F2"]);
    expect(filtrarExpedientes(exps, f({ ducafast: "si" })).map((e) => e.file)).toEqual(["F1"]);
  });

  it("Usuario y Analista son dimensiones independientes", () => {
    expect(filtrarExpedientes(exps, f({ usuarios: ["ANA"] })).map((e) => e.file)).toEqual(["F1"]);
    expect(filtrarExpedientes(exps, f({ analistas: ["BETO"] })).map((e) => e.file)).toEqual(["F1"]);
    // ANA es Usuario de F1, pero no Analista de ningún expediente.
    expect(filtrarExpedientes(exps, f({ analistas: ["ANA"] }))).toHaveLength(0);
  });

  it("una dimensión multivaluada incluye el expediente si ALGUNO coincide", () => {
    const dup = construirExpedientes([
      fila({ c807_file: "D", Proceso: "Aduana" }),
      fila({ c807_file: "D", Proceso: "Importación" }),
    ]);
    expect(filtrarExpedientes(dup, f({ procesos: ["Aduana"] }))).toHaveLength(1);
    expect(filtrarExpedientes(dup, f({ procesos: ["Importación"] }))).toHaveLength(1);
  });

  it("combina filtros de forma acumulativa", () => {
    expect(filtrarExpedientes(exps, f({ meses: ["2026-01"], ducafast: "no" }))).toHaveLength(0);
    expect(filtrarExpedientes(exps, f({ meses: ["2026-01"], ducafast: "si" }))).toHaveLength(1);
  });
});

describe("coberturaHitos", () => {
  it("cuenta cuántos expedientes alcanzaron cada hito", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "F1" }),
      fila({ c807_file: "F2", Solicitar_firma_def: "" }),
    ]);
    const h = coberturaHitos(exps);
    expect(h.find((x) => x.key === "dpr")!.expedientes).toBe(2);
    expect(h.find((x) => x.key === "firma")!.expedientes).toBe(1);
    expect(h.find((x) => x.key === "firma")!.cobertura).toBe(0.5);
  });
});

describe("agruparPor", () => {
  it("un expediente con varios valores cuenta en cada grupo", () => {
    const dup = construirExpedientes([
      fila({ c807_file: "D", Proceso: "Aduana" }),
      fila({ c807_file: "D", Proceso: "Importación" }),
    ]);
    const g = agruparPor(dup, (e) => e.procesos, "mediana");
    expect(g.map((x) => x.clave).sort()).toEqual(["Aduana", "Importación"]);
    expect(g.every((x) => x.volumen === 1)).toBe(true);
  });

  it("separa personas de automatizados y excluye (sin dato)", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "F1", Mesa: "Mesa 1", Analista: "ANA" }),
      fila({ c807_file: "F2", Mesa: "Mesa 1", Analista: "CLASIFICACION IA" }),
      fila({ c807_file: "F3", Mesa: "Mesa 1", Analista: "" }),
    ]);
    const [g] = agruparPor(exps, (e) => e.mesas, "mediana");
    expect(g.personas).toBe(1);
    expect(g.automatizados).toBe(1);
  });
});

describe("serieTemporal", () => {
  it("agrupa por mes en orden cronológico", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "F1", Creado: "2026-02-05T08:00:00" }),
      fila({ c807_file: "F2", Creado: "2026-01-05T08:00:00" }),
    ]);
    const s = serieTemporal(exps, "mediana", false);
    expect(s.map((p) => p.clave)).toEqual(["2026-01", "2026-02"]);
  });

  it("con porDia agrupa a detalle diario", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "F1", Creado: "2026-01-05T08:00:00" }),
      fila({ c807_file: "F2", Creado: "2026-01-06T08:00:00" }),
    ]);
    expect(serieTemporal(exps, "mediana", true).map((p) => p.clave))
      .toEqual(["2026-01-05", "2026-01-06"]);
  });
});

describe("cargaYCapacidad", () => {
  // Usuario ANA, Analista BETO en ambos → plantilla real de 2 personas.
  const exps = construirExpedientes([fila({ c807_file: "F1" }), fila({ c807_file: "F2" })]);

  it("con simultaneos=1 es el cálculo crudo", () => {
    const [m] = cargaYCapacidad(exps, 1);
    expect(m.demandaHoras).toBeCloseTo(10, 5); // 2 expedientes × 5 h
    expect(m.demandaAjustada).toBeCloseTo(10, 5);
  });

  it("simultaneos divide la demanda (trabajo en paralelo)", () => {
    expect(cargaYCapacidad(exps, 4)[0].demandaAjustada).toBeCloseTo(2.5, 5);
  });

  it("simultaneos < 1 no rompe el cálculo", () => {
    expect(cargaYCapacidad(exps, 0)[0].demandaAjustada).toBeCloseTo(10, 5);
  });

  it("cuenta la plantilla real, sin duplicar a quien hace ambos papeles", () => {
    const [m] = cargaYCapacidad(exps, 1);
    expect(m.usuarios).toBe(1);   // ANA
    expect(m.analistas).toBe(1);  // BETO
    expect(m.personas).toBe(2);
    expect(m.ambos).toBe(0);
  });

  it("quien es Usuario y Analista cuenta una sola vez", () => {
    const [m] = cargaYCapacidad(construirExpedientes([fila({ Usuario: "ANA", Analista: "ANA" })]), 1);
    expect(m.usuarios).toBe(1);
    expect(m.analistas).toBe(1);
    expect(m.personas).toBe(1); // no 2
    expect(m.ambos).toBe(1);
  });

  it("los ejecutores automatizados no entran en la plantilla", () => {
    const [m] = cargaYCapacidad(
      construirExpedientes([fila({ Usuario: "Docalpha OCR (KM)", Analista: "BETO" })]), 1);
    expect(m.personas).toBe(1); // solo BETO
    expect(m.automatizados).toBe(1);
  });

  it("la capacidad sale de la plantilla contada, no de una estimación", () => {
    const [m] = cargaYCapacidad(exps, 1);
    expect(m.capacidadHoras).toBeCloseTo(2 * 44 * (52 / 12), 5);
  });

  it("la utilización marca el exceso sobre la jornada disponible", () => {
    const [m] = cargaYCapacidad(exps, 1);
    expect(m.utilizacion).toBeCloseTo(10 / (2 * 44 * (52 / 12)), 5);
    expect(m.excede).toBe(false);
    // Un tramo enorme sí la desborda.
    const pesado = construirExpedientes([fila({ DPR: "2026-05-11T08:00:00" })]);
    expect(cargaYCapacidad(pesado, 1)[0].excede).toBe(true);
  });

  it("cuenta el tiempo medido aunque falte el ciclo completo", () => {
    // Sin firma no hay Total, pero T1-T4 sí ocuparon calendario.
    const sinFirma = construirExpedientes([fila({ Solicitar_firma_def: "" })]);
    expect(sinFirma[0].total).toBeNull();
    expect(cargaYCapacidad(sinFirma, 1)[0].demandaHoras).toBeCloseTo(4, 5);
  });

  it("reporta expedientes por persona", () => {
    expect(cargaYCapacidad(exps, 1)[0].expedientesPorPersona).toBeCloseTo(1, 5); // 2 exp / 2 personas
  });
});

describe("contarPersonas", () => {
  it("excluye automatizados y (sin dato), y distingue la dimensión", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "F1", Usuario: "ANA", Analista: "BETO" }),
      fila({ c807_file: "F2", Usuario: "CLASIFICACION IA", Analista: "" }),
    ]);
    expect(contarPersonas(exps, (e) => e.analistas)).toBe(1); // BETO
    expect(contarPersonas(exps, (e) => e.usuarios)).toBe(1);  // ANA (la IA no cuenta)
  });
});

describe("opcionesDeFiltro", () => {
  it("marca los automatizados en Usuario y Analista", () => {
    const exps = construirExpedientes([fila({ Usuario: "Docalpha OCR (KM)", Analista: "ANA" })]);
    const o = opcionesDeFiltro(exps);
    expect(o.usuarios[0].automatizado).toBe(true);
    expect(o.analistas[0].automatizado).toBe(false);
  });

  it("ordena las mesas de forma natural", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "A", Mesa: "Mesa 10" }),
      fila({ c807_file: "B", Mesa: "Mesa 2" }),
    ]);
    expect(opcionesDeFiltro(exps).mesas.map((m) => m.value)).toEqual(["Mesa 2", "Mesa 10"]);
  });
});

describe("exportarCSV", () => {
  it("incluye los tiempos en hh:mm:ss y en segundos", () => {
    const csv = exportarCSV(construirExpedientes([fila({})]));
    const [cab, f1] = csv.split("\n");
    expect(cab).toContain("T1");
    expect(cab).toContain("T1_seg");
    expect(cab).toContain("Total_seg");
    expect(f1).toContain("01:00:00");
    expect(f1).toContain("3600");
  });

  it("incluye las dimensiones nuevas", () => {
    const cab = exportarCSV(construirExpedientes([fila({})])).split("\n")[0];
    for (const c of ["Proceso", "Cliente", "Usuario", "Analista", "Embarque", "Documento"]) {
      expect(cab).toContain(c);
    }
  });

  it("escapa campos con comas o comillas", () => {
    const csv = exportarCSV(construirExpedientes([fila({ c807_file: 'F"1,X' })]));
    expect(csv.split("\n")[1]).toContain('"F""1,X"');
  });

  it("las etapas sin calcular quedan vacías, no en cero", () => {
    const csv = exportarCSV(construirExpedientes([fila({
      DPR: "", Clasificacion_exacta: "", Revision_Analista: "", Creacion_Pre_DUCA: "", Solicitar_firma_def: "",
    })]));
    expect(csv.split("\n")[1]).not.toContain("00:00:00");
  });

  it("una línea por expediente más la cabecera", () => {
    const exps = construirExpedientes([fila({ c807_file: "A" }), fila({ c807_file: "B" })]);
    expect(exportarCSV(exps).split("\n")).toHaveLength(3);
  });
});

describe("atribución de tiempo por rol", () => {
  // Fixture base: 5 etapas de 1 h. Usuario ANA, Analista BETO.
  const distinto = fila({ c807_file: "D1", Usuario: "ANA", Analista: "BETO" });
  const mismo = fila({ c807_file: "M1", Usuario: "ANA", Analista: "ANA" });

  it("personas distintas: el Usuario carga T1-T4 y el Analista solo T5", () => {
    const [e] = construirExpedientes([distinto]);
    expect(etapasAtribuidas(e, "usuario")).toEqual(["t1", "t2", "t3", "t4"]);
    expect(etapasAtribuidas(e, "analista")).toEqual(["t5"]);
    expect(tiempoAtribuido(e, "usuario")).toBe(4 * 3600);
    expect(tiempoAtribuido(e, "analista")).toBe(3600);
  });

  it("misma persona: carga el ciclo completo en los dos roles", () => {
    const [e] = construirExpedientes([mismo]);
    expect(mismaPersona(e)).toBe(true);
    expect(tiempoAtribuido(e, "usuario")).toBe(5 * 3600);
    expect(tiempoAtribuido(e, "analista")).toBe(5 * 3600);
  });

  it("compara sin acentos ni mayúsculas", () => {
    const [e] = construirExpedientes([fila({ Usuario: "ANA LUCÍA", Analista: "ana lucia" })]);
    expect(mismaPersona(e)).toBe(true);
  });

  it("sin Usuario o sin Analista no es la misma persona", () => {
    expect(mismaPersona(construirExpedientes([fila({ Usuario: "" })])[0])).toBe(false);
    expect(mismaPersona(construirExpedientes([fila({ Analista: "" })])[0])).toBe(false);
  });

  it("una etapa suya sin medir anula su tiempo, no lo cuenta como cero", () => {
    // Sin Clasificación no hay T2 ni T3: el Usuario responde por ellas.
    const [e] = construirExpedientes([fila({ Usuario: "ANA", Analista: "BETO", Clasificacion_exacta: "" })]);
    expect(tiempoAtribuido(e, "usuario")).toBeNull();
    expect(tiempoAtribuido(e, "analista")).toBe(3600); // T5 sí se puede medir
  });

  it("al analista no se le carga la espera anterior a su revisión", () => {
    // T1 enorme (una semana) y T5 de 1 h: el analista solo debe ver la hora.
    const exps = construirExpedientes([fila({
      c807_file: "X", Usuario: "ANA", Analista: "BETO", Creado: "2026-01-05T08:00:00", DPR: "2026-01-12T08:00:00",
    })]);
    const [a] = agruparPorPersona(exps, "analista", "mediana");
    expect(a.clave).toBe("BETO");
    expect(a.tiempos.total).toBe(3600);
    expect(a.tiempos.t1).toBeNull(); // no es suya
    expect(a.tiempos.t5).toBe(3600);
  });

  it("las etapas ajenas quedan en null, no en cero", () => {
    const [u] = agruparPorPersona(construirExpedientes([distinto]), "usuario", "mediana");
    expect(u.tiempos.t4).toBe(3600);
    expect(u.tiempos.t5).toBeNull(); // el tramo de revisión no es del Usuario
    expect(u.tiempos.total).toBe(4 * 3600);
  });

  it("cuenta cuántos expedientes hizo de punta a punta", () => {
    const exps = construirExpedientes([
      mismo,
      fila({ c807_file: "M2", Usuario: "ANA", Analista: "ANA" }),
      fila({ c807_file: "D2", Usuario: "ANA", Analista: "BETO" }),
    ]);
    const ana = agruparPorPersona(exps, "usuario", "mediana").find((x) => x.clave === "ANA")!;
    expect(ana.volumen).toBe(3);
    expect(ana.cicloCompleto).toBe(2);
  });

  it("mezcla los dos casos en la métrica de la persona", () => {
    // ANA: un expediente de punta a punta (5 h) y otro solo hasta la revisión (4 h).
    const exps = construirExpedientes([mismo, fila({ c807_file: "D2", Usuario: "ANA", Analista: "BETO" })]);
    const ana = agruparPorPersona(exps, "usuario", "mediana").find((x) => x.clave === "ANA")!;
    expect(ana.tiempos.total).toBe(4.5 * 3600); // mediana de 5 h y 4 h
  });
});

describe("unirIntervalos", () => {
  const iv = (a: number, b: number) => ({ inicio: a, fin: b });

  it("fusiona los tramos que se solapan", () => {
    expect(unirIntervalos([iv(0, 10), iv(5, 20)])).toEqual([iv(0, 20)]);
  });

  it("fusiona los que se tocan justo en el borde", () => {
    expect(unirIntervalos([iv(0, 10), iv(10, 20)])).toEqual([iv(0, 20)]);
  });

  it("deja separados los que no se tocan", () => {
    expect(unirIntervalos([iv(0, 10), iv(15, 20)])).toEqual([iv(0, 10), iv(15, 20)]);
  });

  it("absorbe un tramo contenido en otro", () => {
    expect(unirIntervalos([iv(0, 100), iv(20, 30)])).toEqual([iv(0, 100)]);
  });

  it("no depende del orden de entrada", () => {
    expect(unirIntervalos([iv(15, 20), iv(0, 10), iv(5, 8)])).toEqual([iv(0, 10), iv(15, 20)]);
  });

  it("no muta la lista original", () => {
    const orig = [iv(0, 10), iv(5, 20)];
    unirIntervalos(orig);
    expect(orig).toEqual([iv(0, 10), iv(5, 20)]);
  });

  it("con lista vacía devuelve vacío", () => {
    expect(unirIntervalos([])).toEqual([]);
  });
});

describe("costoTiempo — horas reales", () => {
  it("traduce las horas a dinero a la tarifa dada", () => {
    // Un expediente: Creado 08 → Firma 13 = 5 h hábiles de reloj.
    const c = costoTiempo(construirExpedientes([fila({})]), 8);
    expect(c.horas).toBe(5);
    expect(c.costo).toBe(40);
  });

  it("dos expedientes traslapados de la misma persona cuestan UNA vez", () => {
    // ANA lleva los dos a la vez, en la misma franja: el reloj corre una vez.
    const exps = construirExpedientes([
      fila({ c807_file: "A", Usuario: "ANA", Analista: "ANA" }),
      fila({ c807_file: "B", Usuario: "ANA", Analista: "ANA" }),
    ]);
    const c = costoTiempo(exps, 8);
    expect(c.horasSuma).toBe(10); // sumando por expediente
    expect(c.horas).toBe(5);      // pero es la misma franja
    expect(c.costo).toBe(40);
    expect(c.traslape).toBe(2);
  });

  it("dos expedientes seguidos, sin traslape, sí suman", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "A", Usuario: "ANA", Analista: "ANA" }),
      fila({
        c807_file: "B", Usuario: "ANA", Analista: "ANA",
        Creado: "2026-01-06T08:00:00", DPR: "2026-01-06T09:00:00",
        Clasificacion_exacta: "2026-01-06T10:00:00", Creacion_Pre_DUCA: "2026-01-06T11:00:00",
        Revision_Analista: "2026-01-06T12:00:00", Solicitar_firma_def: "2026-01-06T13:00:00",
      }),
    ]);
    const c = costoTiempo(exps, 8);
    expect(c.horas).toBe(10);
    expect(c.traslape).toBe(1);
  });

  it("personas distintas en la misma franja sí cuestan por separado", () => {
    // Son dos sueldos: el traslape solo aplica dentro de una misma persona.
    const exps = construirExpedientes([
      fila({ c807_file: "A", Usuario: "ANA", Analista: "ANA" }),
      fila({ c807_file: "B", Usuario: "BETO", Analista: "BETO" }),
    ]);
    expect(costoTiempo(exps, 8).horas).toBe(10);
  });

  it("Usuario y Analista distintos se reparten la ventana sin solaparse", () => {
    // ANA responde de Creado a Revisión (4 h) y BETO de Revisión a Firma (1 h).
    const c = costoTiempo(construirExpedientes([fila({ Usuario: "ANA", Analista: "BETO" })]), 8);
    const ana = c.personas.find((p) => p.clave === "ANA")!;
    const beto = c.personas.find((p) => p.clave === "BETO")!;
    expect(ana.horasReales).toBe(4);
    expect(beto.horasReales).toBe(1);
    expect(c.horas).toBe(5);
  });

  it("reporta el traslape de cada persona por separado", () => {
    // ANA con dos traslapados (2×) y BETO con uno solo (1×).
    const filas = costoPorPersona(construirExpedientes([
      fila({ c807_file: "A", Usuario: "ANA", Analista: "ANA" }),
      fila({ c807_file: "B", Usuario: "ANA", Analista: "ANA" }),
      fila({ c807_file: "C", Usuario: "BETO", Analista: "BETO" }),
    ]), 8);
    const ana = filas.find((p) => p.clave === "ANA")!;
    const beto = filas.find((p) => p.clave === "BETO")!;
    expect(ana.expedientes).toBe(2);
    expect(ana.horasReales).toBe(5);
    expect(ana.traslape).toBe(2);
    expect(ana.bloques).toBe(1);
    expect(beto.traslape).toBe(1);
  });

  it("los ejecutores automatizados no cobran", () => {
    const c = costoTiempo(construirExpedientes([
      fila({ c807_file: "A", Usuario: "Docalpha OCR (KM)", Analista: "Docalpha OCR (KM)" }),
    ]), 8);
    expect(c.horas).toBe(0);
    expect(c.costo).toBe(0);
    expect(c.personas).toHaveLength(0);
  });

  it("reparte por etapa y las cuotas suman 100", () => {
    const c = costoTiempo(construirExpedientes([fila({})]), 8);
    expect(c.porEtapa).toHaveLength(5);
    expect(c.porEtapa.reduce((s, e) => s + e.pct, 0)).toBeCloseTo(100, 8);
    expect(c.porEtapa.reduce((s, e) => s + e.costo, 0)).toBeCloseTo(c.costo, 8);
  });

  it("la serie va en orden y sus meses suman el total exacto", () => {
    const c = costoTiempo(construirExpedientes([
      fila({ c807_file: "F1", Creado: "2026-02-05T08:00:00", DPR: "2026-02-05T09:00:00",
        Clasificacion_exacta: "2026-02-05T10:00:00", Creacion_Pre_DUCA: "2026-02-05T11:00:00",
        Revision_Analista: "2026-02-05T12:00:00", Solicitar_firma_def: "2026-02-05T13:00:00" }),
      fila({ c807_file: "F2" }),
    ]), 8);
    expect(c.serie.map((p) => p.clave)).toEqual(["2026-01", "2026-02"]);
    expect(c.serie.reduce((s, p) => s + p.costo, 0)).toBeCloseTo(c.costo, 6);
  });

  it("un tramo que cruza de mes se reparte entre los dos", () => {
    // Creado el 29 de enero, firmado el 3 de febrero: cada mes recibe lo suyo.
    const c = costoTiempo(construirExpedientes([fila({
      Creado: "2026-01-29T08:00:00", DPR: "2026-01-29T09:00:00",
      Clasificacion_exacta: "2026-01-30T10:00:00", Creacion_Pre_DUCA: "2026-02-02T11:00:00",
      Revision_Analista: "2026-02-03T09:00:00", Solicitar_firma_def: "2026-02-03T13:00:00",
    })]), 8);
    expect(c.serie).toHaveLength(2);
    expect(c.serie.reduce((s, p) => s + p.horas, 0)).toBeCloseTo(c.horas, 6);
    expect(c.serie.every((p) => p.horas > 0)).toBe(true);
  });

  it("sin expedientes no divide por cero ni inventa costo", () => {
    const c = costoTiempo([], 8);
    expect(c.costo).toBe(0);
    expect(c.traslape).toBe(0);
    expect(c.serie).toEqual([]);
    expect(c.porEtapa.every((e) => e.pct === 0 && e.costo === 0)).toBe(true);
    expect(c.costoDisponible).toBe(0);
    expect(c.utilizacion).toBe(0);
  });
});

describe("licencias de digitalización", () => {
  const conLic = (o: Partial<RoiRow> = {}) =>
    fila({ Licencias: "2", Costo: "2.2", "Documents Count": "3", "Pages Count": "5", ...o });

  it("lee los números de la hoja", () => {
    const [e] = construirExpedientes([conLic({})]);
    expect(e.licencias).toBe(2);
    expect(e.costoLicencias).toBeCloseTo(2.2, 8);
    expect(e.docs).toBe(3);
    expect(e.paginas).toBe(5);
  });

  it("un expediente sin dato queda en cero, no en NaN", () => {
    const [e] = construirExpedientes([fila({ Licencias: "", Costo: "" })]);
    expect(e.licencias).toBe(0);
    expect(e.costoLicencias).toBe(0);
  });

  it("las filas repetidas NO suman: el valor se toma una vez", () => {
    // Caso real: 3,109 expedientes duplicados, todos con el mismo valor en sus
    // filas. Sumarlas inventaría licencias que no existen.
    const exps = construirExpedientes([
      conLic({ c807_file: "DUP", Proceso: "Aduana" }),
      conLic({ c807_file: "DUP", Proceso: "Importación" }),
    ]);
    expect(exps).toHaveLength(1);
    expect(exps[0].licencias).toBe(2); // no 4
    expect(exps[0].costoLicencias).toBeCloseTo(2.2, 8);
  });

  it("suma el total del recorte y reporta la cobertura", () => {
    const l = contarLicencias(construirExpedientes([
      conLic({ c807_file: "A" }),
      conLic({ c807_file: "B", Licencias: "4", Costo: "4.4" }),
      fila({ c807_file: "C", Licencias: "", Costo: "" }), // sin dato
    ]));
    expect(l.total).toBe(6);
    expect(l.costo).toBeCloseTo(6.6, 8);
    expect(l.expedientes).toBe(2);
    expect(l.cobertura).toBeCloseTo(2 / 3, 8);
    expect(l.precioUnitario).toBeCloseTo(1.1, 8);
    expect(l.porExpediente).toBe(3);
  });

  it("sin licencias no divide por cero", () => {
    const l = contarLicencias(construirExpedientes([fila({ Licencias: "", Costo: "" })]));
    expect(l.precioUnitario).toBe(0);
    expect(l.porExpediente).toBe(0);
    expect(l.cobertura).toBe(0);
  });

  it("el costo total suma las horas y las licencias", () => {
    // Un expediente de 5 h a $8 = $40, más 2 licencias de $2.20.
    const c = costoTiempo(construirExpedientes([conLic({ Usuario: "ANA", Analista: "ANA" })]), 8);
    expect(c.costo).toBe(40);
    expect(c.licencias.costo).toBeCloseTo(2.2, 8);
    expect(c.costoTotal).toBeCloseTo(42.2, 8);
  });

  it("las licencias responden a los filtros igual que todo lo demás", () => {
    const exps = construirExpedientes([
      conLic({ c807_file: "A", Mesa: "Mesa 1" }),
      conLic({ c807_file: "B", Mesa: "Mesa 2", Licencias: "10", Costo: "11" }),
    ]);
    const soloMesa1 = filtrarExpedientes(exps, { ...FILTROS_VACIOS, mesas: ["Mesa 1"] });
    expect(contarLicencias(soloMesa1).total).toBe(2);
    expect(contarLicencias(exps).total).toBe(12);
  });
});

describe("costoUnitario y proyección", () => {
  const conLic = (o: Partial<RoiRow> = {}) => fila({ Licencias: "2", Costo: "2.2", ...o });

  it("reparte el costo total entre los expedientes trabajados", () => {
    // Un expediente: 5 h × $8 = $40 de horas + $2.20 de licencias.
    const u = costoUnitario(costoTiempo(construirExpedientes([conLic({ Usuario: "ANA", Analista: "ANA" })]), 8));
    expect(u.expedientes).toBe(1);
    expect(u.operativoPorExpediente).toBe(40);
    expect(u.licenciasPorExpediente).toBeCloseTo(2.2, 8);
    expect(u.porExpediente).toBeCloseTo(42.2, 8);
    expect(u.horasPorExpediente).toBe(5);
  });

  it("calcula la plantilla necesaria al 95% de ocupación", () => {
    const c = costoTiempo(construirExpedientes([fila({ Usuario: "ANA", Analista: "ANA" })]), 8);
    const u = costoUnitario(c);
    // 5 h de reloj sobre una ventana de 5 h al 95% → algo más de una persona.
    expect(u.horasPorPersonaObjetivo).toBeCloseTo(5 * 0.95, 8);
    expect(u.personasNecesarias).toBeCloseTo(5 / (5 * 0.95), 8);
    expect(u.personasActuales).toBe(1);
  });

  it("sin expedientes no divide por cero", () => {
    const u = costoUnitario(costoTiempo([], 8));
    expect(u.porExpediente).toBe(0);
    expect(u.personasNecesarias).toBe(0);
  });

  it("proyecta los meses que faltan del año con el promedio reciente", () => {
    const serie = [
      { clave: "2026-01", label: "ene 26", volumen: 100, horas: 50, costo: 400 },
      { clave: "2026-02", label: "feb 26", volumen: 100, horas: 50, costo: 400 },
      { clave: "2026-03", label: "mar 26", volumen: 100, horas: 50, costo: 400 },
    ];
    // Referencia: 31 de marzo a las 18:00 → marzo ya está completo.
    const p = proyectarAnio(serie, new Date(2026, 2, 31, 18, 0, 0));
    expect(p).toHaveLength(12);
    expect(p.filter((x) => x.estimado)).toHaveLength(9); // abril a diciembre
    const abril = p.find((x) => x.clave === "2026-04")!;
    expect(abril.estimado).toBe(true);
    expect(abril.costo).toBe(400);
    expect(abril.volumen).toBe(100);
  });

  it("completa el mes en curso en vez de dejarlo a medias", () => {
    const serie = [
      { clave: "2026-01", label: "ene 26", volumen: 100, horas: 50, costo: 400 },
      { clave: "2026-02", label: "feb 26", volumen: 50, horas: 5, costo: 40 }, // a medias
    ];
    const p = proyectarAnio(serie, new Date(2026, 1, 10, 13, 0, 0), 1);
    const feb = p.find((x) => x.clave === "2026-02")!;
    expect(feb.parcial).toBe(true);
    expect(feb.estimado).toBe(true);
    expect(feb.volumen).toBeGreaterThan(50); // el ritmo de creación se escala
  });

  it("el costo del mes en curso NO arrastra el sesgo de los ciclos sin cerrar", () => {
    // Enero completo: 100 expedientes a $4 c/u. Febrero lleva 50 creados pero
    // solo $40 medidos ($0.80 c/u) porque acaban de empezar. Escalar ese costo
    // multiplicaría el sesgo; hay que usar el unitario de los meses cerrados.
    const serie = [
      { clave: "2026-01", label: "ene 26", volumen: 100, horas: 50, costo: 400 },
      { clave: "2026-02", label: "feb 26", volumen: 50, horas: 5, costo: 40 },
    ];
    const feb = proyectarAnio(serie, new Date(2026, 1, 10, 13, 0, 0), 1)
      .find((x) => x.clave === "2026-02")!;
    expect(feb.costoPorExpediente).toBeCloseTo(4, 8); // el de enero, no $0.80
    expect(feb.costo).toBeCloseTo(feb.volumen * 4, 6);
  });

  it("el mes parcial no contamina la base de la proyección", () => {
    // Enero y febrero completos a 400; marzo va a medias con 40.
    const serie = [
      { clave: "2026-01", label: "ene 26", volumen: 100, horas: 50, costo: 400 },
      { clave: "2026-02", label: "feb 26", volumen: 100, horas: 50, costo: 400 },
      { clave: "2026-03", label: "mar 26", volumen: 10, horas: 5, costo: 40 },
    ];
    const p = proyectarAnio(serie, new Date(2026, 2, 5, 13, 0, 0), 2);
    // Abril sale de enero y febrero, no del marzo incompleto.
    expect(p.find((x) => x.clave === "2026-04")!.costo).toBe(400);
  });

  it("reporta el costo por expediente de cada mes", () => {
    const serie = [{ clave: "2026-01", label: "ene 26", volumen: 100, horas: 50, costo: 400 }];
    const p = proyectarAnio(serie, new Date(2026, 0, 31, 18, 0, 0));
    expect(p[0].costoPorExpediente).toBe(4);
  });

  it("una serie vacía no proyecta nada", () => {
    expect(proyectarAnio([], new Date(2026, 5, 1))).toEqual([]);
  });
});

// El acordeón del costo unitario mide SOLO Ducafast (T1–T3). El resto del
// reporte sigue con las 5 etapas, así que lo que se prueba aquí es que el
// alcance recorte de verdad y que el camino por defecto no cambie.
describe("alcance de etapas", () => {
  it("ALCANCE_UNITARIO es el tramo Ducafast", () => {
    expect(ALCANCE_UNITARIO).toEqual(["t1", "t2", "t3"]);
  });

  it("etiqueta y recorrido describen el tramo", () => {
    expect(etiquetaAlcance(ALCANCE_UNITARIO)).toBe("T1–T3");
    expect(recorridoAlcance(ALCANCE_UNITARIO)).toBe("Creado → Creación Pre-DUCA");
    expect(etiquetaAlcance(["t2"])).toBe("T2");
    // Con el ciclo entero no hay nada que aclarar: la etiqueta va vacía.
    expect(etiquetaAlcance(ETAPA_KEYS)).toBe("");
  });

  it("los hitos del alcance son los extremos de sus tramos", () => {
    expect(hitosDelAlcance(ALCANCE_UNITARIO).sort())
      .toEqual(["clasificacion", "creado", "dpr", "preduca"]);
  });

  it("recorta las etapas atribuidas a cada rol", () => {
    const e = construirExpedientes([fila({ Usuario: "ANA", Analista: "BETO" })])[0];
    expect(etapasAtribuidas(e, "usuario", ALCANCE_UNITARIO)).toEqual(["t1", "t2", "t3"]);
    // El analista solo carga T5, que queda fuera: no le toca nada.
    expect(etapasAtribuidas(e, "analista", ALCANCE_UNITARIO)).toEqual([]);
  });

  it("el ciclo completo de quien hace ambos roles también se recorta", () => {
    const e = construirExpedientes([fila({ Usuario: "ANA", Analista: "ANA" })])[0];
    expect(etapasAtribuidas(e, "usuario")).toEqual(ETAPA_KEYS);
    expect(etapasAtribuidas(e, "usuario", ALCANCE_UNITARIO)).toEqual(["t1", "t2", "t3"]);
  });

  it("la ventana se mide entre los hitos del alcance", () => {
    // Creado 08:00 → Pre-DUCA 11:00 = 3 h, contra las 5 h del ciclo entero.
    expect(ventanaDe(construirExpedientes([fila({})]), ALCANCE_UNITARIO).horas).toBe(3);
    expect(ventanaDe(construirExpedientes([fila({})])).horas).toBe(5);
  });

  it("solo cobra quien participa en el tramo", () => {
    const exps = construirExpedientes([fila({ Usuario: "ANA", Analista: "BETO" })]);
    const c = costoTiempo(exps, 8, false, false, ALCANCE_UNITARIO);
    // ANA: Creado → Pre-DUCA = 3 h. BETO solo tenía T5, así que desaparece.
    expect(c.personas.map((p) => p.clave)).toEqual(["ANA"]);
    expect(c.horas).toBe(3);
    expect(c.costo).toBe(24);
    // El ciclo entero sí incluye a BETO y su hora.
    expect(costoTiempo(exps, 8).horas).toBe(5);
  });

  it("el reparto por etapa se limita al alcance y sigue sumando 100", () => {
    const c = costoTiempo(construirExpedientes([fila({})]), 8, false, false, ALCANCE_UNITARIO);
    expect(c.alcance).toEqual(ALCANCE_UNITARIO);
    expect(c.porEtapa.map((e) => e.key)).toEqual(["t1", "t2", "t3"]);
    expect(c.porEtapa.reduce((s, e) => s + e.pct, 0)).toBeCloseTo(100, 8);
    expect(c.porEtapa.reduce((s, e) => s + e.horas, 0)).toBeCloseTo(c.horas, 8);
  });

  it("no cuenta expedientes cuyo tiempo medido cae fuera del tramo", () => {
    // Solo tiene Pre-DUCA → Revisión → Firma: nada de Ducafast que medir.
    const exps = construirExpedientes([fila({
      Creado: "", DPR: "", Clasificacion_exacta: "",
    })]);
    expect(costoTiempo(exps, 8).n).toBe(1);
    expect(costoTiempo(exps, 8, false, false, ALCANCE_UNITARIO).n).toBe(0);
  });

  it("el traslape se une dentro del tramo, no se suma", () => {
    // Dos expedientes de ANA en la misma franja: 3 h reales, no 6.
    const c = costoTiempo(construirExpedientes([
      fila({ c807_file: "A", Usuario: "ANA", Analista: "ANA" }),
      fila({ c807_file: "B", Usuario: "ANA", Analista: "ANA" }),
    ]), 8, false, false, ALCANCE_UNITARIO);
    expect(c.horas).toBe(3);
    expect(c.horasSuma).toBe(6);
    expect(c.traslape).toBe(2);
  });

  it("las licencias del unitario salen de la misma base que el denominador", () => {
    const exps = construirExpedientes([
      // Completo: entra en las dos bases.
      fila({ c807_file: "A", Licencias: "2", Costo: "2.2" }),
      // Sin Ducafast: solo aporta licencias a la base del ciclo completo.
      fila({ c807_file: "B", Licencias: "5", Costo: "5.5", Creado: "", DPR: "", Clasificacion_exacta: "" }),
    ]);
    const duca = costoTiempo(exps, 8, false, false, ALCANCE_UNITARIO);
    // El recorte entero sigue reportando las 7 licencias…
    expect(duca.licencias.total).toBe(7);
    // …pero el unitario solo reparte las 2 del expediente que sí midió T1–T3.
    expect(duca.licenciasBase.total).toBe(2);
    expect(duca.n).toBe(1);
    expect(costoUnitario(duca).licenciasPorExpediente).toBeCloseTo(2.2, 8);
  });

  it("el costo unitario del tramo divide entre los expedientes del tramo", () => {
    const exps = construirExpedientes([fila({ Usuario: "ANA", Analista: "ANA", Licencias: "2", Costo: "2.2" })]);
    const u = costoUnitario(costoTiempo(exps, 8, false, false, ALCANCE_UNITARIO));
    expect(u.expedientes).toBe(1);
    expect(u.horasPorExpediente).toBe(3);
    expect(u.operativoPorExpediente).toBe(24);
    // Las licencias no salen del reloj: no dependen del tramo.
    expect(u.licenciasPorExpediente).toBeCloseTo(2.2, 8);
    expect(u.porExpediente).toBeCloseTo(26.2, 8);
  });

  it("el volumen de la serie cuenta solo lo que entró en el costo", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "A" }),
      // Creado el mismo mes (así entra en el cubo) pero sin ningún tramo de
      // Ducafast medido: le faltan DPR y Clasificación, así que T1–T3 se caen.
      fila({ c807_file: "B", DPR: "", Clasificacion_exacta: "" }),
    ]);
    expect(costoTiempo(exps, 8).serie[0].volumen).toBe(2);
    const duca = costoTiempo(exps, 8, false, false, ALCANCE_UNITARIO).serie;
    expect(duca[0].volumen).toBe(1);
    // 3 h × $8 entre 1 expediente, no entre 2.
    expect(duca[0].costo / duca[0].volumen).toBe(24);
  });

  it("sin alcance explícito nada cambia", () => {
    const exps = construirExpedientes([fila({})]);
    const a = costoTiempo(exps, 8);
    const b = costoTiempo(exps, 8, false, false, ETAPA_KEYS);
    expect(a.horas).toBe(b.horas);
    expect(a.n).toBe(b.n);
    expect(a.alcance).toEqual(ETAPA_KEYS);
  });
});

// Filtro global "Tiempo" del reporte: un rango T_i→T_j elegido por el usuario
// que reacciona en la barra del ciclo, los indicadores, Capacidad instalada y
// Costo por expediente — todas con el MISMO alcance (interseccionAlcance ya
// no se usa para acotar costo por expediente a Ducafast; eso quedó solo para
// el Informe anual y como corchete informativo de la barra del ciclo).
// Ver rangoEtapas/interseccionAlcance/totalEnAlcance.
describe("filtro global de Tiempo", () => {
  it("rangoEtapas arma un tramo contiguo sin importar el orden de desde/hasta", () => {
    expect(rangoEtapas("t2", "t4")).toEqual(["t2", "t3", "t4"]);
    expect(rangoEtapas("t4", "t2")).toEqual(["t2", "t3", "t4"]); // invertido: mismo tramo
    expect(rangoEtapas("t1", "t5")).toEqual(ETAPA_KEYS);
    expect(rangoEtapas("t3", "t3")).toEqual(["t3"]);
  });

  it("interseccionAlcance combina el filtro global con un alcance fijo (Ducafast)", () => {
    expect(interseccionAlcance(rangoEtapas("t1", "t2"), ALCANCE_UNITARIO)).toEqual(["t1", "t2"]);
    expect(interseccionAlcance(rangoEtapas("t4", "t5"), ALCANCE_UNITARIO)).toEqual([]); // sin traslape
    expect(interseccionAlcance(ETAPA_KEYS, ALCANCE_UNITARIO)).toEqual(ALCANCE_UNITARIO);
  });

  it("totalEnAlcance suma solo las etapas del tramo y exige que ESAS estén completas", () => {
    const e = construirExpedientes([fila({})])[0]; // 1 h por etapa
    expect(totalEnAlcance(e, ["t1", "t2"])).toBe(7200); // 2 h, ignora t3-t5
    expect(totalEnAlcance(e, ETAPA_KEYS)).toBe(e.total); // alcance completo = e.total
    const incompleto = construirExpedientes([fila({ DPR: "" })])[0]; // sin hito de t1/t2
    expect(totalEnAlcance(incompleto, ["t1", "t2"])).toBeNull(); // le falta t1 (y t2) dentro del tramo
    expect(totalEnAlcance(incompleto, ["t3"])).not.toBeNull(); // t3 no depende de DPR
  });

  it("calcularIndicadores recorta las tarjetas y el Total refleja el tramo", () => {
    const exps = construirExpedientes([fila({})]);
    const ind = calcularIndicadores(exps, "mediana", rangoEtapas("t1", "t2"));
    expect(ind.map((i) => i.key)).toEqual(["t1", "t2", "total"]);
    expect(ind.find((i) => i.key === "total")!.label).toBe("Total · T1–T2");
    expect(ind.find((i) => i.key === "total")!.valor).toBe(7200); // 2 h
  });

  it("calcularIndicadores omite el Total si el tramo es una sola etapa (sería redundante)", () => {
    const exps = construirExpedientes([fila({})]);
    const ind = calcularIndicadores(exps, "mediana", ["t3"]);
    expect(ind.map((i) => i.key)).toEqual(["t3"]); // sin fila "total" duplicada
  });

  it("composicionCiclo recorta segmentos, exige solo las etapas del tramo y sigue sumando 100", () => {
    const exps = construirExpedientes([fila({})]);
    const c = composicionCiclo(exps, "mediana", rangoEtapas("t1", "t3"));
    expect(c.segmentos.map((s) => s.key)).toEqual(["t1", "t2", "t3"]);
    expect(c.total).toBe(10800); // 3 h
    expect(c.segmentos.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 8);
    // Ducafast (t1-t3) SÍ cabe entero en el tramo t1-t3 → se dibuja.
    expect(c.grupos.map((g) => g.key)).toEqual(["ducafast"]);
  });

  it("composicionCiclo oculta un grupo con nombre que no cabe entero en el tramo", () => {
    const exps = construirExpedientes([fila({})]);
    // Ducafast es t1-t3; un tramo t2-t4 solo cubre una parte → no se dibuja el corchete.
    const c = composicionCiclo(exps, "mediana", rangoEtapas("t2", "t4"));
    expect(c.grupos).toEqual([]);
  });

  it("composicionCiclo: un expediente que solo completa el tramo (no las 5) SÍ cuenta como completo", () => {
    // Le falta Revisión/Firma (t4/t5), pero el tramo pedido es solo t1-t2.
    const exps = construirExpedientes([fila({ Revision_Analista: "", Solicitar_firma_def: "" })]);
    expect(exps[0].total).toBeNull(); // no completa el ciclo entero
    const c = composicionCiclo(exps, "mediana", rangoEtapas("t1", "t2"));
    expect(c.n).toBe(1); // pero sí completa t1-t2
    expect(c.total).toBe(7200);
  });

  it("agruparPorPersona: un rol sin ningún solape con el tramo da null (no cero)", () => {
    const exps = construirExpedientes([fila({ Usuario: "ANA", Analista: "BETO" })]);
    // El Analista solo carga T5; con el tramo T1-T3 no le toca nada del ciclo.
    const filas = agruparPorPersona(exps, "analista", "mediana", ALCANCE_UNITARIO);
    const beto = filas.find((f) => f.clave === "BETO")!;
    expect(beto.tiempos.total).toBeNull();
    expect(beto.tiempos.t5).toBeNull(); // fuera del alcance, no "no le tocó su etapa"
  });

  it("agruparPorPersona: quien sí solapa con el tramo mide solo esa parte", () => {
    const exps = construirExpedientes([fila({ Usuario: "ANA", Analista: "BETO" })]);
    const filas = agruparPorPersona(exps, "usuario", "mediana", ALCANCE_UNITARIO);
    const ana = filas.find((f) => f.clave === "ANA")!;
    expect(ana.tiempos.total).toBe(10800); // T1-T3 = 3 h
    expect(ana.tiempos.t4).toBeNull(); // fuera del alcance elegido
  });

  it("coberturaHitos recorta a los hitos que delimitan el tramo elegido", () => {
    const exps = construirExpedientes([fila({})]);
    const h = coberturaHitos(exps, rangoEtapas("t1", "t2"));
    expect(h.map((x) => x.key)).toEqual(["creado", "dpr", "clasificacion"]);
  });

  it("sin filtro (T1→T5) todas las funciones se comportan como antes", () => {
    const exps = construirExpedientes([fila({})]);
    const full = rangoEtapas("t1", "t5");
    expect(full).toEqual(ETAPA_KEYS);
    expect(calcularIndicadores(exps, "mediana", full)).toEqual(calcularIndicadores(exps, "mediana"));
    expect(composicionCiclo(exps, "mediana", full)).toEqual(composicionCiclo(exps, "mediana"));
    expect(coberturaHitos(exps, full)).toEqual(coberturaHitos(exps));
  });
});

describe("disponibilidad contra uso", () => {
  it("la ventana son las horas hábiles entre el primer y el último hito", () => {
    // Creado 08:00 → Firma 13:00 del mismo día = 5 h hábiles.
    const v = ventanaDe(construirExpedientes([fila({})]));
    expect(v.horas).toBe(5);
  });

  it("la ventana no depende de cuántos expedientes haya, sino de su alcance", () => {
    const v = ventanaDe(construirExpedientes([
      fila({ c807_file: "A" }),
      fila({
        c807_file: "B", Creado: "2026-01-06T08:00:00", DPR: "2026-01-06T09:00:00",
        Clasificacion_exacta: "2026-01-06T10:00:00", Creacion_Pre_DUCA: "2026-01-06T11:00:00",
        Revision_Analista: "2026-01-06T12:00:00", Solicitar_firma_def: "2026-01-06T13:00:00",
      }),
    ]));
    // Lunes 08:00 → martes 13:00: 9 h del lunes + 5 h del martes.
    expect(v.horas).toBe(14);
  });

  it("quien ocupa toda la ventana no deja nada sin usar", () => {
    const [p] = costoPorPersona(construirExpedientes([fila({ Usuario: "ANA", Analista: "ANA" })]), 8);
    expect(p.horasDisponibles).toBe(5);
    expect(p.horasReales).toBe(5);
    expect(p.utilizacion).toBe(1);
    expect(p.costoSinUsar).toBe(0);
  });

  it("pone precio a la disponibilidad no ocupada", () => {
    // ANA solo cubre T1-T4 (4 h) de una ventana de 5 h: 1 h sin usar = $8.
    const [ana] = costoPorPersona(construirExpedientes([fila({ Usuario: "ANA", Analista: "BETO" })]), 8)
      .filter((p) => p.clave === "ANA");
    expect(ana.horasDisponibles).toBe(5);
    expect(ana.horasReales).toBe(4);
    expect(ana.costoDisponible).toBe(40);
    expect(ana.costo).toBe(32);
    expect(ana.costoSinUsar).toBe(8);
    expect(ana.utilizacion).toBeCloseTo(0.8, 8);
  });

  it("esUsuario/esAnalista clasifican a cada persona por el rol con que contribuyó horas", () => {
    const exps = construirExpedientes([fila({ Usuario: "ANA", Analista: "BETO" })]);
    const [ana] = costoPorPersona(exps, 8).filter((p) => p.clave === "ANA");
    const [beto] = costoPorPersona(exps, 8).filter((p) => p.clave === "BETO");
    expect(ana).toMatchObject({ esUsuario: true, esAnalista: false });
    expect(beto).toMatchObject({ esUsuario: false, esAnalista: true });
  });

  it("quien es Usuario en un expediente y Analista en otro queda marcado en ambos roles", () => {
    const exps = construirExpedientes([
      fila({ c807_file: "A", Usuario: "ANA", Analista: "BETO" }),
      fila({ c807_file: "B", Usuario: "CARLA", Analista: "ANA" }),
    ]);
    const [ana] = costoPorPersona(exps, 8).filter((p) => p.clave === "ANA");
    expect(ana).toMatchObject({ esUsuario: true, esAnalista: true });
  });

  it("quien hace ambos papeles en el MISMO expediente queda marcado en AMBOS roles, sin duplicar la hora", () => {
    // mismaPersona: su ciclo completo se cuenta UNA sola vez (vía Usuario,
    // etapasAtribuidas le da las 5 etapas), pero se marca también Analista
    // para que aparezca en los dos filtros mostrando el ciclo completo.
    const exps = construirExpedientes([fila({ Usuario: "ANA", Analista: "ANA" })]);
    const [ana] = costoPorPersona(exps, 8).filter((p) => p.clave === "ANA");
    expect(ana).toMatchObject({ esUsuario: true, esAnalista: true });
    expect(ana.horasReales).toBe(5);  // ciclo completo (Creado→Firma), una sola vez
    expect(ana.expedientes).toBe(1);  // no se duplicó el intervalo
  });

  it("el alcance recorta el rol: si el tramo de su rol queda fuera, no se marca", () => {
    // BETO solo es Analista (T5); con el alcance Ducafast (T1-T3) no le toca nada.
    const exps = construirExpedientes([fila({ Usuario: "ANA", Analista: "BETO" })]);
    const filas = costoPorPersona(exps, 8, undefined, ALCANCE_UNITARIO);
    expect(filas.map((p) => p.clave)).toEqual(["ANA"]); // BETO ni aparece
  });

  it("el total disponible es la plantilla por la ventana", () => {
    const c = costoTiempo(construirExpedientes([fila({ Usuario: "ANA", Analista: "BETO" })]), 8);
    expect(c.personas).toHaveLength(2);
    expect(c.ventana.horas).toBe(5);
    expect(c.costoDisponible).toBe(2 * 5 * 8);   // 2 personas × 5 h × $8
    expect(c.costo).toBe(40);                     // ANA 4 h + BETO 1 h
    expect(c.costoSinUsar).toBe(40);
    expect(c.utilizacion).toBeCloseTo(0.5, 8);
  });

  it("el costo sin usar nunca es negativo", () => {
    const c = costoTiempo(construirExpedientes([
      fila({ c807_file: "A", Usuario: "ANA", Analista: "ANA" }),
      fila({ c807_file: "B", Usuario: "ANA", Analista: "ANA" }),
    ]), 8);
    expect(c.costoSinUsar).toBeGreaterThanOrEqual(0);
    expect(c.personas.every((p) => p.costoSinUsar >= 0)).toBe(true);
  });
});

describe("ETAPA_KEYS", () => {
  it("son las 5 etapas de la cadena", () => {
    expect(ETAPA_KEYS).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });
});
