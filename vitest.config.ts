import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import path from "node:path";

// La capa de servicios lee DATABASE_URL al cargar `@/lib/prisma`; inyectamos
// la URL de la BD de test en el entorno de los workers. En CI se pasa por
// TEST_DATABASE_URL; en local cae a .env.test (BD nexo_test del Docker).
// Nunca usamos un DATABASE_URL suelto del shell para no truncar la BD de dev.
const testDbUrl =
  process.env.TEST_DATABASE_URL ?? config({ path: ".env.test" }).parsed?.DATABASE_URL;

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    env: { DATABASE_URL: testDbUrl ?? "" },
    globalSetup: "./tests/global-setup.ts",
    include: ["tests/**/*.test.ts"],
    // Comparten una sola BD de test → sin paralelismo de ficheros (evita carreras).
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
});
