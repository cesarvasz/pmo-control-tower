import { describe, it, expect } from "vitest";
import {
  OBJETIVO_DEFECTO, SIN_CLIENTE, SIN_FECHA, aNumero, agruparPorClienteYMes, avanceMesCliente, avanceTotalMes,
  claveMes, etiquetaMes, evaluarFile, evaluarFilaMeta, evaluarObjetivo, filtrarPorMeses, fmtFechaCorta, fmtImporte,
  fmtPct, indexarMetas, leerDocMetas, metaProfitMensual, normalizarMetas, normalizarObjetivos, objetivoDe,
  pasaFiltroSemaforo, resumenSemaforo, serieMensual, totalesImplementacion,
} from "./implementaciones";
import type { ImplementacionRow, MetaCliente, ObjetivoMes } from "@/types";

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

/** Meta de un cliente: la misma para todos los meses. */
const meta = (cliente: string, vol: number, cm1: number): MetaCliente => ({ cliente, vol, cm1 });
/** % a alcanzar de un mes. */
const obj = (mes: string, objetivo: number): ObjetivoMes => ({ mes, objetivo });

describe("metas por cliente y % a alcanzar por mes", () => {
  const matriz = agruparPorClienteYMes(DATOS);
  const a = matriz.clientes.find((c) => c.cliente === "A")!;

  it("la meta de Profit del mes es Vol × CM1", () => {
    expect(metaProfitMensual(meta("A", 10, 20))).toBe(200);
    expect(metaProfitMensual({ vol: 0, cm1: 50 })).toBe(0);
  });

  it("solo cuentan las metas con algo contra qué dividir; el % de un mes sin captura es 100", () => {
    const idx = indexarMetas([meta("A", 10, 20), meta("Z", 0, 10), meta("Y", 10, 0)], [obj("2026-03", 70)]);
    expect([...idx.clientes.keys()]).toEqual(["A"]);
    expect(objetivoDe(idx, "2026-03")).toBe(70);
    expect(objetivoDe(idx, "2026-04")).toBe(OBJETIVO_DEFECTO);
  });

  it("un % ilegible (0, negativo, enorme) no entra al índice: ese mes vale 100", () => {
    const idx = indexarMetas([meta("A", 1, 1)], [obj("2026-03", 0), obj("2026-04", -5), obj("2026-05", 5000)]);
    expect(idx.objetivos.size).toBe(0);
    expect(objetivoDe(idx, "2026-03")).toBe(100);
  });

  describe("leerDocMetas (lo guardado en Firestore)", () => {
    it("lee el formato actual: metas por cliente y % por mes, ordenados", () => {
      const r = leerDocMetas({
        metas: [meta("B", 5, 4), meta("A", 10, 20)],
        objetivos: [obj("2026-04", 80), obj("2026-03", 70)],
      });
      expect(r).toEqual({ metas: [meta("A", 10, 20), meta("B", 5, 4)], objetivos: [obj("2026-03", 70), obj("2026-04", 80)] });
    });

    it("lee el formato más viejo: una meta por cliente, sin mes ni %", () => {
      expect(leerDocMetas({ metas: [meta("A", 10, 20)] })).toEqual({ metas: [meta("A", 10, 20)], objetivos: [] });
    });

    it("lee el formato por mes: un solo Vol y CM1 por cliente (el del mes más reciente) y un % por mes", () => {
      const r = leerDocMetas({
        metas: [
          { cliente: "A", mes: "2026-08", vol: 70, cm1: 90, objetivo: 100 },
          { cliente: "A", mes: "2026-09", vol: 70, cm1: 90, objetivo: 70 },
          { cliente: "A", mes: "2026-10", vol: 75, cm1: 95, objetivo: 30 },
          { cliente: "B", mes: "2026-08", vol: 80, cm1: 90, objetivo: 100 },
          { cliente: "B", mes: "2026-09", vol: 80, cm1: 90, objetivo: 50 }, // otro cliente, mismo mes: queda el primero
        ],
      });
      expect(r.metas).toEqual([meta("A", 75, 95), meta("B", 80, 90)]);
      // El 100 % es el valor por defecto y no se guarda.
      expect(r.objetivos).toEqual([obj("2026-09", 70), obj("2026-10", 30)]);
    });

    it("lo ilegible se ignora y un documento vacío no da nada", () => {
      const r = leerDocMetas({
        metas: [null, { cliente: "  ", vol: 1, cm1: 1 }, { cliente: "A", vol: "10", cm1: 1 }, { cliente: "B", vol: 1, cm1: NaN }, meta("C", 2, 3)],
        objetivos: [obj("2026-13", 70), obj("2026-03", 0), obj("2026-04", 100), { mes: "2026-05" }],
      });
      expect(r).toEqual({ metas: [meta("C", 2, 3)], objetivos: [] });
      expect(leerDocMetas(undefined)).toEqual({ metas: [], objetivos: [] });
      expect(leerDocMetas({ metas: "no es lista", objetivos: 5 })).toEqual({ metas: [], objetivos: [] });
    });
  });

  describe("avances", () => {
    // A: Vol 10 × CM1 20 = 200 de meta cada mes. Marzo pide el 70 %; el resto de los meses, el 100 %.
    const idx = indexarMetas([meta("A", 10, 20), meta("B", 5, 4)], [obj("2026-03", 70)]);

    it("% de un cliente en un mes: Profit ÷ la meta del cliente, que es la misma todos los meses", () => {
      const mar = avanceMesCliente(a, "2026-03", idx)!;
      expect(mar).toMatchObject({ meta: 200, profit: 150.5, n: 1 });
      expect(mar.pct).toBeCloseTo(0.7525);
      expect(avanceMesCliente(a, "2026-05", idx)!.meta).toBe(200);
    });

    it("cada mes usa su propio % a alcanzar", () => {
      const mar = avanceMesCliente(a, "2026-03", idx)!; // 70 % de 200 = 140 → 150.50 cumple
      expect(mar).toMatchObject({ requerido: 140, cumple: true });
      const may = avanceMesCliente(a, "2026-05", idx)!; // sin captura = 100 % → 200; −20 no llega
      expect(may).toMatchObject({ requerido: 200, cumple: false });
      expect(may.pct).toBeCloseTo(-0.1);
    });

    it("un mes sin files del cliente cuenta como 0 % de la meta, no como «sin dato»", () => {
      const r = avanceMesCliente(a, "2026-04", idx)!;
      expect(r.profit).toBe(0);
      expect(r.pct).toBe(0);
      expect(r.cumple).toBe(false);
    });

    it("sin meta para el cliente, o en «Sin fecha», no hay %", () => {
      expect(avanceMesCliente(a, "2026-03", indexarMetas([meta("B", 5, 4)]))).toBeNull();
      expect(avanceMesCliente(a, "2026-03", indexarMetas([]))).toBeNull();
      expect(avanceMesCliente(a, SIN_FECHA, idx)).toBeNull();
    });

    describe("el % a alcanzar (no siempre 100 %)", () => {
      const conObjetivo = (pct: number) => indexarMetas([meta("A", 10, 20)], [obj("2026-03", pct)]);

      it("igualar el requerido cumple; un centavo menos, no", () => {
        expect(avanceMesCliente(a, "2026-03", conObjetivo(75.25))!.cumple).toBe(true); // requerido 150.50
        expect(avanceMesCliente(a, "2026-03", conObjetivo(75.26))!.cumple).toBe(false); // requerido 150.52
      });

      it("un % mayor a 100 pide más que la meta", () => {
        const r = avanceMesCliente(a, "2026-03", conObjetivo(120))!;
        expect(r.requerido).toBe(240);
        expect(r.cumple).toBe(false);
      });

      it("compara en centavos: la basura decimal de una suma no tumba un cumplimiento exacto", () => {
        const fila1 = agruparPorClienteYMes([fila("A", "2026-03-05T00:00:00", 0.1 + 12.2)]).clientes[0];
        expect(0.1 + 12.2 === 12.3).toBe(false); // el problema que se evita
        expect(avanceMesCliente(fila1, "2026-03", indexarMetas([meta("A", 1, 12.3)]))!.cumple).toBe(true);
      });
    });

    it("total del mes: solo los clientes con meta, y su Profit contra su meta", () => {
      const ambos = avanceTotalMes(matriz, "2026-03", idx)!;
      expect(ambos).toMatchObject({ meta: 220, n: 2, requerido: 154, cumple: true }); // 70 % de 220
      expect(ambos.profit).toBeCloseTo(160.5);

      // Con meta solo para A, el Profit de B (10) no se mezcla en el numerador.
      const soloA = avanceTotalMes(matriz, "2026-03", indexarMetas([meta("A", 10, 20)]))!;
      expect(soloA.meta).toBe(200);
      expect(soloA.profit).toBeCloseTo(150.5);
    });

    it("sin ninguna meta aplicable, no hay % en el total", () => {
      expect(avanceTotalMes(matriz, "2026-03", indexarMetas([]))).toBeNull();
      expect(avanceTotalMes(matriz, SIN_FECHA, idx)).toBeNull();
    });
  });

  describe("normalizarMetas (lo que se guarda)", () => {
    it("acepta una lista válida, ordena por cliente y redondea el CM1 a centavos", () => {
      const r = normalizarMetas([{ cliente: " B ", vol: 5, cm1: 4.567 }, { cliente: "A", vol: 10, cm1: 20 }]);
      expect(r).toEqual({ ok: true, metas: [meta("A", 10, 20), meta("B", 5, 4.57)] });
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
      expect(normalizarMetas([meta("A", 1, 1), meta("A", 2, 2)]).ok).toBe(false);
      expect(normalizarMetas([{ cliente: "x".repeat(201), vol: 1, cm1: 1 }]).ok).toBe(false);
    });

    it("rechaza Vol o CM1 negativos, no numéricos o infinitos", () => {
      expect(normalizarMetas([meta("A", -1, 1)]).ok).toBe(false);
      expect(normalizarMetas([meta("A", 1, -1)]).ok).toBe(false);
      expect(normalizarMetas([{ cliente: "A", vol: "10", cm1: 1 }]).ok).toBe(false);
      expect(normalizarMetas([meta("A", 1, Infinity)]).ok).toBe(false);
      expect(normalizarMetas([{ cliente: "A", vol: 1 }]).ok).toBe(false);
      expect(normalizarMetas([null]).ok).toBe(false);
    });

    it("pone un tope al tamaño de la lista", () => {
      const muchas = Array.from({ length: 501 }, (_, i) => meta(`C${i}`, 1, 1));
      expect(normalizarMetas(muchas).ok).toBe(false);
    });
  });

  describe("normalizarObjetivos (los % por mes que se guardan)", () => {
    it("acepta una lista válida, ordena por mes y redondea a 2 decimales", () => {
      expect(normalizarObjetivos([obj("2026-04", 80), obj("2026-03", 70.126)])).toEqual({
        ok: true, objetivos: [obj("2026-03", 70.13), obj("2026-04", 80)],
      });
    });

    it("una lista vacía o ausente es válida (todos los meses a 100 %)", () => {
      expect(normalizarObjetivos([])).toEqual({ ok: true, objetivos: [] });
      expect(normalizarObjetivos(undefined)).toEqual({ ok: true, objetivos: [] });
    });

    it("pasarse de 100 sí vale", () => {
      expect(normalizarObjetivos([obj("2026-03", 150)]).ok).toBe(true);
    });

    it("rechaza lo que no es una lista, o una lista demasiado larga", () => {
      expect(normalizarObjetivos({ mes: "2026-03" }).ok).toBe(false);
      expect(normalizarObjetivos(Array.from({ length: 501 }, (_, i) => obj(`2026-${String((i % 12) + 1).padStart(2, "0")}`, 50))).ok).toBe(false);
    });

    it("rechaza un mes que no sea «yyyy-MM» (incluido «Sin fecha») o repetido", () => {
      expect(normalizarObjetivos([{ objetivo: 70 }]).ok).toBe(false);
      expect(normalizarObjetivos([obj(SIN_FECHA, 70)]).ok).toBe(false);
      expect(normalizarObjetivos([obj("2026-13", 70)]).ok).toBe(false);
      expect(normalizarObjetivos([obj("2026-3", 70)]).ok).toBe(false);
      expect(normalizarObjetivos([{ mes: 202603, objetivo: 70 }]).ok).toBe(false);
      expect(normalizarObjetivos([obj("2026-03", 70), obj("2026-03", 80)])).toEqual({ ok: false, error: "Mes repetido: Mar 2026" });
    });

    it("rechaza un % de 0 o menos, enorme o que no sea número", () => {
      expect(normalizarObjetivos([obj("2026-03", 0)]).ok).toBe(false);
      expect(normalizarObjetivos([obj("2026-03", -5)]).ok).toBe(false);
      expect(normalizarObjetivos([obj("2026-03", 1001)]).ok).toBe(false);
      expect(normalizarObjetivos([{ mes: "2026-03", objetivo: "90" }]).ok).toBe(false);
      expect(normalizarObjetivos([{ mes: "2026-03" }]).ok).toBe(false);
      expect(normalizarObjetivos([null]).ok).toBe(false);
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

  describe("evaluarObjetivo (el campo «% a alcanzar» de un mes)", () => {
    it("vacío = sin captura (vale 100 y no se guarda)", () => {
      expect(evaluarObjetivo("")).toEqual({ objetivo: null, error: "" });
      expect(evaluarObjetivo("   ")).toEqual({ objetivo: null, error: "" });
    });

    it("lee el número, con o sin el signo %", () => {
      expect(evaluarObjetivo("90")).toEqual({ objetivo: 90, error: "" });
      expect(evaluarObjetivo("92.5 %")).toEqual({ objetivo: 92.5, error: "" });
      expect(evaluarObjetivo("120")).toEqual({ objetivo: 120, error: "" });
    });

    it("0 o menos, ilegible o desmedido es un error", () => {
      expect(evaluarObjetivo("0").error).toBe("Debe ser mayor que 0");
      expect(evaluarObjetivo("abc").error).toBe("Número inválido");
      expect(evaluarObjetivo("1500").error).toBe("Máximo 1000%");
      expect(evaluarObjetivo("-5").objetivo).toBeNull();
    });
  });
});

describe("semáforo por file (Profit vs CM1 del cliente)", () => {
  const metas = indexarMetas([meta("A", 10, 50), meta("B", 0, 30)]);
  const file = (cliente: string, profit: number | null, fecha = "2026-03-02T00:00:00") => fila(cliente, fecha, profit);

  it("cumple si el Profit alcanza el CM1, y también si lo iguala", () => {
    expect(evaluarFile(file("A", 80), metas)).toEqual({ estado: "cumple", cm1: 50 });
    expect(evaluarFile(file("A", 50), metas).estado).toBe("cumple");
  });

  it("no cumple si el Profit se queda corto, aunque sea por un centavo", () => {
    expect(evaluarFile(file("A", 49.99), metas)).toEqual({ estado: "no-cumple", cm1: 50 });
    expect(evaluarFile(file("A", 0), metas).estado).toBe("no-cumple");
    expect(evaluarFile(file("A", -5), metas).estado).toBe("no-cumple");
  });

  it("el CM1 es el mismo en todos los meses, y también aplica a un file sin fecha", () => {
    expect(evaluarFile(file("A", 60, "2026-04-10T00:00:00"), metas).estado).toBe("cumple");
    expect(evaluarFile(file("A", 60, "2026-11-10T00:00:00"), metas).estado).toBe("cumple");
    expect(evaluarFile(file("A", 40, ""), metas)).toEqual({ estado: "no-cumple", cm1: 50 });
  });

  it("el % a alcanzar de un mes no relaja el CM1 de cada file", () => {
    const flojo = indexarMetas([meta("A", 10, 50)], [obj("2026-03", 50)]);
    expect(evaluarFile(file("A", 40), flojo)).toEqual({ estado: "no-cumple", cm1: 50 });
  });

  it("compara en centavos: la basura decimal de una resta no tumba un file que cumple", () => {
    const m = indexarMetas([meta("A", 1, 12.3)]);
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
    const m = indexarMetas([meta(SIN_CLIENTE, 1, 10)]);
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
