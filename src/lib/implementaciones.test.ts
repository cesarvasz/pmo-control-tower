import { describe, it, expect } from "vitest";
import {
  SIN_CLIENTE, SIN_FECHA, agruparPorClienteYMes, claveMes, etiquetaMes, filtrarPorMeses,
  fmtFechaCorta, fmtImporte, serieMensual, totalesImplementacion,
} from "./implementaciones";
import type { ImplementacionRow } from "@/types";

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

describe("formato", () => {
  it("importe con miles y dos decimales, «—» si no hay valor", () => {
    expect(fmtImporte(1234.5)).toBe("1,234.50");
    expect(fmtImporte(0)).toBe("0.00");
    expect(fmtImporte(-20)).toBe("-20.00");
    expect(fmtImporte(null)).toBe("—");
  });

  it("fecha corta sin pasar por Date (no depende de la zona horaria)", () => {
    expect(fmtFechaCorta("2026-03-02T00:00:00")).toBe("02/03/2026");
    expect(fmtFechaCorta("2026-03-02T14:30:45")).toBe("02/03/2026 14:30");
    expect(fmtFechaCorta("")).toBe("—");
  });
});
