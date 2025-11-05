import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: true,
    outDir: ".vite/build/cli",
    emptyOutDir: false,
    rollupOptions: {
      input: "src/cli/conduit.ts",
      output: {
        entryFileNames: "conduit.js",
        format: "cjs",
      },
      external: ["electron"],
    },
  },
});
