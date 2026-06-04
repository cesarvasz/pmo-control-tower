import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fija la raíz del workspace a este proyecto. Evita que Next infiera
  // C:\Users\pmoa01 como root por el package-lock.json extraviado del home.
  turbopack: {
    root: __dirname,
  },
  // firebase-admin usa require() dinámicos y deps nativas: no debe empaquetarse,
  // se carga como módulo externo de Node en el servidor.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
