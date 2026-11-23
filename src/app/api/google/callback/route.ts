// src/app/api/google/callback/route.ts
// A donde Google devuelve al usuario. No trae el token de la app: la identidad sale del state firmado (atado a la cookie).
// Guarda el refresh token en el Vault y redirige a /gestion-iniciativas (donde está «Agendar») con ?google=ok o ?google=<motivo>.

import { NextResponse } from "next/server";
import { COOKIE_STATE, configGoogle, intercambiarCodigo, SCOPES_OBLIGATORIOS, verificarState } from "@/lib/googleOauth";
import { guardarConexion } from "@/lib/reuniones";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const volver = (motivo: string) => {
    const res = NextResponse.redirect(new URL(`/gestion-iniciativas?google=${motivo}`, url.origin));
    res.cookies.set(COOKIE_STATE, "", { path: "/api/google", maxAge: 0 });
    return res;
  };
  try {
    const cfg = configGoogle();
    if (!cfg) return volver("sin-configurar");
    if (url.searchParams.get("error")) return volver("cancelado"); // el usuario dijo «no» (access_denied) u otro rechazo
    const cookie = request.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE_STATE}=`))?.slice(COOKIE_STATE.length + 1) ?? null;
    const st = verificarState(url.searchParams.get("state"), cookie, cfg.stateSecret);
    const code = url.searchParams.get("code");
    if (!st || !code) return volver("estado-invalido");

    const t = await intercambiarCodigo(cfg, url.origin, code);
    if (!SCOPES_OBLIGATORIOS.every((s) => t.scopes.includes(s))) return volver("permisos-incompletos");
    if (!t.refreshToken) return volver("sin-refresh-token");
    await guardarConexion({ usuarioId: st.usuarioId, googleEmail: t.email, googleSub: t.sub, scopes: t.scopes, refreshToken: t.refreshToken });
    return volver("ok");
  } catch (err) {
    console.error("[google/callback]", err instanceof Error ? err.message : "error");
    return volver("error");
  }
}
