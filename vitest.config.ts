import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests de lógica pura (fechas, dinero, KPI). Entorno Node: sin DOM.
// El alias "@" replica el de tsconfig para resolver imports "@/lib/...".
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
