// src/lib/auth-server.ts
// SOLO SERVIDOR. Verificación del token de sesión de Supabase Auth (antes: ID token de
// Firebase con el Admin SDK). Solo establece QUIÉN es; si puede o no entrar (cuenta en
// espera, permisos) lo decide users.ts (requireSession / requireAction / requirePage).

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export interface VerifiedUser {
  uid: string;   // id del usuario en Supabase Auth (uuid)
  email: string;
  name: string;
}

/**
 * Verifica el access token (Authorization: Bearer …) y exige que el correo pertenezca
 * al dominio permitido. Lanza Error con código en el mensaje:
 * no-token | invalid-token | domain-not-allowed.
 */
export async function verifyRequest(authHeader: string | null): Promise<VerifiedUser> {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) throw new Error("no-token");

  // getSupabaseAdmin() puede lanzar "Supabase sin configurar..." → se propaga tal cual
  // (el route lo devuelve como 500 con mensaje claro), separado del token inválido.
  const auth = getSupabaseAdmin().auth;

  // getClaims valida la firma del JWT (con las llaves públicas del proyecto, en caché) y
  // su vencimiento; si el proyecto usa la llave simétrica antigua, consulta al servidor de Auth.
  const { data, error } = await auth.getClaims(token);
  const claims = data?.claims;
  if (error || !claims?.sub || claims.is_anonymous) throw new Error("invalid-token");

  const email = (claims.email ?? "").toLowerCase();
  const domain = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN?.toLowerCase();
  if (!email || (domain && !email.endsWith(`@${domain}`))) throw new Error("domain-not-allowed");

  const meta = (claims.user_metadata ?? {}) as { name?: unknown; full_name?: unknown };
  const name = typeof meta.name === "string" && meta.name.trim()
    ? meta.name.trim()
    : typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : email;

  return { uid: claims.sub, email, name };
}
