import { describe, it, expect } from "vitest";
import { Heerich } from "../src/heerich.js";
import { WebGPURenderer } from "../src/renderers/webgpu.js";

const canUseWebGPU = await (async () => {
  if (typeof navigator === "undefined" || !navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch { return false; }
})();

function makeGrid(gridSize, styleOpts = {}) {
  const colors = ["#e8927c", "#7cc8a0", "#6c5ce7", "#fdcb6e"];
  const h = new Heerich({ camera: { type: "oblique", angle: 45, distance: 15 } });
  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      const height = 1 + ((gx + gz) % 4) + Math.round(Math.abs(Math.sin(gx * 0.7 + gz * 0.5)) * 4);
      h.addBox({
        position: [gx * 3, 0, gz * 3], size: [2, height, 2],
        style: { default: { fill: colors[(gx + gz) % colors.length], ...styleOpts } },
      });
    }
  }
  return h;
}

async function bench(label, canvas, renderer, faces, N = 20) {
  for (let i = 0; i < 5; i++) renderer.render(faces);
  await renderer._device.queue.onSubmittedWorkDone();
  const start = performance.now();
  for (let i = 0; i < N; i++) renderer.render(faces);
  await renderer._device.queue.onSubmittedWorkDone();
  const avg = (performance.now() - start) / N;
  console.log(`${label} (${faces.length} faces): ${avg.toFixed(2)}ms`);
  return avg;
}

describe.skipIf(!canUseWebGPU)("WebGPU render performance", () => {
  it("fill + stroke (default)", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 800;
    const renderer = await WebGPURenderer.create(canvas);
    const faces = makeGrid(10, { stroke: "#000", strokeWidth: 0.4 }).getFaces();
    const avg = await bench("WebGPU fill+stroke 10x10", canvas, renderer, faces);
    expect(avg).toBeLessThan(5000);
    renderer.destroy();
  });

  it("fill only (no stroke)", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 800;
    const renderer = await WebGPURenderer.create(canvas);
    const faces = makeGrid(10, { stroke: "none" }).getFaces();
    const avg = await bench("WebGPU fill-only 10x10", canvas, renderer, faces);
    expect(avg).toBeLessThan(5000);
    renderer.destroy();
  });

  it("semi-transparent fill + stroke", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 800;
    const renderer = await WebGPURenderer.create(canvas);
    const faces = makeGrid(10, { stroke: "#000", strokeWidth: 0.4, opacity: 0.7 }).getFaces();
    const avg = await bench("WebGPU transparent 10x10", canvas, renderer, faces);
    expect(avg).toBeLessThan(5000);
    renderer.destroy();
  });

  it("dashed stroke", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 800;
    const renderer = await WebGPURenderer.create(canvas);
    const faces = makeGrid(10, { stroke: "#000", strokeWidth: 0.8, strokeDasharray: "3 2" }).getFaces();
    const avg = await bench("WebGPU dashed 10x10", canvas, renderer, faces);
    expect(avg).toBeLessThan(5000);
    renderer.destroy();
  });

  it("20x20 fill + stroke", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 800;
    const renderer = await WebGPURenderer.create(canvas);
    const faces = makeGrid(20, { stroke: "#000", strokeWidth: 0.4 }).getFaces();
    const avg = await bench("WebGPU fill+stroke 20x20", canvas, renderer, faces);
    expect(avg).toBeLessThan(5000);
    renderer.destroy();
  });

  it("20x20 fill only", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 800;
    const renderer = await WebGPURenderer.create(canvas);
    const faces = makeGrid(20, { stroke: "none" }).getFaces();
    const avg = await bench("WebGPU fill-only 20x20", canvas, renderer, faces);
    expect(avg).toBeLessThan(5000);
    renderer.destroy();
  });
});
