import { describe, expect, it } from "vitest";
import { configGoogle, crearState, leerIdToken, urlAutorizacion, verificarState, VIGENCIA_STATE_MS } from "@/lib/googleOauth";

const SECRETO = "s".repeat(40);
const U = "11111111-1111-4111-8111-111111111111";

describe("state de OAuth", () => {
  it("ida y vuelta con el nonce de la cookie", () => {
    const { state, nonce } = crearState(U, SECRETO);
    expect(verificarState(state, nonce, SECRETO)).toEqual({ usuarioId: U });
  });
  it("rechaza otra cookie, firma alterada, secreto distinto y vencido", () => {
    const { state, nonce } = crearState(U, SECRETO, 1000);
    expect(verificarState(state, "otro", SECRETO, 1000)).toBeNull();
    expect(verificarState(state, null, SECRETO, 1000)).toBeNull();
    expect(verificarState(state, nonce, "x".repeat(40), 1000)).toBeNull();
    expect(verificarState(state + "a", nonce, SECRETO, 1000)).toBeNull();
    expect(verificarState(state, nonce, SECRETO, 1000 + VIGENCIA_STATE_MS + 1)).toBeNull();
    expect(verificarState("basura", nonce, SECRETO)).toBeNull();
  });
  it("no se puede cambiar el usuario del cuerpo", () => {
    const { state, nonce } = crearState(U, SECRETO);
    const [, firma] = state.split(".");
    const falso = Buffer.from(JSON.stringify({ u: "otro", n: nonce, exp: Date.now() + 1e6 })).toString("base64url");
    expect(verificarState(`${falso}.${firma}`, nonce, SECRETO)).toBeNull();
  });
});

describe("configuración y URL", () => {
  it("exige las tres variables (y un secreto largo)", () => {
    expect(configGoogle({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", GOOGLE_STATE_SECRET: SECRETO })).not.toBeNull();
    expect(configGoogle({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", GOOGLE_STATE_SECRET: "corto" })).toBeNull();
    expect(configGoogle({ GOOGLE_CLIENT_ID: "a", GOOGLE_STATE_SECRET: SECRETO })).toBeNull();
  });
  it("pide acceso offline con consentimiento y los 4 permisos", () => {
    const u = new URL(urlAutorizacion({ clientId: "cid", clientSecret: "x", stateSecret: SECRETO }, "http://localhost:3000", "st", "a@c807.com"));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/google/callback");
    expect(u.searchParams.get("scope")).toContain("calendar.freebusy");
    expect(u.searchParams.get("login_hint")).toBe("a@c807.com");
  });
  it("lee email y sub del id_token", () => {
    const t = `h.${Buffer.from(JSON.stringify({ email: "A@C807.com", sub: "123" })).toString("base64url")}.f`;
    expect(leerIdToken(t)).toEqual({ email: "a@c807.com", sub: "123" });
    expect(leerIdToken("x")).toBeNull();
    expect(leerIdToken(undefined)).toBeNull();
  });
});
