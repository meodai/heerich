// Clip planes and group transforms (getFaces({ clip, caps, transforms })),
// exits non-zero on failure:
//  1. A clip around the whole scene, or a transform that changes nothing,
//     gives exactly the faces getFaces() gives.
//  2. Clipping and transforming leave the face caches alone.
//  3. A clip on cell edges looks exactly like the scene built from only the
//     voxels inside it (walls, slopes and all).
//  4. A group moved by whole cells, or turned by 90°, looks exactly like the
//     scene built there.
//  5. No holes: points inside the kept solid all land on a drawn face, for
//     random scenes, clips (any angle, anywhere) and transforms, under every
//     camera.
//  6. Everything drawn is inside the clip; walls lie on their plane.
//  7. The renderers write every point of a face with more than four.
//  8. Bad input throws; groups survive toJSON/fromJSON; walls take `cap`
//     styles.
// Run directly: node tests/clip.test.js

import { Heerich } from "../src/heerich.js";
import { toPlanes, dist, toMatrix, apply } from "../src/clip.js";

// Seeded (mulberry32) so failures reproduce
let seed = 0x5eed1234;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rnd = (n) => Math.floor(rand() * n);
const pick = (list) => list[rnd(list.length)];

const failures = [];
function check(name, ok, detail = "") {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

// Scenes sit at z ≥ 2, so perspective cameras never see them cross the eye.
const CAMERAS = [
  { type: "oblique", angle: 45, distance: 15 },
  { type: "oblique", angle: 225, distance: 9 },
  { type: "oblique", angle: 315, distance: 1 },
  { type: "isometric", angle: 30 },
  { type: "isometric", angle: 225 },
  { type: "orthographic", angle: 130, pitch: 20 },
  { type: "orthographic", angle: 300, pitch: -25 },
  { type: "perspective", position: [4, -6], distance: 12 },
  { type: "perspective", position: [-3, 9], distance: 20 },
  { type: "perspective", position: [12, 3], distance: 6 },
];
const camName = (c) => JSON.stringify(c);

const Q = [0, 0.25, 0.5, 0.75, 1];
// Pieces from all the families slopes come in
function randomSlope() {
  switch (rnd(6)) {
    case 0:
      return null;
    case 1:
      return null;
    case 2:
      return pick(["+x", "-x", "+z", "-z", "tip", "outer+x+z", "inner-x+z"]);
    case 3: {
      const c = [pick(Q), pick(Q), pick(Q), pick(Q)];
      if (c.every((v) => v === 0)) c[0] = 1;
      return { corners: c };
    }
    case 4: {
      const c = [pick(Q), pick(Q), pick(Q), pick(Q)];
      if (c.every((v) => v === 0)) c[3] = 1;
      return { corners: c, ceiling: true };
    }
    default:
      return { side: pick(["+x", "-z"]), from: 0.25, to: 0.75 };
  }
}

const STYLES = [
  { default: { fill: "#c33" }, top: { fill: "#f99" } },
  { default: { fill: "#3c3" }, left: { fill: "#060" } },
  { default: { fill: "#33c" }, front: { fill: "#99f" } },
];

// A random scene: a block with bumps and dents, some slopes. Returned as a
// list of voxel specs so it can be rebuilt (or filtered, moved) exactly.
function randomSpecs({ slopes = true, size = 6, odd = false } = {}) {
  const specs = new Map();
  const put = (x, y, z) => {
    const spec = {
      x,
      y,
      z,
      style: pick(STYLES),
      slope: slopes ? randomSlope() : null,
    };
    // now and then a squashed voxel or one with a gap (other code paths)
    if (odd && rnd(8) === 0) spec.scale = [1, 0.4 + rand() * 0.5, 1];
    else if (odd && rnd(8) === 0) spec.gap = 0.1;
    specs.set(`${x},${y},${z}`, spec);
  };
  const w = 2 + rnd(size - 1),
    h = 1 + rnd(4),
    d = 2 + rnd(size - 1);
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) put(x, y, z + 2);
  for (let i = 0; i < 6; i++) put(rnd(w + 2) - 1, -1 - rnd(2), rnd(d + 2) + 1);
  for (let i = 0; i < 4; i++) specs.delete(`${rnd(w)},${rnd(h)},${rnd(d) + 2}`);
  return [...specs.values()];
}

function build(specs, camera, { group } = {}) {
  const h = new Heerich({ tile: 20, camera });
  for (const s of specs) {
    h.addGeometry({
      type: "box",
      position: [s.x, s.y, s.z],
      size: 1,
      style: s.style,
      slope: s.slope || undefined,
      group: s.group ?? group,
      scale: s.scale,
      scaleOrigin: s.scale ? [0.5, 1, 0.5] : undefined,
      gap: s.gap,
    });
  }
  return h;
}

// A face as a comparable string: its points (rounded) starting at the
// smallest and running in the smaller direction, plus its fill.
function key(f) {
  const d = f.points.data;
  let pts = [];
  for (let i = 0; i < d.length; i += 2) {
    const p = [Math.round(d[i] * 100) / 100, Math.round(d[i + 1] * 100) / 100];
    const q = pts[pts.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) pts.push(p);
  }
  while (
    pts.length > 1 &&
    pts[0][0] === pts[pts.length - 1][0] &&
    pts[0][1] === pts[pts.length - 1][1]
  )
    pts.pop();
  // drop corners in line with their neighbours (a cut may add some)
  for (let i = 0; pts.length > 3 && i < pts.length; ) {
    const a = pts[(i + pts.length - 1) % pts.length],
      b = pts[i],
      c = pts[(i + 1) % pts.length];
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cr) < 0.05) pts.splice(i, 1);
    else i++;
  }
  if (pts.length < 3) return null;
  // faces with no area draw nothing (edge-on, or slivers): leave them out
  let a2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i],
      q = pts[(i + 1) % pts.length];
    a2 += p[0] * q[1] - q[0] * p[1];
  }
  if (Math.abs(a2) < 1) return null;
  const s = pts.map((p) => `${p[0] + 0},${p[1] + 0}`);
  let best = null;
  for (const seq of [s, [...s].reverse()])
    for (let i = 0; i < seq.length; i++) {
      const r = [...seq.slice(i), ...seq.slice(0, i)].join(" ");
      if (best === null || r < best) best = r;
    }
  return `${best} ${f.style?.fill}`;
}
const keys = (faces) => faces.map(key).filter(Boolean).sort();

function sameSets(name, a, b) {
  const A = keys(a),
    B = keys(b);
  if (A.length === B.length && A.every((k, i) => k === B[i])) return;
  const inA = new Map(),
    inB = new Map();
  for (const k of A) inA.set(k, (inA.get(k) || 0) + 1);
  for (const k of B) inB.set(k, (inB.get(k) || 0) + 1);
  const onlyA = [...inA].filter(([k, n]) => (inB.get(k) || 0) < n).map(([k]) => k);
  const onlyB = [...inB].filter(([k, n]) => (inA.get(k) || 0) < n).map(([k]) => k);
  check(
    name,
    false,
    `${A.length} vs ${B.length} faces; only in first: ${onlyA.slice(0, 2).join(" | ")}; only in second: ${onlyB.slice(0, 2).join(" | ")}`,
  );
}

const facesString = (faces) =>
  faces.map((f) => `${f.type}:${Array.from(f.points.data).join(",")}`).join(";");

// ─── 1. A clip around everything, or no move, changes nothing ───
for (let run = 0; run < 12; run++) {
  const specs = randomSpecs();
  for (const camera of CAMERAS) {
    const h = build(specs, camera);
    const plain = facesString(h.getFaces());
    const around = facesString(
      h.getFaces({ clip: { min: [-50, -50, -50], max: [50, 50, 50] } }),
    );
    check(`clip around all (${camName(camera)})`, plain === around);
    // A moved face seen exactly edge-on (no area) may drop out where the
    // unmoved one, a rounding error the other side of 0, stays: so compare
    // what is drawn.
    const g = build(specs, camera, { group: "all" });
    const still = g.getFaces({ transforms: { all: { translate: [0, 0, 0] } } });
    sameSets(`identity transform (${camName(camera)})`, still, g.getFaces());
    sameSets(`grouped = ungrouped (${camName(camera)})`, g.getFaces(), h.getFaces());
  }
}

// ─── 2. The caches are left alone ───
for (let run = 0; run < 6; run++) {
  const specs = randomSpecs().map((s, i) => ({ ...s, group: i % 2 ? "a" : undefined }));
  for (const camera of CAMERAS) {
    const h = build(specs, camera);
    h.getFaces();
    h.getFaces({ clip: { min: [0.3, -2.5, 2.7], max: [3.6, 1.2, 5.2] } });
    h.getFaces({ transforms: { a: { rotate: [10, 30, 0], translate: [0.5, 0, 0] } } });
    h.getFaces({
      clip: [{ point: [2, 0, 4], normal: [1, 0.3, -0.5] }],
      transforms: { a: { translate: [0.25, 0.5, 0] } },
    });
    const after = facesString(h.getFaces());
    const fresh = facesString(build(specs, camera).getFaces());
    check(`caches untouched (${camName(camera)})`, after === fresh);
  }
}

// ─── 3. A clip on cell edges = the scene built from what's inside ───
for (let run = 0; run < 30; run++) {
  const specs = randomSpecs({ odd: run % 2 === 1 });
  const min = [rnd(3), -1 - rnd(2) + rnd(3), 2 + rnd(3)];
  const max = [min[0] + 1 + rnd(4), min[1] + 1 + rnd(4), min[2] + 1 + rnd(4)];
  const inside = specs.filter(
    (s) =>
      s.x >= min[0] && s.x < max[0] &&
      s.y >= min[1] && s.y < max[1] &&
      s.z >= min[2] && s.z < max[2],
  );
  for (const camera of CAMERAS) {
    const clipped = build(specs, camera).getFaces({ clip: { min, max } });
    const reference = build(inside, camera).getFaces();
    sameSets(`edge clip = inside scene, run ${run} (${camName(camera)})`, clipped, reference);
  }
}

// A slope piece walled in by cubes hides its slanted face. Cut on the cell
// edge of an open side, the cubes there go, and the face must show again.
for (const slope of [
  "+x",
  "-x",
  "+z",
  "-z",
  "outer+x+z",
  "inner-x-z",
  "tip",
  { corners: [0, 0.5, 0.25, 1] },
  { corners: [1, 0, 0, 0.5], ceiling: true },
]) {
  const specs = [];
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++)
      for (let z = 2; z < 5; z++)
        specs.push({
          x,
          y,
          z,
          style: STYLES[(x + y + z) % 3],
          slope: x === 1 && y === 1 && z === 3 ? slope : null,
        });
  for (const [min, max] of [
    [[1, -5, 0], [9, 9, 9]], // cut at x = 1
    [[-5, -5, 0], [2, 9, 9]], // cut at x = 2
    [[-5, -5, 3], [9, 9, 9]], // cut at z = 3
    [[-5, -5, 0], [9, 9, 4]], // cut at z = 4
    [[-5, 1, 0], [9, 9, 9]], // cut at y = 1 (over the piece)
    [[-5, -5, 0], [9, 2, 9]], // cut at y = 2 (under it)
  ]) {
    const inside = specs.filter(
      (s) =>
        s.x >= min[0] && s.x < max[0] &&
        s.y >= min[1] && s.y < max[1] &&
        s.z >= min[2] && s.z < max[2],
    );
    for (const camera of CAMERAS) {
      sameSets(
        `walled-in ${JSON.stringify(slope)} cut ${min}..${max} (${camName(camera)})`,
        build(specs, camera).getFaces({ clip: { min, max } }),
        build(inside, camera).getFaces(),
      );
    }
  }
}

// ─── 4. Whole-cell moves and 90° turns = the scene built there ───
for (let run = 0; run < 10; run++) {
  const specs = randomSpecs({ slopes: run % 2 === 0 });
  const t = [rnd(5) - 2, rnd(3) - 1, rnd(3)];
  const moved = specs.map((s) => ({ ...s, x: s.x + t[0], y: s.y + t[1], z: s.z + t[2] }));
  for (const camera of CAMERAS) {
    const a = build(specs, camera, { group: "g" }).getFaces({
      transforms: { g: { translate: t } },
    });
    const b = build(moved, camera, { group: "g" }).getFaces();
    sameSets(`translate ${t} run ${run} (${camName(camera)})`, a, b);
  }
}
// 90° about y, around the cell corner (2, 0, 4): cell (x, y, z) goes to
// (2 + (z − 4), y, 4 − (x − 2) − 1). Cubes only (a slope would turn too).
for (let run = 0; run < 10; run++) {
  const specs = randomSpecs({ slopes: false }).map((s) => ({ ...s, style: STYLES[0] }));
  const turned = specs.map((s) => ({
    ...s,
    x: 2 + (s.z - 4),
    z: 4 - (s.x - 2) - 1,
  }));
  for (const camera of CAMERAS) {
    const a = build(specs, camera, { group: "g" }).getFaces({
      transforms: { g: { rotate: [0, 90, 0], origin: [2, 0, 4] } },
    });
    const b = build(turned, camera, { group: "g" }).getFaces();
    // The turned faces keep their own names, so compare shapes only
    const strip = (fs) => fs.map((f) => ({ ...f, style: { fill: "x" } }));
    sameSets(`rotate 90° run ${run} (${camName(camera)})`, strip(a), strip(b));
  }
}

// ─── The whole scene's transform ───
// = every voxel in one group moved the same way; and after a group's own
// transform = that group moved by both.
const mul = (a, b) => {
  const out = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++)
      out.push(
        a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + (c === 3 ? a[r * 4 + 3] : 0),
      );
  return out;
};
for (let run = 0; run < 12; run++) {
  const specs = randomSpecs({ odd: run % 2 === 0 });
  const scene = randomTransform();
  const own = randomTransform();
  const clip = run % 3 ? randomClip() : undefined;
  for (const camera of CAMERAS) {
    const name = `run ${run} (${camName(camera)})`;
    sameSets(
      `scene transform = one group ${name}`,
      build(specs, camera).getFaces({ transform: scene, clip }),
      build(specs, camera, { group: "all" }).getFaces({ transforms: { all: scene }, clip }),
    );
    const mixed = specs.map((s, i) => ({ ...s, group: i % 3 ? undefined : "g" }));
    const named = mixed.map((s) => ({ ...s, group: s.group || "rest" }));
    sameSets(
      `group then scene ${name}`,
      build(mixed, camera).getFaces({ transform: scene, transforms: { g: own }, clip }),
      build(named, camera).getFaces({
        transforms: {
          g: { matrix: mul(toMatrix(scene), toMatrix(own)) },
          rest: scene,
        },
        clip,
      }),
    );
  }
}
{
  const specs = randomSpecs();
  for (const camera of CAMERAS) {
    const h = build(specs, camera);
    sameSets(
      `identity scene transform (${camName(camera)})`,
      h.getFaces({ transform: { rotate: [0, 0, 0] } }),
      h.getFaces(),
    );
  }
}

// ─── renderTest, findByPosition and getVoxelInfo take them too ───
for (let run = 0; run < 10; run++) {
  // cubes only: renderTest has no slopes
  const specs = randomSpecs({ slopes: false }).map((s) => ({ ...s, style: STYLES[0] }));
  const cells = new Set(specs.map((s) => `${s.x},${s.y},${s.z}`));
  const test = (x, y, z) => cells.has(`${x},${y},${z}`);
  const bounds = [
    [-3, -4, 0],
    [10, 6, 12],
  ];
  const transform = randomTransform();
  const clip = randomClip();
  for (const camera of CAMERAS) {
    const name = `run ${run} (${camName(camera)})`;
    const stored = build(specs, camera);
    const free = new Heerich({ tile: 20, camera });
    const style = STYLES[0];
    sameSets(
      `renderTest transform ${name}`,
      free.renderTest({ bounds, test, style, transform }),
      stored.getFaces({ transform }),
    );
    sameSets(
      `renderTest clip ${name}`,
      free.renderTest({ bounds, test, style, transform, clip }),
      stored.getFaces({ transform, clip, caps: false }),
    );
    // the frontmost drawn face is what findByPosition finds at its middle
    const drawn = stored.getFaces({ transform, clip });
    const top = drawn[drawn.length - 1];
    if (top && top.points.length >= 3) {
      const d = top.points.data;
      let x = 0,
        y = 0;
      for (let i = 0; i < d.length; i += 2) {
        x += d[i];
        y += d[i + 1];
      }
      const n = d.length / 2;
      const hit = stored.findByPosition([x / n, y / n], { transform, clip });
      check(
        `findByPosition finds the drawn face ${name}`,
        hit && hit.voxel === top.voxel && hit.face.type === top.type,
      );
      const info = stored.getVoxelInfo(top.voxel, { transform, clip });
      const m = toMatrix(transform);
      const v = top.voxel;
      const want = stored.project(apply(m, [v.x + 0.5, v.y + 0.5, v.z + 0.5]));
      check(
        `getVoxelInfo centre where drawn ${name}`,
        Math.abs(info.center2D.x - want.x) < 1e-3 && Math.abs(info.center2D.y - want.y) < 1e-3,
      );
      check(`getVoxelInfo bounds from drawn faces ${name}`, !!info.bounds2D);
    }
  }
}

// ─── 5 + 6. No holes, nothing outside, walls on their planes ───
// Inside a voxel's solid: count crossings of a ray with its faces.
function insideSolid(faces, p) {
  const dir = [0.5718, 0.3112, 0.7593]; // not along any face
  let hits = 0;
  for (const f of faces) {
    // fan into triangles (faces are convex)
    for (let i = 1; i + 1 < f.length; i++) {
      if (rayHits(p, dir, f[0], f[i], f[i + 1])) hits++;
    }
  }
  return hits % 2 === 1;
}
function rayHits(o, d, a, b, c) {
  const e1 = sub(b, a),
    e2 = sub(c, a);
  const pv = crs(d, e2);
  const det = dot(e1, pv);
  if (Math.abs(det) < 1e-12) return false;
  const tv = sub(o, a);
  const u = dot(tv, pv) / det;
  if (u < 0 || u > 1) return false;
  const qv = crs(tv, e1);
  const v = dot(d, qv) / det;
  if (v < 0 || u + v > 1) return false;
  return dot(e2, qv) / det > 1e-9;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function inPolygon(d, x, y) {
  let c = false;
  const n = d.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = d[i * 2],
      yi = d[i * 2 + 1],
      xj = d[j * 2],
      yj = d[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// Close to a polygon's edge counts as on it (points on shared edges)
function nearPolygon(d, x, y, tol) {
  if (inPolygon(d, x, y)) return true;
  const n = d.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = d[j * 2],
      ay = d[j * 2 + 1],
      bx = d[i * 2],
      by = d[i * 2 + 1];
    const vx = bx - ax,
      vy = by - ay;
    const l = vx * vx + vy * vy;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l)) : 0;
    if (Math.hypot(ax + vx * t - x, ay + vy * t - y) < tol) return true;
  }
  return false;
}

function randomClip() {
  const list = [];
  const kinds = rnd(4);
  if (kinds !== 1) {
    // a box with bounds anywhere
    const min = [rand() * 3 - 0.5, -2 + rand() * 2, 2 + rand() * 3];
    list.push({
      min,
      max: [min[0] + 0.6 + rand() * 4, min[1] + 0.6 + rand() * 4, min[2] + 0.6 + rand() * 4],
    });
  }
  if (kinds !== 0) {
    // planes at any angle
    for (let i = 0; i < 1 + rnd(3); i++) {
      list.push({
        point: [rand() * 5, rand() * 3 - 1.5, 2 + rand() * 5],
        normal: [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1],
      });
    }
  }
  return list;
}
function randomTransform() {
  return {
    translate: [rand() * 2 - 1, rand() * 2 - 1, rand() * 2],
    rotate: [rnd(4) ? 0 : rand() * 60 - 30, rand() * 360, rnd(3) ? 0 : rand() * 40 - 20],
    scale: rnd(4) ? 1 : [0.6 + rand() * 0.8, 0.6 + rand() * 0.8, rnd(2) ? -1 : 1],
    origin: [2, 0, 4],
  };
}

let sampled = 0;
for (let run = 0; run < 150; run++) {
  const specs = randomSpecs({ odd: true }).map((s) => ({ ...s, group: rnd(3) === 0 ? "m" : undefined }));
  const clip = run % 5 === 4 ? undefined : randomClip();
  const transforms = rnd(2) ? { m: randomTransform() } : undefined;
  const transform = rnd(3) === 0 ? randomTransform() : undefined;
  if (!clip && !transforms && !transform) continue;
  const planes = clip ? toPlanes(clip) : [];
  const st = transform ? toMatrix(transform) : null;
  const gt = transforms ? toMatrix(transforms.m) : null;
  // where a voxel's points go: its group's move, then the scene's
  const moveFor = (voxel) => {
    const g = voxel.group === "m" ? gt : null;
    if (g && st) return mul(st, g);
    return g || st;
  };
  for (const camera of CAMERAS) {
    const h = build(specs, camera);
    const faces = h.getFaces({ clip, transforms, transform });
    const name = `run ${run} (${camName(camera)})`;
    // 6: nothing outside, walls on a plane, no broken points
    let bad = "";
    for (const f of faces) {
      if (f.type === "content") continue;
      if (Array.from(f.points.data).some((v) => !Number.isFinite(v))) {
        bad = "non-finite point";
        break;
      }
      for (const v of f.vertices) {
        for (const pl of planes) if (dist(pl, v) < -1e-6) bad = `point outside clip ${v}`;
      }
      if (f.cap && !planes.some((pl) => f.vertices.every((v) => Math.abs(dist(pl, v)) < 1e-6)))
        bad = "wall off its plane";
      if (bad) break;
    }
    check(`kept inside ${name}`, !bad, bad);
    // 5: sample points inside each kept voxel's solid, inset from the cut
    // and from cell edges, and look for a face over each
    const polys = faces.filter((f) => f.points).map((f) => f.points.data);
    let holes = 0,
      tried = 0,
      example = "";
    for (const voxel of h.voxels.values()) {
      let solid = h._solidFaces(voxel);
      const m = moveFor(voxel);
      if (m) solid = solid.map((f) => f.map((p) => apply(m, p)));
      for (let k = 0; k < 3; k++) {
        const local = [
          voxel.x + 0.08 + rand() * 0.84,
          voxel.y + 0.08 + rand() * 0.84,
          voxel.z + 0.08 + rand() * 0.84,
        ];
        const p = m ? apply(m, local) : local;
        if (planes.some((pl) => dist(pl, p) < 0.02)) continue;
        if (!insideSolid(solid, p)) continue;
        tried++;
        const q = h.project(p);
        if (!polys.some((d) => nearPolygon(d, q.x, q.y, 0.05))) {
          holes++;
          if (!example) {
            example = `voxel ${voxel.x},${voxel.y},${voxel.z} ${voxel.slope || "cube"} at ${p.map((v) => v.toFixed(2))}`;
            if (process.env.DEBUG) {
              const nb = [];
              for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
                const v = h.getVoxel([voxel.x + dx, voxel.y + dy, voxel.z + dz]);
                if (v) nb.push(`${dx},${dy},${dz}:${v.slope || "cube"}${v.scale ? " scale" : ""}${v.gap ? " gap" : ""}${v.group ? " g" : ""}`);
              }
              example += ` [self scale=${!!voxel.scale} gap=${!!voxel.gap} group=${voxel.group}] clip=${JSON.stringify(clip)} tf=${!!transforms} nb=${nb.join(" ")}`;
            }
          }
        }
      }
    }
    sampled += tried;
    check(`no holes ${name}`, holes === 0, `${holes}/${tried} points uncovered, e.g. ${example}`);
  }
}
check("sampled enough points", sampled > 12000, `${sampled}`);

// Walls show only where the cut faces the camera, and nothing drawn faces
// away from it: every face drawn faces the camera.
for (let run = 0; run < 20; run++) {
  const specs = randomSpecs().map((s) => ({ ...s, group: run % 2 ? "m" : undefined }));
  const clip = randomClip();
  const transforms = { m: randomTransform() };
  for (const camera of CAMERAS) {
    const h = build(specs, camera);
    const r = h.renderOptions;
    for (const f of h.getFaces({ clip, transforms })) {
      if (f.type === "content") continue;
      let toward;
      if (r.projection === "perspective")
        toward = dot(sub([r.cameraX, r.cameraY, -r.cameraDistance], f.c), f.n);
      else if (r.projection === "oblique")
        toward = -(f.n[2] - (f.n[0] * r.depthOffsetX) / r.tileW - (f.n[1] * r.depthOffsetY) / r.tileH);
      else
        toward = -dot(
          [Math.sin(r.angle) * Math.cos(r.pitch), Math.sin(r.pitch), Math.cos(r.angle) * Math.cos(r.pitch)],
          f.n,
        );
      if (!(toward > -1e-9)) {
        check(`faces the camera run ${run} (${camName(camera)})`, false, `${f.type}${f.cap ? " (wall)" : ""} n=${f.n}`);
        break;
      }
    }
  }
}

// Two groups side by side, unmoved, still cover everything (their shared
// walls are drawn), and moving one apart shows the walls between them.
{
  const specs = [];
  for (let x = 0; x < 4; x++)
    for (let z = 2; z < 5; z++) specs.push({ x, y: 0, z, style: STYLES[0], group: x < 2 ? "a" : "b" });
  // angle 315 sees the right sides
  const h = build(specs, { type: "isometric", angle: 315 });
  const alone = build(specs.map((s) => ({ ...s, group: undefined })), { type: "isometric", angle: 315 });
  check("groups draw their shared walls", h.getFaces().length > alone.getFaces().length);
  const apart = h.getFaces({ transforms: { b: { translate: [1.5, 0, 0] } } });
  check(
    "moved group shows the wall between",
    apart.some((f) => f.voxel.group === "a" && f.type === "right"),
  );
}

// ─── 7. Renderers write every point ───
{
  const h = new Heerich({ tile: 10, camera: { type: "oblique", angle: 45, distance: 10 } });
  h.addGeometry({ type: "box", position: [0, 0, 0], size: 2 });
  const clip = [{ point: [1, 0, 0.5], normal: [-1, 0, -1] }]; // cuts corners off quads
  const faces = h.getFaces({ clip });
  const big = faces.find((f) => f.points.length > 4);
  check("a cut face has more than four points", !!big);
  const svg = h.toSVG({ clip });
  const counts = [...svg.matchAll(/points="([^"]+)"/g)].map((m) => m[1].trim().split(/\s+/).length);
  check("toSVG writes them all", counts.some((n) => n > 4) && counts.length === faces.length);

  // updateSVG on a tiny fake DOM
  class El {
    constructor(doc, tag) {
      this.ownerDocument = doc;
      this.tagName = tag;
      this.attrs = new Map();
      this.children = [];
    }
    setAttribute(k, v) {
      this.attrs.set(k, String(v));
    }
    removeAttribute(k) {
      this.attrs.delete(k);
    }
    appendChild(c) {
      c.parentNode = this;
      this.children.push(c);
      return c;
    }
    removeChild(c) {
      this.children.splice(this.children.indexOf(c), 1);
      return c;
    }
    replaceChild(n, o) {
      this.children[this.children.indexOf(o)] = n;
      return o;
    }
    set innerHTML(v) {}
  }
  const doc = { createElementNS: (_ns, tag) => new El(doc, tag) };
  const root = new El(doc, "g");
  h.updateSVG(root, { clip });
  const written = root.children[0].children.map((p) => p.attrs.get("points").split(" ").length);
  check("updateSVG writes them all", written.some((n) => n > 4) && written.length === faces.length);
}

// ─── Decals on cut faces: laid on the whole face, clipped to the cut ───
{
  const h = new Heerich({ tile: 40, camera: { type: "oblique", angle: 45, distance: 15 } });
  h.defineDecal("x", '<path d="M0 0 L1 1 M1 0 L0 1" fill="none" stroke="#000"/>');
  h.addGeometry({ type: "box", position: [0, 0, 2], size: 1, style: { front: { decal: "x" } } });
  const decalPath = (svg) => svg.match(/<path d="([^"]+)"/)?.[1];
  const whole = h.toSVG();
  const cut = h.toSVG({ clip: { min: [0.3, -9, -9], max: [9, 9, 9] } });
  check("cut face keeps its decal", !!decalPath(cut));
  check("decal laid on the whole face", decalPath(cut) === decalPath(whole), `${decalPath(cut)} vs ${decalPath(whole)}`);
  check("decal clipped to the cut", /<clipPath id="heerich-cut-\d+"><polygon/.test(cut) && /clip-path="url\(#heerich-cut-/.test(cut));
  check("uncut face isn't clipped", !/clipPath/.test(whole));
  // a cut leaving five corners still gets its decal
  const five = h.toSVG({ clip: [{ point: [0.3, 0.3, 2], normal: [1, 1, 0] }] });
  check("five-cornered cut keeps its decal", !!decalPath(five));
  // walls don't take the face's decal
  h.addGeometry({ type: "box", position: [3, 0, 2], size: 1, style: { default: { decal: "x" } } });
  const walls = h.getFaces({ clip: { min: [-9, -9, 2.5], max: [9, 9, 9] } }).filter((f) => f.cap);
  check("walls have no decal", walls.length > 0 && walls.every((f) => !f.style.decal));
}

// ─── 8. Errors, JSON, styles ───
{
  const h = new Heerich();
  h.addGeometry({ type: "box", position: [0, 0, 2], size: 2, group: "g" });
  const throws = (fn) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  check("clip with raw throws", throws(() => h.getFaces({ raw: true, clip: { min: [0, 0, 0], max: [1, 1, 1] } })));
  check("plane without normal throws", throws(() => h.getFaces({ clip: [{ point: [0, 0, 0], normal: [0, 0, 0] }] })));
  check("unknown clip throws", throws(() => h.getFaces({ clip: [{ foo: 1 }] })));
  check("short matrix throws", throws(() => h.getFaces({ transforms: { g: { matrix: [1, 0, 0] } } })));

  const back = Heerich.fromJSON(JSON.parse(JSON.stringify(h.toJSON())));
  check("group survives JSON", [...back.voxels.values()].every((v) => v.group === "g"));

  check("clipBox gives six planes", Heerich.clipBox([0, 0, 0], [1, 1, 1]).length === 6);

  const s = new Heerich({ camera: { type: "oblique", angle: 45, distance: 10 } });
  s.addGeometry({
    type: "box",
    position: [0, 0, 2],
    size: 3,
    style: { default: { fill: "#111" }, front: { fill: "#222" }, cap: { fill: "#f0f" } },
  });
  s.addGeometry({ type: "box", position: [4, 0, 2], size: 3, style: { default: { fill: "#111" }, front: { fill: "#222" } } });
  const walls = s.getFaces({ clip: { min: [-1, -1, 3.5], max: [9, 9, 9] } }).filter((f) => f.cap);
  check("walls drawn", walls.length > 0);
  check("cap style used", walls.filter((f) => f.voxel.x < 3).every((f) => f.style.fill === "#f0f"));
  check("side style otherwise", walls.filter((f) => f.voxel.x >= 4).every((f) => f.style.fill === "#222"));
  check(
    "caps: false draws none",
    !s.getFaces({ clip: { min: [-1, -1, 3.5], max: [9, 9, 9] }, caps: false }).some((f) => f.cap),
  );
}

if (failures.length) {
  console.error(`${failures.length} failure(s):`);
  for (const f of failures.slice(0, 40)) console.error("  " + f);
  process.exit(1);
}
console.log(`clip ok (${sampled} points sampled)`);
