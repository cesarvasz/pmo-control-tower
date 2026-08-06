import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  // firebase-admin usa require() dinámicos y deps nativas: no debe empaquetarse,
  // se carga como módulo externo de Node en el servidor.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
