import { describe, it, expect } from "vitest";
import { Heerich } from "../src/heerich.js";
import { Canvas2dRenderer } from "../src/renderers/canvas2d.js";

function makeScene(gridSize) {
  const colors = ["#e8927c", "#7cc8a0", "#6c5ce7", "#fdcb6e"];
  const h = new Heerich({ camera: { type: "oblique", angle: 45, distance: 15 } });
  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      const height = 1 + ((gx + gz) % 4) + Math.round(Math.abs(Math.sin(gx * 0.7 + gz * 0.5)) * 4);
      h.addBox({
        position: [gx * 3, 0, gz * 3], size: [2, height, 2],
        style: { default: { fill: colors[(gx + gz) % colors.length], stroke: "#000", strokeWidth: 0.4 } },
      });
    }
  }
  return h;
}

describe("Canvas2D render performance", () => {
  for (const size of [10, 20]) {
    it(`${size}x${size} grid renders in reasonable time`, () => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 800;
      const renderer = new Canvas2dRenderer(canvas);
      const h = makeScene(size);
      const faces = h.getFaces();

      // Warmup
      for (let i = 0; i < 5; i++) renderer.render(faces);

      // Measure
      const N = 20;
      const start = performance.now();
      for (let i = 0; i < N; i++) renderer.render(faces);
      const avg = (performance.now() - start) / N;

      console.log(`Canvas2D render ${size}x${size} (${faces.length} faces): ${avg.toFixed(2)}ms`);
      // Just verify it completes — the timing is logged for tracking
      expect(avg).toBeLessThan(5000);
    });
  }
});
