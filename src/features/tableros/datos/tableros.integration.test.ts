// Un tablero DE PUNTA A PUNTA contra la base real (lee .env.local). Crea un tablero de prueba,
// lo usa y lo BORRA al final (también si falla).
// No corre en `npm test` ni en CI: solo con  TABLEROS_IT=1 npx vitest run src/features/tableros/datos/tableros.integration.test.ts

import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import type { AppUser } from "@/lib/permissions";
import type { Acceso } from "./tableros";

const ACTIVO = process.env.TABLEROS_IT === "1";
if (ACTIVO && existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!ACTIVO)("Tableros · de punta a punta (integración)", { timeout: 120_000 }, async () => {
  const { crearTablero, leerTablero, leerHistorial } = await import("./tableros");
  const { ejecutarOperacion } = await import("./operaciones");
  const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
  const db = () => getSupabaseAdmin();

  const admin: AppUser = {
    uid: "00000000-0000-4000-8000-00000000a001", email: "prueba-tableros@local", displayName: "Prueba", roleId: "admin", roleName: "Admin",
    permissions: { pages: {}, actions: { manage_roles: true }, groups: {} }, defaultPage: null,
  };
  const accesoAdmin: Acceso = { usuario: { rolId: "admin", esAdmin: true, personaId: null }, reglas: [] };
  let tableroId = "";
  const otros: string[] = [];

  afterAll(async () => {
    for (const id of [tableroId, ...otros].filter(Boolean)) {
      const rutas = ((await db().from("elemento_archivos").select("ruta").eq("tablero_id", id)).data ?? []).map((a) => a.ruta);
      if (rutas.length) await db().storage.from("tableros").remove(rutas);
      await db().from("tableros").delete().eq("id", id);
    }
  });

  it("crea, edita estructura y valores, guarda historial y aplica «solo lo mío»", async () => {
    tableroId = await crearTablero({ nombre: "Prueba automática de tableros", codigo: "TEST", categoria: "proyecto" }, admin);
    let t = (await leerTablero(tableroId, accesoAdmin))!;
    expect(t.grupos).toHaveLength(1);
    expect(t.columnas.map((c) => c.rol)).toEqual(["status", "responsable", "plan", "fecha_limite", "fin_real", "costo"]);
    const run = (datos: Record<string, unknown>, acceso = accesoAdmin) => ejecutarOperacion(admin, acceso, t.tablero, datos);

    // Estructura: grupo, columna de subelementos
    await run({ op: "grupo.crear", titulo: "Fase 2" });
    await run({ op: "columna.crear", nivel: "sub", titulo: "Responsable", tipo: "persona", rol: "responsable" });
    await expect(run({ op: "columna.crear", nivel: "item", titulo: "Otra", tipo: "fecha", rol: "fecha_limite" })).rejects.toThrow(/Ya hay una columna/);

    // Elementos y valores
    const [ana, luis] = (await db().from("personas").select("id").eq("activo", true).limit(2)).data!.map((p) => p.id);
    const { id: item1 } = (await run({ op: "elemento.crear", grupoId: t.grupos[0].id, nombre: "Entregable A" })) as { id: string };
    const { id: item2 } = (await run({ op: "elemento.crear", grupoId: t.grupos[0].id, nombre: "Entregable B" })) as { id: string };
    const { id: sub1 } = (await run({ op: "elemento.crear", parentId: item2, nombre: "Actividad B.1" })) as { id: string };
    t = (await leerTablero(tableroId, accesoAdmin))!;
    const c = (rol: string, nivel = "item") => t.columnas.find((x) => x.rol === rol && x.nivel === nivel)!;

    const statusListo = (c("status").config as { etiquetas: { id: string; categoria: string }[] }).etiquetas.find((e) => e.categoria === "hecho")!.id;
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("status").id, valor: statusListo });
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("costo").id, valor: "1,500.5" });
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("plan").id, valor: { desde: "2026-12-01", hasta: "2026-11-20" } });
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("responsable").id, valor: [ana] });
    await run({ op: "valor.cambiar", elementoId: sub1, columnaId: c("responsable", "sub").id, valor: [ana, luis] });
    await expect(run({ op: "valor.cambiar", elementoId: sub1, columnaId: c("costo").id, valor: 1 })).rejects.toThrow(/nivel/);
    await run({ op: "elemento.renombrar", elementoId: item1, nombre: "Entregable A (v2)" });

    t = (await leerTablero(tableroId, accesoAdmin))!;
    const e1 = t.elementos.find((e) => e.id === item1)!;
    expect(e1.nombre).toBe("Entregable A (v2)");
    expect(e1.valores[c("costo").id]).toBe(1500.5);
    expect(e1.valores[c("plan").id]).toEqual({ desde: "2026-11-20", hasta: "2026-12-01" });
    expect(e1.responsables).toEqual([ana]);
    expect(t.elementos.find((e) => e.id === sub1)!.responsables).toEqual([ana, luis]);

    // Vaciar una celda la quita del jsonb
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("costo").id, valor: null });
    t = (await leerTablero(tableroId, accesoAdmin))!;
    expect(c("costo").id in t.elementos.find((e) => e.id === item1)!.valores).toBe(false);

    // Historial
    const h = await leerHistorial(tableroId, item1);
    expect(h.map((x) => x.campo)).toEqual(expect.arrayContaining(["creado", "valor", "nombre"]));
    expect(h.filter((x) => x.campo === "valor")).toHaveLength(5);

    // «Solo lo mío»: un rol que solo edita Status de lo suyo (regla solo para este tablero)
    await db().from("tablero_permisos").insert({ rol_id: "viewer", tablero_id: tableroId, nivel: "editar_valores", columnas_editables: ["status"], solo_lo_mio: true });
    const accesoAna: Acceso = {
      usuario: { rolId: "viewer", esAdmin: false, personaId: ana },
      reglas: [{ rolId: "viewer", tableroId, categoria: null, nivel: "editar_valores" as const, columnasEditables: ["status"], soloLoMio: true }],
    };
    const visto = (await leerTablero(tableroId, accesoAna))!;
    expect(visto.elementos.map((e) => e.id).sort()).toEqual([item1, item2, sub1].sort()); // item1 suyo; sub1 suyo + su padre item2
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("status").id, valor: null }, accesoAna);
    await expect(run({ op: "valor.cambiar", elementoId: item1, columnaId: c("costo").id, valor: 5 }, accesoAna)).rejects.toThrow(/columna/);
    await expect(run({ op: "columna.crear", nivel: "item", titulo: "X", tipo: "texto" }, accesoAna)).rejects.toThrow(/no alcanza/);

    // Archivar: el grupo con sus elementos; el tablero necesita al menos un grupo
    await run({ op: "elemento.archivar", elementoId: item2 });
    t = (await leerTablero(tableroId, accesoAdmin))!;
    expect(t.elementos.map((e) => e.id)).toEqual([item1]); // item2 y su subelemento se fueron
    const fase2 = t.grupos.find((g) => g.titulo === "Fase 2")!;
    await run({ op: "grupo.archivar", grupoId: fase2.id });
    await expect(run({ op: "grupo.archivar", grupoId: t.grupos[0].id })).rejects.toThrow(/al menos un grupo/);
  });

  it("fase 3: fórmulas, espejo, relación, bitácora y archivos", async () => {
    const { calcularTablero } = await import("../dominio/calculos");
    const { listarPersonasCorto, leerExtras } = await import("./tableros");
    let t = (await leerTablero(tableroId, accesoAdmin))!;
    const run = (datos: Record<string, unknown>) => ejecutarOperacion(admin, accesoAdmin, t.tablero, datos);
    const c = (rol: string) => t.columnas.find((x) => x.rol === rol && x.nivel === "item")!;
    const item1 = t.elementos.find((e) => !e.parentId)!.id;

    // Fórmulas: con rol (número) y validaciones de referencia, ciclo y formato.
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("costo").id, valor: 100 });
    await run({ op: "columna.crear", nivel: "item", titulo: "Con IVA", tipo: "formula", config: { expresion: `{${c("costo").id}} * 1.12`, formato: "numero" } });
    t = (await leerTablero(tableroId, accesoAdmin))!;
    const iva = t.columnas.find((x) => x.titulo === "Con IVA")!;
    await expect(run({ op: "columna.crear", nivel: "item", titulo: "Mala", tipo: "formula", config: { expresion: "{no-existe} + 1" } })).rejects.toThrow(/no existe/);
    await expect(run({ op: "columna.editar", columnaId: iva.id, config: { expresion: `{${iva.id}} + 1`, formato: "numero" } })).rejects.toThrow(/sí misma/);
    await expect(run({ op: "columna.editar", columnaId: iva.id, rol: "fecha_limite" })).rejects.toThrow(/una fecha|no se puede/);
    await expect(run({ op: "valor.cambiar", elementoId: item1, columnaId: iva.id, valor: 5 })).rejects.toThrow(/se calcula sola/);

    // Espejo del TLD del Responsable.
    await run({ op: "columna.crear", nivel: "item", titulo: "TLD", tipo: "espejo", config: { columna: c("responsable").id, campo: "tld" } });
    await expect(run({ op: "columna.crear", nivel: "item", titulo: "X", tipo: "espejo", config: { columna: iva.id, campo: "tld" } })).rejects.toThrow(/Persona o Relación/);

    // Relación a otro tablero.
    const otroId = await crearTablero({ nombre: "Prueba automática · objetivos", categoria: "estrategia" }, admin);
    otros.push(otroId);
    const otro = (await leerTablero(otroId, accesoAdmin))!;
    const { id: objetivo } = (await ejecutarOperacion(admin, accesoAdmin, otro.tablero, { op: "elemento.crear", grupoId: otro.grupos[0].id, nombre: "Objetivo 1" })) as { id: string };
    await run({ op: "columna.crear", nivel: "item", titulo: "Objetivo", tipo: "relacion", config: { tableroId: otroId, multiple: false } });
    t = (await leerTablero(tableroId, accesoAdmin))!;
    const rel = t.columnas.find((x) => x.tipo === "relacion")!;
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: rel.id, valor: [objetivo] });

    t = (await leerTablero(tableroId, accesoAdmin))!;
    const extras = await leerExtras(t, accesoAdmin);
    expect(extras.ligados[otroId].elementos.map((e) => e.nombre)).toEqual(["Objetivo 1"]);
    const personas = new Map((await listarPersonasCorto()).map((p) => [p.id, p]));
    const calc = calcularTablero(t, { personas, ligados: extras.ligados });
    const v = calc.valores.get(item1)!;
    expect(v[iva.id]).toBeCloseTo(112);
    const tld = t.columnas.find((x) => x.titulo === "TLD")!;
    const respId = (t.elementos.find((e) => e.id === item1)!.valores[c("responsable").id] as string[])[0];
    expect(v[tld.id] ?? null).toBe(personas.get(respId)?.tld ?? null);

    // Bitácora: crear, editar el propio, borrar.
    const { id: com } = (await run({ op: "comentario.crear", elementoId: item1, texto: "  Primera actualización  " })) as { id: string };
    await run({ op: "comentario.editar", comentarioId: com, texto: "Editada" });
    expect((await leerExtras(t, accesoAdmin)).comentarios[item1]).toBe(1);
    await run({ op: "comentario.borrar", comentarioId: com });
    expect((await leerExtras(t, accesoAdmin)).comentarios[item1]).toBeUndefined();

    // Archivo: preparar → subir con la URL firmada → confirmar → descargar → borrar.
    await run({ op: "columna.crear", nivel: "item", titulo: "Docs", tipo: "archivo" });
    t = (await leerTablero(tableroId, accesoAdmin))!;
    const docs = t.columnas.find((x) => x.tipo === "archivo")!;
    const prep = (await run({ op: "archivo.preparar", elementoId: item1, columnaId: docs.id, nombre: "Acta ñandú.txt", tamano: 5, tipoMime: "text/plain" })) as { archivoId: string; ruta: string; token: string };
    await expect(run({ op: "archivo.confirmar", archivoId: prep.archivoId })).rejects.toThrow(/no llegó/);
    const sub = await db().storage.from("tableros").uploadToSignedUrl(prep.ruta, prep.token, new Blob(["hola!"], { type: "text/plain" }));
    expect(sub.error).toBeNull();
    await run({ op: "archivo.confirmar", archivoId: prep.archivoId });
    expect((await leerExtras(t, accesoAdmin)).archivos.map((a) => a.nombre)).toEqual(["Acta ñandú.txt"]);
    const { url } = (await run({ op: "archivo.descargar", archivoId: prep.archivoId })) as { url: string };
    expect(await (await fetch(url)).text()).toBe("hola!");
    await run({ op: "archivo.borrar", archivoId: prep.archivoId });
    expect((await leerExtras(t, accesoAdmin)).archivos).toEqual([]);
    expect((await db().storage.from("tableros").list(prep.ruta.slice(0, prep.ruta.lastIndexOf("/")))).data).toEqual([]);
  });

  it('bitácora: responder y adjuntar archivos a un comentario, y borrarlo todo junto', async () => {
    const { leerExtras } = await import("./tableros");
    const id = await crearTablero({ nombre: 'Prueba de bitácora', codigo: 'TEST-B', categoria: 'proyecto' }, admin);
    otros.push(id);
    let t = (await leerTablero(id, accesoAdmin))!;
    const run = (datos: Record<string, unknown>) => ejecutarOperacion(admin, accesoAdmin, t.tablero, datos);
    const { id: item } = (await run({ op: 'elemento.crear', grupoId: t.grupos[0].id, nombre: 'Entregable' })) as { id: string };
    const subir = async (comentarioId: string, nombre: string, texto: string) => {
      const p = (await run({ op: 'archivo.preparar', elementoId: item, comentarioId, nombre, tamano: texto.length, tipoMime: 'text/plain' })) as { archivoId: string; ruta: string; token: string };
      const r = await db().storage.from('tableros').uploadToSignedUrl(p.ruta, p.token, new Blob([texto], { type: 'text/plain' }));
      expect(r.error).toBeNull();
      await run({ op: 'archivo.confirmar', archivoId: p.archivoId });
      return p;
    };

    // Una actualización solo con archivos (sin texto) y una respuesta con texto y archivo.
    await expect(run({ op: 'comentario.crear', elementoId: item, texto: '' })).rejects.toThrow(/Escribe/);
    const { id: act } = (await run({ op: 'comentario.crear', elementoId: item, texto: '', conArchivos: true })) as { id: string };
    const a1 = await subir(act, 'Acta ñandú.txt', 'hola!');
    const { id: resp } = (await run({ op: 'comentario.crear', elementoId: item, texto: 'Gracias', respuestaA: act })) as { id: string };
    const a2 = await subir(resp, 'Anexo.txt', 'anexo');
    // Solo se responde a una actualización, no a otra respuesta.
    await expect(run({ op: 'comentario.crear', elementoId: item, texto: 'x', respuestaA: resp })).rejects.toThrow(/no a otra respuesta/);

    const filas = (await db().from('elemento_comentarios').select('id, texto, respuesta_a').eq('tablero_id', id).is('borrado_at', null)).data!;
    expect(filas.find((c) => c.id === resp)!.respuesta_a).toBe(act);
    expect(filas.find((c) => c.id === act)!.texto).toBe('');
    // Los adjuntos de comentarios no se mezclan con los archivos de columnas.
    t = (await leerTablero(id, accesoAdmin))!;
    expect((await leerExtras(t, accesoAdmin)).archivos).toEqual([]);
    const { url } = (await run({ op: 'archivo.descargar', archivoId: a1.archivoId })) as { url: string };
    expect(await (await fetch(url)).text()).toBe('hola!');

    // Borrar un adjunto suelto; borrar la actualización se lleva su respuesta y los archivos de las dos.
    await run({ op: 'archivo.borrar', archivoId: a2.archivoId });
    expect((await db().from('elemento_archivos').select('id').eq('comentario_id', resp).is('borrado_at', null)).data).toEqual([]);
    await run({ op: 'comentario.borrar', comentarioId: act });
    expect((await db().from('elemento_comentarios').select('id').eq('tablero_id', id).is('borrado_at', null)).data).toEqual([]);
    expect((await db().from('elemento_archivos').select('id').eq('tablero_id', id).is('borrado_at', null)).data).toEqual([]);
    expect((await db().storage.from('tableros').list(a1.ruta.slice(0, a1.ruta.lastIndexOf('/')))).data).toEqual([]);
  });
});
