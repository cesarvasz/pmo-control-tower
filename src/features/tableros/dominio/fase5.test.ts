import { describe, expect, it } from "vitest";
import { mondayADefinicion, type ColumnaMonday, type FilaMonday } from "./importar-monday";
import { mismoValor, planSincronizacion, planVacio, type EntradaSincronizar } from "./sincronizar";
import { esDatoDeMonday } from "./tablero";
import { armarHilos, assetsDelHtml, tamanoLegible } from "./bitacora";
import { filaIgual, separarExplicadas, type FilaMetrica } from "./paridad";
import type { DefinicionTablero } from "./definicion";

// Un board de Monday chico: Status, Notas (texto), Cost $ (número) y Resp (persona).
const COLUMNAS: Record<string, ColumnaMonday> = {
  name: { title: "Name" },
  status: { title: "Status", settings_str: JSON.stringify({ labels: { 0: "Working on it", 1: "Done" } }) },
  text0: { title: "Notas" },
  numeric_x: { title: "Cost $" },
  person: { title: "Resp" },
};
const ANA = "00000000-0000-4000-8000-0000000000a1";
const BETO = "00000000-0000-4000-8000-0000000000b2";
const PERSONAS: Record<string, string> = { "ana lopez": ANA, "beto ruiz": BETO };

type Fila = { id: string; parent?: string; grupo?: string; nombre: string; status?: string; notas?: string; costo?: string; resp?: string };
const fila = (f: Fila, orden: number): FilaMonday => ({
  id: f.id, parent_id: f.parent ?? null, orden, nombre: f.nombre, grupo: f.parent ? null : f.grupo ?? "Fase 1",
  column_values: [
    { id: "status", text: f.status ?? null }, { id: "text0", text: f.notas ?? null },
    { id: "numeric_x", text: f.costo ?? null }, { id: "person", text: f.resp ?? null },
  ],
});

function deMonday(filas: Fila[], columnas = COLUMNAS) {
  const filasMonday = filas.map(fila);
  const r = mondayADefinicion({
    columnas, columnasSub: columnas, filas: filasMonday, rhBoardId: null,
    personaPorNombre: (n) => PERSONAS[n.trim().toLowerCase()],
  });
  return { def: r.definicion, filas: filasMonday };
}

/** Lo que dejó la importación: el mismo board ya en la app (ids "G-…", "C-…", "E-…"). */
function importado(def: DefinicionTablero): EntradaSincronizar["actual"] {
  return {
    grupos: def.grupos.map((g, i) => ({ id: `G-${g.clave}`, titulo: g.titulo, orden: i, mondayGrupo: g.mondayGrupo ?? null, archivado: false })),
    columnas: def.columnas.map((c, i) => ({
      id: `C-${c.clave}`, nivel: c.nivel, titulo: c.titulo, tipo: c.tipo, rol: c.rol, config: c.config, orden: i, ancho: null, oculta: false,
      mondayColumnId: c.mondayColumnId, archivada: false,
    })),
    elementos: def.elementos.map((e, i) => ({
      id: `E-${e.clave}`, grupoId: e.grupo ? `G-${e.grupo}` : null, parentId: e.padre ? `E-${e.padre}` : null, nombre: e.nombre, orden: i,
      valores: Object.fromEntries(Object.entries(e.valores).map(([k, v]) => [`C-${k}`, v])), mondayItemId: e.mondayItemId ?? e.clave, archivado: false,
    })),
  };
}

function plan(actual: EntradaSincronizar["actual"], hoy: { def: DefinicionTablero; filas: FilaMonday[] }) {
  let n = 0;
  return planSincronizacion({
    actual, monday: hoy.def,
    textoMonday: (item, col) => hoy.filas.find((f) => f.id === item)?.column_values.find((v) => v.id === col)?.text ?? null,
    ctx: { personaPorNombre: (x) => PERSONAS[x.trim().toLowerCase()] },
    nuevoId: () => `N${++n}`,
  });
}

const AYER: Fila[] = [
  { id: "1", nombre: "Diseño", status: "Done", notas: "ok", costo: "100", resp: "Ana Lopez" },
  { id: "2", nombre: "Pruebas", status: "Working on it", costo: "50" },
  { id: "3", parent: "1", nombre: "Bocetos", status: "Done" },
];

describe("sincronizar con Monday · lo que trae", () => {
  it("si nada cambió en Monday, no hay nada que hacer", () => {
    const ayer = deMonday(AYER);
    expect(planVacio(plan(importado(ayer.def), deMonday(AYER)))).toBe(true);
  });

  it("valores y nombres que cambiaron en Monday; las columnas propias de la app se respetan", () => {
    const actual = importado(deMonday(AYER).def);
    actual.columnas.push({ id: "C-propia", nivel: "item", titulo: "Comentario PMO", tipo: "texto", rol: null, config: {}, orden: 9, ancho: null, oculta: false, mondayColumnId: null, archivada: false });
    actual.elementos[0].valores["C-propia"] = "lo escribí aquí";
    const hoy = deMonday([{ ...AYER[0], nombre: "Diseño final", status: "Working on it", notas: "", resp: "Beto Ruiz" }, AYER[1], AYER[2]]);
    const p = plan(actual, hoy);
    expect(p.elementosNuevos).toEqual([]);
    expect(p.elementosCambiados).toHaveLength(1);
    const c = p.elementosCambiados[0];
    expect(c.id).toBe("E-1");
    expect(c.nombre).toBe("Diseño final");
    expect(c.valores!["C-item:status"]).toBe("0");
    expect(c.valores!["C-item:person"]).toEqual([BETO]);
    expect("C-item:text0" in c.valores!).toBe(false); // se vació en Monday
    expect(c.valores!["C-propia"]).toBe("lo escribí aquí");
    expect(c.cambios.map((x) => x.columnaId).sort()).toEqual(["C-item:person", "C-item:status", "C-item:text0"]);
  });

  it("items y subitems nuevos (en un grupo nuevo) y lo borrado en Monday se archiva", () => {
    const actual = importado(deMonday(AYER).def);
    const hoy = deMonday([AYER[0], { id: "4", grupo: "Fase 2", nombre: "Lanzamiento", status: "Done" }, { id: "5", parent: "4", nombre: "Comunicado" }, AYER[2]]);
    const p = plan(actual, hoy);
    expect(p.gruposNuevos).toEqual([expect.objectContaining({ titulo: "Fase 2", mondayGrupo: "Fase 2", orden: 1 })]);
    const [item, sub] = p.elementosNuevos;
    expect(item).toMatchObject({ nombre: "Lanzamiento", grupoId: p.gruposNuevos[0].id, parentId: null, mondayItemId: "4" });
    expect(sub).toMatchObject({ nombre: "Comunicado", grupoId: null, parentId: item.id, mondayItemId: "5" });
    expect(p.archivar).toEqual(["E-2"]); // «Pruebas» ya no está en Monday
  });

  it("lo que vuelve a aparecer en Monday se restaura", () => {
    const actual = importado(deMonday(AYER).def);
    actual.elementos[1].archivado = true;
    expect(plan(actual, deMonday(AYER)).restaurar).toEqual(["E-2"]);
  });

  it("un item que cambió de grupo en Monday se mueve al final del grupo", () => {
    const actual = importado(deMonday([...AYER, { id: "9", grupo: "Fase 2", nombre: "Otro" }]).def);
    const p = plan(actual, deMonday([{ ...AYER[0], grupo: "Fase 2" }, AYER[1], AYER[2], { id: "9", grupo: "Fase 2", nombre: "Otro" }]));
    expect(p.elementosCambiados).toEqual([expect.objectContaining({ id: "E-1", grupoId: "G-g2", parentId: null })]);
    expect(p.elementosCambiados[0].orden).toBeGreaterThan(actual.elementos.find((e) => e.id === "E-9")!.orden);
  });
});

describe("sincronizar con Monday · el modelo es de la app", () => {
  it("título, rol y grupo renombrados en la app no se tocan; el grupo se reconoce por su clave de Monday", () => {
    const actual = importado(deMonday(AYER).def);
    actual.columnas[0].titulo = "Estado";
    actual.columnas[0].rol = null;
    actual.grupos[0].titulo = "1 · Diseño";
    expect(planVacio(plan(actual, deMonday(AYER)))).toBe(true);
  });

  it("una columna archivada en la app no vuelve ni recibe valores; una columna nueva en Monday sí llega", () => {
    const actual = importado(deMonday(AYER).def);
    const notas = actual.columnas.find((c) => c.mondayColumnId === "text0" && c.nivel === "item")!;
    notas.archivada = true;
    const conNueva = { ...COLUMNAS, date4: { title: "Go live" } };
    const hoy = deMonday([{ ...AYER[0], notas: "cambió" }, AYER[1], AYER[2]], conNueva);
    const p = plan(actual, hoy);
    expect(p.elementosCambiados.flatMap((c) => c.cambios).some((x) => x.columnaId === notas.id)).toBe(false);
    expect(p.columnasNuevas.map((c) => `${c.nivel}:${c.titulo}:${c.tipo}`).sort()).toEqual(["item:Go live:fecha", "sub:Go live:fecha"]);
  });

  it("Status: una etiqueta renombrada en la app se respeta (va por id); una etiqueta nueva de Monday se agrega", () => {
    const actual = importado(deMonday(AYER).def);
    const st = actual.columnas.find((c) => c.mondayColumnId === "status" && c.nivel === "item")!;
    st.config = { etiquetas: (st.config as { etiquetas: { id: string; texto: string }[] }).etiquetas.map((e) => (e.id === "1" ? { ...e, texto: "Hecho" } : e)) };
    expect(plan(actual, deMonday(AYER)).configs).toEqual([]);

    const conAtascado = { ...COLUMNAS, status: { title: "Status", settings_str: JSON.stringify({ labels: { 0: "Working on it", 1: "Done", 2: "Stuck" } }) } };
    const p = plan(actual, deMonday([{ ...AYER[0], status: "Stuck" }, AYER[1], AYER[2]], conAtascado));
    expect(p.configs.find((c) => c.columnaId === st.id)?.agregadas).toEqual(["Stuck"]);
    expect(p.elementosCambiados[0].valores![st.id]).toBe("2");
  });

  it("si en la app se cambió el tipo de una columna, el valor de Monday se convierte a ese tipo", () => {
    const actual = importado(deMonday([{ ...AYER[0], notas: "7" }, AYER[1], AYER[2]]).def);
    const notas = actual.columnas.find((c) => c.mondayColumnId === "text0" && c.nivel === "item")!;
    notas.tipo = "numero";
    notas.config = { decimales: 0 };
    actual.elementos[0].valores[notas.id] = 7;
    expect(planVacio(plan(actual, deMonday([{ ...AYER[0], notas: "7" }, AYER[1], AYER[2]])))).toBe(true);
    const p = plan(actual, deMonday([{ ...AYER[0], notas: "12" }, AYER[1], AYER[2]]));
    expect(p.elementosCambiados[0].valores![notas.id]).toBe(12);
  });

  it("los elementos creados en la app (sin id de Monday) no se tocan", () => {
    const actual = importado(deMonday(AYER).def);
    actual.elementos.push({ id: "E-app", grupoId: "G-g1", parentId: null, nombre: "Mío", orden: 50, valores: {}, mondayItemId: null, archivado: false });
    const p = plan(actual, deMonday(AYER));
    expect(planVacio(p)).toBe(true);
  });
});

describe("sincronizar con Monday · ayudas", () => {
  it("mismoValor compara sin importar el orden de las llaves (jsonb las reordena)", () => {
    expect(mismoValor({ desde: "a", hasta: "b" }, { hasta: "b", desde: "a" })).toBe(true);
    expect(mismoValor(undefined, null)).toBe(true);
    expect(mismoValor(["1"], ["2"])).toBe(false);
  });

  it("esDatoDeMonday: solo mientras el tablero se sincroniza, y solo lo que viene de Monday", () => {
    const sync = { sincronizaMonday: true };
    expect(esDatoDeMonday(sync, { mondayItemId: "1" })).toBe(true);
    expect(esDatoDeMonday(sync, { mondayItemId: "1" }, { mondayColumnId: "status" })).toBe(true);
    expect(esDatoDeMonday(sync, { mondayItemId: "1" }, { mondayColumnId: null })).toBe(false); // columna propia
    expect(esDatoDeMonday(sync, { mondayItemId: null })).toBe(false); // elemento creado aquí
    expect(esDatoDeMonday({ sincronizaMonday: false }, { mondayItemId: "1" })).toBe(false); // después del corte
  });
});

describe("bitácora · respuestas y adjuntos", () => {
  const com = (id: string, creadoAt: string, respuestaA: string | null = null) => ({
    id, autorId: null, autorNombre: "A", autorEmail: null, texto: id, creadoAt, editadoAt: null, deMonday: true, respuestaA, archivos: [],
  });

  it("armarHilos: actualizaciones nuevas primero y sus respuestas debajo, de la más antigua a la más nueva", () => {
    const hilos = armarHilos([
      com("r2", "2026-11-03T10:00:00Z", "u1"), com("u2", "2026-11-05T10:00:00Z"), com("u1", "2026-11-01T10:00:00Z"), com("r1", "2026-11-02T10:00:00Z", "u1"),
    ]);
    expect(hilos.map((h) => h.comentario.id)).toEqual(["u2", "u1"]);
    expect(hilos[1].respuestas.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(hilos[0].respuestas).toEqual([]);
  });

  it("armarHilos: una respuesta huérfana (su actualización se borró) no se pierde", () => {
    const hilos = armarHilos([com("r1", "2026-11-02T10:00:00Z", "borrada"), com("u1", "2026-11-01T10:00:00Z")]);
    expect(hilos.map((h) => h.comentario.id)).toEqual(["r1", "u1"]);
  });

  it("assetsDelHtml: las imágenes de una respuesta de Monday traen su id de archivo", () => {
    const html = `<p> Se hizo una actualización</p><img src="https://x.monday.com/protected_static/1/resources/3365963346/a.png" data-asset_id="3365963346" ><img data-asset_id="77"><img data-asset_id="77">`;
    expect(assetsDelHtml(html)).toEqual(["3365963346", "77"]);
    expect(assetsDelHtml("<p>solo texto</p>")).toEqual([]);
    expect(assetsDelHtml(null)).toEqual([]);
  });

  it("tamanoLegible", () => {
    expect(tamanoLegible(null)).toBe("");
    expect(tamanoLegible(512)).toBe("512 B");
    expect(tamanoLegible(2048)).toBe("2 KB");
    expect(tamanoLegible(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("diferencias decididas (PM-018)", () => {
  const filas: FilaMetrica[] = [
    { etiqueta: "Elementos", monday: 31, app: 31 },
    { etiqueta: "Costo", monday: 9, app: 273 },
    { etiqueta: "CPI", monday: 1, app: 1 },
    { etiqueta: "Atrasados", monday: 2, app: 3 },
  ];
  const dif = ["«Entregable 1».cost: Monday 9 ≠ app 273", "«Entregable 2».status: Monday \"Done\" ≠ app \"Stuck\""];

  it("PM-018: el costo y lo que depende de él se apartan con su motivo; lo demás sigue contando", () => {
    const r = separarExplicadas("PM-018", dif, filas);
    expect(r.diferencias).toEqual([dif[1]]);
    expect(r.filas.find((f) => f.etiqueta === "Costo")!.explicada).toMatch(/Costo adicional/);
    expect(filaIgual(r.filas.find((f) => f.etiqueta === "Costo")!)).toBe(true);
    expect(filaIgual(r.filas.find((f) => f.etiqueta === "Atrasados")!)).toBe(false); // esa sí es una diferencia
    expect(r.explicadas).toEqual([expect.objectContaining({ cantidad: 2 })]); // una diferencia por elemento + una métrica
  });

  it("otro tablero (o sin código) no aparta nada", () => {
    expect(separarExplicadas("PM-013", dif, filas)).toEqual({ diferencias: dif, filas, explicadas: [] });
    expect(separarExplicadas(null, dif, filas).explicadas).toEqual([]);
  });
});
