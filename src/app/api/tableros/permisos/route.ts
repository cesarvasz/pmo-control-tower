// src/app/api/tableros/permisos/route.ts
// Reglas de permisos de tableros por rol (tabla tablero_permisos). Pasa por la puerta de Tableros.
//  GET                 → { reglas, roles: [{ id, name }] }
//  PUT  ReglaPermiso   → crea o reemplaza la regla del rol para ese tablero o categoría
//  DELETE ?id=<uuid>   → borra la regla

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { listRoles } from "@/lib/roles";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { borrarRegla, guardarRegla, listarReglas } from "@/features/tableros/datos/permisos";
import { validarRegla } from "@/features/tableros/dominio/permisos";
import { categoriaTablero } from "@/features/tableros/dominio/categorias";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    await exigirAccion(request, "tableros_ver");
    const [reglas, roles] = await Promise.all([listarReglas(), listRoles()]);
    return NextResponse.json({ reglas, roles: roles.map((r) => ({ id: r.id, name: r.name })) });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const me = await exigirAccion(request, "permisos_tableros_administrar");
    const regla = validarRegla(await request.json().catch(() => null));
    if (!regla || (regla.categoria && !categoriaTablero(regla.categoria)) || (regla.tableroId && !UUID_RE.test(regla.tableroId))) {
      return NextResponse.json({ error: "Regla inválida" }, { status: 400 });
    }
    if (!(await listRoles()).some((r) => r.id === regla.rolId)) return NextResponse.json({ error: "Rol no encontrado" }, { status: 404 });
    return NextResponse.json(await guardarRegla(regla, me.email));
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    await exigirAccion(request, "permisos_tableros_administrar");
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    await borrarRegla(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
