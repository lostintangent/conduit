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
  },
  resolve: {
    alias: [
      // Mock monaco-editor ESM submodules (CSS, language contributions, etc.)
      // These must come before the main monaco-editor alias
      {
        find: /^monaco-editor\/esm\/.*/,
        replacement: path.resolve(
          __dirname,
          "./tests/setup/monaco-esm-mock.ts",
        ),
      },
      // Path aliases for source code
      { find: "@", replacement: path.resolve(__dirname, "./src/renderer") },
      { find: "@shared", replacement: path.resolve(__dirname, "./src/shared") },
      // Mock monaco-editor in tests - it has complex exports that don't work in jsdom
      {
        find: "monaco-editor",
        replacement: path.resolve(__dirname, "./tests/setup/monaco-mock.ts"),
      },
    ],
  },
});
