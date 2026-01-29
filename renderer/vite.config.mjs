import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";

const rendererRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(rendererRoot, "..");

export default defineConfig({
  base: "/input-projections/",
  root: rendererRoot,
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  build: {
    outDir: path.resolve(rendererRoot, "dist"),
    emptyOutDir: true,
  },
});

