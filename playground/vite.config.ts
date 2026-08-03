import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@sunaissu\/document-editor$/,
        replacement: path.resolve(directory, "../src/index.tsx"),
      },
      { find: "react", replacement: path.resolve(directory, "node_modules/react") },
      { find: "react-dom", replacement: path.resolve(directory, "node_modules/react-dom") },
    ],
  },
});
