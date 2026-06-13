import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const devBackend = process.env.AGENTIC_CANVAS_DEV_BACKEND ?? "http://127.0.0.1:3333";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/healthz": {
        target: devBackend,
        changeOrigin: true,
      },
      "/mcp": {
        target: devBackend,
        changeOrigin: true,
      },
      "/ws": {
        target: devBackend,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
});
