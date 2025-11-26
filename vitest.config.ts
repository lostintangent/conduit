import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/**/__tests__/**",
        "**/*.d.ts",
      ],
    },
    outputFile: {
      junit: "./test-results/junit.xml",
    },
    reporters: ["default", "junit"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/renderer"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      // Mock monaco-editor in tests - it has complex exports that don't work in jsdom
      "monaco-editor": path.resolve(__dirname, "./tests/setup/monaco-mock.ts"),
    },
  },
});
