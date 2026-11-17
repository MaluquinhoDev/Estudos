import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  optimizeDeps: {
    // PowerSync contains Web Workers and WASM modules; keep it out of pre-bundling.
    exclude: ["@powersync/web"]
  },
  worker: {
    format: "es"
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: "src/powersync-ui.js",
      output: {
        entryFileNames: "powersync.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
