import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Site build — builds the docs/demo page as a static site
export default defineConfig({
  base: "/heerich/",
  build: {
    outDir: "dist-site",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        minesweeper: fileURLToPath(
          new URL("./minesweeper.html", import.meta.url),
        ),
        "canvas-demo": fileURLToPath(
          new URL("./canvas-demo.html", import.meta.url),
        ),
        "stress-test": fileURLToPath(
          new URL("./stress-test.html", import.meta.url),
        ),
      },
    },
  },
});
