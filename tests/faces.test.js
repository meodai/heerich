// Consistency checks for getFaces(), which exits non-zero on failure:
//  1. A scene edited step by step (using the per-voxel caches) must produce the
//     same faces as a fresh instance built from the same operations.
//  2. Perspective walls: the visible set must match one derived directly from
//     the voxels, so a wrongly culled wall can't hide behind check 1.
// Run directly: node tests/faces.test.js

import { Heerich } from "../src/heerich.js";

const RUNS = 25;
const STEPS = 16;

// Seeded (mulberry32) so failures reproduce
let seed = 0x9e3779b9;
function rnd(n) {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) % n;
}

const PERSPECTIVE = [
  [5, 5, 20],
  [5, 5, 3],
  [0, 0, 8],
  [12, -4, 6],
  [-6, 14, 15],
  [4, 4, 0.5], // geometry crosses the near plane
  [30, 30, 2],
  [5, 5, 1],
].map(([x, y, distance]) => ({
  type: "perspective",
  position: [x, y],
  distance,
}));

const CAMERAS = [
  ...PERSPECTIVE,
  { type: "oblique", angle: 45, distance: 15 },
  { type: "oblique", angle: 225, distance: 9 },
  { type: "isometric", angle: 30 },
  { type: "orthographic", angle: 130, pitch: 20 },
];

function shape() {
  const pick = rnd(3);
  if (pick === 0)
    return {
      type: "box",
      position: [rnd(10) - 2, rnd(10) - 2, rnd(10) - 2],
      size: 1 + rnd(4),
    };
  if (pick === 1)
    return {
      type: "sphere",
      center: [rnd(10), rnd(10), rnd(10)],
      radius: 1 + rnd(3),
    };
  return {
    type: "line",
    from: [rnd(10), rnd(10), rnd(10)],
    to: [rnd(10), rnd(10), rnd(10)],
    radius: rnd(2),
  };
}

function randomOp() {
  const r = rnd(10);
  if (r < 3)
    return {
      kind: "geometry",
      opts: {
        ...shape(),
        mode: "union",
        style: rnd(2) ? { default: { fill: `#${rnd(900)}` } } : undefined,
        opaque: rnd(5) ? undefined : false,
        gap: rnd(6) ? undefined : 0.1,
        scale: rnd(7) ? undefined : [0.5, 1, 0.5],
      },
    };
  if (r < 6)
    return {
      kind: "geometry",
      opts: {
        ...shape(),
        mode: "subtract",
        style: rnd(2) ? { default: { fill: `#a${rnd(90)}` } } : undefined,
      },
    };
  if (r < 7) return { kind: "geometry", opts: { ...shape(), mode: "exclude" } };
  if (r < 8)
    return {
      kind: "geometry",
      opts: {
        type: "box",
        position: [-3, -3, -3],
        size: 12 + rnd(4),
        mode: "intersect",
        style: rnd(2) ? { top: { fill: `#b${rnd(90)}` } } : undefined,
      },
    };
  if (r < 9)
    return {
      kind: "style",
      opts: { style: { default: { fill: `#c${rnd(90)}` } } },
    };
  return {
    kind: "style",
    opts: {
      type: "box",
      position: [rnd(8), rnd(8), rnd(8)],
      size: 1 + rnd(4),
      style: { front: { fill: `#d${rnd(90)}` } },
    },
  };
}

function apply(h, op) {
  if (op.kind === "geometry") h.applyGeometry(op.opts);
  else h.applyStyle(op.opts);
}

const faceId = (f) => `${f.type}@${f.voxel.x},${f.voxel.y},${f.voxel.z}`;

function fingerprint(h) {
  return h
    .getFaces()
    .map((f) => `${faceId(f)}:${f.points.data.join()}|${f.style?.fill}`)
    .join(";");
}

const FACE_GEOMETRY = [
  // [type, normal, center, vertex z offsets]
  ["top", [0, -1, 0], [0.5, 0, 0.5], [0, 0, 1, 1]],
  ["bottom", [0, 1, 0], [0.5, 1, 0.5], [1, 1, 0, 0]],
  ["left", [-1, 0, 0], [0, 0.5, 0.5], [1, 0, 0, 1]],
  ["right", [1, 0, 0], [1, 0.5, 0.5], [0, 1, 1, 0]],
  ["front", [0, 0, -1], [0.5, 0.5, 0], [0, 0, 0, 0]],
  ["back", [0, 0, 1], [0.5, 0.5, 1], [1, 1, 1, 1]],
];

/** Faces a perspective camera must show, derived from the voxels alone. */
function expectedPerspectiveFaces(h, cam) {
  const [camX, camY] = cam.position;
  const camZ = -cam.distance;
  const solid = (x, y, z) => {
    const v = h.getVoxel([x, y, z]);
    return v && v.opaque !== false;
  };
  const expected = new Set();

  for (const v of h) {
    if (v.content) continue;
    const forced = v.scale || v.gap;
    const gs = v.gap ? 1 - 2 * v.gap : 1;
    // Apply scale then gap, the same transforms the vertices go through
    const toWorld = (ox, oy, oz) => {
      const c = [v.x + ox, v.y + oy, v.z + oz];
      if (v.scale)
        for (let i = 0; i < 3; i++) {
          const o = [v.x, v.y, v.z][i] + v.scaleOrigin[i];
          c[i] = o + (c[i] - o) * v.scale[i];
        }
      if (v.gap)
        for (let i = 0; i < 3; i++) {
          const o = [v.x, v.y, v.z][i] + 0.5;
          c[i] = o + (c[i] - o) * gs;
        }
      return c;
    };

    for (const [type, n, center, zOffsets] of FACE_GEOMETRY) {
      if (!forced && solid(v.x + n[0], v.y + n[1], v.z + n[2])) continue;
      const c = toWorld(center[0], center[1], center[2]);
      const facing =
        (c[0] - camX) * n[0] + (c[1] - camY) * n[1] + (c[2] - camZ) * n[2] < 0;
      if (!facing) continue;
      // Near plane: a face with any vertex at or behind the eye is dropped
      const behindEye = zOffsets.some(
        (oz) => toWorld(0, 0, oz)[2] + cam.distance < 0.01,
      );
      if (!behindEye) expected.add(`${type}@${v.x},${v.y},${v.z}`);
    }
  }
  return expected;
}

const failures = [];
let checks = 0;
let wallChecks = 0;

for (const cam of CAMERAS) {
  for (let run = 0; run < RUNS; run++) {
    const h = new Heerich({ camera: cam });
    const log = [];
    for (let step = 0; step < STEPS; step++) {
      const op = randomOp();
      log.push(op);
      apply(h, op);
      if (rnd(4) === 0) h.getFaces({ raw: true }); // mix in the other cache
      if (rnd(3) === 0) continue; // let dirty keys accumulate across edits

      const fresh = new Heerich({ camera: cam });
      for (const o of log) apply(fresh, o);
      checks++;
      if (fingerprint(h) !== fingerprint(fresh)) {
        failures.push(
          `edited != fresh: ${JSON.stringify(cam)} run ${run} step ${step}`,
        );
      }

      if (cam.type !== "perspective") continue;
      wallChecks++;
      const expected = expectedPerspectiveFaces(h, cam);
      const actual = new Set(h.getFaces().map(faceId));
      const missing = [...expected].filter((id) => !actual.has(id));
      const extra = [...actual].filter((id) => !expected.has(id));
      if (missing.length || extra.length) {
        failures.push(
          `perspective walls: ${JSON.stringify(cam)} run ${run} step ${step} missing=${missing.length} (${missing.slice(0, 3)}) extra=${extra.length} (${extra.slice(0, 3)})`,
        );
      }
    }
  }
}

console.log(`${checks} edit checks, ${wallChecks} perspective wall checks`);
if (failures.length) {
  console.error(`${failures.length} failures, first 5:`);
  for (const f of failures.slice(0, 5)) console.error(`  ${f}`);
  process.exit(1);
}
console.log("ok");
