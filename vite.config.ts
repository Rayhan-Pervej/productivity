import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";

// The app's name lives in one place: productName in src-tauri/tauri.conf.json.
const tauriConf = JSON.parse(readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf-8"));
const APP_NAME: string = tauriConf.productName;

// Tauri expects a fixed port and no clearing of the terminal.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    { name: "app-name", transformIndexHtml: (html) => html.replaceAll("%APP_NAME%", APP_NAME) },
  ],
  define: { __APP_NAME__: JSON.stringify(APP_NAME) },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
});
