// Clip planes and group transforms: the geometry applied to 3D faces after
// they are built and before they are projected. Pure functions, no engine
// state, so they can be tested on their own.

/**
 * A clip plane: keeps the side its normal points into.
 * @typedef {Object} ClipPlane
 * @property {[number,number,number]} point - Any point on the plane
 * @property {[number,number,number]} normal - Points into the kept side (any length)
 */

/**
 * A box to keep, from its two corners.
 * @typedef {Object} ClipBox
 * @property {[number,number,number]} min
 * @property {[number,number,number]} max
 */

/**
 * What to keep: a box, a plane, or a list of them (kept where inside all).
 * @typedef {ClipBox|ClipPlane|Array<ClipBox|ClipPlane>} ClipOption
 */

/**
 * A group's transform: scale, then rotate (degrees, about x, then y, then z),
 * then translate, all around `origin`. Or a 3×4 `matrix`, row-major
 * [a, b, c, tx,  d, e, f, ty,  g, h, i, tz], used as given.
 * @typedef {Object} GroupTransform
 * @property {[number,number,number]} [translate]
 * @property {[number,number,number]} [rotate] - Degrees about x, y, z
 * @property {number|[number,number,number]} [scale]
 * @property {[number,number,number]} [origin=[0,0,0]] - Point that rotate and scale turn around
 * @property {number[]} [matrix] - 12 numbers; overrides the others
 */

/** Distance below which a point counts as on a plane. */
export const CLIP_EPS = 1e-9;

/**
 * The six planes keeping the inside of a box.
 * @param {[number,number,number]} min
 * @param {[number,number,number]} max
 * @returns {ClipPlane[]}
 */
export function clipBox(min, max) {
  return [
    { point: [min[0], 0, 0], normal: [1, 0, 0] },
    { point: [max[0], 0, 0], normal: [-1, 0, 0] },
    { point: [0, min[1], 0], normal: [0, 1, 0] },
    { point: [0, max[1], 0], normal: [0, -1, 0] },
    { point: [0, 0, min[2]], normal: [0, 0, 1] },
    { point: [0, 0, max[2]], normal: [0, 0, -1] },
  ];
}

/**
 * Normalise a clip option into planes `{ n, d }` with unit `n`: a point p is
 * kept where n·p − d ≥ 0.
 * @param {ClipOption} clip
 * @returns {{n: number[], d: number}[]}
 */
export function toPlanes(clip) {
  const list = Array.isArray(clip) ? clip : [clip];
  const planes = [];
  for (const c of list) {
    if (!c) continue;
    if (c.min && c.max) {
      for (const p of clipBox(c.min, c.max)) planes.push(plane(p));
    } else if (c.normal && c.point) {
      planes.push(plane(c));
    } else {
      throw new Error(
        "Heerich: a clip is a { min, max } box or a { point, normal } plane",
      );
    }
  }
  return planes;
}

function plane({ point, normal }) {
  const len = Math.hypot(normal[0], normal[1], normal[2]);
  if (!(len > 0)) throw new Error("Heerich: a clip plane needs a normal");
  const n = [normal[0] / len, normal[1] / len, normal[2] / len];
  return { n, d: n[0] * point[0] + n[1] * point[1] + n[2] * point[2] };
}

/** Signed distance of p from a plane: ≥ 0 inside. */
export function dist(pl, p) {
  return pl.n[0] * p[0] + pl.n[1] * p[1] + pl.n[2] * p[2] - pl.d;
}

/**
 * Keep the part of a convex polygon inside a plane (Sutherland–Hodgman).
 * Points on the plane count as inside.
 * @param {number[][]} pts - 3D points
 * @param {{n: number[], d: number}} pl
 * @returns {number[][]}
 */
export function clipToPlane(pts, pl) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i],
      q = pts[(i + 1) % n];
    const dp = dist(pl, p),
      dq = dist(pl, q);
    if (dp >= -CLIP_EPS) out.push(p);
    if (dp >= -CLIP_EPS !== dq >= -CLIP_EPS) {
      const t = dp / (dp - dq);
      out.push([
        p[0] + (q[0] - p[0]) * t,
        p[1] + (q[1] - p[1]) * t,
        p[2] + (q[2] - p[2]) * t,
      ]);
    }
  }
  return out;
}

/**
 * Drop repeated corners (a triangle is stored as a quad with one twice), and
 * corners in line with their neighbours. Null if no area is left.
 * @param {number[][]} pts
 * @param {number} [eps=1e-9] - Corners closer than this on every axis merge
 * @returns {number[][]|null}
 */
export function tidy(pts, eps = 1e-9) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || !same(p, q, eps)) out.push(p);
  }
  while (out.length > 1 && same(out[0], out[out.length - 1], eps)) out.pop();
  for (let i = 0; out.length > 2 && i < out.length;) {
    const a = out[(i + out.length - 1) % out.length],
      b = out[i],
      c = out[(i + 1) % out.length];
    if (crossLen(a, b, c) < 1e-12) out.splice(i, 1);
    else i++;
  }
  return out.length >= 3 ? out : null;
}

function same(a, b, eps) {
  return (
    Math.abs(a[0] - b[0]) < eps &&
    Math.abs(a[1] - b[1]) < eps &&
    Math.abs(a[2] - b[2]) < eps
  );
}

function crossLen(a, b, c) {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2];
  const vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/**
 * Where a closed solid crosses a plane: its outline there, as a loop of 3D
 * points, or null. The solid is given by its faces (convex polygons), all of
 * them, hidden or not. Each face that crosses gives one segment; the segments
 * are chained into the loop.
 * @param {number[][][]} faces - Each a list of 3D points
 * @param {{n: number[], d: number}} pl
 * @returns {number[][]|null}
 */
export function section(faces, pl) {
  const segs = [];
  for (const verts of faces) {
    const pts = [];
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const p = verts[i],
        q = verts[(i + 1) % n];
      const dp = dist(pl, p),
        dq = dist(pl, q);
      // on the plane counts as inside, as in clipToPlane, so each edge is
      // crossed at most once and a convex face gives 0 or 2 points
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        pts.push([
          p[0] + (q[0] - p[0]) * t,
          p[1] + (q[1] - p[1]) * t,
          p[2] + (q[2] - p[2]) * t,
        ]);
      }
    }
    if (pts.length === 2 && !near(pts[0], pts[1])) segs.push(pts);
  }
  if (segs.length < 3) return null;
  const loop = [...segs.pop()];
  while (segs.length) {
    const end = loop[loop.length - 1];
    const i = segs.findIndex((g) => near(g[0], end) || near(g[1], end));
    if (i < 0) return hullOnPlane(loop.concat(segs.flat()), pl);
    const [g] = segs.splice(i, 1);
    loop.push(near(g[0], end) ? g[1] : g[0]);
  }
  if (near(loop[0], loop[loop.length - 1])) loop.pop();
  return tidy(loop);
}

function near(a, b) {
  return (
    Math.abs(a[0] - b[0]) < 1e-7 &&
    Math.abs(a[1] - b[1]) < 1e-7 &&
    Math.abs(a[2] - b[2]) < 1e-7
  );
}

// Fallback when segments don't chain (a solid that isn't closed): the
// convex hull of the crossing points, in the plane.
function hullOnPlane(pts, pl) {
  const n = pl.n;
  const u = Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]);
  const ul = Math.hypot(...u);
  u[0] /= ul;
  u[1] /= ul;
  u[2] /= ul;
  const v = cross(n, u);
  const flat = pts.map((p) => [
    p[0] * u[0] + p[1] * u[1] + p[2] * u[2],
    p[0] * v[0] + p[1] * v[1] + p[2] * v[2],
    p,
  ]);
  flat.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (
        out.length >= 2 &&
        turn(out[out.length - 2], out[out.length - 1], p) <= 0
      )
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  const hull = [...half(flat), ...half([...flat].reverse())].map((h) => h[2]);
  return tidy(hull);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * A group transform as a 3×4 matrix, row-major.
 * @param {GroupTransform} t
 * @returns {number[]}
 */
export function toMatrix(t) {
  if (t.matrix) {
    if (t.matrix.length !== 12)
      throw new Error("Heerich: a transform matrix has 12 numbers (3×4)");
    return t.matrix.slice();
  }
  const o = t.origin || [0, 0, 0];
  const s =
    t.scale === undefined
      ? [1, 1, 1]
      : typeof t.scale === "number"
        ? [t.scale, t.scale, t.scale]
        : t.scale;
  const [rx, ry, rz] = (t.rotate || [0, 0, 0]).map((a) => (a * Math.PI) / 180);
  const cx = Math.cos(rx),
    sx = Math.sin(rx),
    cy = Math.cos(ry),
    sy = Math.sin(ry),
    cz = Math.cos(rz),
    sz = Math.sin(rz);
  // R = Rz · Ry · Rx (about x first), then times the scale
  const R = [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
  const tr = t.translate || [0, 0, 0];
  const m = [];
  for (let r = 0; r < 3; r++) {
    const a = R[r][0] * s[0],
      b = R[r][1] * s[1],
      c = R[r][2] * s[2];
    // p' = A (p − o) + o + translate
    m.push(a, b, c, o[r] - (a * o[0] + b * o[1] + c * o[2]) + tr[r]);
  }
  return m;
}

/** Apply a 3×4 matrix to a point. */
export function apply(m, p) {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  ];
}

/**
 * The matrix that turns normals: the inverse transpose of the 3×3 part, as
 * its cofactors (so a flat scale of 0 doesn't divide by zero). Results are
 * normalised where used, so the determinant's size doesn't matter; its sign
 * does, and cofactors keep it for a mirror (a negative determinant flips them
 * back the right way in `turnNormal`).
 * @param {number[]} m
 * @returns {{c: number[], det: number}}
 */
export function normalMatrix(m) {
  const [a, b, c, , d, e, f, , g, h, i] = m;
  const C = [
    e * i - f * h,
    f * g - d * i,
    d * h - e * g,
    c * h - b * i,
    a * i - c * g,
    b * g - a * h,
    b * f - c * e,
    c * d - a * f,
    a * e - b * d,
  ];
  const det = a * C[0] + b * C[1] + c * C[2];
  return { c: C, det };
}

/** Turn a unit normal by a normal matrix; null if it collapses. */
export function turnNormal(nm, n) {
  const C = nm.c;
  const s = nm.det < 0 ? -1 : 1;
  const x = s * (C[0] * n[0] + C[1] * n[1] + C[2] * n[2]),
    y = s * (C[3] * n[0] + C[4] * n[1] + C[5] * n[2]),
    z = s * (C[6] * n[0] + C[7] * n[1] + C[8] * n[2]);
  const len = Math.hypot(x, y, z);
  return len > 0 ? [x / len, y / len, z / len] : null;
}

/** The face name whose outward normal is closest to n. */
export function sideOf(n) {
  const ax = Math.abs(n[0]),
    ay = Math.abs(n[1]),
    az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return n[1] < 0 ? "top" : "bottom";
  if (ax >= az) return n[0] < 0 ? "left" : "right";
  return n[2] < 0 ? "front" : "back";
}
