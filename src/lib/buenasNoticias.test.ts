import { describe, it, expect } from "vitest";
import { nombreDeRotacion, diaDeBuenasNoticias, listaDeSemanas, nombreVisibleHoy } from "@/lib/buenasNoticias";

const d = (y: number, m: number, dd: number) => new Date(y, m - 1, dd);

describe("rotación de buenas noticias", () => {
  it("arranca el 16-nov con Cesar y sigue en orden, dando la vuelta", () => {
    expect([d(2026, 11, 16), d(2026, 11, 23), d(2026, 11, 30), d(2026, 12, 7), d(2026, 12, 14)].map(nombreDeRotacion))
      .toEqual(["Cesar Vasquez", "Daniela Alvarez", "David Guzman", "Luis Aguilar", "Cesar Vasquez"]);
  });
  it("también hacia atrás", () => expect(nombreDeRotacion(d(2026, 11, 9))).toBe("Luis Aguilar"));
  it("lunes con asueto: pasa al martes", () => {
    expect(diaDeBuenasNoticias(d(2026, 11, 2)).getDate()).toBe(2);   // 1-nov es domingo; el lunes 2 es normal
    expect(diaDeBuenasNoticias(d(2026, 6, 29))).toEqual(d(2026, 6, 30)); // Día del Ejército, lunes
  });
});

describe("lista y visibilidad", () => {
  it("lista la actual y 8 semanas más y se desliza sola", () => {
    const l = listaDeSemanas(d(2026, 11, 11), {});
    expect(l.map((a) => a.semana)).toEqual(["2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21", "2026-12-28", "2027-01-04"]);
    expect(listaDeSemanas(d(2026, 11, 17), {})[0].semana).toBe("2026-11-16");
  });
  it("el suplente reemplaza al original", () => {
    const [a] = listaDeSemanas(d(2026, 11, 16), { "2026-11-16": "Luis Aguilar" });
    expect(a).toMatchObject({ original: "Cesar Vasquez", suplente: "Luis Aguilar", asignado: "Luis Aguilar" });
  });
  it("un suplente igual al original no cuenta", () => {
    expect(listaDeSemanas(d(2026, 11, 16), { "2026-11-16": "Cesar Vasquez" })[0].suplente).toBeNull();
  });
  it("solo se ve el viernes previo y el lunes", () => {
    const s = {};
    expect(nombreVisibleHoy(d(2026, 11, 13), s)).toBe("Cesar Vasquez");  // viernes previo al 16
    expect(nombreVisibleHoy(d(2026, 11, 16), s)).toBe("Cesar Vasquez");  // lunes
    for (const dia of [17, 18, 19]) expect(nombreVisibleHoy(d(2026, 11, dia), s)).toBeNull();
    expect(nombreVisibleHoy(d(2026, 11, 20), s)).toBe("Daniela Alvarez");
    expect(nombreVisibleHoy(d(2026, 11, 14), s)).toBeNull();            // sábado
  });
  it("lunes con asueto: se ve el martes, no el lunes", () => {
    expect(nombreVisibleHoy(d(2026, 6, 29), {})).toBeNull();
    expect(nombreVisibleHoy(d(2026, 6, 30), {})).not.toBeNull();
  });
});
