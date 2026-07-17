import { describe, it, expect } from "vitest";
import { nextOrLatest, iniItemStatus, INI_ACTIVE_STS, iniProcess } from "./ini";
import { today } from "./business";
import type { IniItem, CalMap, MondayColumnValue, MondayItem } from "@/types";

const daysFromToday = (n: number): Date => {
  const d = today();
  d.setDate(d.getDate() + n);
  return d;
};

describe("nextOrLatest", () => {
  const mk = (d: Date) => ({ inicio: d, fin: d });
  it("null para vacío o indefinido", () => {
    expect(nextOrLatest(undefined)).toBeNull();
    expect(nextOrLatest([])).toBeNull();
  });
  it("prefiere la próxima futura", () => {
    const past = mk(daysFromToday(-5));
    const future = mk(daysFromToday(5));
    expect(nextOrLatest([past, future])).toBe(future);
  });
  it("si todas son pasadas, devuelve la última", () => {
    const a = mk(daysFromToday(-10));
    const b = mk(daysFromToday(-2));
    expect(nextOrLatest([a, b])).toBe(b);
  });
});

const iniItem = (o: Partial<IniItem>): IniItem => ({
  id: "A", name: "Ini", grupo: "New", pm: "PM", status: "New", benefit: "",
  estado: "EN TIEMPO", dias: 1, limite: 10, deadline: null, creacion: null, ...o,
});
const emptyCal: CalMap = new Map();
const calWithM1: CalMap = new Map([["A", { M1: [{ inicio: new Date(), fin: new Date() }], M2: [] }]]);

describe("iniItemStatus", () => {
  it("ATRASADO → off-track", () => {
    expect(iniItemStatus(iniItem({ estado: "ATRASADO" }))).toBe("off-track");
  });
  it("activa sin reunión: <3 días hábiles = in-risk, ≥3 = off-track", () => {
    expect(iniItemStatus(iniItem({ dias: 1 }), emptyCal)).toBe("in-risk");
    expect(iniItemStatus(iniItem({ dias: 5 }), emptyCal)).toBe("off-track");
  });
  it("con reunión agendada → on-track", () => {
    expect(iniItemStatus(iniItem({ dias: 5 }), calWithM1)).toBe("on-track");
  });
  it("estado no activo → on-track", () => {
    expect(INI_ACTIVE_STS.has("PM Aprobado")).toBe(false);
    expect(iniItemStatus(iniItem({ status: "PM Aprobado", dias: 5 }), emptyCal)).toBe("on-track");
  });
});

// ── iniProcess (procesador completo desde items crudos de Monday) ─────────
// IDs de columna del board de Iniciativas (mismos que INI_COL en ini.ts).
const INI_COL_ID = {
  status: "color_mm3a94fr",
  id: "pulse_id_mm3atas7",
  pm: "multiple_person_mm3akwgd",
  benefit: "numeric_mm3ajaxp",
  creRaw: "pulse_log_mm3a84me",
};
const col = (id: string, text: string): MondayColumnValue => ({ id, text });
const mkIni = (name: string, cols: MondayColumnValue[]): MondayItem => ({
  id: name, name, group: { title: "Grupo" }, column_values: cols,
});

describe("iniProcess", () => {
  it("PM Aprobado → APROBADA sin cálculo de días, conserva id/pm", () => {
    const [r] = iniProcess([mkIni("Ini A", [
      col(INI_COL_ID.status, "PM Aprobado"), col(INI_COL_ID.id, "PMO-1"),
      col(INI_COL_ID.pm, "Luis"), col(INI_COL_ID.benefit, "1000"),
    ])]);
    expect(r.estado).toBe("APROBADA");
    expect(r.dias).toBeNull();
    expect(r.id).toBe("PMO-1");
    expect(r.pm).toBe("Luis");
  });

  it("Meeting 2 y status vacío → SKIP", () => {
    expect(iniProcess([mkIni("B", [col(INI_COL_ID.status, "Meeting 2")])])[0].estado).toBe("SKIP");
    expect(iniProcess([mkIni("C", [])])[0].estado).toBe("SKIP");
  });

  it("New con creación muy antigua → ATRASADO con deadline y límite 5", () => {
    const [r] = iniProcess([mkIni("D", [
      col(INI_COL_ID.status, "New"), col(INI_COL_ID.creRaw, "2020-01-01 08:00:00 UTC"),
    ])]);
    expect(r.estado).toBe("ATRASADO");
    expect(r.limite).toBe(5);
    expect(r.dias).not.toBeNull();
    expect(r.deadline).toBeInstanceOf(Date);
  });

  it("New sin fecha → 'Sin fecha', días y deadline null", () => {
    const [r] = iniProcess([mkIni("E", [col(INI_COL_ID.status, "New")])]);
    expect(r.estado).toBe("Sin fecha");
    expect(r.dias).toBeNull();
    expect(r.deadline).toBeNull();
  });
});
