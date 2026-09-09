import { describe, it, expect } from "vitest";
import {
  construirRegistros, minutosHabiles, costoClonacion, costoClonacionPorOrigen, aplicarFiltros, distribucionRangos,
  agruparPor, opcionesDeFiltro, limpiarComentario, origenDeComentario, calcularKPIs,
  FILTROS_VACIOS, TARIFA_CLONACION_DEFECTO,
  type ClonacionRegistro,
} from "./clonaciones";
import type { ClonacionRow } from "@/types";

// 2026-01-05 es lunes (misma semana de referencia que horario.test.ts).
const row = (
  file: string, usuario: string, cliente: string, solicitud: string, creacion: string,
  mesa = "", proceso = "", comentario = "",
): ClonacionRow => ({
  c807_file: file, Fecha: "", Solicitud_fecha: solicitud, Creacion_fecha: creacion,
  Usuario: usuario, Cliente: cliente, Mesa: mesa, Proceso: proceso, Comentario: comentario,
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

  it("sin Creacion_fecha, la fila se descarta (no hay mes al que atribuirla)", () => {
    expect(construirRegistros([row("F", "U", "C", "2026-01-05T09:00:00", "")])).toHaveLength(0);
  });

  it("Solicitud_fecha > Creacion_fecha: Minutos_Habiles = 0 y Anomalo = TRUE", () => {
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

describe("C1/C5 · dimensiones Mesa y Proceso", () => {
  const base = construirRegistros([
    row("F1", "ANA", "ACME", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "Mesa 1", "Alta"),
    row("F2", "LUIS", "ACME", "2026-01-05T08:00:00", "2026-01-05T10:00:00", "Mesa 1", "Baja"),
    row("F3", "ANA", "GLOBEX", "2026-01-05T08:00:00", "2026-01-05T11:00:00", "Mesa 2", "Alta"),
    row("F4", "ANA", "GLOBEX", "2026-01-06T08:00:00", "2026-01-06T09:00:00", "", ""),
  ]);

  it("celda vacía de Mesa/Proceso cae en SIN_DATO", () => {
    expect(base.find((r) => r.file === "F4")?.mesa).toBe("(sin dato)");
    expect(base.find((r) => r.file === "F4")?.proceso).toBe("(sin dato)");
  });

  it("normaliza capitalización dispar del origen y no duplica al agrupar", () => {
    const mixto = construirRegistros([
      row("A", "U", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "MESA 2", "aduana"),
      row("B", "U", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "Mesa 2", "Aduana"),
      row("C", "U", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "mesa 2", "ADUANA"),
    ]);
    expect(mixto.every((r) => r.mesa === "Mesa 2" && r.proceso === "Aduana")).toBe(true);
    expect(agruparPor(mixto, "mesa", "mediana")).toHaveLength(1);
    expect(opcionesDeFiltro(mixto).procesos).toHaveLength(1);
  });

  it("filtra por Mesa", () => {
    const f = aplicarFiltros(base, { ...FILTROS_VACIOS, mesas: ["Mesa 1"] });
    expect(f.map((r) => r.file).sort()).toEqual(["F1", "F2"]);
  });

  it("filtra por Proceso", () => {
    const f = aplicarFiltros(base, { ...FILTROS_VACIOS, procesos: ["Alta"] });
    expect(f.map((r) => r.file).sort()).toEqual(["F1", "F3"]);
  });

  it("Mesa y Proceso se combinan (AND)", () => {
    const f = aplicarFiltros(base, { ...FILTROS_VACIOS, mesas: ["Mesa 1"], procesos: ["Alta"] });
    expect(f.map((r) => r.file)).toEqual(["F1"]);
  });

  it("agruparPor('mesa') mide solo las filas medibles del recorte", () => {
    const r = agruparPor(base, "mesa", "mediana");
    const mesa1 = r.find((x) => x.clave === "Mesa 1");
    expect(mesa1?.n).toBe(2); // F1 (1h) y F2 (2h)
    expect(mesa1?.valor).toBe(90 * 60); // mediana de 3600 y 7200 = 5400 s
  });

  it("opcionesDeFiltro expone mesas y procesos por volumen", () => {
    const o = opcionesDeFiltro(base);
    expect(o.mesas.map((x) => x.value)).toContain("Mesa 1");
    expect(o.procesos.map((x) => x.value)).toContain("Alta");
  });
});

describe("C7 · comentario del origen (HTML → texto plano)", () => {
  it("convierte <br> en saltos de línea y quita el resto del HTML", () => {
    expect(limpiarComentario("Tipo: Importación<br>Vía: Marítimo<br>Carga: FCL<br>"))
      .toBe("Tipo: Importación\nVía: Marítimo\nCarga: FCL");
  });

  it("tolera <br/>, entidades y vacío", () => {
    expect(limpiarComentario("a &amp; b<br />c")).toBe("a & b\nc");
    expect(limpiarComentario("")).toBe("");
    expect(limpiarComentario(null)).toBe("");
  });

  it("llega al registro ya limpio", () => {
    const [r] = construirRegistros([
      row("F", "U", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "M", "P", "uno<br>dos"),
    ]);
    expect(r.comentario).toBe("uno\ndos");
  });
});

describe("C7 · columna Origen (deducida del comentario)", () => {
  const existentes = new Set(["GT-2026-101488", "GT-2025-7"]);

  it("réplica cuyo padre existe en c807_file → '<CODIGO> - v'", () => {
    expect(origenDeComentario("Creado como replica del file GT-2026-101488\nTipo: Importación", existentes))
      .toBe("GT-2026-101488 - v");
  });

  it("réplica cuyo padre NO existe → '<CODIGO> - sv'", () => {
    expect(origenDeComentario("Creado como réplica del file GT-2026-999999", existentes))
      .toBe("GT-2026-999999 - sv");
  });

  it("dígitos variables y sin acento", () => {
    expect(origenDeComentario("creado como replica del file GT-2025-7", existentes)).toBe("GT-2025-7 - v");
  });

  it("comentario que no empieza así (o vacío) → 'Padre'", () => {
    expect(origenDeComentario("Tipo de File: Importación", existentes)).toBe("Padre");
    expect(origenDeComentario("", existentes)).toBe("Padre");
  });

  it("se resuelve contra TODAS las filas del origen, se descarten o no", () => {
    const regs = construirRegistros([
      // Padre sin Creacion_fecha: se descarta, pero su c807_file sigue contando.
      row("GT-2026-500", "U", "C", "2026-01-05T08:00:00", "", "M", "P", ""),
      row("GT-2026-501", "U", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "M", "P",
        "Creado como replica del file GT-2026-500<br>Tipo: Exportación"),
      row("GT-2026-502", "U", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "M", "P",
        "Creado como replica del file GT-2026-404"),
      row("GT-2026-503", "U", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "M", "P", "nota suelta"),
    ]);
    expect(regs.map((r) => r.origen)).toEqual([
      "GT-2026-500 - v", "GT-2026-404 - sv", "Padre",
    ]);
  });
});

describe("C1 · filtro Herramienta (con = V · sin = Padre + SV)", () => {
  const base = construirRegistros([
    row("GT-2026-1", "U", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "M", "P", "nota"),               // padre → sin
    row("GT-2026-2", "U", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "M", "P", "Creado como replica del file GT-2026-1"),   // v → con
    row("GT-2026-3", "U", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "M", "P", "Creado como replica del file GT-2026-1"),   // v → con
    row("GT-2026-4", "U", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "M", "P", "Creado como replica del file GT-2026-999"), // sv → sin
  ]);

  it("la categoría interna sigue siendo v / sv / padre", () => {
    expect(base.map((r) => r.origenTipo)).toEqual(["padre", "v", "v", "sv"]);
  });

  it("'con herramienta' = solo las réplicas V", () => {
    expect(aplicarFiltros(base, { ...FILTROS_VACIOS, herramienta: ["con"] }).map((r) => r.file))
      .toEqual(["GT-2026-2", "GT-2026-3"]);
  });

  it("'sin herramienta' = Padre + SV", () => {
    expect(aplicarFiltros(base, { ...FILTROS_VACIOS, herramienta: ["sin"] }).map((r) => r.file))
      .toEqual(["GT-2026-1", "GT-2026-4"]);
  });

  it("marcar las dos (o ninguna) no filtra nada", () => {
    expect(aplicarFiltros(base, { ...FILTROS_VACIOS, herramienta: ["sin", "con"] })).toHaveLength(4);
  });

  it("opcionesDeFiltro.herramienta: orden fijo sin·con con conteos", () => {
    const o = opcionesDeFiltro(base);
    expect(o.herramienta.map((x) => [x.value, x.count])).toEqual([["sin", 2], ["con", 2]]);
  });
});

describe("D2 · tiempo hábil según Origen", () => {
  it("origen 'v': se mide desde la Creación del file padre, no desde la Solicitud", () => {
    const regs = construirRegistros([
      // Padre: creado Lun 08:00 → 09:00.
      row("GT-2026-1", "ANA", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00"),
      // Réplica: su Solicitud es Lun 15:00, su Creación Lun 17:00 — pero se mide
      // desde la creación del padre (09:00) hasta la suya (17:00) = 8 h - 1 h almuerzo = 7 h.
      row("GT-2026-2", "LUIS", "C", "2026-01-05T15:00:00", "2026-01-05T17:00:00", "M", "P",
        "Creado como replica del file GT-2026-1"),
    ]);
    expect(minutosHabiles(regs[0].segHabiles)).toBe(60);
    expect(minutosHabiles(regs[1].segHabiles)).toBe(7 * 60);
    expect(regs[1].inicioMetrica?.toISOString()).toBe(regs[0].creacion.toISOString());
  });

  it("origen 'v' con el padre repetido: usa la Creación MÁS ANTIGUA", () => {
    const regs = construirRegistros([
      row("GT-2026-1", "ANA", "C", "2026-01-06T08:00:00", "2026-01-06T10:00:00"), // martes
      row("GT-2026-1", "ANA", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00"), // lunes (más antigua)
      row("GT-2026-9", "LUIS", "C", "2026-01-05T08:00:00", "2026-01-05T11:00:00", "M", "P",
        "Creado como replica del file GT-2026-1"),
    ]);
    // desde Lun 09:00 hasta Lun 11:00 = 2 h.
    expect(minutosHabiles(regs[2].segHabiles)).toBe(120);
  });

  it("origen 'v' pero el padre no tiene Creacion_fecha → cae a Solicitud → Creación", () => {
    const regs = construirRegistros([
      row("GT-2026-1", "ANA", "C", "2026-01-05T08:00:00", ""), // se descarta, sin fecha
      row("GT-2026-2", "LUIS", "C", "2026-01-05T09:00:00", "2026-01-05T11:00:00", "M", "P",
        "Creado como replica del file GT-2026-1"),
    ]);
    expect(regs).toHaveLength(1);
    expect(regs[0].origen).toBe("GT-2026-1 - v");
    expect(minutosHabiles(regs[0].segHabiles)).toBe(120); // Solicitud 09:00 → Creación 11:00
  });

  it("origen 'sv': se mide desde la Solicitud, como 'Padre'", () => {
    const [r] = construirRegistros([
      row("GT-2026-2", "LUIS", "C", "2026-01-05T09:00:00", "2026-01-05T11:00:00", "M", "P",
        "Creado como replica del file GT-2026-404"),
    ]);
    expect(r.origenTipo).toBe("sv");
    expect(minutosHabiles(r.segHabiles)).toBe(120);
  });

  it("réplica creada ANTES que su padre → anómala (inicio posterior a creación)", () => {
    const regs = construirRegistros([
      row("GT-2026-1", "ANA", "C", "2026-01-06T08:00:00", "2026-01-06T09:00:00"),
      row("GT-2026-2", "LUIS", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00", "M", "P",
        "Creado como replica del file GT-2026-1"),
    ]);
    expect(regs[1].anomalo).toBe(true);
    expect(regs[1].segHabiles).toBe(0);
  });

  it("el costo usa el par de la métrica (inicioMetrica → creación)", () => {
    const regs = construirRegistros([
      // Réplica creada el mismo lunes, 30 min después de su padre.
      row("GT-2026-1", "ANA", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00"),
      row("GT-2026-2", "LUIS", "C", "2026-01-05T09:20:00", "2026-01-05T09:30:00", "M", "P",
        "Creado como replica del file GT-2026-1"),
    ]);
    const c = costoClonacion(regs, TARIFA_CLONACION_DEFECTO);
    // ANA: 1 h. LUIS (réplica): desde la creación del padre 09:00 → 09:30 = 0.5 h.
    expect(c.horasEfectivas).toBeCloseTo(1.5, 5);
  });

  it("casosInflados de KPIs usa el par de la métrica, no la antigüedad de la solicitud", () => {
    const regs = construirRegistros([
      // Padre creado hace más de un año que la réplica.
      row("GT-2026-1", "ANA", "C", "2024-01-05T08:00:00", "2024-01-05T09:00:00"),
      row("GT-2026-2", "LUIS", "C", "2026-01-02T08:00:00", "2026-01-05T09:00:00", "M", "P",
        "Creado como replica del file GT-2026-1"),
    ]);
    const filtrados = aplicarFiltros(regs, FILTROS_VACIOS);
    const kpis = calcularKPIs(regs, filtrados, FILTROS_VACIOS, 0);
    // La réplica: su solicitud es de hace 3 días, pero el par de la métrica
    // (Creación del padre 2024 → Creación 2026) sí pasa el año.
    expect(kpis.casosInflados).toBe(1);
  });
});

describe("C6 · costo partido Padres+SV vs V", () => {
  it("cada grupo une los tramos de su usuario por separado; el total es la suma", () => {
    const regs = construirRegistros([
      // ANA · Padre: lun 08–10 (2 h hábiles: 08–10).
      row("GT-2026-1", "ANA", "C", "2026-01-05T08:00:00", "2026-01-05T10:00:00"),
      // ANA · dos réplicas del mismo padre, ambas creadas mié — inicio = creación
      // del padre (lun 10:00). Intervalos [lun10:00, mié09:00] y [lun10:00, mié11:00]
      // se unen → un solo tramo hasta mié 11:00.
      row("GT-2026-2", "ANA", "C", "2026-01-07T08:00:00", "2026-01-07T09:00:00", "M", "P", "Creado como replica del file GT-2026-1"),
      row("GT-2026-3", "ANA", "C", "2026-01-07T08:00:00", "2026-01-07T11:00:00", "M", "P", "Creado como replica del file GT-2026-1"),
    ]);
    const cpo = costoClonacionPorOrigen(regs, TARIFA_CLONACION_DEFECTO);
    // Padres+SV: solo ANA·Padre = 2 h.
    expect(cpo.padreSv.horasEfectivas).toBeCloseTo(2, 5);
    // V: unión [lun 10:00 → mié 11:00] = lun(10-13,14-18)=7 + mar 9 + mié(08-11)=3 = 19 h.
    expect(cpo.v.horasEfectivas).toBeCloseTo(19, 5);
    expect(cpo.costoTotal).toBeCloseTo((2 + 19) * TARIFA_CLONACION_DEFECTO, 5);
    expect(cpo.v.personas).toHaveLength(1);
    expect(cpo.v.personas[0].files).toBe(2);
  });

  it("sin réplicas: el grupo V queda en cero", () => {
    const cpo = costoClonacionPorOrigen(construirRegistros([
      row("GT-2026-1", "ANA", "C", "2026-01-05T08:00:00", "2026-01-05T09:00:00"),
    ]), TARIFA_CLONACION_DEFECTO);
    expect(cpo.v.costoTotal).toBe(0);
    expect(cpo.padreSv.costoTotal).toBeCloseTo(1 * TARIFA_CLONACION_DEFECTO, 5);
  });

  it("costo por file y contrafactual del valor de la herramienta", () => {
    const regs = construirRegistros([
      // 2 files Padre de ANA: lun 08–10 (2 h) y mar 08–09 (1 h) → 3 h · $18 · 2 files → $9/file.
      row("GT-2026-1", "ANA", "C", "2026-01-05T08:00:00", "2026-01-05T10:00:00"),
      row("GT-2026-2", "ANA", "C", "2026-01-06T08:00:00", "2026-01-06T09:00:00"),
      // 3 réplicas de GT-2026-1 (creado lun 10:00), hechas segundos después el mismo lunes.
      row("GT-2026-9a", "LUIS", "C", "2026-01-05T10:00:05", "2026-01-05T10:00:25", "M", "P", "Creado como replica del file GT-2026-1"),
      row("GT-2026-9b", "LUIS", "C", "2026-01-05T10:00:06", "2026-01-05T10:00:26", "M", "P", "Creado como replica del file GT-2026-1"),
      row("GT-2026-9c", "LUIS", "C", "2026-01-05T10:00:07", "2026-01-05T10:00:27", "M", "P", "Creado como replica del file GT-2026-1"),
    ]);
    const cpo = costoClonacionPorOrigen(regs, TARIFA_CLONACION_DEFECTO);
    expect(cpo.padreSv.nFiles).toBe(2);
    expect(cpo.padreSv.costoPorFile).toBeCloseTo(9, 5); // $18 / 2
    expect(cpo.contrafactual.nFilesV).toBe(3);
    expect(cpo.contrafactual.costoPorFilePadreSv).toBeCloseTo(9, 5);
    expect(cpo.contrafactual.costoManualV).toBeCloseTo(27, 5); // 3 × $9
    expect(cpo.contrafactual.ahorro).toBeCloseTo(27 - cpo.v.costoTotal, 5);
    expect(cpo.v.costoTotal).toBeLessThan(1); // las réplicas casi no cuestan
  });
});
