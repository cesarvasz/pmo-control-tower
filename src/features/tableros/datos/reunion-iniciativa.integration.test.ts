// Contra la base real, solo lectura: REUNIONES_IT=1 npx vitest run src/features/tableros/datos/reunion-iniciativa.integration.test.ts
import { describe, expect, it } from "vitest";
import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import { ACCION_PUENTE } from "../dominio/acciones";
import { iniciativaAgendable } from "./reunion-iniciativa";

const IT = process.env.REUNIONES_IT === "1";
if (IT) process.loadEnvFile(".env.local");

describe.skipIf(!IT)("iniciativaAgendable (base real, solo lectura)", () => {
  const admin = { uid: "00000000-0000-4000-8000-000000000000", email: "x@c807.com", roleId: null, permissions: { pages: {}, actions: { [ACCION_PUENTE]: true } } } as unknown as AppUser;
  const pm = { ...admin, permissions: { pages: {}, actions: {} } } as unknown as AppUser;

  it("una iniciativa en New o Meeting 1: el Admin sí; alguien que no es su PM, no; las que ya no tocan, error de etapa", async () => {
    const db = getSupabaseAdmin();
    const t = unwrap(await db.from("tableros").select("id").eq("id", "57734daa-e622-4134-99b2-705588bc2086").maybeSingle());
    expect(t).not.toBeNull();
    const elementos = unwrap(await db.from("elementos").select("id").eq("tablero_id", t!.id).is("parent_id", null).is("archivado_at", null).limit(400)) ?? [];
    let ok = 0, etapa = 0;
    for (const e of elementos) {
      try {
        const r = await iniciativaAgendable(e.id, admin);
        expect(r.codigo).toMatch(/^IN-\d+$/); expect(["M1", "M2"]).toContain(r.tipo);
        ok++;
        await expect(iniciativaAgendable(e.id, pm)).rejects.toThrow("forbidden"); // sin persona ligada ni Admin
      } catch (err) {
        if ((err as Error).message === "reunion-etapa-invalida") etapa++; else throw err;
      }
      if (ok >= 3 && etapa >= 1) break;
    }
    expect(ok).toBeGreaterThan(0);
  }, 120_000);
});
