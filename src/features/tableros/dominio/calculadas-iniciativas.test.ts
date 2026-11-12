import { describe, expect, it } from "vitest";
import { addBusinessDays, today } from "@/lib/business";
import { calcIniPMHealth, iniItemStatus } from "@/lib/ini";
import { calcEntregaStats } from "@/lib/dashboard";
import type { CalMap, IniItem } from "@/types";
import {
  calidadIniciativa, camposApp, CAMPOS_INICIATIVAS, cumplimientoIniciativa, etapaIniciativa, plazoIniciativa, saludIniciativa, valoresIniciativa,
} from "./calculadas-iniciativas";
import { app } from "./tipos-columna/app";
import { tipoColumna } from "./tipos-columna";

const ini = (o: Partial<IniItem>): IniItem => ({
  id: "INI-1", name: "Una iniciativa", grupo: "G", pm: "Ana", status: "New", benefit: "", estado: "EN TIEMPO",
  dias: 1, limite: 5, deadline: null, creacion: null, ...o,
});
const sinReuniones: CalMap = new Map();
const conM1: CalMap = new Map([["INI-1", { M1: [{ inicio: new Date(), fin: new Date() }], M2: [] }]]);
const ymdDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("Tableros · columnas «Calculada por la app» de Iniciativas", () => {
  it("el tipo está registrado, es calculado y solo las Iniciativas tienen campos", () => {
    expect(tipoColumna("app")).toBe(app);
    expect(app.calculado).toBe(true);
    expect(app.config.validar({ campo: "salud" })).toEqual({ campo: "salud" });
    expect(app.config.validar(null)).toEqual({ campo: "" });
    expect(camposApp("iniciativas")).toBe(CAMPOS_INICIATIVAS);
    expect(camposApp("proyecto")).toEqual([]);
  });

  it("la etapa del embudo, en palabras", () => {
    expect(etapaIniciativa(ini({ status: "New" }))).toBe("Nueva · por Meeting 1");
    expect(etapaIniciativa(ini({ status: "Meeting 1" }))).toBe("Meeting 1 · por Meeting 2");
    expect(etapaIniciativa(ini({ estado: "APROBADA", status: 'PM "B"', clase: "B" }))).toBe("Aprobada · Clase B");
    expect(etapaIniciativa(ini({ estado: "EN_ESPERA", status: "Sin Valor Def" }))).toBe("En espera");
    expect(etapaIniciativa(ini({ estado: "PLAN_FUTURO", status: "Plan Futuro" }))).toBe("Plan futuro");
    expect(etapaIniciativa(ini({ estado: "CAMBIO_ESTRATEGIA", status: "Cambio estrategia" }))).toBe("Cambio de estrategia");
    expect(etapaIniciativa(ini({ estado: "POR_DEFINIR", status: "Meeting 2" }))).toBe("Por definir (Meeting 2)");
    expect(etapaIniciativa(ini({ estado: "SKIP", status: "" }))).toBeNull();
  });

  it("el plazo solo existe en New y Meeting 1; una reunión hoy la marca «Para hoy»", () => {
    expect(plazoIniciativa(ini({ estado: "ATRASADO" }))).toBe("Atrasada");
    expect(plazoIniciativa(ini({ estado: "Sin fecha" }))).toBe("Sin fecha");
    expect(plazoIniciativa(ini({ estado: "PARA HOY" }))).toBe("Para hoy");
    expect(plazoIniciativa(ini({ estado: "EN TIEMPO" }), sinReuniones)).toBe("En tiempo");
    expect(plazoIniciativa(ini({ estado: "EN TIEMPO" }), conM1)).toBe("Para hoy"); // M1 agendada hoy
    expect(plazoIniciativa(ini({ estado: "APROBADA", status: 'PM "A"' }))).toBeNull();
  });

  it("la salud es la que cuenta en el EVM del PM (misma función) y no afirma lo que no puede saber", () => {
    for (const [i, cal] of [[ini({ dias: 1 }), sinReuniones], [ini({ dias: 5 }), sinReuniones], [ini({ dias: 5 }), conM1], [ini({ estado: "ATRASADO" }), conM1]] as const) {
      const esperada = { "on-track": "On track", "in-risk": "At risk", "off-track": "Off track" }[iniItemStatus(i, cal)];
      expect(saludIniciativa(i, cal)).toBe(esperada);
    }
    // Sin calendario no se sabe si hay reunión: solo se afirma lo que no depende de él.
    expect(saludIniciativa(ini({ dias: 5 }))).toBeNull();
    expect(saludIniciativa(ini({ estado: "ATRASADO" }))).toBe("Off track");
    // Por definir: más de 1 día hábil desde Meet 2 → off track
    const meet2 = ymdDe(addBusinessDays(today(), -3, true));
    expect(saludIniciativa(ini({ estado: "POR_DEFINIR", status: "Meeting 2", meet2 }))).toBe("Off track");
    expect(saludIniciativa(ini({ estado: "APROBADA", status: 'PM "A"' }), conM1)).toBeNull();
  });

  it("con las mismas Iniciativas, las «Off track» de la columna son las que penalizan el índice del PM", () => {
    const lista = [ini({ id: "A", dias: 1 }), ini({ id: "B", dias: 5 }), ini({ id: "C", estado: "ATRASADO" })];
    const cal: CalMap = new Map();
    const textos = lista.map((i) => saludIniciativa(i, cal));
    const h = calcIniPMHealth("Ana", lista, cal);
    expect(textos.filter((t) => t === "On track").length).toBe(h.onTrack);
    expect(textos.filter((t) => t === "At risk").length).toBe(h.inRisk);
    expect(textos.filter((t) => t === "Off track").length).toBe(h.offTrack);
  });

  it("Cumplimiento y Calidad: solo las aprobadas, con la regla de las métricas", () => {
    const creacion = addBusinessDays(today(), -40, true);
    const aTiempo = ini({ id: "OK", estado: "APROBADA", status: 'PM "A"', clase: "A", creacion, meet1: ymdDe(addBusinessDays(creacion, 3, true)) });
    const tarde = ini({ id: "TARDE", estado: "APROBADA", status: 'PM "C"', clase: "C", creacion, meet1: ymdDe(addBusinessDays(creacion, 9, true)) });
    const sinDatos = ini({ id: "SD", estado: "APROBADA", status: 'PM "B"', clase: "B", creacion: null });
    expect(cumplimientoIniciativa(aTiempo)).toBe("A tiempo");
    expect(cumplimientoIniciativa(tarde)).toBe("Tarde");
    expect(cumplimientoIniciativa(tarde, { TARDE: { responsible: "Sponsor" } })).toBe("Tarde (excusada)");
    expect(cumplimientoIniciativa(tarde, { TARDE: { responsible: "PM" } })).toBe("Tarde"); // «PM» sigue penalizando
    expect(cumplimientoIniciativa(sinDatos)).toBe("No evaluable");
    expect(cumplimientoIniciativa(ini({}))).toBeNull();
    // Calidad: 100 solo con un responsable distinto de PM; sin asignar penaliza
    expect(calidadIniciativa(aTiempo)).toBe(0);
    expect(calidadIniciativa(aTiempo, { OK: { responsible: "Sin reproceso" as never } })).toBe(100);
    expect(calidadIniciativa(aTiempo, { OK: { responsible: "PM" } })).toBe(0);
    expect(calidadIniciativa(ini({}), {})).toBeNull();
    // Y coincide con lo que cuenta Cumplimiento de Entrega
    const s = calcEntregaStats([], [], {}, [aTiempo, tarde, sinDatos]);
    expect(s.total).toBe(2);
    expect(s.onTime).toBe(1);
  });

  it("todos los campos juntos, y las etapas sin dato dan null", () => {
    const v = valoresIniciativa(ini({ estado: "APROBADA", status: 'PM "A"', clase: "A", creacion: null }), {});
    expect(Object.keys(v).sort()).toEqual(CAMPOS_INICIATIVAS.map((c) => c.clave).sort());
    expect(v).toMatchObject({ etapa: "Aprobada · Clase A", plazo: null, dias: null, fecha_limite: null, salud: null, clase: "A", cumplimiento: "No evaluable", calidad: 0 });
    expect(valoresIniciativa(ini({ estado: "EN_ESPERA", status: "Sin Valor Def" }))).toMatchObject({ clase: null, cumplimiento: null, calidad: null });
  });
});
