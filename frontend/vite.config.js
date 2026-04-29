import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": {
        target: "https://172.16.31.208:3443",
        secure: false,
        changeOrigin: true,
      },
      "/audio": {
        target: "https://172.16.31.208:3443",
        secure: false,
        changeOrigin: true,
      },
    },
  },
});
