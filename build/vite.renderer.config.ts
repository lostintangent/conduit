import path from "path";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  const { default: react } = await import("@vitejs/plugin-react");
  const { default: tailwindcss } = await import("@tailwindcss/vite");

  const root = path.resolve(__dirname, "../src/renderer");
  const bundleName = process.env.MAIN_WINDOW_VITE_NAME ?? "main_window";
  const outDir = path.resolve(__dirname, `../.vite/renderer/${bundleName}`);

  return {
    root,
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      port: 5173,
    },
    build: {
      outDir,
    },
    resolve: {
      alias: {
        "@": root,
        "@shared": path.resolve(__dirname, "../src/shared"),
      },
    },
  };
});
