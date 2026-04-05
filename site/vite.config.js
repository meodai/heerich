import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Site build — builds the docs/demo page as a static site
export default defineConfig({
  root: __dirname,
  base: "/heerich/",
  build: {
    outDir: "../dist-site",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        minesweeper: fileURLToPath(
          new URL("./minesweeper.html", import.meta.url),
        ),
      },
    },
  },
});
