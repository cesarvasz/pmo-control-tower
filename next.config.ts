import type { NextConfig } from "next";

// URL y publishable key de Supabase: PÚBLICAS por diseño (el navegador las usa solo para el login;
// con ellas no se lee ninguna tabla). Vercel no deja guardar como Sensitive una variable con
// prefijo NEXT_PUBLIC_, así que allá se llaman SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY y aquí se
// incrustan en el build con los nombres que usa el código. En local siguen sirviendo las
// NEXT_PUBLIC_ del .env.local. (La SECRET key nunca pasa por aquí: solo la lee el servidor.)
const supabasePublico = {
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
};

const nextConfig: NextConfig = {
  env: supabasePublico,
  // Fija la raíz del workspace a este proyecto. Evita que Next infiera
  // C:\Users\pmoa01 como root por el package-lock.json extraviado del home.
  turbopack: {
    root: __dirname,
  },
  // Misma razón, para el output file tracing: sin esto el build anida la
  // salida en .next/standalone/pmo-app/ y se rompen los COPY del Dockerfile.
  outputFileTracingRoot: __dirname,
  // Empaqueta en .next/standalone solo los archivos que el servidor necesita,
  // incluido un subconjunto de node_modules. Requerido por el Dockerfile.
  output: "standalone",
};

export default nextConfig;
