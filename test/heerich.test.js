import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { Heerich } from "../src/heerich.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeH(cameraOpts) {
  return new Heerich({ camera: { type: "oblique", angle: 45, distance: 15, ...cameraOpts } });
}

function faceTypes(faces) {
  return [...new Set(faces.map((f) => f.type))].sort();
}

function countVoxels(h) {
  let n = 0;
  h.forEach(() => n++);
  return n;
}

/**
 * Compute the analytical exposed surface area per face direction for a set of boxes.
 * Uses a 3D occupancy grid to count exposed faces — this is an independent
 * reimplementation that doesn't share code with Heerich's face generation.
 * Returns { top, bottom, left, right, front, back } with integer area counts.
 */
function analyticalSurfaceArea(boxes) {
  if (boxes.length === 0) return { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 };

  // Compute bounding box
  let mnX = Infinity, mnY = Infinity, mnZ = Infinity;
  let mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
  for (const b of boxes) {
    mnX = Math.min(mnX, b.x); mnY = Math.min(mnY, b.y); mnZ = Math.min(mnZ, b.z);
    mxX = Math.max(mxX, b.x + b.w); mxY = Math.max(mxY, b.y + b.h); mxZ = Math.max(mxZ, b.z + b.d);
  }

  // Pad by 1 so neighbor checks don't go out of bounds
  const ox = mnX - 1, oy = mnY - 1, oz = mnZ - 1;
  const sx = mxX - ox + 1, sy = mxY - oy + 1, sz = mxZ - oz + 1;
  const grid = new Uint8Array(sx * sy * sz);
  const idx = (x, y, z) => (x - ox) * sy * sz + (y - oy) * sz + (z - oz);

  // Fill grid
  for (const b of boxes) {
    for (let x = b.x; x < b.x + b.w; x++)
      for (let y = b.y; y < b.y + b.h; y++)
        for (let z = b.z; z < b.z + b.d; z++)
          grid[idx(x, y, z)] = 1;
  }

  // Count exposed faces per direction by iterating the grid (not the box list,
  // to avoid double-counting overlapping regions)
  const result = { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 };
  for (let x = mnX; x < mxX; x++)
    for (let y = mnY; y < mxY; y++)
      for (let z = mnZ; z < mxZ; z++) {
        if (!grid[idx(x, y, z)]) continue;
        if (!grid[idx(x, y - 1, z)]) result.top++;
        if (!grid[idx(x, y + 1, z)]) result.bottom++;
        if (!grid[idx(x - 1, y, z)]) result.left++;
        if (!grid[idx(x + 1, y, z)]) result.right++;
        if (!grid[idx(x, y, z - 1)]) result.front++;
        if (!grid[idx(x, y, z + 1)]) result.back++;
      }
  return result;
}

/** Normal direction for each face type (points toward empty space). */
const FACE_NORMALS = {
  top: [0, -1, 0],
  bottom: [0, 1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  front: [0, 0, -1],
  back: [0, 0, 1],
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

describe("analyticalSurfaceArea", () => {
  it("empty input", () => {
    expect(analyticalSurfaceArea([])).toEqual({ top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 });
  });

  it("single 1×1×1 box", () => {
    const r = analyticalSurfaceArea([{ x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 }]);
    expect(r).toEqual({ top: 1, bottom: 1, left: 1, right: 1, front: 1, back: 1 });
  });

  it("single 2×2×2 box", () => {
    const r = analyticalSurfaceArea([{ x: 0, y: 0, z: 0, w: 2, h: 2, d: 2 }]);
    expect(r).toEqual({ top: 4, bottom: 4, left: 4, right: 4, front: 4, back: 4 });
  });

  it("two identical overlapping boxes", () => {
    const box = { x: 0, y: 0, z: 0, w: 2, h: 2, d: 2 };
    const r = analyticalSurfaceArea([box, box]);
    expect(r).toEqual({ top: 4, bottom: 4, left: 4, right: 4, front: 4, back: 4 });
  });

  it("two touching boxes on X axis", () => {
    const r = analyticalSurfaceArea([
      { x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 },
      { x: 1, y: 0, z: 0, w: 1, h: 1, d: 1 },
    ]);
    // Shared face on X: left/right each lose 1
    expect(r).toEqual({ top: 2, bottom: 2, left: 1, right: 1, front: 2, back: 2 });
  });

  it("two non-touching boxes", () => {
    const r = analyticalSurfaceArea([
      { x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 },
      { x: 5, y: 0, z: 0, w: 1, h: 1, d: 1 },
    ]);
    expect(r).toEqual({ top: 2, bottom: 2, left: 2, right: 2, front: 2, back: 2 });
  });
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("constructor", () => {
  it("creates instance with defaults", () => {
    const h = new Heerich();
    expect(h).toBeInstanceOf(Heerich);
    expect(h.getFaces()).toEqual([]);
  });

  it("accepts custom tile and style", () => {
    const h = new Heerich({
      tile: [20, 30],
      style: { fill: "#ff0000", stroke: "#000", strokeWidth: 2 },
    });
    h.addBox({ position: [0, 0, 0], size: [1, 1, 1] });
    const faces = h.getFaces();
    expect(faces.length).toBeGreaterThan(0);
    expect(faces[0].style.fill).toBe("#ff0000");
  });

  it("accepts perspective camera", () => {
    const h = new Heerich({ camera: { type: "perspective", distance: 20 } });
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    const faces = h.getFaces();
    expect(faces.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// addBox / removeBox
// ---------------------------------------------------------------------------

describe("addBox / removeBox", () => {
  it("adds voxels", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 3, 2] });
    expect(h.hasVoxel([0, 0, 0])).toBe(true);
    expect(h.hasVoxel([1, 2, 1])).toBe(true);
    expect(h.hasVoxel([2, 0, 0])).toBe(false); // size is exclusive
    expect(countVoxels(h)).toBe(2 * 3 * 2);
  });

  it("removes voxels", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [3, 3, 3] });
    h.removeBox({ position: [1, 1, 1], size: [1, 1, 1] });
    expect(h.hasVoxel([1, 1, 1])).toBe(false);
    expect(h.hasVoxel([0, 0, 0])).toBe(true);
    expect(countVoxels(h)).toBe(27 - 1);
  });
});

// ---------------------------------------------------------------------------
// addSphere
// ---------------------------------------------------------------------------

describe("addSphere", () => {
  it("produces voxels within radius", () => {
    const h = makeH();
    h.addSphere({ center: [0, 0, 0], radius: 3 });
    expect(h.hasVoxel([0, 0, 0])).toBe(true);
    // [3,0,0]: dx²+dy²+dz² = 9 = r², so it IS inside (≤ r²)
    expect(h.hasVoxel([3, 0, 0])).toBe(true);
    const n = countVoxels(h);
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// Boolean ops
// ---------------------------------------------------------------------------

describe("boolean ops", () => {
  it("subtract reduces voxels", () => {
    const h = makeH();
    h.addBox({ position: [-3, -3, -3], size: [6, 6, 6] });
    const before = countVoxels(h);
    h.addSphere({ center: [0, 0, 0], radius: 3, mode: "subtract" });
    expect(countVoxels(h)).toBeLessThan(before);
  });

  it("intersect keeps only overlap", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [4, 4, 4] });
    h.addBox({ position: [2, 2, 2], size: [4, 4, 4], mode: "intersect" });
    // Overlap is [2,2,2] to [4,4,4) = 2×2×2 = 8
    expect(countVoxels(h)).toBe(8);
    expect(h.hasVoxel([2, 2, 2])).toBe(true);
    expect(h.hasVoxel([0, 0, 0])).toBe(false);
  });

  it("exclude toggles voxels", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2] });
    h.addBox({ position: [1, 1, 1], size: [2, 2, 2], mode: "exclude" });
    // Overlap [1,1,1] to [2,2,2) = 1 voxel gets removed
    // Non-overlap from first: 8-1 = 7, from second: 8-1 = 7 → 14
    expect(h.hasVoxel([0, 0, 0])).toBe(true); // only in first
    expect(h.hasVoxel([1, 1, 1])).toBe(false); // in both → removed
    expect(h.hasVoxel([2, 2, 2])).toBe(true); // only in second
  });
});

// ---------------------------------------------------------------------------
// getFaces
// ---------------------------------------------------------------------------

describe("getFaces", () => {
  it("single box produces correct face count", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 3, 2], style: { default: { fill: "#e8927c" } } });
    const faces = h.getFaces();
    // Oblique angle=45, distance=15: depthOffsetX > 0 (right visible), depthOffsetY > 0 (bottom visible)
    // 4 visible directions: bottom, right, front, back
    // bottom: 2×2 = 4 faces, right: 2×3 = 6 faces, front: 2×3 = 6 faces, back: 2×3 = 6 faces
    const types = faceTypes(faces);
    expect(types).toEqual(["back", "bottom", "front", "right"]);
    expect(faces.filter((f) => f.type === "bottom").length).toBe(4); // 2×2 bottom surface
    expect(faces.filter((f) => f.type === "right").length).toBe(6);  // 2×3 right surface
    expect(faces.filter((f) => f.type === "front").length).toBe(6);  // 2×3 front surface
    expect(faces.filter((f) => f.type === "back").length).toBe(6);   // 2×3 back surface
    expect(faces.length).toBe(22);
  });

  it("each face has required properties", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    const faces = h.getFaces();
    for (const f of faces) {
      if (f.type === "content") continue;
      expect(f.type).toMatch(/^(top|bottom|left|right|front|back)$/);
      expect(f.points).toBeInstanceOf(Array);
      expect(f.points.length).toBe(4);
      for (const pt of f.points) {
        expect(pt).toBeInstanceOf(Array);
        expect(pt.length).toBe(2);
        expect(typeof pt[0]).toBe("number");
        expect(typeof pt[1]).toBe("number");
      }
      expect(typeof f.depth).toBe("number");
      expect(f.style).toBeDefined();
      expect(f.voxel).toBeDefined();
      expect(typeof f.voxel.x).toBe("number");
      expect(typeof f.voxel.y).toBe("number");
      expect(typeof f.voxel.z).toBe("number");
    }
  });

  it("two non-touching boxes produce expected faces", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    h.addBox({ position: [5, 0, 0], size: [2, 2, 2], style: { default: { fill: "#bbb" } } });
    const faces = h.getFaces();
    // Each isolated box produces the same face count
    const h1 = makeH();
    h1.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    const singleCount = h1.getFaces().length;
    expect(faces.length).toBe(singleCount * 2);
  });

  it("touching boxes hide shared face", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    h.addBox({ position: [2, 0, 0], size: [2, 2, 2], style: { default: { fill: "#bbb" } } });
    const touchingCount = h.getFaces().length;

    const h2 = makeH();
    h2.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    h2.addBox({ position: [5, 0, 0], size: [2, 2, 2], style: { default: { fill: "#bbb" } } });
    const separateCount = h2.getFaces().length;

    expect(touchingCount).toBeLessThan(separateCount);
  });

  it("empty scene returns no faces", () => {
    const h = makeH();
    expect(h.getFaces()).toEqual([]);
  });

  it("subtract exposes interior faces", () => {
    const h1 = makeH();
    h1.addBox({ position: [-3, -3, -3], size: [6, 6, 6], style: { default: { fill: "#aaa" } } });
    const boxFaces = h1.getFaces().length;
    const boxVoxels = countVoxels(h1);

    const h2 = makeH();
    h2.addBox({ position: [-3, -3, -3], size: [6, 6, 6], style: { default: { fill: "#aaa" } } });
    h2.addSphere({ center: [0, 0, 0], radius: 3, mode: "subtract" });
    const subtractedFaces = h2.getFaces().length;
    const subtractedVoxels = countVoxels(h2);

    // Subtraction removes voxels
    expect(subtractedVoxels).toBeLessThan(boxVoxels);
    // Carving a hole in a solid cube exposes interior faces, so face count increases
    expect(subtractedFaces).toBeGreaterThan(boxFaces);
  });
});

// ---------------------------------------------------------------------------
// getFaces perspective
// ---------------------------------------------------------------------------

describe("getFaces perspective", () => {
  it("perspective culls differently than oblique", () => {
    const hObl = makeH();
    hObl.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    const obliqueFaces = hObl.getFaces().length;

    const hPersp = new Heerich({ camera: { type: "perspective", distance: 20 } });
    hPersp.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    const perspFaces = hPersp.getFaces().length;

    // Perspective uses normal-based culling (view vector · face normal),
    // oblique uses direction-based (depthOffset signs).
    // For a single box, perspective shows 3 faces (the 3 facing the camera),
    // oblique shows 4 (top, right, front, back).
    expect(perspFaces).toBeGreaterThan(0);
    expect(perspFaces).not.toBe(obliqueFaces);
  });

  it("all perspective faces have 4 points", () => {
    const h = new Heerich({ camera: { type: "perspective", distance: 20 } });
    h.addBox({ position: [0, 0, 0], size: [3, 3, 3], style: { default: { fill: "#aaa" } } });
    for (const f of h.getFaces()) {
      if (f.type === "content") continue;
      expect(f.points.length).toBe(4);
    }
  });
});

// ---------------------------------------------------------------------------
// getFacesFrom
// ---------------------------------------------------------------------------

describe("getFacesFrom", () => {
  it("generates faces from test function", () => {
    const h = makeH();
    const faces = h.getFacesFrom({
      bounds: [[-3, 0, -3], [3, 5, 3]],
      test: (x, y, z) => x * x + z * z < 9 && y >= 0 && y < 5,
      style: { default: { fill: "#7cc8a0" } },
    });
    expect(faces.length).toBeGreaterThan(0);
    const types = faceTypes(faces);
    expect(types.length).toBeGreaterThan(1);
  });

  it("respects static style", () => {
    const h = makeH();
    // With default camera (angle=45, distance=15), bottom faces are visible
    const faces = h.getFacesFrom({
      bounds: [[-2, 0, -2], [2, 2, 2]],
      test: (x, y, z) => x >= -2 && x < 2 && y >= 0 && y < 2 && z >= -2 && z < 2,
      style: { default: { fill: "#f00" }, bottom: { fill: "#0f0" } },
    });
    expect(faces.length).toBeGreaterThan(0);
    const bottomFaces = faces.filter((f) => f.type === "bottom");
    expect(bottomFaces.length).toBeGreaterThan(0);
    for (const f of bottomFaces) expect(f.style.fill).toBe("#0f0");
    const otherFaces = faces.filter((f) => f.type !== "bottom" && f.type !== "content");
    for (const f of otherFaces) expect(f.style.fill).toBe("#f00");
  });

  it("respects function style", () => {
    const h = makeH();
    const faces = h.getFacesFrom({
      bounds: [[0, 0, 0], [4, 2, 4]],
      test: (x, y, z) => x >= 0 && x < 4 && y >= 0 && y < 2 && z >= 0 && z < 4,
      style: { default: (x, y, z) => ({ fill: x >= 2 ? "#f00" : "#0f0" }) },
    });
    expect(faces.length).toBeGreaterThan(0);
    const fills = new Set(faces.map((f) => f.style.fill));
    expect(fills.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

describe("styles", () => {
  it("static default style applies to all faces", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#f00" } } });
    for (const f of h.getFaces()) {
      if (f.type !== "content") expect(f.style.fill).toBe("#f00");
    }
  });

  it("per-face style overrides default", () => {
    const h = makeH();
    h.addBox({
      position: [0, 0, 0], size: [2, 2, 2],
      style: { default: { fill: "#aaa" }, top: { fill: "#f00" } },
    });
    for (const f of h.getFaces()) {
      if (f.type === "top") expect(f.style.fill).toBe("#f00");
      else if (f.type !== "content") expect(f.style.fill).toBe("#aaa");
    }
  });

  it("function style varies by position", () => {
    const h = makeH();
    h.addBox({
      position: [0, 0, 0], size: [4, 1, 1],
      style: (x, y, z) => ({ default: { fill: x >= 2 ? "#f00" : "#0f0" } }),
    });
    const fills = new Set(h.getFaces().map((f) => f.style.fill));
    expect(fills.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// toSVG
// ---------------------------------------------------------------------------

describe("toSVG", () => {
  it("produces valid SVG structure", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    const svg = h.toSVG();
    expect(svg).toMatch(/^<svg/);
    expect(svg).toMatch(/<\/svg>$/);
    expect(svg).toContain("<polygon");
  });

  it("includes data attributes", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [1, 1, 1], style: { default: { fill: "#aaa" } } });
    const svg = h.toSVG();
    expect(svg).toContain('data-x="0"');
    expect(svg).toContain('data-y="0"');
    expect(svg).toContain('data-z="0"');
    expect(svg).toContain("data-face=");
  });

  it("polygon count matches face count", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    const faces = h.getFaces().filter((f) => f.type !== "content");
    const svg = h.toSVG();
    const polygonCount = (svg.match(/<polygon/g) || []).length;
    expect(polygonCount).toBe(faces.length);
  });

  it("faceAttributes callback adds custom attributes", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [1, 1, 1], style: { default: { fill: "#aaa" } } });
    const svg = h.toSVG({ faceAttributes: () => ({ class: "my-face" }) });
    expect(svg).toContain('class="my-face"');
  });

  it("meta produces data-* attributes", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [1, 1, 1], style: { default: { fill: "#aaa" } }, meta: { id: "foo" } });
    const svg = h.toSVG();
    expect(svg).toContain('data-id="foo"');
  });
});

// ---------------------------------------------------------------------------
// Content voxels
// ---------------------------------------------------------------------------

describe("content voxels", () => {
  it("produces content face type", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [1, 1, 1], content: '<circle cx="20" cy="20" r="10"/>' });
    const faces = h.getFaces();
    const contentFaces = faces.filter((f) => f.type === "content");
    expect(contentFaces.length).toBe(1);
    expect(contentFaces[0].content).toContain("<circle");
  });

  it("SVG wraps content in g with transform", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [1, 1, 1], content: '<rect width="10" height="10"/>' });
    const svg = h.toSVG();
    expect(svg).toContain("<g transform=");
    expect(svg).toContain('<rect width="10" height="10"/>');
  });
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

describe("cache", () => {
  it("returns same reference on repeated calls", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    const a = h.getFaces();
    const b = h.getFaces();
    expect(a).toBe(b);
  });

  it("invalidates after addBox", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    const a = h.getFaces();
    h.addBox({ position: [5, 0, 0], size: [1, 1, 1], style: { default: { fill: "#bbb" } } });
    const b = h.getFaces();
    expect(a).not.toBe(b);
  });

  it("invalidates after setCamera", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa" } } });
    const a = h.getFaces();
    h.setCamera({ angle: 30 });
    const b = h.getFaces();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

describe("serialization", () => {
  it("toJSON / fromJSON round-trip preserves voxels", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#f00" } } });
    const json = h.toJSON();
    const h2 = Heerich.fromJSON(json);
    expect(countVoxels(h2)).toBe(countVoxels(h));
  });

  it("restored instance produces faces", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#f00" } } });
    const json = h.toJSON();
    const h2 = Heerich.fromJSON(json);
    expect(h2.getFaces().length).toBe(h.getFaces().length);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("clear empties everything", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [3, 3, 3] });
    h.clear();
    expect(h.getFaces()).toEqual([]);
    expect(h.hasVoxel([0, 0, 0])).toBe(false);
  });

  it("zero-size box adds nothing", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [0, 0, 0] });
    expect(countVoxels(h)).toBe(0);
  });

  it("opaque false does not hide neighbor faces", () => {
    // Two touching boxes: with both opaque, shared face is hidden
    const hOpaque = makeH();
    hOpaque.addBox({ position: [0, 0, 0], size: [1, 1, 1], style: { default: { fill: "#aaa" } } });
    hOpaque.addBox({ position: [1, 0, 0], size: [1, 1, 1], style: { default: { fill: "#bbb" } } });
    const opaqueFaces = hOpaque.getFaces().length;

    // Same setup but second box is non-opaque: shared face should NOT be hidden
    const hTransp = makeH();
    hTransp.addBox({ position: [0, 0, 0], size: [1, 1, 1], style: { default: { fill: "#aaa" } } });
    hTransp.addBox({ position: [1, 0, 0], size: [1, 1, 1], style: { default: { fill: "#bbb" } }, opaque: false });
    const transpFaces = hTransp.getFaces().length;

    // Non-opaque neighbor means more visible faces (shared face not culled)
    expect(transpFaces).toBeGreaterThan(opaqueFaces);
  });

  it("rotation transforms voxel coordinates", () => {
    const h = makeH();
    // 3×1×1 along X axis
    h.addBox({ position: [0, 0, 0], size: [3, 1, 1], style: { default: { fill: "#aaa" } } });
    expect(h.hasVoxel([2, 0, 0])).toBe(true);
    expect(h.hasVoxel([0, 0, 2])).toBe(false);
    // Rotate 90° around Y: X→Z, Z→-X (centered on bounding box center)
    h.rotate({ axis: "y", turns: 1 });
    // After rotation, the 3-long span should be along Z instead of X
    expect(h.hasVoxel([2, 0, 0])).toBe(false);
    const faces = h.getFaces();
    expect(faces.length).toBeGreaterThan(0);
    // Verify voxels span Z axis now
    const zCoords = new Set();
    h.forEach((v) => zCoords.add(v.z));
    expect(zCoords.size).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

describe("scale", () => {
  it("scaled voxel produces faces", () => {
    const h = makeH();
    h.addBox({
      position: [0, 0, 0], size: [1, 1, 1],
      style: { default: { fill: "#aaa" } },
      scale: [0.5, 0.5, 0.5],
    });
    const faces = h.getFaces();
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) {
      if (f.type !== "content") expect(f.points.length).toBe(4);
    }
  });

  it("scaled voxel is automatically non-opaque", () => {
    const h = makeH();
    h.addBox({
      position: [0, 0, 0], size: [1, 1, 1],
      scale: [0.5, 0.5, 0.5],
    });
    const v = h.getVoxel([0, 0, 0]);
    expect(v).not.toBeNull();
    expect(v.opaque).toBe(false);
  });

  it("scaled voxel does not occlude neighbor faces", () => {
    // Two touching boxes: with unscaled neighbor, shared face hidden
    const hNormal = makeH();
    hNormal.addBox({ position: [0, 0, 0], size: [1, 1, 1], style: { default: { fill: "#aaa" } } });
    hNormal.addBox({ position: [1, 0, 0], size: [1, 1, 1], style: { default: { fill: "#bbb" } } });
    const normalFaces = hNormal.getFaces().length;

    // Same but second box is scaled — should not occlude first box's face
    const hScaled = makeH();
    hScaled.addBox({ position: [0, 0, 0], size: [1, 1, 1], style: { default: { fill: "#aaa" } } });
    hScaled.addBox({ position: [1, 0, 0], size: [1, 1, 1], style: { default: { fill: "#bbb" } }, scale: [0.5, 0.5, 0.5] });
    const scaledFaces = hScaled.getFaces().length;

    expect(scaledFaces).toBeGreaterThan(normalFaces);
  });

  it("scale shrinks face vertices", () => {
    // Unscaled 1×1×1 box vs scaled — scaled should have smaller vertex spread
    const hFull = makeH();
    hFull.addBox({ position: [0, 0, 0], size: [1, 1, 1], style: { default: { fill: "#aaa" } } });
    const fullFaces = hFull.getFaces();

    const hSmall = makeH();
    hSmall.addBox({
      position: [0, 0, 0], size: [1, 1, 1],
      style: { default: { fill: "#aaa" } },
      scale: [0.5, 0.5, 0.5], scaleOrigin: [0.5, 0.5, 0.5],
    });
    const smallFaces = hSmall.getFaces();

    // Compare bounding box of all projected points — scaled should be smaller
    function pointsBBox(faces) {
      let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
      for (const f of faces) {
        if (f.type === "content") continue;
        for (const [px, py] of f.points) {
          if (px < mnX) mnX = px; if (px > mxX) mxX = px;
          if (py < mnY) mnY = py; if (py > mxY) mxY = py;
        }
      }
      return { w: mxX - mnX, h: mxY - mnY };
    }
    const fullBB = pointsBBox(fullFaces);
    const smallBB = pointsBBox(smallFaces);
    expect(smallBB.w).toBeLessThan(fullBB.w);
    expect(smallBB.h).toBeLessThan(fullBB.h);
  });

  it("scale round-trips through toJSON/fromJSON", () => {
    const h = makeH();
    h.addBox({
      position: [0, 0, 0], size: [1, 1, 1],
      style: { default: { fill: "#aaa" } },
      scale: [0.5, 0.5, 0.5], scaleOrigin: [0.5, 0, 0.5],
    });
    const json = h.toJSON();
    const h2 = Heerich.fromJSON(json);
    const v = h2.getVoxel([0, 0, 0]);
    expect(v.scale).toEqual([0.5, 0.5, 0.5]);
    expect(v.scaleOrigin).toEqual([0.5, 0, 0.5]);
    expect(h2.getFaces().length).toBe(h.getFaces().length);
  });
});

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

describe("snapshot", () => {
  it("2x2x2 box produces stable face output", () => {
    const h = makeH();
    h.addBox({ position: [0, 0, 0], size: [2, 2, 2], style: { default: { fill: "#aaa", stroke: "#000", strokeWidth: 1 } } });
    const faces = h.getFaces();
    const snapshot = faces.map((f) => ({
      type: f.type,
      vx: f.voxel.x, vy: f.voxel.y, vz: f.voxel.z,
      depth: Math.round(f.depth * 100) / 100,
      points: f.points.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]),
    }));
    expect(snapshot).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe("properties", () => {
  const boxArb = fc.record({
    x: fc.integer({ min: -10, max: 10 }),
    y: fc.integer({ min: -10, max: 10 }),
    z: fc.integer({ min: -10, max: 10 }),
    w: fc.integer({ min: 1, max: 5 }),
    h: fc.integer({ min: 1, max: 5 }),
    d: fc.integer({ min: 1, max: 5 }),
  });

  const sceneArb = fc.array(boxArb, { minLength: 1, maxLength: 8 });

  function buildScene(boxes) {
    const h = makeH();
    for (const b of boxes) {
      h.addBox({
        position: [b.x, b.y, b.z],
        size: [b.w, b.h, b.d],
        style: { default: { fill: "#aaa" } },
      });
    }
    return h;
  }

  it("face count ≤ 6 × voxelCount", () => {
    fc.assert(fc.property(sceneArb, (boxes) => {
      const h = buildScene(boxes);
      const faces = h.getFaces().filter((f) => f.type !== "content");
      const voxels = countVoxels(h);
      expect(faces.length).toBeLessThanOrEqual(6 * voxels);
    }));
  });

  it("every face is a quad with 4 points", () => {
    fc.assert(fc.property(sceneArb, (boxes) => {
      const h = buildScene(boxes);
      for (const f of h.getFaces()) {
        if (f.type === "content") continue;
        expect(f.points.length).toBe(4);
      }
    }));
  });

  it("oblique faces sorted by depth (non-increasing)", () => {
    fc.assert(fc.property(sceneArb, (boxes) => {
      const h = buildScene(boxes);
      const faces = h.getFaces();
      for (let i = 1; i < faces.length; i++) {
        expect(faces[i].depth).toBeLessThanOrEqual(faces[i - 1].depth);
      }
    }));
  });

  it("no interior faces (every face borders empty space)", () => {
    fc.assert(fc.property(sceneArb, (boxes) => {
      const h = buildScene(boxes);
      const faces = h.getFaces().filter((f) => f.type !== "content");
      for (const f of faces) {
        const n = FACE_NORMALS[f.type];
        if (!n) continue;
        const nx = f.voxel.x + n[0];
        const ny = f.voxel.y + n[1];
        const nz = f.voxel.z + n[2];
        // The neighbor in the face's normal direction should be empty
        // (or non-opaque, which counts as empty for face culling)
        const neighbor = h.getVoxel([nx, ny, nz]);
        if (neighbor) {
          expect(neighbor.opaque).toBe(false);
        }
      }
    }));
  });

  it("no holes (every empty neighbor has a face)", () => {
    fc.assert(fc.property(sceneArb, (boxes) => {
      const h = buildScene(boxes);
      const faces = h.getFaces().filter((f) => f.type !== "content");

      // Build a set of (x,y,z,type) from emitted faces
      const faceSet = new Set();
      for (const f of faces) {
        faceSet.add(`${f.voxel.x},${f.voxel.y},${f.voxel.z},${f.type}`);
      }

      // For every voxel, check that each empty neighbor has a corresponding face
      h.forEach((voxel) => {
        if (voxel.opaque === false) return;
        const { x, y, z } = voxel;
        for (const [type, n] of Object.entries(FACE_NORMALS)) {
          const nx = x + n[0], ny = y + n[1], nz = z + n[2];
          const neighbor = h.getVoxel([nx, ny, nz]);
          if (!neighbor || neighbor.opaque === false) {
            // This boundary should have a face — but only if this direction is visible
            // (oblique backface culling may skip some directions entirely)
            // So we check: if ANY face of this type exists in the output, then
            // this specific boundary must also have one
            const anyOfType = faces.some((f) => f.type === type);
            if (anyOfType) {
              expect(faceSet.has(`${x},${y},${z},${type}`)).toBe(true);
            }
          }
        }
      });
    }));
  });

  it("getFaces is idempotent", () => {
    fc.assert(fc.property(sceneArb, (boxes) => {
      const h = buildScene(boxes);
      const a = h.getFaces();
      const b = h.getFaces();
      expect(a).toBe(b);
    }));
  });

  it("depth correlates with Z position", () => {
    // Two boxes at different Z: the further box should have strictly greater
    // depth values than the nearer box (in oblique projection)
    fc.assert(fc.property(
      fc.integer({ min: -5, max: 5 }),
      fc.integer({ min: -5, max: 5 }),
      fc.integer({ min: 2, max: 8 }),
      (x, y, gap) => {
        const h = makeH();
        h.addBox({ position: [x, y, 0], size: [1, 1, 1], style: { default: { fill: "#aaa" } } });
        h.addBox({ position: [x, y, gap], size: [1, 1, 1], style: { default: { fill: "#bbb" } } });
        const faces = h.getFaces();
        const nearFaces = faces.filter((f) => f.voxel.z === 0);
        const farFaces = faces.filter((f) => f.voxel.z === gap);
        if (nearFaces.length === 0 || farFaces.length === 0) return; // degenerate
        const maxNearDepth = Math.max(...nearFaces.map((f) => f.depth));
        const minFarDepth = Math.min(...farFaces.map((f) => f.depth));
        expect(minFarDepth).toBeGreaterThan(maxNearDepth);
      },
    ));
  });

  it("all projected points are finite and form non-degenerate quads", () => {
    fc.assert(fc.property(sceneArb, (boxes) => {
      const h = buildScene(boxes);
      for (const f of h.getFaces()) {
        if (f.type === "content") continue;
        for (const [px, py] of f.points) {
          expect(Number.isFinite(px)).toBe(true);
          expect(Number.isFinite(py)).toBe(true);
        }
        // Quad has positive area (cross product of diagonals is non-zero)
        const [p0, p1, p2, p3] = f.points;
        const dx1 = p2[0] - p0[0], dy1 = p2[1] - p0[1];
        const dx2 = p3[0] - p1[0], dy2 = p3[1] - p1[1];
        const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
        expect(cross).toBeGreaterThan(0);
      }
    }));
  });

  it("winding order is consistent per face type", () => {
    // All faces of the same type should wind in the same direction.
    // Compute signed area (positive = counterclockwise, negative = clockwise).
    function signedArea(points) {
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        area += (x2 - x1) * (y2 + y1);
      }
      return area;
    }

    fc.assert(fc.property(sceneArb, (boxes) => {
      const h = buildScene(boxes);
      const faces = h.getFaces().filter((f) => f.type !== "content");
      const signByType = {};
      for (const f of faces) {
        const s = Math.sign(signedArea(f.points));
        if (s === 0) continue; // degenerate, skip
        if (signByType[f.type] === undefined) {
          signByType[f.type] = s;
        } else {
          expect(s).toBe(signByType[f.type]);
        }
      }
    }));
  });

  it("subtract preserves surviving voxel styles", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 4 }),
      fc.integer({ min: 1, max: 4 }),
      fc.integer({ min: 1, max: 4 }),
      (w, h, d) => {
        const h1 = makeH();
        h1.addBox({ position: [0, 0, 0], size: [w + 2, h + 2, d + 2], style: { default: { fill: "#f00" } } });
        h1.addBox({ position: [1, 1, 1], size: [w, h, d], mode: "subtract" });
        const faces = h1.getFaces().filter((f) => f.type !== "content");
        // All surviving faces should still be red
        for (const f of faces) {
          expect(f.style.fill).toBe("#f00");
        }
      },
    ));
  });

  it("non-overlapping unions are commutative", () => {
    // Two non-overlapping boxes produce the same faces regardless of add order
    fc.assert(fc.property(
      boxArb, boxArb,
      (a, b) => {
        // Ensure non-overlapping by offsetting b far away
        const bOffset = { ...b, x: a.x + a.w + 5 + b.x };

        const h1 = makeH();
        h1.addBox({ position: [a.x, a.y, a.z], size: [a.w, a.h, a.d], style: { default: { fill: "#aaa" } } });
        h1.addBox({ position: [bOffset.x, bOffset.y, bOffset.z], size: [bOffset.w, bOffset.h, bOffset.d], style: { default: { fill: "#bbb" } } });

        const h2 = makeH();
        h2.addBox({ position: [bOffset.x, bOffset.y, bOffset.z], size: [bOffset.w, bOffset.h, bOffset.d], style: { default: { fill: "#bbb" } } });
        h2.addBox({ position: [a.x, a.y, a.z], size: [a.w, a.h, a.d], style: { default: { fill: "#aaa" } } });

        const faces1 = h1.getFaces();
        const faces2 = h2.getFaces();
        expect(faces1.length).toBe(faces2.length);

        // Same set of (x, y, z, type) tuples
        const set1 = new Set(faces1.map((f) => `${f.voxel.x},${f.voxel.y},${f.voxel.z},${f.type}`));
        const set2 = new Set(faces2.map((f) => `${f.voxel.x},${f.voxel.y},${f.voxel.z},${f.type}`));
        expect(set1).toEqual(set2);
      },
    ));
  });

  it("surface area conservation", () => {
    // For any set of axis-aligned boxes, the face count per visible direction
    // must equal the analytically computed exposed surface area.
    // Uses an independent 3D grid reimplementation to compute the expected area.
    fc.assert(fc.property(sceneArb, (boxes) => {
      const h = buildScene(boxes);
      const faces = h.getFaces().filter((f) => f.type !== "content");
      const expected = analyticalSurfaceArea(boxes);

      // Sum actual face count per type
      const actual = {};
      for (const f of faces) {
        actual[f.type] = (actual[f.type] || 0) + 1;
      }

      // Check each visible direction (oblique backface culling hides some)
      for (const type of Object.keys(actual)) {
        expect(actual[type]).toBe(expected[type]);
      }
    }));
  });
});
