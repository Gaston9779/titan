import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// The math engine lives OUTSIDE this client (repo-root /engine) and is the single
// source of truth. Allow Vite to serve it read-only; the client only imports from it.
const engineDir = fileURLToPath(new URL("../engine", import.meta.url));

export default defineConfig({
  root: ".",
  server: {
    port: 5180,
    strictPort: false,
    fs: { allow: [".", engineDir, fileURLToPath(new URL("..", import.meta.url))] },
  },
  resolve: {
    alias: { "@engine": engineDir },
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
