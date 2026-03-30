/**
 * Benchmarks for Heerich.
 * Run: node bench.js
 */

import { bench, boxplot, run, summary, do_not_optimize } from "mitata";
import { Heerich } from "./src/heerich.js";

const colors = ["#e8927c", "#7cc8a0", "#6c5ce7", "#fdcb6e", "#fd79a8", "#00b894", "#b0c4de", "#e17055"];
const strokeColors = ["#c47060", "#5ea87e", "#4834a8", "#c8a020", "#d63071", "#00695c", "#7a8fa5", "#8b3a2a"];
const defaultStyle = {
  default: { fill: colors[0], stroke: strokeColors[0], strokeWidth: 0.4 },
  top: { fill: colors[1], stroke: strokeColors[0], strokeWidth: 0.4 },
};

function makeGrid(gridSize, camera = { type: "oblique", angle: 45, distance: 15 }) {
  const h = new Heerich({ camera });
  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      const ci = (gx * 7 + gz * 13) % colors.length;
      const height = 1 + ((gx + gz) % 4) + Math.round(Math.abs(Math.sin(gx * 0.7 + gz * 0.5)) * 4);
      const ox = gx * 3 - (gridSize * 3) / 2;
      const oz = gz * 3 - (gridSize * 3) / 2;
      h.addBox({
        position: [ox, 0, oz],
        size: [2, height, 2],
        style: {
          default: { fill: colors[ci], stroke: strokeColors[ci], strokeWidth: 0.4 },
          top: { fill: colors[(ci + 1) % colors.length], stroke: strokeColors[ci], strokeWidth: 0.4 },
        },
      });
    }
  }
  return h;
}

// Pre-build scenes so getFaces/toSVG benchmarks don't include construction time
const scenes = {};
for (const size of [10, 20, 30]) {
  scenes[`oblique_${size}`] = makeGrid(size);
  scenes[`perspective_${size}`] = makeGrid(size, { type: "perspective", fov: 60, distance: 80 });
}

// ---------------------------------------------------------------------------
// addBox
// ---------------------------------------------------------------------------
boxplot(() => {
  summary(() => {
    bench("addBox $size grid", function* (state) {
      const size = state.get("size");
      yield () => makeGrid(size);
    }).args("size", [10, 20, 30]);
  });
});

// ---------------------------------------------------------------------------
// getFaces (oblique)
// ---------------------------------------------------------------------------
boxplot(() => {
  summary(() => {
    bench("getFaces oblique $size grid", function* (state) {
      const h = scenes[`oblique_${state.get("size")}`];
      yield () => {
        h._dirty = true;
        h.getFaces();
      };
    }).args("size", [10, 20, 30]);
  });
});

// ---------------------------------------------------------------------------
// getFaces (perspective)
// ---------------------------------------------------------------------------
boxplot(() => {
  summary(() => {
    bench("getFaces perspective $size grid", function* (state) {
      const h = scenes[`perspective_${state.get("size")}`];
      yield () => {
        h._dirty = true;
        h.getFaces();
      };
    }).args("size", [10, 20, 30]);
  });
});

// ---------------------------------------------------------------------------
// toSVG (full pipeline)
// ---------------------------------------------------------------------------
boxplot(() => {
  summary(() => {
    bench("toSVG $size grid", function* (state) {
      const h = scenes[`oblique_${state.get("size")}`];
      yield () => {
        h._dirty = true;
        h.toSVG();
      };
    }).args("size", [10, 20, 30]);
  });
});

// ---------------------------------------------------------------------------
// Boolean subtract
// ---------------------------------------------------------------------------
boxplot(() => {
  bench("subtract sphere from box getFaces", () => {
    const h = new Heerich({ camera: { type: "oblique", angle: 45, distance: 15 } });
    h.addBox({ position: [-5, -5, -5], size: [10, 10, 10], style: defaultStyle });
    h.addSphere({ center: [0, 0, 0], radius: 6, style: defaultStyle, mode: "subtract" });
    do_not_optimize(h.getFaces());
  });
});

// ---------------------------------------------------------------------------
// sphere getFaces (includes voxelization)
// ---------------------------------------------------------------------------
boxplot(() => {
  summary(() => {
    for (const r of [5, 10, 20]) {
      bench(`sphere r=${r} getFaces`, () => {
        const h = new Heerich({ camera: { type: "oblique", angle: 45, distance: 15 } });
        h.addSphere({ center: [0, 0, 0], radius: r, style: defaultStyle });
        do_not_optimize(h.getFaces());
      });
    }
  });
});

// ---------------------------------------------------------------------------
// getFacesFrom (stateless)
// ---------------------------------------------------------------------------
boxplot(() => {
  summary(() => {
    bench("getFacesFrom $size region", function* (state) {
      const size = state.get("size");
      const h = new Heerich({ camera: { type: "oblique", angle: 45, distance: 15 } });
      const half = size / 2;
      yield () =>
        h.getFacesFrom({
          bounds: [[-half, 0, -half], [half, size, half]],
          test: (x, y, z) => x * x + z * z < half * half && y >= 0 && y < size,
          style: defaultStyle,
        });
    }).args("size", [10, 20, 30]);
  });
});

await run();
