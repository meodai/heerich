import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/heerich.js"),
      name: "Heerich",
      fileName: "heerich",
    },
  },
});
