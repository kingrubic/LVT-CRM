import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["lvt.vscgroup.io.vn"],
    proxy: {
      "/api/auth": {
        target: "http://127.0.0.1:3211",
        changeOrigin: true,
      },
      "/api": {
        target: "http://127.0.0.1:3210",
        changeOrigin: true,
        ws: true,
      },
      "/.well-known": {
        target: "http://127.0.0.1:3211",
        changeOrigin: true,
      },
    },
  },
});
