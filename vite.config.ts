import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Two pages: the app (index.html) and the Gemini key help page (gemini-key.html, opened in a new tab from Settings).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        help: fileURLToPath(new URL("./gemini-key.html", import.meta.url)),
      },
    },
  },
});
