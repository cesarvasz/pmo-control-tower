import { describe, it, expect } from "vitest";
import type { OcrRow } from "@/types";
import {
  construirFiles, stat, filtrar, calcularKpis, serie, porCliente, porFile,
  opcionesDeFiltro, rangoFechas, FILTROS_VACIOS, TARIFA_HORA_OCR, type Filtros,
} from "./digitalizacion";

const row = (o: Partial<OcrRow>): OcrRow => ({
  id: "1", c807_file: "GT-2026-1", Embarque: "MAR", Cliente: "CLIENTE A",
  Creacion: "2026-01-05T09:00:00",
  Digit_docs: "2026-01-05T09:30:00",
  Digit_carta_licencia: "2026-01-05T10:00:00",
  "Documents Count": "0", "Pages Count": "0", Licencias: "0", Costo: "0",
  ...o,
});

describe("stat", () => {
  it("ignora null y cuenta enCero", () => {
    const s = stat([0, 60, 120, null, 180]);
    expect(s.n).toBe(4);
    expect(s.enCero).toBe(1);
    expect(s.prom).toBe((0 + 60 + 120 + 180) / 4);
    expect(s.mediana).toBe(90);
    expect(s.max).toBe(180);
  });
  it("lista vacía o toda-null", () => {
    expect(stat([]).prom).toBeNull();
    expect(stat([null, null]).n).toBe(0);
  });
});

describe("construirFiles — T1 y T2 hábiles", () => {
  it("caso base: T1 y T2 de 30 min cada uno", () => {
    const [f] = construirFiles([row({})]);
    expect(f.t1Seg).toBe(30 * 60);
    expect(f.t2Seg).toBe(30 * 60);
    expect(f.totalSeg).toBe(60 * 60);
    expect(f.completo).toBe(true);
  });
  it("sin Digit_docs → T1 y T2 null, no completo", () => {
    const [f] = construirFiles([row({ Digit_docs: "" })]);
    expect(f.t1Seg).toBeNull();
    expect(f.t2Seg).toBeNull();
    expect(f.totalSeg).toBeNull();
    expect(f.completo).toBe(false);
  });
  it("sin Digit_carta_licencia → T1 numérico, T2 null", () => {
    const [f] = construirFiles([row({ Digit_carta_licencia: "" })]);
    expect(f.t1Seg).toBe(30 * 60);
    expect(f.t2Seg).toBeNull();
    expect(f.completo).toBe(false);
  });
  it("fin de semana → T1 = 0 (se conserva el file)", () => {
    const fs = construirFiles([row({
      Creacion: "2026-01-03T09:00:00", Digit_docs: "2026-01-03T17:00:00", Digit_carta_licencia: "",
    })]); // sábado
    expect(fs).toHaveLength(1);
    expect(fs[0].t1Seg).toBe(0);
  });
  it("carta antes que docs → T2 = 0", () => {
    const [f] = construirFiles([row({
      Digit_docs: "2026-01-05T10:00:00", Digit_carta_licencia: "2026-01-05T09:30:00",
    })]);
    expect(f.t2Seg).toBe(0);
  });
  it("fila sin c807_file se descarta", () => {
    expect(construirFiles([row({ c807_file: "" })])).toHaveLength(0);
  });
});

describe("construirFiles — Documents Count / Pages Count / Licencias / Costo", () => {
  it("se leen tal cual de la hoja, sin cruce con otra fuente", () => {
    const [f] = construirFiles([row({
      "Documents Count": "2", "Pages Count": "2", Licencias: "2", Costo: "2.5",
    })]);
    expect(f.docsCount).toBe(2);
    expect(f.pagesCount).toBe(2);
    expect(f.licencias).toBe(2);
    expect(f.costo).toBe(2.5);
  });
  it("vacío o 'No encontrado' → 0", () => {
    const [f] = construirFiles([row({
      "Documents Count": "", "Pages Count": "No encontrado", Licencias: "", Costo: "",
    })]);
    expect(f.docsCount).toBe(0);
    expect(f.pagesCount).toBe(0);
    expect(f.licencias).toBe(0);
    expect(f.costo).toBe(0);
  });
  it("sinDatosLicencia: true cuando los 4 campos son 0 (default de la fixture)", () => {
    expect(construirFiles([row({})])[0].sinDatosLicencia).toBe(true);
  });
  it("sinDatosLicencia: false si al menos uno trae dato", () => {
    expect(construirFiles([row({ Licencias: "1" })])[0].sinDatosLicencia).toBe(false);
    expect(construirFiles([row({ "Pages Count": "4" })])[0].sinDatosLicencia).toBe(false);
  });
});

describe("filtrar", () => {
  const todos = construirFiles([
    row({ c807_file: "F1", Cliente: "A", Creacion: "2026-01-05T09:00:00", Digit_docs: "2026-01-05T09:10:00", Digit_carta_licencia: "2026-01-05T09:20:00", Licencias: "2", Costo: "2.5" }),
    row({ c807_file: "F2", Cliente: "B", Creacion: "2026-02-10T09:00:00", Digit_docs: "2026-02-13T17:00:00", Digit_carta_licencia: "" }),
    row({ c807_file: "F3", Cliente: "B", Creacion: "2026-02-11T09:00:00", Digit_docs: "", Digit_carta_licencia: "" }),
  ]);

  it("cliente", () => expect(filtrar(todos, { ...FILTROS_VACIOS, clientes: ["A"] }).map((f) => f.file)).toEqual(["F1"]));
  it("rango de fechas sobre Creación", () =>
    expect(filtrar(todos, { ...FILTROS_VACIOS, desde: "2026-02-01", hasta: "2026-02-28" }).map((f) => f.file).sort()).toEqual(["F2", "F3"]));
  it("soloCompletos deja solo los que tienen T1 y T2", () =>
    expect(filtrar(todos, { ...FILTROS_VACIOS, soloCompletos: true }).map((f) => f.file)).toEqual(["F1"]));
  it("casos extremos: descarta T1 > 1 h", () =>
    expect(filtrar(todos, { ...FILTROS_VACIOS, maxHoras: "1h" }).map((f) => f.file).sort()).toEqual(["F1", "F3"]));
  it("licencia: 'con' deja solo los que traen datos, 'sin' los que no", () => {
    expect(filtrar(todos, { ...FILTROS_VACIOS, licencia: "con" }).map((f) => f.file)).toEqual(["F1"]);
    expect(filtrar(todos, { ...FILTROS_VACIOS, licencia: "sin" }).map((f) => f.file).sort()).toEqual(["F2", "F3"]);
  });
  it("opcionesDeFiltro y rangoFechas", () => {
    expect(opcionesDeFiltro(todos).clientes.map((o) => o.value).sort()).toEqual(["A", "B"]);
    expect(rangoFechas(todos)).toEqual({ desde: "2026-01-05", hasta: "2026-02-11" });
  });
});

describe("calcularKpis", () => {
  const files = construirFiles([
    row({ c807_file: "F1", Digit_carta_licencia: "2026-01-05T10:00:00" }),           // T1=30, T2=30
    row({ c807_file: "F2", Digit_docs: "2026-01-05T09:00:00", Digit_carta_licencia: "" }), // T1=0, T2=null
    row({ c807_file: "F3", Digit_docs: "", Digit_carta_licencia: "" }),               // T1=null, T2=null
  ]);
  const k = calcularKpis(files);

  it("conteos", () => {
    expect(k.files).toBe(3);
    expect(k.conT1).toBe(2);
    expect(k.conT2).toBe(1);
    expect(k.completos).toBe(1);
  });
  it("T2 promedio ignora los files sin carta de licencia", () => {
    expect(k.t2.n).toBe(1);
    expect(k.t2.prom).toBe(30 * 60);
  });
  it("total solo sobre completos", () => {
    expect(k.total.n).toBe(1);
    expect(k.total.prom).toBe(60 * 60);
  });
});

describe("calcularKpis — resumen de digitalización", () => {
  it("suma docs/páginas/licencias/costo del recorte y cuenta con licencia / sin datos", () => {
    const files = construirFiles([
      row({ c807_file: "F1", "Documents Count": "2", "Pages Count": "2", Licencias: "2", Costo: "2.5" }),
      row({ c807_file: "F2", "Documents Count": "1", "Pages Count": "0", Licencias: "0", Costo: "0" }),
      row({ c807_file: "F3" }), // defaults en 0 → sin datos
    ]);
    const { digitalizacion: d } = calcularKpis(files);
    expect(d.docsCount).toBe(3);
    expect(d.pagesCount).toBe(2);
    expect(d.licencias).toBe(2);
    expect(d.costo).toBe(2.5);
    expect(d.conLicencia).toBe(1);
    expect(d.sinDatos).toBe(1); // solo F3
    expect(d.costoPorFile).toBeCloseTo(2.5 / 3, 6);
  });
  it("recorte vacío no revienta (costoPorFile = 0)", () => {
    expect(calcularKpis([]).digitalizacion.costoPorFile).toBe(0);
  });
});

describe("calcularKpis — costo de tiempo ($6/hora hábil)", () => {
  it("suma T1 y T2 por separado y total = T1 + T2", () => {
    // dos files de 30 min de T1 y 30 min de T2 cada uno → 1 h de cada uno en total
    const files = construirFiles([row({ c807_file: "F1" }), row({ c807_file: "F2" })]);
    const { costoTiempo: c } = calcularKpis(files);
    expect(c.tarifaHora).toBe(TARIFA_HORA_OCR);
    expect(c.t1).toBeCloseTo(1 * TARIFA_HORA_OCR, 6);
    expect(c.t2).toBeCloseTo(1 * TARIFA_HORA_OCR, 6);
    expect(c.total).toBeCloseTo(c.t1 + c.t2, 6);
  });
  it("un file sin T2 igual cuenta su T1", () => {
    const files = construirFiles([
      row({ c807_file: "F1" }),                              // T1 30 min, T2 30 min
      row({ c807_file: "F2", Digit_carta_licencia: "" }),     // T1 30 min, T2 null
    ]);
    const { costoTiempo: c } = calcularKpis(files);
    expect(c.t1).toBeCloseTo(1 * TARIFA_HORA_OCR, 6);   // 30+30 min de T1
    expect(c.t2).toBeCloseTo(0.5 * TARIFA_HORA_OCR, 6); // solo 30 min de T2
  });
  it("recorte vacío → todo en 0", () => {
    const c = calcularKpis([]).costoTiempo;
    expect(c).toEqual({ tarifaHora: TARIFA_HORA_OCR, t1: 0, t2: 0, total: 0 });
  });
});

describe("calcularKpis — costo por file (licencias + tiempo)", () => {
  it("junta el costo de licencias y de tiempo, repartido entre los files", () => {
    const files = construirFiles([
      row({ c807_file: "F1", Costo: "3" }), // T1 30 min, T2 30 min por defecto
      row({ c807_file: "F2", Costo: "0" }),
    ]);
    const k = calcularKpis(files);
    expect(k.costoFile.licencias).toBe(3);
    expect(k.costoFile.tiempo).toBeCloseTo(k.costoTiempo.total, 6);
    expect(k.costoFile.total).toBeCloseTo(3 + k.costoTiempo.total, 6);
    expect(k.costoFile.porFileLicencia).toBeCloseTo(3 / 2, 6);
    expect(k.costoFile.porFileTiempo).toBeCloseTo(k.costoTiempo.total / 2, 6);
    expect(k.costoFile.porFile).toBeCloseTo(k.costoFile.total / 2, 6);
    expect(k.costoFile.porFile).toBeCloseTo(k.costoFile.porFileLicencia + k.costoFile.porFileTiempo, 6);
  });
  it("recorte vacío → todo en 0", () => {
    expect(calcularKpis([]).costoFile).toEqual({
      licencias: 0, tiempo: 0, total: 0, porFileLicencia: 0, porFileTiempo: 0, porFile: 0,
    });
  });
});

describe("serie / porCliente", () => {
  const rows: OcrRow[] = [
    row({ c807_file: "F1", Cliente: "A", Creacion: "2026-01-05T09:00:00", Digit_docs: "2026-01-05T09:30:00", Digit_carta_licencia: "2026-01-05T10:00:00" }),
    row({ c807_file: "F2", Cliente: "A", Creacion: "2026-01-20T09:00:00", Digit_docs: "2026-01-20T10:00:00", Digit_carta_licencia: "" }),
    row({ c807_file: "F3", Cliente: "B", Creacion: "2026-02-10T09:00:00", Digit_docs: "2026-02-10T09:30:00", Digit_carta_licencia: "2026-02-10T09:45:00" }),
  ];
  const files = construirFiles(rows);
  const f: Filtros = { ...FILTROS_VACIOS, agrupar: "mes" };

  it("serie agrupa por mes de Creación y promedia T1/T2 sin nulls", () => {
    const s = serie(files, f);
    expect(s.map((p) => p.clave)).toEqual(["2026-01", "2026-02"]);
    const ene = s[0];
    expect(ene.files).toBe(2);
    expect(ene.conT2).toBe(1);
    expect(ene.t1Prom).toBe((1800 + 3600) / 2);
    expect(ene.t2Prom).toBe(1800); // solo F1
  });
  it("porCliente: Σ files = total, conT2 ≤ files", () => {
    const pc = porCliente(files);
    expect(pc.reduce((s, r) => s + r.files, 0)).toBe(files.length);
    pc.forEach((r) => expect(r.conT2).toBeLessThanOrEqual(r.files));
    const a = pc.find((r) => r.cliente === "A")!;
    expect(a.files).toBe(2);
    expect(a.t2Prom).toBe(1800);
  });
});

describe("porFile", () => {
  it("expone T1/T2/total y fechas por file", () => {
    const [r] = porFile(construirFiles([row({})]));
    expect(r.file).toBe("GT-2026-1");
    expect(r.t1Seg).toBe(1800);
    expect(r.t2Seg).toBe(1800);
    expect(r.totalSeg).toBe(3600);
    expect(r.docs).toBeInstanceOf(Date);
  });
});
