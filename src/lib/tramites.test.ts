import { describe, it, expect } from "vitest";
import {
  esAutomatizado, ordenarMesas, parseFecha,
  construirExpedientes, calcularIndicadores, composicionCiclo,
  filtrarExpedientes, coberturaHitos, serieTemporal, cargaYCapacidad,
  contarPersonas, exportarCSV, agruparPor, opcionesDeFiltro,
  mediana, promedio, percentil90,
  mismaPersona, etapasAtribuidas, tiempoAtribuido, agruparPorPersona, costoTiempo,
  SIN_MESA, SIN_DATO, FILTROS_VACIOS, ETAPA_KEYS,
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

describe("costoTiempo", () => {
  it("traduce las horas a dinero a la tarifa dada", () => {
    // Un expediente de 5 etapas × 1 h = 5 h hábiles.
    const c = costoTiempo(construirExpedientes([fila({})]), 8);
    expect(c.horas).toBe(5);
    expect(c.costo).toBe(40);
  });

  it("cuenta las etapas medidas aunque falte el ciclo completo", () => {
    // Sin firma no hay T5 ni Total, pero T1-T4 sí ocuparon calendario.
    const exps = construirExpedientes([fila({ Solicitar_firma_def: "" })]);
    expect(exps[0].total).toBeNull();
    const c = costoTiempo(exps, 8);
    expect(c.horas).toBe(4);
    expect(c.costo).toBe(32);
  });

  it("simultáneos divide el costo: el mismo tiempo repartido en más trámites", () => {
    const exps = construirExpedientes([fila({})]);
    expect(costoTiempo(exps, 8, 1).costo).toBe(40);
    expect(costoTiempo(exps, 8, 4).costo).toBe(10);
  });

  it("simultáneos menor a 1 no infla el costo", () => {
    expect(costoTiempo(construirExpedientes([fila({})]), 8, 0).costo).toBe(40);
  });

  it("reparte por etapa y las cuotas suman 100", () => {
    const c = costoTiempo(construirExpedientes([fila({})]), 8);
    expect(c.porEtapa).toHaveLength(5);
    expect(c.porEtapa.reduce((s, e) => s + e.pct, 0)).toBeCloseTo(100, 8);
    expect(c.porEtapa.reduce((s, e) => s + e.costo, 0)).toBeCloseTo(c.costo, 8);
    expect(c.porEtapa[0].costo).toBe(8); // T1 = 1 h
  });

  it("la serie va por mes y en orden cronológico", () => {
    const c = costoTiempo(construirExpedientes([
      fila({ c807_file: "F1", Creado: "2026-02-05T08:00:00" }),
      fila({ c807_file: "F2", Creado: "2026-01-05T08:00:00" }),
    ]), 8);
    expect(c.serie.map((p) => p.clave)).toEqual(["2026-01", "2026-02"]);
    expect(c.serie.reduce((s, p) => s + p.costo, 0)).toBeCloseTo(c.costo, 8);
  });

  it("sin expedientes no divide por cero ni inventa costo", () => {
    const c = costoTiempo([], 8);
    expect(c.costo).toBe(0);
    expect(c.serie).toEqual([]);
    expect(c.porEtapa.every((e) => e.pct === 0 && e.costo === 0)).toBe(true);
  });

  it("solo cuenta como base los expedientes con algo medido", () => {
    const c = costoTiempo(construirExpedientes([
      fila({ c807_file: "CON" }),
      fila({ c807_file: "SIN", DPR: "", Clasificacion_exacta: "", Revision_Analista: "", Creacion_Pre_DUCA: "", Solicitar_firma_def: "" }),
    ]), 8);
    expect(c.n).toBe(1);
  });
});

describe("ETAPA_KEYS", () => {
  it("son las 5 etapas de la cadena", () => {
    expect(ETAPA_KEYS).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });
});
