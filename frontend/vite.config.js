import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.BACKEND_ORIGIN || "http://localhost:4173",
        changeOrigin: true,
      },
      "/sliced": {
        target: process.env.BACKEND_ORIGIN || "http://localhost:4173",
        changeOrigin: true,
      },
      "/demo-assets": {
        target: process.env.BACKEND_ORIGIN || "http://localhost:4173",
        changeOrigin: true,
      },
    },
  },
});
