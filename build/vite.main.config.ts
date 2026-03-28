import path from "path";
import { defineConfig } from "vite";

// Ensure native modules stay external to avoid bundling issues
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "electron",
        "node-pty",
        "@parcel/watcher",
        "@vscode/ripgrep",
        // ws optional dependencies - mark as external to avoid bundling errors
        "bufferutil",
        "utf-8-validate",
      ],
      output: {
        format: "es",
      },
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../src/shared"),
    },
  },
});
