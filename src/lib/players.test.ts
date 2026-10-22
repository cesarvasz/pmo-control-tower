import { describe, it, expect } from "vitest";
import { swapPmCku } from "@/lib/players";
import { lateExcused, type DelayMap } from "@/lib/delay";

const m = (responsible: string | null): DelayMap =>
  ({ x: { responsible } } as unknown as DelayMap);

describe("swapPmCku — para un CKU penaliza 'CKU' en vez de 'PM'", () => {
  it("CKU penaliza, PM excusa", () => {
    expect(lateExcused("x", swapPmCku(m("CKU")))).toBe(false);
    expect(lateExcused("x", swapPmCku(m("PM")))).toBe(true);
  });
  it("sin asignar sigue penalizando y los demás responsables excusan", () => {
    expect(lateExcused("x", swapPmCku({}))).toBe(false);
    expect(lateExcused("x", swapPmCku(m("Sponsor")))).toBe(true);
    expect(lateExcused("x", swapPmCku(m("Sin reproceso")))).toBe(true);
  });
  it("no muta el mapa original", () => {
    const orig = m("CKU");
    swapPmCku(orig);
    expect(orig.x.responsible).toBe("CKU");
  });
});

import { buildCkuScope, ckuDeEmail, ckuNameForEmail, cuentaEnPlayers, PLAYER_CKUS } from "@/lib/players";
import { esRolCku } from "@/lib/permissions";
import { calcNpsFromRecords } from "@/lib/nps";
import type { MondayItem, NpsRecord } from "@/types";

const hr = (name: string, email: string, role: string) =>
  ({ id: name, name, group: { title: "x" }, column_values: [
    { id: "email_mkz5qg4v", text: email }, { id: "dropdown_mkz53tjj", text: role },
  ] } as unknown as MondayItem);

describe("ckuNameForEmail", () => {
  const items = [hr("Javier Juarez", "JJ@x.com", "CKU"), hr("Ana PM", "ana@x.com", "PM"), hr("Multi", "m@x.com", "DEV, CKU")];
  it("devuelve el nombre solo si el Role incluye CKU (sin importar mayúsculas)", () => {
    expect(ckuNameForEmail(items, "jj@x.com")).toBe("Javier Juarez");
    expect(ckuNameForEmail(items, "m@x.com")).toBe("Multi");
    expect(ckuNameForEmail(items, "ana@x.com")).toBeNull();
    expect(ckuNameForEmail(items, "otro@x.com")).toBeNull();
    expect(ckuNameForEmail(items, "")).toBeNull();
  });
});

const rec = (over: Partial<NpsRecord>): NpsRecord => ({
  answers: { nps: 10 }, pm: "", invalidated: false, respondentEmail: "", submittedAt: "", reqCode: "", reqId: "", ...over,
});

describe("NPS de encuestas enviadas por CKU", () => {
  it("no entran al NPS global ni al de un PM", () => {
    const records = [rec({ pm: "PM1", reqId: "r1" }), rec({ pm: "PM1", reqId: "r1", cku: "Javier Juarez" })];
    expect(calcNpsFromRecords(records).total).toBe(1);
    expect(calcNpsFromRecords(records, "PM1").total).toBe(1);
  });
  it("solo cuentan para el player de ese CKU, no las de los PM sobre sus PML", () => {
    const base = { ini: [], proj: [], projBoards: [] } as never as Parameters<typeof buildCkuScope>[1];
    const data = {
      ...base,
      req: [{ id: "r1", cku: "Javier Juarez" }] as never,
      npsRecords: [
        rec({ pm: "PM1", reqId: "r1" }),                                  // enviada por el PM → no cuenta
        rec({ pm: "PM1", reqId: "r1", cku: "Javier Juarez" }),           // enviada por el CKU → cuenta
        rec({ pm: "PM1", reqId: "r1", cku: "Victoria Escobar" }),        // de otro CKU → no cuenta
      ],
    } as Parameters<typeof buildCkuScope>[1];
    const s = buildCkuScope("Javier Juarez", data);
    expect(s.npsRecords).toHaveLength(1);
    expect(calcNpsFromRecords(s.npsRecords, "Javier Juarez").total).toBe(1);
  });
  it("sin encuestas propias el NPS del CKU queda sin dato", () => {
    const data = { ini: [], proj: [], projBoards: [], req: [{ id: "r1", cku: "Javier Juarez" }] as never,
      npsRecords: [rec({ pm: "PM1", reqId: "r1" })] } as Parameters<typeof buildCkuScope>[1];
    const s = buildCkuScope("Javier Juarez", data);
    expect(calcNpsFromRecords(s.npsRecords, "Javier Juarez").nps).toBeNull();
  });
});

describe("Iniciativas en 'Sin Valor Def' (EN_ESPERA) no se toman en cuenta en Players", () => {
  const ini = (id: string, estado: string, cku = "Javier Juarez") => ({ id, estado, cku, pm: "Luis" });
  const data = (inis: ReturnType<typeof ini>[]) =>
    ({ ini: inis, req: [], proj: [], projBoards: [], npsRecords: [] }) as never as Parameters<typeof buildCkuScope>[1];

  it("cuentaEnPlayers deja fuera solo EN_ESPERA", () => {
    expect(cuentaEnPlayers(ini("a", "EN_ESPERA") as never)).toBe(false);
    for (const e of ["APROBADA", "EN TIEMPO", "ATRASADO", "POR_DEFINIR", "PLAN_FUTURO", "CAMBIO_ESTRATEGIA"])
      expect(cuentaEnPlayers(ini("a", e) as never)).toBe(true);
  });

  it("el scope del CKU no incluye sus Iniciativas en espera (las de otro CKU tampoco se mezclan)", () => {
    const s = buildCkuScope("Javier Juarez", data([
      ini("i1", "APROBADA"), ini("i2", "EN_ESPERA"), ini("i3", "EN TIEMPO"), ini("i4", "EN_ESPERA", "Victoria Escobar"),
    ]));
    expect(s.ini.map((i) => i.id)).toEqual(["i1", "i3"]);
  });
});

describe("ckuDeEmail / esRolCku — un rol CKU ve solo lo suyo", () => {
  const directorio = [
    { name: "Javier Juarez", email: "Implementacion@c807.com" },
    { name: "Víctoria Escobar", email: "aduana85@c807.com" },   // con acento: el match de nombre lo ignora
    { name: "Daniela Alvarez", email: "pm3@c807.com" },          // está en el Directorio pero no es un player CKU
  ];

  it("liga el correo con su CKU sin importar mayúsculas ni espacios", () => {
    expect(ckuDeEmail(directorio, "  implementacion@C807.COM ")).toBe("Javier Juarez");
    expect(ckuDeEmail(directorio, "aduana85@c807.com")).toBe("Victoria Escobar");
  });

  it("devuelve el nombre canónico de PLAYER_CKUS (el que usan las listas y el scope)", () => {
    expect(PLAYER_CKUS).toContain(ckuDeEmail(directorio, "aduana85@c807.com"));
  });

  it("null si el correo es de alguien que no es un player, no está en el Directorio, o viene vacío", () => {
    expect(ckuDeEmail(directorio, "pm3@c807.com")).toBeNull();
    expect(ckuDeEmail(directorio, "desconocido@c807.com")).toBeNull();
    expect(ckuDeEmail(directorio, "")).toBeNull();
    expect(ckuDeEmail([], "aduana85@c807.com")).toBeNull();
  });

  it("esRolCku reconoce el rol por nombre (sin importar mayúsculas ni espacios)", () => {
    for (const r of ["CKU", "cku", " Cku "]) expect(esRolCku(r)).toBe(true);
    for (const r of ["PM", "Administrador", "CKU Senior", "", undefined]) expect(esRolCku(r)).toBe(false);
  });
});
