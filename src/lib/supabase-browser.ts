// src/lib/supabase-browser.ts  (cliente)
// Cliente de Supabase del NAVEGADOR, con la publishable key (pública por diseño). Se usa
// SOLO para la sesión (Supabase Auth): las tablas no son accesibles con esta llave (RLS sin
// políticas). Los datos se piden a /api/* con authedFetch, que adjunta el access token.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase sin configurar: define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local");
  }
  // La sesión se guarda en localStorage y se renueva sola antes de vencer.
  cached = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return cached;
}
