import { describe, it, expect } from "vitest";
import { Heerich } from "../src/heerich.js";
import { Canvas2dRenderer } from "../src/renderers/canvas2d.js";

function makeH() {
  return new Heerich({ camera: { type: "oblique", angle: 45, distance: 15 } });
}

describe("Canvas2dRenderer (browser)", () => {
  /** @returns {HTMLCanvasElement} */
  function createCanvas(w = 400, h = 400) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  it("renders to a real canvas without errors", () => {
    const canvas = createCanvas();
    const renderer = new Canvas2dRenderer(canvas);
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#e8927c", stroke: "#000", strokeWidth: 1 } } });
    const faces = h.getFaces();

    // Should not throw
    renderer.render(faces);

    // Canvas should have non-transparent pixels
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonEmpty = 0;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 0) nonEmpty++;
    }
    expect(nonEmpty).toBeGreaterThan(0);
  });

  it("hitTest finds face on rendered canvas", () => {
    const canvas = createCanvas();
    const renderer = new Canvas2dRenderer(canvas);
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [3, 3, 3], style: { default: { fill: "#e8927c", stroke: "#000", strokeWidth: 1 } } });
    const faces = h.getFaces();
    renderer.render(faces);

    // Hit the center of the canvas — should be inside some face
    const hit = renderer.hitTest(canvas.width / 2, canvas.height / 2);
    expect(hit).not.toBeNull();
    expect(hit.type).toMatch(/^(top|bottom|left|right|front|back)$/);
  });

  it("hitTest returns null outside the scene", () => {
    const canvas = createCanvas();
    const renderer = new Canvas2dRenderer(canvas);
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [1, 1, 1], style: { default: { fill: "#aaa" } } });
    renderer.render(h.getFaces());

    // Corner of canvas should be outside the small box
    expect(renderer.hitTest(0, 0)).toBeNull();
  });

  it("hitTest returns null before render", () => {
    const canvas = createCanvas();
    const renderer = new Canvas2dRenderer(canvas);
    expect(renderer.hitTest(200, 200)).toBeNull();
  });

  it("hitTest returns topmost face when overlapping", () => {
    const canvas = createCanvas();
    const renderer = new Canvas2dRenderer(canvas);
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    h.addBox({ position: [1, 0, 0], size: [2, 2, 2], style: { default: { fill: "#bbb" } } });
    const faces = h.getFaces();
    renderer.render(faces);

    // Hit test the center — should return a face
    const hit = renderer.hitTest(canvas.width / 2, canvas.height / 2);
    expect(hit).not.toBeNull();
    // The hit should be a frontmost face (later in the sorted array = drawn on top)
    const hitIdx = faces.indexOf(hit);
    expect(hitIdx).toBeGreaterThan(faces.length / 2);
  });

  it("different faces have different fill colors on canvas", () => {
    const canvas = createCanvas();
    const renderer = new Canvas2dRenderer(canvas);
    const h = makeH();
    // Two boxes with different colors, separated
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#ff0000", stroke: "none" } } });
    h.addBox({ position: [6, 0, 0], size: [2, 2, 2], style: { default: { fill: "#0000ff", stroke: "none" } } });
    renderer.render(h.getFaces());

    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Check that we have both red and blue pixels
    let hasRed = false, hasBlue = false;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (imageData.data[i + 3] === 0) continue; // skip transparent
      if (imageData.data[i] > 200 && imageData.data[i + 2] < 50) hasRed = true;
      if (imageData.data[i + 2] > 200 && imageData.data[i] < 50) hasBlue = true;
    }
    expect(hasRed).toBe(true);
    expect(hasBlue).toBe(true);
  });

  it("strokeDasharray does not leak between faces", () => {
    const canvas = createCanvas(600, 600);
    const renderer = new Canvas2dRenderer(canvas);
    const h = makeH();
    // First box: dashed stroke
    h.addBox({
      position: [0, 0, 0], size: [3, 3, 3],
      style: { default: { fill: "#ff0000", stroke: "#000", strokeWidth: 1, strokeDasharray: "4 4" } },
    });
    // Second box: solid stroke (no dasharray), drawn AFTER the dashed one
    h.addBox({
      position: [5, 0, 0], size: [3, 3, 3],
      style: { default: { fill: "#0000ff", stroke: "#000", strokeWidth: 2 } },
    });
    renderer.render(h.getFaces());

    // Sample pixels along the edge of the blue box's faces.
    // If dashes leaked, we'd see gaps (transparent pixels) in the stroke.
    // With solid strokes, the border should be continuous.
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Find the bounding box of blue pixels (the solid-stroke box)
    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i + 2] > 150 && data[i] < 50 && data[i + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Scan the top edge of the blue box for gaps (transparent pixels surrounded by opaque ones)
    // A dashed stroke would have alternating opaque/transparent segments
    if (maxX > minX && maxY > minY) {
      const edgeY = minY;
      let transitions = 0;
      let wasOpaque = false;
      for (let x = minX; x <= maxX; x++) {
        const i = (edgeY * canvas.width + x) * 4;
        const isOpaque = data[i + 3] > 128;
        if (wasOpaque && !isOpaque) transitions++;
        wasOpaque = isOpaque;
      }
      // A solid stroke should have at most 1 transition (opaque → transparent at the edge)
      // A dashed stroke would have many transitions (one per dash gap)
      expect(transitions).toBeLessThanOrEqual(2);
    }
  });
});
