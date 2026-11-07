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
        // the demos, each its own page under demos/
        minesweeper: fileURLToPath(
          new URL("./demos/minesweeper.html", import.meta.url),
        ),
        terrain: fileURLToPath(
          new URL("./demos/terrain.html", import.meta.url),
        ),
        clip: fileURLToPath(new URL("./demos/clip.html", import.meta.url)),
        towers: fileURLToPath(new URL("./demos/towers.html", import.meta.url)),
      },
    },
  },
});
