import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: true,     // Permite conexões na rede local
    port: 5173,     // Porta de desenvolvimento
    allowedHosts: ["localhost","jupiter", "jupiter.local"],
  },
  preview: {
    host: true,
    port: 8080,
    allowedHosts: ["localhost", "jupiter", "jupiter.local"],
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));