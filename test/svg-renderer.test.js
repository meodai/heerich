import { describe, it, expect } from "vitest";
import { Heerich } from "../src/heerich.js";
import { SVGRenderer, computeBounds } from "../src/renderers/svg.js";

function makeH() {
  return new Heerich({ camera: { type: "oblique", angle: 45, distance: 15 } });
}

/** @returns {import('../src/heerich.js').Face[]} */
function makeFaces() {
  const h = makeH();
  h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa", stroke: "#000", strokeWidth: 1 } } });
  return h.getFaces();
}

describe("computeBounds", () => {
  it("returns correct bounding box", () => {
    const b = computeBounds(makeFaces());
    expect(b.w).toBeGreaterThan(0);
    expect(b.h).toBeGreaterThan(0);
    expect(Number.isFinite(b.x)).toBe(true);
    expect(Number.isFinite(b.y)).toBe(true);
  });

  it("handles empty array", () => {
    expect(computeBounds([])).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});

describe("SVGRenderer", () => {
  it("render produces valid SVG", () => {
    const renderer = new SVGRenderer();
    const svg = renderer.render(makeFaces(), { tileW: 40 });
    expect(svg).toMatch(/^<svg/);
    expect(svg).toMatch(/<\/svg>$/);
    expect(svg).toContain("<polygon");
  });

  it("render with viewBox override", () => {
    const renderer = new SVGRenderer();
    const svg = renderer.render(makeFaces(), { viewBox: [10, 20, 300, 400], tileW: 40 });
    expect(svg).toContain('viewBox="10 20 300 400"');
  });

  it("render with offset applies translate", () => {
    const renderer = new SVGRenderer();
    const svg = renderer.render(makeFaces(), { offset: [5, 10], tileW: 40 });
    expect(svg).toContain("translate(5, 10)");
  });

  it("render with prepend/append", () => {
    const renderer = new SVGRenderer();
    const svg = renderer.render(makeFaces(), {
      prepend: '<defs><style>.x{}</style></defs>',
      append: '<text>hi</text>',
      tileW: 40,
    });
    expect(svg.indexOf("<defs>")).toBeLessThan(svg.indexOf("<polygon"));
    expect(svg.indexOf("<text>hi</text>")).toBeGreaterThan(svg.lastIndexOf("<polygon"));
  });

  it("faceAttributes callback merges style and adds attrs", () => {
    const renderer = new SVGRenderer();
    const svg = renderer.render(makeFaces(), {
      tileW: 40,
      faceAttributes: () => ({ fill: "#f00", class: "my-face" }),
    });
    expect(svg).toContain('fill="#f00"');
    expect(svg).toContain('class="my-face"');
  });

  it("content faces render as g with transform", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [1, 1, 1], content: '<circle r="5"/>' });
    const renderer = new SVGRenderer();
    const svg = renderer.render(h.getFaces(), { tileW: 40 });
    expect(svg).toContain('<circle r="5"/>');
    expect(svg).toContain("<g transform=");
    expect(svg).not.toContain("<polygon");
  });
});
