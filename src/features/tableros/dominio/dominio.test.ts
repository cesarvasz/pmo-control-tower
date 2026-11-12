import { describe, expect, it } from "vitest";
import { TIPOS_COLUMNA, tipoColumna } from "./tipos-columna";
import { status } from "./tipos-columna/status";
import { dropdown } from "./tipos-columna/dropdown";
import { timeline } from "./tipos-columna/timeline";
import { numero } from "./tipos-columna/numero";
import { fecha } from "./tipos-columna/fecha";
import { persona } from "./tipos-columna/persona";
import { ROLES_COLUMNA, rolesParaTipo } from "./roles";
import { CATEGORIAS_STATUS, categoriaDeTextoMonday } from "./estados";
import { CATEGORIAS_TABLERO, rolesFaltantes } from "./categorias";
import { ACCIONES_TABLEROS, tieneAccionTableros } from "./acciones";
import { evaluar, filtrarVisibles, puede, validarRegla, type ReglaPermiso, type UsuarioTableros } from "./permisos";
import { claveNombre, ligarPorEmail, personaDesdeRh } from "./personas";
import type { MondayItem } from "@/types";

const unicas = (xs: string[]) => new Set(xs).size === xs.length;

describe("registros", () => {
  it("las claves no se repiten", () => {
    expect(unicas(TIPOS_COLUMNA.map((t) => t.clave))).toBe(true);
    expect(unicas(ROLES_COLUMNA.map((r) => r.clave))).toBe(true);
    expect(unicas(CATEGORIAS_STATUS.map((c) => c.clave))).toBe(true);
    expect(unicas(CATEGORIAS_TABLERO.map((c) => c.clave))).toBe(true);
    expect(unicas(ACCIONES_TABLEROS.map((a) => a.clave))).toBe(true);
  });

  it("cada rol acepta solo tipos registrados y cada categoría pide roles registrados", () => {
    for (const r of ROLES_COLUMNA) for (const t of r.tipos) expect(tipoColumna(t), `${r.clave} → ${t}`).toBeDefined();
    const roles = new Set(ROLES_COLUMNA.map((r) => r.clave));
    for (const c of CATEGORIAS_TABLERO) {
      for (const r of [...c.rolesRequeridos.flat(), ...c.columnasIniciales]) expect(roles.has(r), `${c.clave} → ${r}`).toBe(true);
    }
  });

  it("la config por defecto de cada tipo es válida", () => {
    for (const t of TIPOS_COLUMNA) expect(t.config.validar(t.config.defecto)).toEqual(t.config.defecto);
  });

  it("rolesParaTipo y rolesFaltantes", () => {
    expect(rolesParaTipo("fecha").map((r) => r.clave)).toEqual(["fecha_limite", "nueva_fecha_limite", "fin_real"]);
    expect(rolesFaltantes("pml", [{ rol: "status" }, { rol: "fin_real" }, { rol: "responsable", nivel: "sub" }]))
      .toEqual(["responsable", ["fecha_limite", "plan"]]);
    expect(rolesFaltantes("proyecto", ["status", "responsable", "plan", "fin_real", "esfuerzo_real"].map((rol) => ({ rol })))).toEqual([]);
    expect(rolesFaltantes("libre", [])).toEqual([]);
  });
});

describe("tipos de columna", () => {
  it("fecha: solo fechas reales", () => {
    expect(fecha.valor.validar("2026-02-28", {})).toBe("2026-02-28");
    expect(fecha.valor.validar("2026-02-30", {})).toBeNull();
    expect(fecha.valor.validar("2026-11-10T08:00:00Z", {})).toBe("2026-11-10");
    expect(fecha.valor.texto("2026-11-10", {})).toBe("10/11/2026");
  });

  it("timeline: ordena el rango e importa el texto de Monday", () => {
    expect(timeline.valor.validar({ desde: "2026-03-01", hasta: "2026-01-01" }, {})).toEqual({ desde: "2026-01-01", hasta: "2026-03-01" });
    expect(timeline.valor.desdeMonday!("2026-01-05 - 2026-02-10", {})).toEqual({ desde: "2026-01-05", hasta: "2026-02-10" });
    expect(timeline.valor.desdeMonday!("", {})).toBeNull();
  });

  it("número: acepta texto con comas y muestra la unidad", () => {
    const c = numero.config.validar({ decimales: 1, unidad: "$", unidadAntes: true });
    expect(numero.valor.validar("1,234.5", c)).toBe(1234.5);
    expect(numero.valor.validar("abc", c)).toBeNull();
    expect(numero.valor.texto(9, c)).toBe("$9");
    expect(numero.valor.desdeMonday!("", c)).toBeNull();
  });

  it("status: importa etiquetas de Monday con su categoría y valida por id", () => {
    const settings = JSON.stringify({
      labels: { 0: "Working on it", 1: "Done", 2: "Stuck Externo", 5: "", 7: "Out Of Scope" },
      labels_colors: { 1: { color: "#00c875" } },
      labels_positions_v2: { 0: 1, 1: 0, 2: 2, 5: 3, 7: 4 },
    });
    const c = status.config.desdeMonday!(settings);
    expect(c.etiquetas.map((e) => [e.id, e.texto, e.categoria])).toEqual([
      ["1", "Done", "hecho"], ["0", "Working on it", "en_curso"], ["2", "Stuck Externo", "atascado"], ["7", "Out Of Scope", "fuera"],
    ]);
    expect(c.etiquetas[0].color).toBe("#00c875");
    expect(status.valor.desdeMonday!("done", c)).toBe("1");
    expect(status.valor.validar("5", c)).toBeNull();
    expect(status.valor.texto("2", c)).toBe("Stuck Externo");
  });

  it("dropdown: respeta selección única y descarta opciones que no existen", () => {
    const c = dropdown.config.desdeMonday!(JSON.stringify({ labels: [{ id: 1, name: "PM" }, { id: 5, name: "CKU" }], label_limit_count: 1 }));
    expect(c.multiple).toBe(false);
    expect(dropdown.valor.validar(["5", "1", "9"], c)).toEqual(["5"]);
    expect(dropdown.valor.desdeMonday!("cku", c)).toEqual(["5"]);
    expect(dropdown.valor.validar([], c)).toBeNull();
  });

  it("persona: solo uuids, y desde Monday busca por nombre", () => {
    const ana = "11111111-1111-4111-8111-111111111111";
    const c = persona.config.defecto;
    expect(persona.valor.validar([ana, "x", ana.toUpperCase()], c)).toEqual([ana]);
    const ctx = { personaPorNombre: (n: string) => (claveNombre(n) === "ana lopez" ? ana : undefined), nombrePersona: () => "Ana López" };
    expect(persona.valor.desdeMonday!("Ana López, Nadie", c, ctx)).toEqual([ana]);
    expect(persona.valor.texto([ana], c, ctx)).toBe("Ana López");
  });

  it("categorías de status desde texto de Monday", () => {
    expect(categoriaDeTextoMonday("Done")).toBe("hecho");
    expect(categoriaDeTextoMonday("Stuck Interno")).toBe("atascado");
    expect(categoriaDeTextoMonday("On Hold")).toBe("pausa");
    expect(categoriaDeTextoMonday("No Viable")).toBe("fuera");
    expect(categoriaDeTextoMonday("Working on it")).toBe("en_curso");
    expect(categoriaDeTextoMonday("")).toBe("sin_iniciar");
  });
});

describe("permisos", () => {
  const ana = "11111111-1111-4111-8111-111111111111";
  const proyecto = { id: "t1", categoria: "proyecto" };
  const otro = { id: "t2", categoria: "proyecto" };
  const dev: UsuarioTableros = { rolId: "dev", esAdmin: false, personaId: ana };
  const reglas: ReglaPermiso[] = [
    { rolId: "dev", tableroId: null, categoria: "proyecto", nivel: "editar_valores", columnasEditables: ["status", "fin_real"], soloLoMio: true },
    { rolId: "dev", tableroId: "t2", categoria: null, nivel: "ninguno", columnasEditables: [], soloLoMio: false },
    { rolId: "pm", tableroId: null, categoria: "proyecto", nivel: "editar_estructura", columnasEditables: ["status"], soloLoMio: false },
  ];
  const mio = { responsables: [ana] };
  const ajeno = { responsables: [] };

  it("ejemplo del diseño: Developer solo marca status y fin real de lo suyo", () => {
    expect(puede(dev, "editar_valor", proyecto, reglas, { elemento: mio, columna: { id: "c1", rol: "status" } })).toBe(true);
    expect(puede(dev, "editar_valor", proyecto, reglas, { elemento: mio, columna: { id: "c2", rol: "costo" } })).toBe(false);
    expect(puede(dev, "editar_valor", proyecto, reglas, { elemento: ajeno, columna: { id: "c1", rol: "status" } })).toBe(false);
    expect(puede(dev, "ver", proyecto, reglas, { elemento: ajeno })).toBe(false);
    expect(puede(dev, "editar_estructura", proyecto, reglas)).toBe(false);
  });

  it("la regla del tablero gana sobre la de la categoría", () => {
    expect(evaluar(dev, "ver", otro, reglas).motivo).toMatch(/Sin acceso/);
  });

  it("columnas editables no limitan a niveles mayores; sin regla no hay acceso; Admin puede todo", () => {
    const pm: UsuarioTableros = { rolId: "pm", esAdmin: false, personaId: null };
    expect(puede(pm, "editar_valor", proyecto, reglas, { columna: { id: "c2", rol: "costo" }, elemento: ajeno })).toBe(true);
    expect(puede(pm, "ver", { id: "t3", categoria: "pml" }, reglas)).toBe(false);
    expect(puede({ rolId: null, esAdmin: true, personaId: null }, "administrar", proyecto, [])).toBe(true);
  });

  it("solo lo mío sin persona ligada no deja ver nada; filtrarVisibles", () => {
    const sinPersona = { ...dev, personaId: null };
    expect(evaluar(sinPersona, "ver", proyecto, reglas, { elemento: mio }).motivo).toMatch(/no está ligado/);
    expect(filtrarVisibles(dev, proyecto, reglas, [mio, ajeno])).toEqual([mio]);
  });

  it("validarRegla", () => {
    expect(validarRegla({ rolId: "dev", categoria: "pml", nivel: "ver", columnasEditables: ["a", "a", " "] }))
      .toEqual({ rolId: "dev", tableroId: null, categoria: "pml", nivel: "ver", columnasEditables: ["a"], soloLoMio: false });
    expect(validarRegla({ rolId: "dev", categoria: "pml", tableroId: "t1", nivel: "ver" })).toBeNull();
    expect(validarRegla({ rolId: "dev", categoria: "pml", nivel: "todo" })).toBeNull();
  });

  it("acciones globales: manage_roles las da todas mientras Tableros está en prueba", () => {
    expect(tieneAccionTableros({ pages: {}, actions: { manage_roles: true }, groups: {} }, "tableros_crear")).toBe(true);
    expect(tieneAccionTableros({ pages: {}, actions: { tableros_ver: true }, groups: {} }, "tableros_ver")).toBe(true);
    expect(tieneAccionTableros({ pages: {}, actions: {}, groups: {} }, "tableros_ver")).toBe(false);
  });
});

describe("personas", () => {
  const col = (title: string, text: string | null) => ({ id: title, text, column: { title } });
  const item: MondayItem = {
    id: "900", name: " Ana López ", group: { title: "Equipo CKU" },
    column_values: [col("Email", " Ana@Empresa.com "), col("Hrs Mes", "160"), col("Role", "CKU"), col("TLD", null), col("Status", "Inactive")],
  };

  it("fila del Directorio RH → persona", () => {
    expect(personaDesdeRh(item)).toEqual({
      nombre: "Ana López", email: "ana@empresa.com", grupo: "Equipo CKU", rol: "CKU", tld: null, hrsMes: 160, activo: false, mondayItemId: "900",
    });
    expect(personaDesdeRh({ ...item, column_values: [] }).hrsMes).toBeNull();
  });

  it("liga con usuarios por correo sin importar mayúsculas", () => {
    const m = ligarPorEmail([{ email: "ana@empresa.com" }, { email: null }], [{ id: "u1", email: "ANA@empresa.com" }]);
    expect([...m]).toEqual([["ana@empresa.com", "u1"]]);
  });
});
