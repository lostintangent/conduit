import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, "../.vite/extension"),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, "../src/extension/content.ts"),
      name: "content",
      fileName: () => "content.js",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
  plugins: [
    {
      name: "copy-manifest",
      closeBundle() {
        const fs = require("fs");
        const manifestSrc = path.resolve(
          __dirname,
          "../src/extension/manifest.json",
        );
        const manifestDest = path.resolve(
          __dirname,
          "../.vite/extension/manifest.json",
        );
        fs.copyFileSync(manifestSrc, manifestDest);
      },
    },
  ],
});
