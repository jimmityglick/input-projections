import { fileURLToPath } from "node:url";
import path from "node:path";
import { readdirSync } from "node:fs";
import { defineConfig } from "vite";

const rendererRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(rendererRoot, "..");

// Collect all HTML files for multi-page build
const htmlFiles = readdirSync(rendererRoot)
  .filter((f) => f.endsWith(".html"))
  .reduce((acc, file) => {
    const name = file.replace(".html", "");
    acc[name] = path.resolve(rendererRoot, file);
    return acc;
  }, {});

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
    rollupOptions: {
      input: htmlFiles,
    },
  },
});

