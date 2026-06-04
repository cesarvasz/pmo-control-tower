// src/lib/api.ts  (cliente)
// fetch que adjunta el ID token de Firebase en Authorization.
import { auth } from "@/lib/firebase";

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sesión no válida. Vuelve a iniciar sesión.");
  return fetch(input, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}
