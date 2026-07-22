import { describe, it, expect } from "vitest";
import { nextOrLatest, iniItemStatus, INI_ACTIVE_STS, iniProcess, porDefinirStatus, porDefinirDias, calcIniPMHealth, esperaReminderInfo, buildReminderMap } from "./ini";
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

const ymdFromToday = (n: number): string => {
  const d = daysFromToday(n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("porDefinirStatus", () => {
  it("Meet 2 hace más de 1 día → off-track", () => {
    expect(porDefinirStatus(iniItem({ status: "Meeting 2", meet2: ymdFromToday(-2) }))).toBe("off-track");
    expect(porDefinirDias(iniItem({ meet2: ymdFromToday(-2) }))).toBe(2);
  });
  it("Meet 2 hoy o ayer → on-track", () => {
    expect(porDefinirStatus(iniItem({ status: "Meeting 2", meet2: ymdFromToday(0) }))).toBe("on-track");
    expect(porDefinirStatus(iniItem({ status: "Meeting 2", meet2: ymdFromToday(-1) }))).toBe("on-track");
  });
  it("Meet 2 futura o sin fecha → on-track", () => {
    expect(porDefinirStatus(iniItem({ status: "Meeting 2", meet2: ymdFromToday(3) }))).toBe("on-track");
    expect(porDefinirStatus(iniItem({ status: "Meeting 2" }))).toBe("on-track");
    expect(porDefinirDias(iniItem({ meet2: undefined }))).toBeNull();
  });
});

describe("calcIniPMHealth incluye Por Definir (Meeting 2)", () => {
  it("un Meeting 2 off-track cuenta en total y baja el índice", () => {
    const items: IniItem[] = [
      iniItem({ id: "A", estado: "POR_DEFINIR", status: "Meeting 2", meet2: ymdFromToday(-5) }),
    ];
    const h = calcIniPMHealth("PM", items, emptyCal);
    expect(h.total).toBe(1);
    expect(h.offTrack).toBe(1);
    expect(h.index).toBe(0);
  });
  it("un Meeting 2 on-track cuenta como sano", () => {
    const items: IniItem[] = [
      iniItem({ id: "A", estado: "POR_DEFINIR", status: "Meeting 2", meet2: ymdFromToday(0) }),
    ];
    const h = calcIniPMHealth("PM", items, emptyCal);
    expect(h.total).toBe(1);
    expect(h.onTrack).toBe(1);
    expect(h.index).toBe(1);
  });
});

describe("esperaReminderInfo (registro real)", () => {
  it("PKU marcado → pausado; sin CKU Mail → sinCorreo", () => {
    expect(esperaReminderInfo(iniItem({ pku: "v", ckuMail: "a@b.com", espera: ymdFromToday(-30) })).pausado).toBe(true);
    expect(esperaReminderInfo(iniItem({ pku: "", ckuMail: "", espera: ymdFromToday(-30) })).sinCorreo).toBe(true);
  });
  it("sin registro y En Espera vencida → 0 enviados y próximo vencido (pendiente)", () => {
    const info = esperaReminderInfo(iniItem({ pku: "", ckuMail: "a@b.com", espera: ymdFromToday(-30) }));
    expect(info.enviados).toBe(0);
    expect(info.vencido).toBe(true);
    expect(info.proximo).toBeInstanceOf(Date);
  });
  it("con 1 envío → próximo = último envío + 10 días háb.", () => {
    const info = esperaReminderInfo(iniItem({ pku: "", ckuMail: "a@b.com", espera: ymdFromToday(-30) }), { count: 1, lastSent: today() });
    expect(info.enviados).toBe(1);
    expect(info.vencido).toBe(false);
    expect(info.faltanDias).toBe(10);
    expect(info.proximo).toBeInstanceOf(Date);
  });
  it("4 correos enviados → completado, sin próximo", () => {
    const info = esperaReminderInfo(iniItem({ pku: "", ckuMail: "a@b.com", espera: ymdFromToday(-60) }), { count: 4, lastSent: daysFromToday(-5) });
    expect(info.enviados).toBe(4);
    expect(info.proximo).toBeNull();
  });
  it("sin fecha En Espera y sin registro → 0 enviados, sin próximo", () => {
    const info = esperaReminderInfo(iniItem({ pku: "", ckuMail: "a@b.com" }));
    expect(info.enviados).toBe(0);
    expect(info.proximo).toBeNull();
  });
});

describe("buildReminderMap", () => {
  it("agrupa por Ini ID: count y última fecha", () => {
    const mk = (iniId: string, fecha: string, numero: number) =>
      ({ fecha, itemId: "x", iniId, nombre: "N", para: "a@b.com", cc: "", numero, espera: "2026-05-01" });
    const map = buildReminderMap([
      mk("IN-1", "2026-05-15", 1), mk("IN-1", "2026-05-29", 2), mk("IN-2", "2026-06-01", 1),
    ]);
    expect(map.get("IN-1")?.count).toBe(2);
    expect(map.get("IN-1")?.lastSent).toEqual(new Date(2026, 4, 29));
    expect(map.get("IN-2")?.count).toBe(1);
    expect(map.has("IN-3")).toBe(false);
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

  it("Meeting 2 → POR_DEFINIR; status vacío → SKIP", () => {
    expect(iniProcess([mkIni("B", [col(INI_COL_ID.status, "Meeting 2")])])[0].estado).toBe("POR_DEFINIR");
    expect(iniProcess([mkIni("C", [])])[0].estado).toBe("SKIP");
  });

  it("Cambio Estrategia → CAMBIO_ESTRATEGIA (tolerante a casing/acentos)", () => {
    expect(iniProcess([mkIni("F", [col(INI_COL_ID.status, "Cambio Estrategia")])])[0].estado).toBe("CAMBIO_ESTRATEGIA");
    expect(iniProcess([mkIni("G", [col(INI_COL_ID.status, "cambio estrategia")])])[0].estado).toBe("CAMBIO_ESTRATEGIA");
    expect(iniProcess([mkIni("H", [col(INI_COL_ID.status, "Cambio de Estrategía")])])[0].estado).toBe("CAMBIO_ESTRATEGIA");
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
