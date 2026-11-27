import { describe, it, expect } from "vitest";
import { fmtHabil, leerFecha } from "./horario008";
import {
  prepararFiles, ubicarColumnas, estadisticas, crearCalculadora, topUsuarios, calcularAporte,
  etiquetaMes, mesCorto, fmtNum, fmtPct, textoMostrando, fraseUso, opcionesDeFiltro,
  FILTROS_VACIOS, SIN_USUARIO, type File008,
} from "./tiempos008";
import type { Roi008Row } from "@/types";

const ENCABEZADOS = ["File_id", "File", "Fecha_file", "Cliente", "Usuario", "Creado", "DPR",
  "Clasificacion_exacta", "Solicitud_prepoliza"];

/** Fila tal como la entrega /api/roi/008 (fechas como texto de pared, "" = vacía). */
const fila = (o: Partial<Record<string, string | number | null>>): Roi008Row => ({
  File_id: 1, File: "SV-X", Fecha_file: "2026-01-05 09:00:00", Cliente: "CLIENTE", Usuario: "Ana",
  Creado: "", DPR: "", Clasificacion_exacta: "", Solicitud_prepoliza: "", ...o,
});

const preparar = (rows: Roi008Row[]): File008[] => {
  const p = prepararFiles(rows, ENCABEZADOS);
  if (!p.ok) throw new Error(`faltan columnas: ${p.faltan.join(", ")}`);
  return p.files;
};

describe("columnas", () => {
  it("las ubica por nombre (sin importar orden, mayúsculas, tildes o espacios) y tolera extras", () => {
    const r = ubicarColumnas(["Extra", "solicitud prepóliza", "DPR", "clasificación exacta", "USUARIO",
      "cliente", "Creado", "fecha file", "file", "File_ID", "Otra"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mapa.sol).toBe("solicitud prepóliza");
      expect(r.mapa.clas).toBe("clasificación exacta");
      expect(r.mapa.fileId).toBe("File_ID");
    }
  });

  it("si falta una columna no calcula nada y dice cuál", () => {
    const p = prepararFiles([fila({})], ENCABEZADOS.filter((c) => c !== "DPR" && c !== "Usuario"));
    expect(p).toEqual({ ok: false, faltan: ["Usuario", "DPR"] });
  });

  it("sin encabezados explícitos usa las claves de la primera fila", () => {
    expect(prepararFiles([fila({})]).ok).toBe(true);
  });
});

describe("casos reales", () => {
  it("SV-2026-187: T1 00:00:00, T2 292:23:27, T3 invertido −255:29:10 (fuera de T3 y de la cadena)", () => {
    const [f] = preparar([fila({
      File: "SV-2026-187", Fecha_file: "2026-01-01 23:59:16",
      Creado: "2026-01-01 23:59:16", DPR: "2026-01-02 00:08:12",
      Clasificacion_exacta: "2026-02-12 10:23:27", Solicitud_prepoliza: "2026-01-07 14:54:17",
    })]);
    expect(f.ducafast).toBe(true);
    expect(fmtHabil(f.t1)).toBe("00:00:00");
    expect(fmtHabil(f.t2)).toBe("292:23:27");
    expect(f.t3).toBeNull();
    expect(f.t3Invertido).toBe(true);
    expect(fmtHabil(f.t3Diferencia)).toBe("−255:29:10");
    expect(f.cadena).toBeNull();

    const { agregados } = crearCalculadora([f])(FILTROS_VACIOS);
    expect(agregados.revisar.map((x) => x.file)).toEqual(["SV-2026-187"]);
    expect(agregados.medidas.t1.n).toBe(1);
    expect(agregados.medidas.t2.n).toBe(1);
    expect(agregados.medidas.t3.n).toBe(0);
    expect(agregados.medidas.cadena.n).toBe(0);
  });

  it("SV-2026-1403361 (fechas como número de serie): T1 05:59:20, T2 934:25:56, T3 01:57:00, cadena 942:22:16", () => {
    const [f] = preparar([fila({
      File: "SV-2026-1403361", Fecha_file: 46162.376296296294,
      Creado: 46162.376296296294, DPR: 46162.62583333333,
      Clasificacion_exacta: 46294.393842592595, Solicitud_prepoliza: 46294.47509259259,
    })]);
    expect(fmtHabil(f.t1)).toBe("05:59:20");
    expect(fmtHabil(f.t2)).toBe("934:25:56");
    expect(fmtHabil(f.t3)).toBe("01:57:00");
    expect(fmtHabil(f.cadena)).toBe("942:22:16");
    expect(f.mes).toBe("2026-05");
  });
});

describe("reglas por file", () => {
  it("sin DPR es Sin Ducafast y no lleva ningún tiempo", () => {
    const [f] = preparar([fila({ Creado: "2026-01-05 09:00", Clasificacion_exacta: "2026-01-05 10:00", Solicitud_prepoliza: "2026-01-06 10:00" })]);
    expect(f.ducafast).toBe(false);
    expect([f.t1, f.t2, f.t3, f.cadena]).toEqual([null, null, null, null]);
  });

  it("sin Creado, T1 no se mide (no se usa Fecha_file) y no hay cadena", () => {
    const [f] = preparar([fila({ DPR: "2026-01-05 10:00", Clasificacion_exacta: "2026-01-05 10:00:03", Solicitud_prepoliza: "2026-01-05 12:00" })]);
    expect(f.t1).toBeNull();
    expect(f.t2).toBe(3);
    expect(f.t3).toBe(2 * 3600 - 3);
    expect(f.cadena).toBeNull();
  });

  it("T2 simultáneo: 5 s o menos en reloj, no en horas hábiles", () => {
    const [a, b, c] = preparar([
      fila({ File: "a", DPR: "2026-01-05 10:00:00", Clasificacion_exacta: "2026-01-05 10:00:05" }),
      fila({ File: "b", DPR: "2026-01-05 10:00:00", Clasificacion_exacta: "2026-01-05 10:00:06" }),
      // sábado: 0 s hábiles pero 1 h en reloj → no es simultáneo
      fila({ File: "c", DPR: "2026-01-10 10:00:00", Clasificacion_exacta: "2026-01-10 11:00:00" }),
    ]);
    expect([a.t2Simultaneo, b.t2Simultaneo, c.t2Simultaneo]).toEqual([true, false, false]);
    expect(c.t2).toBe(0);
  });

  it("Cliente y Usuario con trim; vacíos quedan como «sin usuario»", () => {
    const [f] = preparar([fila({ Cliente: "  ACME  ", Usuario: "   " })]);
    expect(f.cliente).toBe("ACME");
    expect(f.usuario).toBe(SIN_USUARIO);
  });

  it("filas sin Fecha_file no se cuentan, pero se reportan", () => {
    const p = prepararFiles([fila({ Fecha_file: "" }), fila({})], ENCABEZADOS);
    expect(p.ok && p.files.length).toBe(1);
    expect(p.ok && p.sinFechaFile).toBe(1);
  });
});

describe("estadísticas", () => {
  it("mediana con n par = promedio de los dos del centro", () => {
    expect(estadisticas([4, 1, 3, 2])).toEqual({ n: 4, promedio: 2.5, mediana: 2.5 });
    expect(estadisticas([5, 1, 3])).toEqual({ n: 3, promedio: 3, mediana: 3 });
    expect(estadisticas([])).toEqual({ n: 0, promedio: null, mediana: null });
  });

  it("aporte de cada tramo al promedio de la cadena", () => {
    const files = preparar([
      fila({ File: "a", Creado: "2026-01-05 08:00", DPR: "2026-01-05 09:00", Clasificacion_exacta: "2026-01-05 09:00", Solicitud_prepoliza: "2026-01-05 12:00" }),
      fila({ File: "b", Creado: "2026-01-05 08:00", DPR: "2026-01-05 09:00", Clasificacion_exacta: "2026-01-05 10:00", Solicitud_prepoliza: "2026-01-05 14:00" }),
      // sin Creado: no tiene cadena y no entra al aporte
      fila({ File: "c", DPR: "2026-01-05 09:00", Clasificacion_exacta: "2026-01-05 09:00", Solicitud_prepoliza: "2026-01-07 09:00" }),
    ]);
    const a = calcularAporte(files);
    expect(a.n).toBe(2);
    expect(a.total).toBe(5 * 3600); // (4 h + 6 h) / 2
    // promedios 1 h · 0.5 h · 3.5 h
    expect(a.partes.map((p) => Math.round(p.pct * 1000) / 10)).toEqual([20, 10, 70]);
  });
});

describe("filtros y agregados", () => {
  const files = preparar([
    fila({ File: "1", Fecha_file: "2026-01-10 09:00", Cliente: "B", Usuario: "Ana", DPR: "2026-01-12 09:00", Creado: "2026-01-12 08:00" }),
    fila({ File: "2", Fecha_file: "2026-01-11 09:00", Cliente: "A", Usuario: "Ana" }),
    fila({ File: "3", Fecha_file: "2026-02-03 09:00", Cliente: "A", Usuario: "Ñoño", DPR: "2026-02-03 12:00", Creado: "2026-02-03 08:00" }),
    fila({ File: "4", Fecha_file: "2026-02-04 09:00", Cliente: "A", Usuario: "Beto" }),
  ]);
  const calcular = crearCalculadora(files);

  it("resumen con todos los filtros, incluido el mes", () => {
    expect(calcular(FILTROS_VACIOS).agregados.resumen).toEqual({ total: 4, con: 2, sin: 2, uso: 0.5 });
    expect(calcular({ ...FILTROS_VACIOS, mes: "2026-02" }).agregados.resumen).toEqual({ total: 2, con: 1, sin: 1, uso: 0.5 });
    expect(calcular({ ...FILTROS_VACIOS, cliente: "A" }).agregados.resumen.total).toBe(3);
  });

  it("lo que ya es por mes no responde al filtro de mes, sí a cliente y usuario", () => {
    expect(calcular({ ...FILTROS_VACIOS, mes: "2026-02" }).porMes.map((m) => m.mes)).toEqual(["2026-01", "2026-02"]);
    expect(calcular({ ...FILTROS_VACIOS, usuario: "Ana" }).porMes.map((m) => [m.mes, m.total, m.con])).toEqual([["2026-01", 2, 1]]);
  });

  it("memoiza cada combinación de filtros", () => {
    const f = { mes: "2026-01", cliente: null, usuario: null };
    expect(calcular(f)).toBe(calcular({ ...f }));
  });

  it("tablas por usuario: Ducafast de mayor a menor, luego total", () => {
    expect(calcular(FILTROS_VACIOS).agregados.porUsuario.map((u) => [u.nombre, u.total, u.con])).toEqual([
      ["Ana", 2, 1], ["Ñoño", 1, 1], ["Beto", 1, 0],
    ]);
  });

  it("opciones ordenadas alfabéticamente en español y meses en orden", () => {
    const o = opcionesDeFiltro(files);
    expect(o.usuarios).toEqual(["Ana", "Beto", "Ñoño"]);
    expect(o.clientes).toEqual(["A", "B"]);
    expect(o.meses).toEqual([{ value: "2026-01", label: "enero 2026" }, { value: "2026-02", label: "febrero 2026" }]);
  });

  it("top de usuarios por el promedio del tramo elegido", () => {
    const top = topUsuarios(calcular(FILTROS_VACIOS).agregados.usuariosTiempo, "t1");
    expect(top.map((u) => [u.usuario, u.medidas.t1.promedio])).toEqual([["Ñoño", 4 * 3600], ["Ana", 3600]]);
    expect(topUsuarios(calcular(FILTROS_VACIOS).agregados.usuariosTiempo, "cadena")).toEqual([]);
  });

  it("textos de filtros y frase de uso", () => {
    expect(textoMostrando(FILTROS_VACIOS)).toBe("todos los meses · todos los clientes · todos los usuarios");
    expect(textoMostrando({ mes: "2026-11", cliente: "A", usuario: null })).toBe("noviembre 2026 · A · todos los usuarios");
    expect(fraseUso(calcular(FILTROS_VACIOS).porMes)).toBe(
      "El uso de Ducafast pasó de 50.0% en enero 2026 a 50.0% en febrero 2026, con un máximo de 50.0% en enero 2026. " +
      "El mes con más files fue enero 2026, con 2.");
  });
});

describe("formato", () => {
  it("cantidades con coma de miles y % con un decimal", () => {
    expect(fmtNum(22947)).toBe("22,947");
    expect(fmtNum(2073)).toBe("2,073");
    expect(fmtPct(3415 / 22947)).toBe("14.9%");
    expect(fmtPct(null)).toBe("—");
  });

  it("meses en español", () => {
    expect(etiquetaMes("2026-01")).toBe("enero 2026");
    expect(mesCorto("2026-01")).toBe("ene");
    expect(mesCorto("2027-09", true)).toBe("sep 27");
  });

  it("la lectura de fechas del módulo es la del horario 008", () => {
    expect(leerFecha("2026-01-05 09:00")).not.toBeNull();
  });
});
