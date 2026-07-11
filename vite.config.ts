import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://localhost:4317",
      "/renders": "http://localhost:4317",
      "/generated": "http://localhost:4317",
      "/assets": "http://localhost:4317",
    },
  },
});
