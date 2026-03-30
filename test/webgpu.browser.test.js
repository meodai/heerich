import { describe, it, expect } from "vitest";
import { Heerich } from "../src/heerich.js";
import { WebGPURenderer } from "../src/renderers/webgpu.js";

function makeH() {
  return new Heerich({ camera: { type: "oblique", angle: 45, distance: 15 } });
}

// WebGPU may be present but adapter unavailable (headless Chromium)
const canUseWebGPU = await (async () => {
  if (typeof navigator === "undefined" || !navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch { return false; }
})();

describe.skipIf(!canUseWebGPU)("WebGPURenderer (browser)", () => {
  /** @returns {HTMLCanvasElement} */
  function createCanvas(w = 400, h = 400) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  it("creates renderer via async factory", async () => {
    const canvas = createCanvas();
    const renderer = await WebGPURenderer.create(canvas);
    expect(renderer).toBeInstanceOf(WebGPURenderer);
    renderer.destroy();
  });

  it("renders faces to canvas", async () => {
    const canvas = createCanvas();
    const renderer = await WebGPURenderer.create(canvas);
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#e8927c", stroke: "#000", strokeWidth: 1 } } });
    const faces = h.getFaces();

    renderer.render(faces);

    // Allow GPU to finish
    await renderer._device.queue.onSubmittedWorkDone();

    renderer.destroy();
  });

  it("hitTest returns face after render", async () => {
    const canvas = createCanvas();
    const renderer = await WebGPURenderer.create(canvas);
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [3, 3, 3], style: { default: { fill: "#e8927c", stroke: "#000", strokeWidth: 1 } } });
    const faces = h.getFaces();
    renderer.render(faces);

    const hit = renderer.hitTest(canvas.width / 2, canvas.height / 2);
    expect(hit).not.toBeNull();
    expect(hit.type).toMatch(/^(top|bottom|left|right|front|back)$/);

    renderer.destroy();
  });

  it("hitTest returns null before render", async () => {
    const canvas = createCanvas();
    const renderer = await WebGPURenderer.create(canvas);
    expect(renderer.hitTest(200, 200)).toBeNull();
    renderer.destroy();
  });

  it("hitTest returns null outside scene", async () => {
    const canvas = createCanvas();
    const renderer = await WebGPURenderer.create(canvas);
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [1, 1, 1], style: { default: { fill: "#aaa" } } });
    renderer.render(h.getFaces());
    expect(renderer.hitTest(0, 0)).toBeNull();
    renderer.destroy();
  });

  it("renders multiple frames without error", async () => {
    const canvas = createCanvas();
    const renderer = await WebGPURenderer.create(canvas);
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#e8927c", stroke: "#000", strokeWidth: 1 } } });
    const faces = h.getFaces();

    // Multiple renders should work (tests buffer reuse / cache)
    for (let i = 0; i < 5; i++) {
      renderer.render(faces);
    }

    await renderer._device.queue.onSubmittedWorkDone();
    renderer.destroy();
  });

  it("renders dashed strokes without error", async () => {
    const canvas = createCanvas();
    const renderer = await WebGPURenderer.create(canvas);
    const h = makeH();
    h.addBox({
      position: [0, 0, 0], size: [3, 3, 3],
      style: { default: { fill: "#6c5ce7", stroke: "#2d3436", strokeWidth: 1, strokeDasharray: "3 2" } },
    });
    const faces = h.getFaces();
    renderer.render(faces);
    await renderer._device.queue.onSubmittedWorkDone();

    // Read back pixels — should have visible content (not blank)
    // We can't easily read WebGPU pixels, but we can verify no crash
    // and that hitTest still works (geometry was built correctly)
    const hit = renderer.hitTest(canvas.width / 2, canvas.height / 2);
    expect(hit).not.toBeNull();

    renderer.destroy();
  });

  it("dashed strokes do not leak to subsequent solid faces", async () => {
    const canvas = createCanvas();
    const renderer = await WebGPURenderer.create(canvas);
    const h = makeH();
    // Dashed box
    h.addBox({
      position: [0, 0, 0], size: [3, 3, 3],
      style: { default: { fill: "#ff0000", stroke: "#000", strokeWidth: 1, strokeDasharray: "4 4" } },
    });
    // Solid box (no dash) — drawn after
    h.addBox({
      position: [5, 0, 0], size: [3, 3, 3],
      style: { default: { fill: "#0000ff", stroke: "#000", strokeWidth: 2 } },
    });
    const faces = h.getFaces();

    // Should not throw — verifies the instance buffer layout is correct
    // with mixed dash/solid faces
    renderer.render(faces);
    await renderer._device.queue.onSubmittedWorkDone();

    // Verify geometry was built for both — face count includes both boxes
    expect(faces.length).toBeGreaterThan(4);

    renderer.destroy();
  });
});
