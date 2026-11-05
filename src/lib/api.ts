// src/lib/api.ts  (cliente)
// fetch que adjunta el access token de la sesión de Supabase en Authorization.
import { getSupabaseBrowser } from "@/lib/supabase-browser";

/** Access token de la sesión actual (renovado si estaba por vencer), o null sin sesión. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowser().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesión no válida. Vuelve a iniciar sesión.");
  return fetch(input, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}
