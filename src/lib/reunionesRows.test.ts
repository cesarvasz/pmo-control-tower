import { describe, expect, it } from "vitest";
import type { Tables } from "@/types/supabase";
import { buildCalMap } from "@/lib/ini";
import { aConexion, aEntradasCalendario, aReunion, invitadosDe } from "./reunionesRows";

const fila = (extra: Partial<Tables<"reuniones">> = {}): Tables<"reuniones"> => ({
  id: "r1", codigo: "IN-158", tipo: "M1", elemento_id: null, titulo: "IN-158 M1 · Reglas ISR", descripcion: null,
  inicio: "2026-11-20T16:00:00+00:00", fin: "2026-11-20T17:00:00+00:00", zona: "America/Guatemala", invitados: [],
  estado: "agendada", origen: "app", organizador_id: "u1", organizador_email: "pm@c807.com", google_calendar_id: "primary",
  google_event_id: "ev1", google_etag: '"1"', meet_url: "https://meet.google.com/abc", enlace_google: null, cancelada_at: null,
  creado_por: "u1", creado_at: "2026-11-16T12:00:00+00:00", actualizado_at: "2026-11-16T12:00:00+00:00", ...extra,
});

describe("invitadosDe", () => {
  it("lee los invitados con correo, en minúsculas, y usa el correo si no hay nombre", () => {
    expect(invitadosDe([
      { personaId: "p1", email: " Ana@C807.com ", nombre: " Ana Pérez " },
      { email: "luis@c807.com" },
    ])).toEqual([
      { personaId: "p1", email: "ana@c807.com", nombre: "Ana Pérez" },
      { personaId: null, email: "luis@c807.com", nombre: "luis@c807.com" },
    ]);
  });

  it("descarta lo que no sirve para invitar: sin correo, no objeto o no arreglo", () => {
    expect(invitadosDe([{ nombre: "Sin correo" }, { email: "  " }, "x", null, 5])).toEqual([]);
    expect(invitadosDe(null)).toEqual([]);
    expect(invitadosDe({ email: "a@c807.com" })).toEqual([]);
  });
});

describe("aReunion", () => {
  it("traduce la fila y deja las fechas como ISO de JS", () => {
    const r = aReunion(fila());
    expect(r).toMatchObject({
      id: "r1", codigo: "IN-158", tipo: "M1", estado: "agendada", origen: "app", organizadorId: "u1",
      inicio: "2026-11-20T16:00:00.000Z", fin: "2026-11-20T17:00:00.000Z", meetUrl: "https://meet.google.com/abc", canceladaAt: null,
    });
  });

  it("valores raros de la base caen a los de siempre (M1, agendada, app)", () => {
    expect(aReunion(fila({ tipo: "M9", estado: "otro", origen: "x" }))).toMatchObject({ tipo: "M1", estado: "agendada", origen: "app" });
    expect(aReunion(fila({ origen: "google", estado: "cancelada", cancelada_at: "2026-11-17T01:00:00+00:00" })))
      .toMatchObject({ origen: "google", estado: "cancelada", canceladaAt: "2026-11-17T01:00:00.000Z" });
  });
});

describe("aEntradasCalendario", () => {
  it("devuelve solo las vigentes, con la forma del calendario de siempre", () => {
    const rs = [
      aReunion(fila()),
      aReunion(fila({ id: "r2", codigo: "IN-159", tipo: "M2", estado: "cancelada" })),
      aReunion(fila({ id: "r3", codigo: "IN-159", tipo: "M2", inicio: "2026-11-27T15:00:00+00:00", fin: "2026-11-27T16:00:00+00:00" })),
    ];
    expect(aEntradasCalendario(rs)).toEqual([
      { codigo: "IN-158", meeting: "M1", inicio: "2026-11-20T16:00:00.000Z", fin: "2026-11-20T17:00:00.000Z" },
      { codigo: "IN-159", meeting: "M2", inicio: "2026-11-27T15:00:00.000Z", fin: "2026-11-27T16:00:00.000Z" },
    ]);
  });

  it("alimenta buildCalMap tal cual: una iniciativa con la reunión cancelada queda sin reuniones", () => {
    const mapa = buildCalMap(aEntradasCalendario([
      aReunion(fila()),
      aReunion(fila({ id: "r2", codigo: "IN-160", estado: "cancelada" })),
    ]));
    expect(mapa.get("IN-158")?.M1).toEqual([{ inicio: new Date("2026-11-20T16:00:00Z"), fin: new Date("2026-11-20T17:00:00Z") }]);
    expect(mapa.get("IN-158")?.M2).toEqual([]);
    expect(mapa.has("IN-160")).toBe(false);
  });
});

describe("aConexion", () => {
  it("no expone el id del secreto del Vault", () => {
    const c = aConexion({
      usuario_id: "u1", google_email: "pm@c807.com", google_sub: "123", secreto_id: "s-secreto", scopes: ["openid"],
      estado: "reconectar", ultimo_error: "invalid_grant", conectado_at: "2026-11-16T12:00:00+00:00", actualizado_at: "2026-11-16T12:00:00+00:00",
    });
    expect(c).toEqual({
      usuarioId: "u1", googleEmail: "pm@c807.com", estado: "reconectar", scopes: ["openid"], ultimoError: "invalid_grant",
      conectadoAt: "2026-11-16T12:00:00.000Z",
    });
    expect(JSON.stringify(c)).not.toContain("secreto");
  });
});
