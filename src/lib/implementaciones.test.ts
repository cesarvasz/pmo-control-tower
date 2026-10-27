import { describe, it, expect } from "vitest";
import {
  SIN_CLIENTE, SIN_FECHA, aNumero, agruparPorClienteYMes, avanceMesCliente, avanceTotalCliente,
  avanceTotalGeneral, avanceTotalMes, claveMes, etiquetaMes, evaluarFile, evaluarFilaMeta, filtrarPorMeses,
  fmtFechaCorta, fmtImporte, fmtPct, indexarMetas, metaProfitMensual, normalizarMetas,
  pasaFiltroSemaforo, resumenSemaforo, serieMensual, totalesImplementacion,
} from "./implementaciones";
import type { ImplementacionRow, MetaCliente } from "@/types";

const fila = (
  cliente: string, fecha: string, profit: number | null,
  extra: Partial<ImplementacionRow> = {},
): ImplementacionRow => ({
  File: "F", Fecha_cierre: fecha, Cliente: cliente, Usuario: "U",
  ingresos_facturados: null, egresos_liquidados: null, Profit: profit, ...extra,
});

const DATOS: ImplementacionRow[] = [
  fila("A", "2026-03-02T10:00:00", 100),
  fila("A", "2026-03-20T00:00:00", 50.5),
  fila("A", "2026-05-01T09:30:00", -20),
  fila("B", "2026-03-15T00:00:00", 10),
  fila("B", "2026-04-10T00:00:00", null),
  fila("B", "", 5),
];

describe("claveMes / etiquetaMes", () => {
  it("toma el año y el mes de Fecha_cierre", () => {
    expect(claveMes("2026-03-02T10:00:00")).toBe("2026-03");
    expect(claveMes("2025-12-31T23:59:59")).toBe("2025-12");
  });

  it("sin fecha, o con una que no se entiende, va al cubo «Sin fecha»", () => {
    expect(claveMes("")).toBe(SIN_FECHA);
    expect(claveMes("05/03/2026")).toBe(SIN_FECHA);
  });

  it("etiqueta en español", () => {
    expect(etiquetaMes("2026-03")).toBe("Mar 2026");
    expect(etiquetaMes("2026-12")).toBe("Dic 2026");
    expect(etiquetaMes(SIN_FECHA)).toBe("Sin fecha");
  });
});

describe("serieMensual", () => {
  it("un punto por mes, cronológico, con volumen (conteo) y Profit (suma)", () => {
    expect(serieMensual(DATOS)).toEqual([
      { clave: "2026-03", label: "Mar 2026", volumen: 3, profit: 160.5 },
      { clave: "2026-04", label: "Abr 2026", volumen: 1, profit: 0 },
      { clave: "2026-05", label: "May 2026", volumen: 1, profit: -20 },
      { clave: SIN_FECHA, label: "Sin fecha", volumen: 1, profit: 5 },
    ]);
  });

  it("ordena por fecha aunque las filas lleguen desordenadas, y cruza el año", () => {
    const s = serieMensual([
      fila("A", "2026-01-05T00:00:00", 1), fila("A", "2025-11-05T00:00:00", 1), fila("A", "2025-12-05T00:00:00", 1),
    ]);
    expect(s.map((p) => p.clave)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  it("sin filas sin fecha no inventa el cubo «Sin fecha»", () => {
    expect(serieMensual([fila("A", "2026-03-02T00:00:00", 1)]).map((p) => p.clave)).toEqual(["2026-03"]);
    expect(serieMensual([])).toEqual([]);
  });
});

describe("filtrarPorMeses", () => {
  it("sin selección devuelve todo", () => {
    expect(filtrarPorMeses(DATOS, [])).toHaveLength(6);
  });

  it("deja solo los meses elegidos", () => {
    expect(filtrarPorMeses(DATOS, ["2026-03"])).toHaveLength(3);
    expect(filtrarPorMeses(DATOS, ["2026-03", "2026-05"])).toHaveLength(4);
  });

  it("«Sin fecha» también se puede elegir", () => {
    const r = filtrarPorMeses(DATOS, [SIN_FECHA]);
    expect(r).toHaveLength(1);
    expect(r[0].Cliente).toBe("B");
  });

  it("un mes sin filas da vacío", () => {
    expect(filtrarPorMeses(DATOS, ["2030-01"])).toEqual([]);
  });
});

describe("agruparPorClienteYMes", () => {
  const m = agruparPorClienteYMes(DATOS);

  it("las columnas son los meses presentes, con «Sin fecha» al final", () => {
    expect(m.meses).toEqual(["2026-03", "2026-04", "2026-05", SIN_FECHA]);
  });

  it("cada cliente trae volumen y Profit por mes", () => {
    const a = m.clientes.find((c) => c.cliente === "A")!;
    expect(a.porMes["2026-03"]).toEqual({ volumen: 2, profit: 150.5 });
    expect(a.porMes["2026-05"]).toEqual({ volumen: 1, profit: -20 });
    expect(a.porMes["2026-04"]).toBeUndefined(); // sin filas ese mes
    expect(a.total).toEqual({ volumen: 3, profit: 130.5 });

    const b = m.clientes.find((c) => c.cliente === "B")!;
    expect(b.porMes["2026-04"]).toEqual({ volumen: 1, profit: 0 }); // Profit vacío suma 0, pero cuenta en volumen
    expect(b.porMes[SIN_FECHA]).toEqual({ volumen: 1, profit: 5 });
  });

  it("los totales por mes y el general cuadran con la suma de los clientes", () => {
    expect(m.totalesPorMes["2026-03"]).toEqual({ volumen: 3, profit: 160.5 });
    expect(m.total).toEqual({ volumen: 6, profit: 145.5 });

    const sumaClientes = m.clientes.reduce((s, c) => s + c.total.volumen, 0);
    expect(sumaClientes).toBe(m.total.volumen);
    const sumaMeses = m.meses.reduce((s, k) => s + m.totalesPorMes[k].volumen, 0);
    expect(sumaMeses).toBe(m.total.volumen);
  });

  it("ordena los clientes por volumen total, mayor primero", () => {
    expect(m.clientes.map((c) => c.cliente)).toEqual(["A", "B"]);
    const inverso = agruparPorClienteYMes([fila("X", "2026-01-01T00:00:00", 1), fila("Y", "2026-01-01T00:00:00", 1), fila("Y", "2026-01-02T00:00:00", 1)]);
    expect(inverso.clientes.map((c) => c.cliente)).toEqual(["Y", "X"]);
  });

  it("empata por Profit y luego por nombre", () => {
    const r = agruparPorClienteYMes([
      fila("Beta", "2026-01-01T00:00:00", 10), fila("Alfa", "2026-01-01T00:00:00", 10), fila("Gama", "2026-01-01T00:00:00", 99),
    ]);
    expect(r.clientes.map((c) => c.cliente)).toEqual(["Gama", "Alfa", "Beta"]);
  });

  it("un cliente vacío o con espacios cae en «(Sin cliente)»", () => {
    const r = agruparPorClienteYMes([fila("", "2026-01-01T00:00:00", 1), fila("   ", "2026-01-02T00:00:00", 2)]);
    expect(r.clientes).toHaveLength(1);
    expect(r.clientes[0].cliente).toBe(SIN_CLIENTE);
    expect(r.clientes[0].total).toEqual({ volumen: 2, profit: 3 });
  });

  it("el espacio sobrante en el nombre no parte un cliente en dos", () => {
    const r = agruparPorClienteYMes([fila("A", "2026-01-01T00:00:00", 1), fila("A ", "2026-01-02T00:00:00", 1)]);
    expect(r.clientes).toHaveLength(1);
  });

  it("filtrar por mes y luego agrupar muestra solo esas columnas", () => {
    const r = agruparPorClienteYMes(filtrarPorMeses(DATOS, ["2026-03"]));
    expect(r.meses).toEqual(["2026-03"]);
    expect(r.total).toEqual({ volumen: 3, profit: 160.5 });
    expect(r.clientes.map((c) => c.cliente)).toEqual(["A", "B"]);
  });

  it("sin filas devuelve una matriz vacía", () => {
    expect(agruparPorClienteYMes([])).toEqual({ meses: [], clientes: [], totalesPorMes: {}, total: { volumen: 0, profit: 0 } });
  });
});

describe("totalesImplementacion", () => {
  const f = (i: number | null, e: number | null, p: number | null) =>
    fila("C", "", p, { ingresos_facturados: i, egresos_liquidados: e });

  it("suma cada columna por separado", () => {
    expect(totalesImplementacion([f(100, 40, 60), f(50.5, 10, 40.5)]))
      .toEqual({ ingresos: 150.5, egresos: 50, profit: 100.5 });
  });

  it("una celda vacía cuenta como 0 y no contamina la suma", () => {
    expect(totalesImplementacion([f(100, null, null), f(null, 30, -30)]))
      .toEqual({ ingresos: 100, egresos: 30, profit: -30 });
  });

  it("sin filas, todo en 0", () => {
    expect(totalesImplementacion([])).toEqual({ ingresos: 0, egresos: 0, profit: 0 });
  });
});

describe("aNumero", () => {
  it("deja pasar los números tal cual", () => {
    expect(aNumero(1500.5)).toBe(1500.5);
    expect(aNumero(0)).toBe(0);
    expect(aNumero(-20)).toBe(-20);
  });

  it("interpreta importes escritos como texto", () => {
    expect(aNumero("Q1,234.50")).toBe(1234.5);
    expect(aNumero("$ 1,234.50")).toBe(1234.5);
    expect(aNumero("1234")).toBe(1234);
    expect(aNumero("500 USD")).toBe(500);
  });

  it("paréntesis y signo menos son negativos", () => {
    expect(aNumero("(500)")).toBe(-500);
    expect(aNumero("$(1,200.75)")).toBe(-1200.75);
    expect(aNumero("-300")).toBe(-300);
    expect(aNumero("Q-300.5")).toBe(-300.5);
  });

  it("vacío o ilegible es null, nunca NaN ni 0", () => {
    expect(aNumero("")).toBeNull();
    expect(aNumero("   ")).toBeNull();
    expect(aNumero("n/d")).toBeNull();
    expect(aNumero(null)).toBeNull();
    expect(aNumero(undefined)).toBeNull();
    expect(aNumero(NaN)).toBeNull();
    expect(aNumero(Infinity)).toBeNull();
  });
});

describe("formato", () => {
  it("importe en dólares con miles y dos decimales, «—» si no hay valor", () => {
    expect(fmtImporte(1234.5)).toBe("$1,234.50");
    expect(fmtImporte(0)).toBe("$0.00");
    expect(fmtImporte(-20)).toBe("-$20.00");
    expect(fmtImporte(null)).toBe("—");
  });

  it("un negativo que redondea a cero no lleva signo menos", () => {
    expect(fmtImporte(-0.004)).toBe("$0.00");
  });

  it("porcentaje con hasta un decimal", () => {
    expect(fmtPct(0.853)).toBe("85.3%");
    expect(fmtPct(1)).toBe("100%");
    expect(fmtPct(0)).toBe("0%");
    expect(fmtPct(1.2345)).toBe("123.5%");
    expect(fmtPct(-0.05)).toBe("-5%");
  });

  it("fecha corta sin pasar por Date (no depende de la zona horaria)", () => {
    expect(fmtFechaCorta("2026-03-02T00:00:00")).toBe("02/03/2026");
    expect(fmtFechaCorta("2026-03-02T14:30:45")).toBe("02/03/2026 14:30");
    expect(fmtFechaCorta("")).toBe("—");
  });
});

describe("metas", () => {
  const metaA: MetaCliente = { cliente: "A", vol: 10, cm1: 20 }; // 200 de Profit por mes
  const metaB: MetaCliente = { cliente: "B", vol: 5, cm1: 4 };   // 20 de Profit por mes
  const matriz = agruparPorClienteYMes(DATOS);
  const a = matriz.clientes.find((c) => c.cliente === "A")!;

  it("la meta de Profit por mes es Vol × CM1", () => {
    expect(metaProfitMensual(metaA)).toBe(200);
    expect(metaProfitMensual({ vol: 0, cm1: 50 })).toBe(0);
  });

  it("solo cuentan las metas con algo contra qué dividir", () => {
    const idx = indexarMetas([metaA, { cliente: "Z", vol: 0, cm1: 10 }, { cliente: "Y", vol: 10, cm1: 0 }]);
    expect([...idx.keys()]).toEqual(["A"]);
  });

  describe("avances", () => {
    it("% de un cliente en un mes: Profit ÷ meta del mes", () => {
      const r = avanceMesCliente(a, "2026-03", metaA)!;
      expect(r.meta).toBe(200);
      expect(r.profit).toBe(150.5);
      expect(r.pct).toBeCloseTo(0.7525);
    });

    it("un mes sin files del cliente cuenta como 0 % de la meta, no como «sin dato»", () => {
      const r = avanceMesCliente(a, "2026-04", metaA)!;
      expect(r.profit).toBe(0);
      expect(r.pct).toBe(0);
    });

    it("un Profit negativo da un % negativo", () => {
      expect(avanceMesCliente(a, "2026-05", metaA)!.pct).toBeCloseTo(-0.1);
    });

    it("sin meta, o en «Sin fecha», no hay %", () => {
      expect(avanceMesCliente(a, "2026-03", undefined)).toBeNull();
      expect(avanceMesCliente(a, SIN_FECHA, metaA)).toBeNull();
    });

    it("total del cliente: meta mensual × cantidad de meses mostrados, contra el Profit de esos meses", () => {
      const r = avanceTotalCliente(a, matriz.meses, metaA)!; // mar, abr, may (sin-fecha no cuenta)
      expect(r.meta).toBe(600);
      expect(r.profit).toBeCloseTo(130.5);
      expect(r.pct).toBeCloseTo(0.2175);
    });

    it("el total del cliente respeta el filtro de meses", () => {
      const soloMar = agruparPorClienteYMes(filtrarPorMeses(DATOS, ["2026-03"]));
      const fila = soloMar.clientes.find((c) => c.cliente === "A")!;
      expect(avanceTotalCliente(fila, soloMar.meses, metaA)!.meta).toBe(200);
    });

    it("si solo hay «Sin fecha» no hay % total", () => {
      expect(avanceTotalCliente(a, [SIN_FECHA], metaA)).toBeNull();
    });

    it("total del mes: solo los clientes con meta, y su Profit contra su meta", () => {
      const ambos = avanceTotalMes(matriz, "2026-03", indexarMetas([metaA, metaB]))!;
      expect(ambos.meta).toBe(220);
      expect(ambos.profit).toBeCloseTo(160.5);

      // Con meta solo para A, el Profit de B (10) no se mezcla en el numerador.
      const soloA = avanceTotalMes(matriz, "2026-03", indexarMetas([metaA]))!;
      expect(soloA.meta).toBe(200);
      expect(soloA.profit).toBeCloseTo(150.5);
    });

    it("total general: todas las metas × meses mostrados contra su Profit", () => {
      const r = avanceTotalGeneral(matriz, indexarMetas([metaA, metaB]))!;
      expect(r.meta).toBe(660); // (200 + 20) × 3 meses
      expect(r.profit).toBeCloseTo(140.5); // A 130.5 + B 10 (sin contar «Sin fecha»)
    });

    it("sin ninguna meta aplicable, no hay % en ningún total", () => {
      expect(avanceTotalMes(matriz, "2026-03", new Map())).toBeNull();
      expect(avanceTotalGeneral(matriz, new Map())).toBeNull();
    });
  });

  describe("normalizarMetas (lo que se guarda)", () => {
    it("acepta una lista válida, ordena por cliente y redondea el CM1 a centavos", () => {
      const r = normalizarMetas([{ cliente: " B ", vol: 5, cm1: 4.567 }, { cliente: "A", vol: 10, cm1: 20 }]);
      expect(r).toEqual({ ok: true, metas: [{ cliente: "A", vol: 10, cm1: 20 }, { cliente: "B", vol: 5, cm1: 4.57 }] });
    });

    it("una lista vacía es válida (quita todas las metas)", () => {
      expect(normalizarMetas([])).toEqual({ ok: true, metas: [] });
    });

    it("rechaza lo que no es una lista", () => {
      expect(normalizarMetas(undefined).ok).toBe(false);
      expect(normalizarMetas({ cliente: "A" }).ok).toBe(false);
    });

    it("rechaza cliente vacío, repetido o demasiado largo", () => {
      expect(normalizarMetas([{ cliente: "  ", vol: 1, cm1: 1 }]).ok).toBe(false);
      expect(normalizarMetas([{ cliente: "A", vol: 1, cm1: 1 }, { cliente: "A", vol: 2, cm1: 2 }]).ok).toBe(false);
      expect(normalizarMetas([{ cliente: "x".repeat(201), vol: 1, cm1: 1 }]).ok).toBe(false);
    });

    it("rechaza Vol o CM1 negativos, no numéricos o infinitos", () => {
      expect(normalizarMetas([{ cliente: "A", vol: -1, cm1: 1 }]).ok).toBe(false);
      expect(normalizarMetas([{ cliente: "A", vol: 1, cm1: -1 }]).ok).toBe(false);
      expect(normalizarMetas([{ cliente: "A", vol: "10", cm1: 1 }]).ok).toBe(false);
      expect(normalizarMetas([{ cliente: "A", vol: 1, cm1: Infinity }]).ok).toBe(false);
      expect(normalizarMetas([{ cliente: "A", vol: 1 }]).ok).toBe(false);
      expect(normalizarMetas([null]).ok).toBe(false);
    });

    it("pone un tope al tamaño de la lista", () => {
      const muchas = Array.from({ length: 501 }, (_, i) => ({ cliente: `C${i}`, vol: 1, cm1: 1 }));
      expect(normalizarMetas(muchas).ok).toBe(false);
    });
  });

  describe("evaluarFilaMeta (los campos del popup)", () => {
    it("los dos vacíos = sin meta, sin errores", () => {
      expect(evaluarFilaMeta("", "  ")).toMatchObject({ vacia: true, completa: false, errorVol: "", errorCm1: "" });
    });

    it("los dos válidos = meta completa; acepta «$» y comas en el CM1", () => {
      const r = evaluarFilaMeta("120", "$1,250.50");
      expect(r).toMatchObject({ vol: 120, cm1: 1250.5, completa: true, vacia: false, errorVol: "", errorCm1: "" });
    });

    it("con uno solo lleno, al otro le falta el dato", () => {
      expect(evaluarFilaMeta("10", "").errorCm1).toBe("Falta CM1");
      expect(evaluarFilaMeta("", "5").errorVol).toBe("Falta Vol");
      expect(evaluarFilaMeta("10", "").completa).toBe(false);
    });

    it("texto que no es número o negativo es un error", () => {
      expect(evaluarFilaMeta("abc", "5").errorVol).toBe("Número inválido");
      expect(evaluarFilaMeta("10", "-3").errorCm1).toBe("Debe ser 0 o más");
      expect(evaluarFilaMeta("abc", "5").completa).toBe(false);
    });

    it("el 0 es un valor válido (no cuenta como vacío)", () => {
      expect(evaluarFilaMeta("0", "0")).toMatchObject({ vol: 0, cm1: 0, completa: true, vacia: false });
    });
  });
});

describe("semáforo por file (Profit vs CM1 del cliente)", () => {
  const metas = indexarMetas([{ cliente: "A", vol: 10, cm1: 50 }, { cliente: "B", vol: 0, cm1: 30 }]);
  const file = (cliente: string, profit: number | null) => fila(cliente, "2026-03-02T00:00:00", profit);

  it("cumple si el Profit alcanza el CM1, y también si lo iguala", () => {
    expect(evaluarFile(file("A", 80), metas)).toEqual({ estado: "cumple", cm1: 50 });
    expect(evaluarFile(file("A", 50), metas).estado).toBe("cumple");
  });

  it("no cumple si el Profit se queda corto, aunque sea por un centavo", () => {
    expect(evaluarFile(file("A", 49.99), metas)).toEqual({ estado: "no-cumple", cm1: 50 });
    expect(evaluarFile(file("A", 0), metas).estado).toBe("no-cumple");
    expect(evaluarFile(file("A", -5), metas).estado).toBe("no-cumple");
  });

  it("compara en centavos: la basura decimal de una resta no tumba un file que cumple", () => {
    const m = indexarMetas([{ cliente: "A", vol: 1, cm1: 12.3 }]);
    expect(0.1 + 12.2 === 12.3).toBe(false); // el problema que se evita
    expect(evaluarFile(file("A", 0.1 + 12.2), m).estado).toBe("cumple");
    expect(evaluarFile(file("A", 12.299999999999997), m).estado).toBe("cumple");
  });

  it("sin meta para su cliente no se puede juzgar", () => {
    expect(evaluarFile(file("Otro", 500), metas)).toEqual({ estado: "sin-meta", cm1: null });
  });

  it("una meta con Vol × CM1 = 0 no es meta (misma regla que el % de meta)", () => {
    expect(evaluarFile(file("B", 500), metas).estado).toBe("sin-meta");
  });

  it("sin Profit en la hoja no se puede juzgar, ni siquiera contra una meta", () => {
    expect(evaluarFile(file("A", null), metas)).toEqual({ estado: "sin-meta", cm1: 50 });
  });

  it("el cliente vacío se busca como «(Sin cliente)», igual que en la tabla por cliente", () => {
    const m = indexarMetas([{ cliente: SIN_CLIENTE, vol: 1, cm1: 10 }]);
    expect(evaluarFile(file("  ", 20), m).estado).toBe("cumple");
  });

  it("el resumen cuenta cada estado y suma el total", () => {
    const estados = [
      evaluarFile(file("A", 80), metas), evaluarFile(file("A", 10), metas), evaluarFile(file("A", 55), metas),
      evaluarFile(file("Otro", 1), metas), evaluarFile(file("A", null), metas),
    ].map((e) => e.estado);
    expect(resumenSemaforo(estados)).toEqual({ cumplen: 2, noCumplen: 1, sinMeta: 2 });
    expect(resumenSemaforo([])).toEqual({ cumplen: 0, noCumplen: 0, sinMeta: 0 });
  });

  it("el filtro deja pasar solo lo pedido; «todos» incluye a los sin meta", () => {
    expect(pasaFiltroSemaforo("cumple", "cumplen")).toBe(true);
    expect(pasaFiltroSemaforo("no-cumple", "cumplen")).toBe(false);
    expect(pasaFiltroSemaforo("sin-meta", "cumplen")).toBe(false);
    expect(pasaFiltroSemaforo("no-cumple", "no-cumplen")).toBe(true);
    expect(pasaFiltroSemaforo("cumple", "no-cumplen")).toBe(false);
    expect(pasaFiltroSemaforo("sin-meta", "no-cumplen")).toBe(false);
    expect(pasaFiltroSemaforo("sin-meta", "todos")).toBe(true);
  });
});
