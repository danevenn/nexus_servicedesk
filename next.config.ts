import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Ancla la raíz de Turbopack a este proyecto. Sin esto, si aparece un
  // lockfile en una carpeta superior (p. ej. un `pnpm add` lanzado por error
  // en el directorio padre), Next infiere la raíz del workspace ahí arriba y
  // el file-watcher vigila TODO el árbol de proyectos hermanos → CPU al 100%.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
