import { execSync } from "node:child_process";
import { config } from "dotenv";

// Aplica las migraciones a la BD de test una vez antes de toda la suite.
// prisma.config.ts hace `import "dotenv/config"` (carga .env sin sobrescribir
// variables ya presentes), así que pasar DATABASE_URL aquí tiene prioridad.
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? config({ path: ".env.test" }).parsed?.DATABASE_URL;
  if (!url) throw new Error("Falta TEST_DATABASE_URL o DATABASE_URL en .env.test");
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
