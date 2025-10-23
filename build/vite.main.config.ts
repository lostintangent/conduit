import { defineConfig } from "vite";

// Ensure native modules stay external to avoid bundling issues
export default defineConfig({
  build: {
    rollupOptions: {
      external: ["electron", "node-pty"],
      output: {
        format: "es",
      },
    },
  },
});
