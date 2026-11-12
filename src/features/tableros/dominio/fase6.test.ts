import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/lib/dashboardData";
import type { DashboardData, DashboardRaw, IniItem, MondayItem } from "@/types";
import { compararDashboard, completarDatosDeEscritura, personasAHrItems, type PersonaRh } from "./dashboard";

const COLUMNAS_RH = {
  name: { title: "Name" }, status: { title: "Status" }, email_mkz5qg4v: { title: "Email" }, numeric_mkze8mf7: { title: "Hrs Mes" },
  dropdown_mkz53tjj: { title: "Role" }, dropdown_mkzhm49h: { title: "TLD" }, pulse_id_mkz5p0r6: { title: "RH ID" },
};
const persona = (p: Partial<PersonaRh>): PersonaRh => ({
  id: "p1", nombre: "Ana López", email: "ana@c807.com", grupo: "Equipo de Desarrollo Interno", rol: "DEV, PM", tld: "Luis",
  hrsMes: 160, activo: true, mondayItemId: "900", ...p,
});

describe("Fase 6 · directorio con la forma del Directorio RH", () => {
  it("cada persona sale con los mismos ids de columna que el board de Monday", () => {
    const [it0] = personasAHrItems([persona({})], COLUMNAS_RH);
    expect(it0.id).toBe("900"); // conserva el id de Monday (los procesadores lo usan)
    expect(it0.name).toBe("Ana López");
    expect(it0.group.title).toBe("Equipo de Desarrollo Interno");
    const v = (id: string) => it0.column_values.find((c) => c.id === id)?.text;
    expect(v("email_mkz5qg4v")).toBe("ana@c807.com");
    expect(v("dropdown_mkz53tjj")).toBe("DEV, PM");
    expect(v("dropdown_mkzhm49h")).toBe("Luis");
    expect(v("numeric_mkze8mf7")).toBe("160");
    expect(v("status")).toBe("Active");
    expect(v("pulse_id_mkz5p0r6")).toBeNull(); // el directorio no guarda el RH ID
    expect(it0.column_values.some((c) => c.id === "name")).toBe(false);
    expect(it0.column_values.find((c) => c.id === "email_mkz5qg4v")?.column?.title).toBe("Email");
  });

  it("una persona inactiva sale Inactive; una creada en la app usa su propio id", () => {
    const [x] = personasAHrItems([persona({ activo: false, mondayItemId: null, id: "uuid-1", hrsMes: null })], COLUMNAS_RH);
    expect(x.id).toBe("uuid-1");
    expect(x.column_values.find((c) => c.id === "status")?.text).toBe("Inactive");
    expect(x.column_values.find((c) => c.id === "numeric_mkze8mf7")?.text).toBeNull();
  });

  it("el directorio armado así da el mismo listado de correos que la app usa hoy", () => {
    const hrItems = personasAHrItems([persona({}), persona({ id: "p2", nombre: "Beto", email: "beto@c807.com", mondayItemId: "901", grupo: "PMO" })], COLUMNAS_RH);
    const d = buildDashboardData(raw({ hrItems }));
    expect(d.directorio).toEqual([{ name: "Ana López", email: "ana@c807.com" }, { name: "Beto", email: "beto@c807.com" }]);
  });
});

function raw(parcial: Partial<DashboardRaw> = {}): DashboardRaw {
  return {
    iniItems: [], reqItems: [], hrItems: [], estrategiaItems: [], projBoards: [], projRaw: [], calData: [], sheetRows: [],
    baselines: {}, projItemBaselines: {}, npsRecords: [], delayAttributions: {}, reprocesoAttributions: {}, metodologiaCalifs: {},
    atrasoDetalles: {}, boardAlcance: {}, onHold: { proyectos: {}, pml: {} }, clases: {}, reminderLog: [], fetchedAt: new Date().toISOString(),
    ...parcial,
  };
}

describe("Fase 6 · seguir escribiendo en Monday con los datos de los tableros", () => {
  const items: MondayItem[] = [
    { id: "100", name: "Item", group: { title: "G" }, email: null, column_values: [], subitems: [
      { id: "101", name: "Hito", email: null, board: { id: "B" }, column_values: [] },
      { id: "uuid-sub", name: "Hito de la app", email: null, board: { id: "B" }, column_values: [] },
    ] },
    { id: "uuid-item", name: "Creado en la app", group: { title: "G" }, email: null, column_values: [] },
  ];
  const copia = new Map([
    ["100", { email: "item-100@c807.monday.com", subBoard: null }],
    ["101", { email: "item-101@c807.monday.com", subBoard: "SUB" }],
  ]);

  it("el item y el hito llevan su correo; el hito, el board OCULTO de subitems (no el del proyecto)", () => {
    const [it0] = completarDatosDeEscritura(items, copia);
    expect(it0.email).toBe("item-100@c807.monday.com");
    expect(it0.subitems![0].email).toBe("item-101@c807.monday.com");
    expect(it0.subitems![0].board).toEqual({ id: "SUB" });
  });

  it("lo creado en la app no existe en Monday: sin correo y el hito sin board (no se ofrece el selector)", () => {
    const [it0, it1] = completarDatosDeEscritura(items, copia);
    expect(it0.subitems![1].board).toBeNull();
    expect(it1.email).toBeNull();
    expect(it1.subitems).toBeUndefined();
  });

  it("no toca los valores (no cambia ninguna métrica)", () => {
    const [it0] = completarDatosDeEscritura(items, copia);
    expect(it0.column_values).toBe(items[0].column_values);
    expect(it0.subitems![0].column_values).toBe(items[0].subitems![0].column_values);
  });
});

describe("Fase 6 · comparar el dashboard completo", () => {
  const base = buildDashboardData(raw());

  it("el mismo dashboard de los dos lados: igual, con los indicadores lado a lado", () => {
    const r = compararDashboard(base, base);
    expect(r.igual).toBe(true);
    expect(r.secciones.map((s) => s.clave)).toEqual(["ini", "req", "proj", "boards", "est", "dir"]);
    expect(r.kpis.map((k) => k.estado)).toEqual(["igual", "igual", "igual", "igual"]);
  });

  it("una iniciativa distinta es diferencia; si solo falta una persona del directorio, es aviso", () => {
    const ini = (sponsor: string) => ({ id: "IN-1", name: "Iniciativa", sponsor } as unknown as IniItem);
    const a: DashboardData = { ...base, ini: [ini("Rafael Toruño")] };
    const b: DashboardData = { ...base, ini: [ini("")] };
    expect(compararDashboard(a, b).secciones[0].total).toBe(1);
    const r = compararDashboard(a, b, new Set(), (n) => n !== "Rafael Toruño");
    expect(r.secciones[0].total).toBe(0);
    expect(r.secciones[0].avisos).toHaveLength(1);
    expect(r.personasFuera).toEqual(["Rafael Toruño"]);
    expect(r.igual).toBe(true);
  });
});
