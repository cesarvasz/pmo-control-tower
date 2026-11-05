// src/lib/password.ts
// Módulo PURO (cliente + servidor). Reglas de contraseña y generador de contraseñas
// temporales (las que un Admin le pone a un usuario desde /usuarios).

/** Largo mínimo de una contraseña. Supabase Auth exige al menos 6; aquí pedimos 8. */
export const PASSWORD_MIN = 8;
/** bcrypt (lo que usa Supabase Auth) solo mira los primeros 72 bytes. */
export const PASSWORD_MAX = 72;

/** null si la contraseña es válida, o el motivo (en español) si no lo es. */
export function errorDePassword(p: unknown): string | null {
  if (typeof p !== "string") return "Escribe una contraseña.";
  if (p.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (new TextEncoder().encode(p).length > PASSWORD_MAX) return `La contraseña no puede pasar de ${PASSWORD_MAX} caracteres.`;
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return "La contraseña debe tener letras y números.";
  return null;
}

// Sin caracteres que se confunden al dictarla o copiarla a mano (0/O, 1/l/I).
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const DIGITOS = "23456789";

/**
 * Contraseña temporal de `largo` caracteres, en grupos de 4 separados por guion
 * (p. ej. "Kp7w-Rt2m-Hx9q"). Siempre trae letras y números. `aleatorio(n)` devuelve
 * un entero en [0, n): en el servidor se le pasa crypto.randomInt (se inyecta para
 * poder testear sin azar).
 */
export function generarPasswordTemporal(aleatorio: (n: number) => number, largo = 12): string {
  const chars: string[] = [];
  for (let i = 0; i < largo; i++) chars.push(ALFABETO[aleatorio(ALFABETO.length)]);
  // Garantiza al menos un número en una posición al azar.
  if (!chars.some((c) => DIGITOS.includes(c))) chars[aleatorio(largo)] = DIGITOS[aleatorio(DIGITOS.length)];
  // Garantiza al menos una letra.
  if (!chars.some((c) => /[A-Za-z]/.test(c))) chars[aleatorio(largo)] = ALFABETO[aleatorio(48)];
  const grupos: string[] = [];
  for (let i = 0; i < chars.length; i += 4) grupos.push(chars.slice(i, i + 4).join(""));
  return grupos.join("-");
}
