import { describe, expect, it } from "vitest";
import { mesAnterior, metaDucafastPorMes } from "./ducafastMesa2";
import type { Expediente } from "./tramites";

// Un File mínimo: solo lo que mira metaDucafastPorMes / ahorroDucafast.
function file(over: Partial<Expediente>): Expediente {
  return {
    file: "F", mes: "2026-11", mesas: ["Mesa 2"], ducafast: false, costoLicencias: 0,
    usuarios: [], analistas: [], etapas: {}, total: null, creado: null,
    ...over,
  } as unknown as Expediente;
}

describe("metaDucafastPorMes", () => {
  it("solo cuenta la Mesa 2, agrupa por mes y deja sin meta al mes que no tiene los dos grupos", () => {
    const todos = [
      file({ file: "A", ducafast: true }),
      file({ file: "B", ducafast: false }),
      file({ file: "C", mesas: ["Mesa 1"] }),        // otra mesa: no cuenta
      file({ file: "D", mes: "2026-10" }),             // otro mes
    ];
    const r = metaDucafastPorMes(todos);
    expect(Object.keys(r).sort()).toEqual(["2026-10", "2026-11"]);
    expect(r["2026-11"].files).toBe(2);
    expect(r["2026-11"].filesConDucafast).toBe(1);
    expect(r["2026-11"].filesSinDucafast).toBe(1);
    expect(r["2026-11"].porcentajeDucafast).toBeCloseTo(0.5, 9);
    expect(r["2026-10"].porcentajeDucafast).toBe(0);
    // Octubre no tiene Files con Ducafast → sin costo de ese grupo.
    expect(r["2026-10"].costoTotalCon).toBeNull();
    // Octubre: un solo File, sin Ducafast → no hay con qué comparar.
    expect(r["2026-10"].meta).toBeNull();
  });

  it("meta = total × costo sin Ducafast − total × costo con Ducafast", () => {
    // Sin tiempos medidos los costos por File son 0: la identidad se comprueba con licencias.
    const todos = [
      ...Array.from({ length: 2 }, (_, i) => file({ file: `C${i}`, ducafast: true, costoLicencias: 1, etapas: { t1: 3600 } as never, total: 3600 })),
      ...Array.from({ length: 3 }, (_, i) => file({ file: `S${i}`, ducafast: false, costoLicencias: 4, etapas: { t1: 3600 } as never, total: 3600 })),
    ];
    const m = metaDucafastPorMes(todos)["2026-11"];
    expect(m.files).toBe(5);
    expect(m.costoConDucafast).toBeCloseTo(m.files * m.costoPorFileCon, 9);
    expect(m.costoSinDucafast).toBeCloseTo(m.files * m.costoPorFileSin, 9);
    // Costo total de cada grupo (el «Costo total» de la 003): sus Files × su costo por File.
    expect(m.costoTotalCon).toBeCloseTo(m.filesConDucafast * m.costoPorFileCon, 9);
    expect(m.costoTotalSin).toBeCloseTo(m.filesSinDucafast * m.costoPorFileSin, 9);
    if (m.meta !== null) expect(m.meta).toBeCloseTo(m.costoSinDucafast - m.costoConDucafast, 9);
    // El beneficio real del mes solo cuenta los Files con Ducafast: Files con × (sin − con).
    if (m.ahorro !== null) expect(m.ahorro).toBeCloseTo(m.filesConDucafast * (m.costoPorFileSin - m.costoPorFileCon), 9);
  });
});

describe("mesAnterior", () => {
  it("retrocede un mes y cruza el cambio de año", () => {
    expect(mesAnterior("2026-11")).toBe("2026-10");
    expect(mesAnterior("2026-10")).toBe("2026-09");
    expect(mesAnterior("2026-01")).toBe("2025-12");
  });
});
