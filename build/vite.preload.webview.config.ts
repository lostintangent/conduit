import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, "../.vite/build"),
    emptyOutDir: false,
    rollupOptions: {
      external: ["electron"],
      output: {
        entryFileNames: "webview-preload.js",
      },
    },
  },
});
