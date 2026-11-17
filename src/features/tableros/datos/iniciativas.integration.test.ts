// «✓ Completar» la Meeting 1 y la Meeting 2 de una iniciativa, DE PUNTA A PUNTA contra la base real (lee .env.local). Crea un tablero de
// prueba, lo usa y lo BORRA al final (también si falla).
// No corre en `npm test` ni en CI: solo con  TABLEROS_IT=1 npx vitest run src/features/tableros/datos/iniciativas.integration.test.ts

import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import type { AppUser } from "@/lib/permissions";
import type { Acceso } from "./tableros";

const ACTIVO = process.env.TABLEROS_IT === "1";
if (ACTIVO && existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!ACTIVO)("Iniciativas · completar la Meeting 1 y la Meeting 2 (integración)", { timeout: 120_000 }, async () => {
  const { crearTablero, leerTablero, leerHistorial } = await import("./tableros");
  const { ejecutarOperacion } = await import("./operaciones");
  const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
  const db = () => getSupabaseAdmin();

  const admin: AppUser = {
    uid: "00000000-0000-4000-8000-00000000a002", email: "prueba-iniciativas@local", displayName: "Prueba", roleId: "admin", roleName: "Admin",
    permissions: { pages: {}, actions: { manage_roles: true }, groups: {} }, defaultPage: null,
  };
  const acceso: Acceso = { usuario: { rolId: "admin", esAdmin: true, personaId: null }, reglas: [] };
  let tableroId = "";

  afterAll(async () => {
    if (tableroId) await db().from("tableros").delete().eq("id", tableroId);
  });

  it("anota Meet 1 / Meet 2 y la hora, mueve el Status a la etapa de la siguiente acción y lo deja en el historial", async () => {
    tableroId = await crearTablero({ nombre: "Prueba automática de iniciativas", codigo: "TESTINI", categoria: "iniciativas" }, admin);
    let t = (await leerTablero(tableroId, acceso))!;
    const run = (datos: Record<string, unknown>) => ejecutarOperacion(admin, acceso, t.tablero, datos);
    const recargar = async () => { t = (await leerTablero(tableroId, acceso))!; };

    // Las etiquetas del Status y la columna Meet 1 (como en el tablero real)
    const colStatus = t.columnas.find((c) => c.rol === "status")!;
    const etiquetas = ["New", "Meeting 1", 'PM "A"', 'PM "B"', "Plan Futuro", "Sin Valor Def"].map((texto, i) => ({ id: String(i + 1), texto, color: "#579bfc", categoria: "en_curso" }));
    await run({ op: "columna.editar", columnaId: colStatus.id, config: { etiquetas } });
    await run({ op: "columna.crear", nivel: "item", titulo: "Meet 1", tipo: "fecha", rol: null });
    await run({ op: "columna.crear", nivel: "item", titulo: "Meet 2", tipo: "fecha", rol: null });
    await run({ op: "columna.crear", nivel: "item", titulo: "Plan Futuro", tipo: "fecha", rol: null });
    await run({ op: "columna.crear", nivel: "item", titulo: "En Espera", tipo: "fecha", rol: null });
    await run({ op: "columna.crear", nivel: "item", titulo: "PKU", tipo: "checkbox", rol: null });
    await recargar();
    const colPku = t.columnas.find((c) => c.titulo === "PKU")!;
    const colPlanFuturo = t.columnas.find((c) => c.titulo === "Plan Futuro" && c.tipo === "fecha")!;
    const colEspera = t.columnas.find((c) => c.titulo === "En Espera")!;
    const colMeet1 = t.columnas.find((c) => c.titulo === "Meet 1")!;
    const colMeet2 = t.columnas.find((c) => c.titulo === "Meet 2")!;
    const idDe = (texto: string) => etiquetas.find((e) => e.texto === texto)!.id;
    const nueva = async (nombre: string) => {
      const { id } = (await run({ op: "elemento.crear", grupoId: t.grupos[0].id, nombre, valores: { [colStatus.id]: idDe("New") } })) as { id: string };
      return id;
    };
    const lee = async (id: string) => { await recargar(); return t.elementos.find((e) => e.id === id)!.valores; };
    const hoyGT = new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);

    const a = await nueva("Iniciativa A");
    // Validaciones: Aprobada pide la Clase; una acción fuera de la lista no pasa
    await expect(run({ op: "iniciativa.completar", accion: "Meeting 1", elementoId: a, siguiente: "Aprobada" })).rejects.toThrow(/Clase/);
    await expect(run({ op: "iniciativa.completar", accion: "Meeting 1", elementoId: a, siguiente: "Cambio estrategia" })).rejects.toThrow(/siguiente acción/);
    expect((await lee(a))[colStatus.id]).toBe(idDe("New")); // nada se escribió a medias

    // Completar → Meeting 2: el Status pasa a «Meeting 1» (ya hubo M1, falta M2) y se anota el día
    const r = (await run({ op: "iniciativa.completar", accion: "Meeting 1", elementoId: a, siguiente: "Meeting 2" })) as { completadaAt: string };
    expect(Date.now() - Date.parse(r.completadaAt)).toBeLessThan(60_000);
    const va = await lee(a);
    expect(va[colStatus.id]).toBe(idDe("Meeting 1"));
    expect(va[colMeet1.id]).toBe(hoyGT);

    // El historial dice qué se completó y cuándo
    const h = (await leerHistorial(tableroId, a)) as { campo: string; despues: { accion?: string; siguiente?: string } | null; fecha: string }[];
    const accion = h.find((c) => c.campo === "accion");
    expect(accion?.despues).toEqual({ accion: "Meeting 1", siguiente: "Meeting 2" });
    expect(Math.abs(Date.parse(accion!.fecha) - Date.parse(r.completadaAt))).toBeLessThan(60_000);

    // Ya no está pendiente
    await expect(run({ op: "iniciativa.completar", accion: "Meeting 1", elementoId: a, siguiente: "Plan Futuro" })).rejects.toThrow(/ya no está pendiente/);

    // Meeting 2: no se puede completar estando en New; estando en «Meeting 1» no ofrece la Meeting 2 otra vez; Aprobada pide la Clase
    const sinM1 = await nueva("Iniciativa sin Meeting 1");
    await expect(run({ op: "iniciativa.completar", accion: "Meeting 2", elementoId: sinM1, siguiente: "Plan Futuro" })).rejects.toThrow(/Meeting 2 ya no está pendiente/);
    await expect(run({ op: "iniciativa.completar", accion: "Meeting 2", elementoId: a, siguiente: "Meeting 2" })).rejects.toThrow(/siguiente acción/);
    await expect(run({ op: "iniciativa.completar", accion: "Meeting 2", elementoId: a, siguiente: "Aprobada" })).rejects.toThrow(/Clase/);
    expect((await lee(a))[colStatus.id]).toBe(idDe("Meeting 1")); // nada se escribió a medias
    const r2 = (await run({ op: "iniciativa.completar", accion: "Meeting 2", elementoId: a, siguiente: "Aprobada", clase: "A" })) as { completadaAt: string };
    const va2 = await lee(a);
    expect(va2[colStatus.id]).toBe(idDe('PM "A"'));
    expect(va2[colMeet2.id]).toBe(hoyGT);
    expect(va2[colMeet1.id]).toBe(hoyGT); // la de la Meeting 1 no se tocó
    const h2 = (await leerHistorial(tableroId, a)) as { campo: string; despues: { accion?: string; siguiente?: string; clase?: string } | null; fecha: string }[];
    const m2 = h2.find((c) => c.campo === "accion" && c.despues?.accion === "Meeting 2");
    expect(m2?.despues).toEqual({ accion: "Meeting 2", siguiente: "Aprobada", clase: "A" });
    expect(Math.abs(Date.parse(m2!.fecha) - Date.parse(r2.completadaAt))).toBeLessThan(60_000);
    await expect(run({ op: "iniciativa.completar", accion: "Meeting 2", elementoId: a, siguiente: "Plan Futuro" })).rejects.toThrow(/ya no está pendiente/);

    // La Meeting 2 también lleva a Plan Futuro (con la fecha en que se retoma) y a Sin Beneficio Definido (En Espera = hoy)
    const x = await nueva("Iniciativa → Plan Futuro");
    await run({ op: "iniciativa.completar", accion: "Meeting 1", elementoId: x, siguiente: "Meeting 2" });
    await expect(run({ op: "iniciativa.completar", accion: "Meeting 2", elementoId: x, siguiente: "Plan Futuro" })).rejects.toThrow(/fecha en que se va a retomar/);
    await expect(run({ op: "iniciativa.completar", accion: "Meeting 2", elementoId: x, siguiente: "Plan Futuro", fecha: hoyGT })).rejects.toThrow(/posterior a hoy/);
    expect((await lee(x))[colStatus.id]).toBe(idDe("Meeting 1")); // nada se escribió a medias
    await run({ op: "iniciativa.completar", accion: "Meeting 2", elementoId: x, siguiente: "Plan Futuro", fecha: "2099-03-01" });
    const vx = await lee(x);
    expect(vx[colStatus.id]).toBe(idDe("Plan Futuro"));
    expect(vx[colPlanFuturo.id]).toBe("2099-03-01");
    expect(vx[colEspera.id]).toBeUndefined();
    const hx = (await leerHistorial(tableroId, x)) as { campo: string; despues: { accion?: string; fecha?: string } | null }[];
    expect(hx.find((c) => c.campo === "accion" && c.despues?.accion === "Meeting 2")?.despues).toEqual({ accion: "Meeting 2", siguiente: "Plan Futuro", fecha: "2099-03-01" });

    const y = await nueva("Iniciativa → Sin Beneficio Definido");
    await run({ op: "iniciativa.completar", accion: "Meeting 1", elementoId: y, siguiente: "Meeting 2" });
    await run({ op: "iniciativa.completar", accion: "Meeting 2", elementoId: y, siguiente: "Sin Beneficio Definido" });
    const vy = await lee(y);
    expect(vy[colStatus.id]).toBe(idDe("Sin Valor Def"));
    expect(vy[colEspera.id]).toBe(hoyGT); // de aquí corren los recordatorios de Sin Valor Def
    expect(vy[colPlanFuturo.id]).toBeUndefined();

    // Plan Futuro también se completa: solo hacia Sin Beneficio Definido o Aprobada, sin tocar la fecha en que se iba a retomar
    await expect(run({ op: "iniciativa.completar", accion: "Plan Futuro", elementoId: x, siguiente: "Meeting 2" })).rejects.toThrow(/siguiente acción/);
    await expect(run({ op: "iniciativa.completar", accion: "Plan Futuro", elementoId: x, siguiente: "Aprobada" })).rejects.toThrow(/Clase/);
    await expect(run({ op: "iniciativa.completar", accion: "Plan Futuro", elementoId: a, siguiente: "Sin Beneficio Definido" })).rejects.toThrow(/ya no está pendiente/); // a ya está aprobada
    expect((await lee(x))[colStatus.id]).toBe(idDe("Plan Futuro")); // nada se escribió a medias
    await run({ op: "iniciativa.completar", accion: "Plan Futuro", elementoId: x, siguiente: "Aprobada", clase: "B" });
    const vpf = await lee(x);
    expect(vpf[colStatus.id]).toBe(idDe('PM "B"'));
    expect(vpf[colPlanFuturo.id]).toBe("2099-03-01"); // la fecha en que se iba a retomar se conserva
    const hpf = (await leerHistorial(tableroId, x)) as { campo: string; despues: { accion?: string; siguiente?: string; clase?: string } | null }[];
    expect(hpf.find((c) => c.campo === "accion" && c.despues?.accion === "Plan Futuro")?.despues).toEqual({ accion: "Plan Futuro", siguiente: "Aprobada", clase: "B" });

    const z = await nueva("Iniciativa Plan Futuro → Sin Beneficio Definido");
    await run({ op: "iniciativa.completar", accion: "Meeting 1", elementoId: z, siguiente: "Plan Futuro", fecha: "2099-05-01" });
    await run({ op: "iniciativa.completar", accion: "Plan Futuro", elementoId: z, siguiente: "Sin Beneficio Definido" });
    const vz = await lee(z);
    expect(vz[colStatus.id]).toBe(idDe("Sin Valor Def"));
    expect(vz[colEspera.id]).toBe(hoyGT); // como Sin Valor Def: de aquí corren sus recordatorios

    // Sin Beneficio Definido: solo «Completar» (cerrarla) o Aprobada
    await expect(run({ op: "iniciativa.completar", accion: "Sin Beneficio Definido", elementoId: y, siguiente: "Plan Futuro", fecha: "2099-01-01" })).rejects.toThrow(/siguiente acción/);
    await expect(run({ op: "iniciativa.completar", accion: "Sin Beneficio Definido", elementoId: y, siguiente: "Aprobada" })).rejects.toThrow(/Clase/);
    expect((await lee(y))[colPku.id]).toBeUndefined();
    await run({ op: "iniciativa.completar", accion: "Sin Beneficio Definido", elementoId: y, siguiente: "Completar" });
    const vy2 = await lee(y);
    expect(vy2[colStatus.id]).toBe(idDe("Sin Valor Def")); // el mismo status
    expect(vy2[colPku.id]).toBe(true); // los recordatorios se pausan
    expect(vy2[colEspera.id]).toBe(hoyGT);
    const hy = (await leerHistorial(tableroId, y)) as { campo: string; despues: { accion?: string; resultado?: string } | null }[];
    expect(hy.find((c) => c.campo === "accion" && c.despues?.accion === "Sin Beneficio Definido")?.despues).toEqual({ accion: "Sin Beneficio Definido", resultado: "sin-aprobar" });
    // Los campos calculados leen el cierre del historial (por elemento, en el día de Guatemala)
    const cierres = await (await import("./calculadas-app")).leerCierres(tableroId);
    expect(cierres.get(y)).toBe(hoyGT);
    expect(cierres.has(z)).toBe(false);
    // ya cerrada: no se completa ni se aprueba después
    await expect(run({ op: "iniciativa.completar", accion: "Sin Beneficio Definido", elementoId: y, siguiente: "Completar" })).rejects.toThrow(/ya se cerró sin aprobar/);
    await expect(run({ op: "iniciativa.completar", accion: "Sin Beneficio Definido", elementoId: y, siguiente: "Aprobada", clase: "A" })).rejects.toThrow(/ya se cerró sin aprobar/);
    expect((await lee(y))[colStatus.id]).toBe(idDe("Sin Valor Def"));

    // Sin Beneficio Definido → Aprobada con Clase: pasa a PM "A" y no marca PKU
    await run({ op: "iniciativa.completar", accion: "Sin Beneficio Definido", elementoId: z, siguiente: "Aprobada", clase: "A" });
    const vz2 = await lee(z);
    expect(vz2[colStatus.id]).toBe(idDe('PM "A"'));
    expect(vz2[colPku.id]).toBeUndefined();

    // Eliminar una iniciativa: solo un Admin (se archiva: deja de verse, pero su historial se conserva)
    const accesoPm: Acceso = { usuario: { rolId: "pm", esAdmin: false, personaId: null }, reglas: [] };
    const runPm = (datos: Record<string, unknown>) => ejecutarOperacion(admin, accesoPm, t.tablero, datos);
    const borrar = await nueva("Iniciativa para eliminar");
    await expect(runPm({ op: "iniciativa.eliminar", elementoId: borrar })).rejects.toThrow(/Solo un Admin/);
    await expect(runPm({ op: "elemento.archivar", elementoId: borrar })).rejects.toThrow(); // tampoco por el archivado genérico
    expect((await lee(borrar))).toBeDefined(); // sigue ahí
    await run({ op: "iniciativa.eliminar", elementoId: borrar });
    await recargar();
    expect(t.elementos.some((e) => e.id === borrar)).toBe(false); // ya no se ve
    expect(t.elementos.some((e) => e.id === a)).toBe(true); // las demás siguen
    const hb = (await leerHistorial(tableroId, borrar)) as { campo: string }[];
    expect(hb.some((c) => c.campo === "archivado")).toBe(true); // queda constancia
    await expect(run({ op: "iniciativa.eliminar", elementoId: borrar })).rejects.toThrow(/ya no existe/);
    const { data: guardada } = await db().from("elementos").select("id, archivado_at").eq("id", borrar).single();
    expect(guardada?.archivado_at).not.toBeNull(); // archivada, no borrada de la base

    // Una acción que no se completa con el botón
    await expect(run({ op: "iniciativa.completar", accion: "Aprobada", elementoId: a, siguiente: "Sin Beneficio Definido" })).rejects.toThrow(/no se completa/);

    // Aprobada con Clase → PM "B"; Plan Futuro y Sin Beneficio Definido → sus etapas
    const b = await nueva("Iniciativa B");
    await run({ op: "iniciativa.completar", accion: "Meeting 1", elementoId: b, siguiente: "Aprobada", clase: "B" });
    expect((await lee(b))[colStatus.id]).toBe(idDe('PM "B"'));
    const c = await nueva("Iniciativa C");
    await run({ op: "iniciativa.completar", accion: "Meeting 1", elementoId: c, siguiente: "Plan Futuro", fecha: "2099-01-15" });
    expect((await lee(c))[colStatus.id]).toBe(idDe("Plan Futuro"));
    expect((await lee(c))[colPlanFuturo.id]).toBe("2099-01-15");
    const d = await nueva("Iniciativa D");
    await run({ op: "iniciativa.completar", accion: "Meeting 1", elementoId: d, siguiente: "Sin Beneficio Definido" });
    expect((await lee(d))[colStatus.id]).toBe(idDe("Sin Valor Def"));
    expect((await lee(d))[colEspera.id]).toBe(hoyGT);
  });
});
