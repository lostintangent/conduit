import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, "../.vite/build"),
    emptyOutDir: false,
    rollupOptions: {
      external: ["electron"],
      output: {
        entryFileNames: "preload.js",
      },
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../src/shared"),
    },
  },
});
