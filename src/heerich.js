import { SVGRenderer, computeBounds } from "./svg-renderer.js";
import { prepareDecalContent } from "./decal-warp.js";
import { Points } from "./points.js";
import { boxCoords, sphereCoords, lineCoords, fillCoords } from "./shapes.js";

export { boxCoords, sphereCoords, lineCoords, fillCoords };
export { SVGRenderer } from "./svg-renderer.js";
export { GPURenderer } from "./gpu-renderer.js";

/**
 * Axis style shorthands → the two faces they paint. Used by `_resolveStyles`
 * so a style object can target both faces of an axis at once (e.g. `x` paints
 * `left` + `right`).
 * @type {Record<'x'|'y'|'z', string[]>}
 */
const AXIS_FACES = {
  x: ["left", "right"],
  y: ["top", "bottom"],
  z: ["front", "back"],
};

/**
 * @typedef {Object} StyleObject
 * @property {string} [fill] - Fill color
 * @property {string} [stroke] - Stroke color
 * @property {number} [strokeWidth] - Stroke width
 * @property {number} [opacity] - Overall opacity
 * @property {number} [fillOpacity] - Fill opacity
 * @property {number} [strokeOpacity] - Stroke opacity
 * @property {string} [strokeDasharray] - Dash pattern
 * @property {string} [strokeLinecap] - Line cap style
 * @property {string} [strokeLinejoin] - Line join style
 * @property {string|DecalRef} [decal] - Decal name or decal reference object
 * @property {import('./hatch.js').HatchOptions} [hatch] - Hatching lines drawn over the face
 */

/**
 * @typedef {Object} DecalRef
 * @property {string} name - Decal name (as registered via defineDecal)
 * @property {Object} [style] - Style overrides applied to the <use> element
 */

/**
 * @typedef {Object} DecalDef
 * @property {string} content - SVG markup containing one or more <path> elements in 0–1 unit space.
 *   Only <path> elements are supported — other shapes (circle, rect, etc.) must be converted to paths first.
 */

/**
 * @typedef {Object} FaceStyleMap
 * @property {StyleObject | ((x: number, y: number, z: number) => StyleObject)} [default]
 * @property {StyleObject | ((x: number, y: number, z: number) => StyleObject)} [top]
 * @property {StyleObject | ((x: number, y: number, z: number) => StyleObject)} [bottom]
 * @property {StyleObject | ((x: number, y: number, z: number) => StyleObject)} [left]
 * @property {StyleObject | ((x: number, y: number, z: number) => StyleObject)} [right]
 * @property {StyleObject | ((x: number, y: number, z: number) => StyleObject)} [front]
 * @property {StyleObject | ((x: number, y: number, z: number) => StyleObject)} [back]
 * @property {StyleObject | ((x: number, y: number, z: number) => StyleObject)} [slope] - Slanted face of slope voxels (falls back to `top`)
 */

/**
 * @typedef {FaceStyleMap | ((x: number, y: number, z: number) => FaceStyleMap)} StyleParam
 * Per-face style map or a function that returns one.
 * Values can be StyleObjects or `(x,y,z) => StyleObject` callbacks.
 */

/**
 * @typedef {'union'|'subtract'|'intersect'|'exclude'} BooleanMode
 */

/**
 * @typedef {Object} RotateOptions
 * @property {'x'|'y'|'z'} axis - Rotation axis
 * @property {number} turns - Number of 90-degree turns (1-3)
 * @property {[number,number,number]} [center] - Rotation center (defaults to bounding-box center)
 */

/**
 * @typedef {Object} Voxel
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {Object} [styles] - Per-face resolved styles
 * @property {string} [content] - SVG content to embed
 * @property {boolean} [opaque] - Whether this voxel occludes neighbors (default true)
 * @property {Object} [meta] - Arbitrary key-value pairs for data-* attributes
 * @property {[number,number,number]} [scale] - Per-axis scale factors [sx, sy, sz] (0-1)
 * @property {[number,number,number]} [scaleOrigin] - Scale transform origin within voxel
 * @property {SlopeDir} [slope] - Wedge rising toward this direction instead of a full cube
 */

/**
 * @typedef {'top'|'bottom'|'left'|'right'|'front'|'back'|'slope'|'content'} FaceType
 */

/**
 * @typedef {string | {side: string, from?: number, to?: number} | {corners: number[], ceiling?: boolean}} SlopeDir
 * Slope shape: a ramp rising toward `'+x'`, `'-x'`, `'+z'` or `'-z'`; an outer
 * or inner corner whose high side faces two directions, e.g. `'outer+x+z'`,
 * `'inner-x+z'`; or `'tip'`, a pyramid peak. Prefix any with `'ceiling:'` to
 * hang it upside down. `{ corners: [h00, h10, h01, h11] }` sets the top's
 * height at each corner (`ceiling: true` hangs it), stored as `'c:…'`.
 * `{ side: '+x', from: 0.5, to: 1 }` is a piece between
 * two heights (fractions of the cell; any piece), stored as `'+x:0.5:1'`.
 */

/**
 * @typedef {Object} CameraOptions
 * @property {'oblique'|'perspective'|'orthographic'|'isometric'} [type='oblique'] - Projection type
 * @property {number} [angle=45] - Oblique: depth axis direction. Orthographic/isometric: horizontal rotation (pan).
 * @property {number} [pitch=35.264] - Orthographic only: vertical tilt in degrees
 * @property {number} [distance=15] - Oblique/perspective: camera distance
 * @property {[number,number]} [position] - Perspective camera position [x, y]
 */

/**
 * @typedef {Object} FitFrame
 * @property {[number,number,number]} pivot - The 3D point the shape turns around
 * @property {number} frontZ - The depth an oblique camera holds still instead of the pivot's: the camera-facing plane
 * @property {number} width - Frame width in pixels, without padding
 * @property {number} height - Frame height in pixels, without padding
 */

/**
 * @typedef {Object} Face
 * @property {FaceType} type - Face name
 * @property {Voxel} voxel - Source voxel data
 * @property {import('./points.js').Points} points - Projected 2D polygon points
 * @property {number} depth - Depth value for sorting
 * @property {StyleObject} [style] - Resolved style for this face
 * @property {[number,number,number][]} [vertices] - 3D polygon vertices (before projection)
 * @property {[number,number,number]} [n] - Face normal vector (perspective/orthographic only)
 * @property {[number,number,number]} [c] - Face center point in 3D (perspective/orthographic only)
 * @property {string} [content] - SVG content string (content faces only)
 * @property {[number,number,number]} [_pos] - Original 3D position (content faces only)
 * @property {number} [_px] - Projected 2D x (content faces only)
 * @property {number} [_py] - Projected 2D y (content faces only)
 * @property {number} [_scale] - Perspective scale factor (content faces only)
 */

/**
 * Test whether a point (px, py) lies inside a convex polygon described by a Points instance.
 * Uses the cross-product sign method — O(n) on the number of vertices.
 * @param {number} px
 * @param {number} py
 * @param {import('./points.js').Points} points
 * @returns {boolean}
 */
function _pointInConvexPoly(px, py, points) {
  const d = points.data;
  const n = d.length >> 1;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = d[j * 2] - d[i * 2];
    const ey = d[j * 2 + 1] - d[i * 2 + 1];
    const cross = ex * (py - d[i * 2 + 1]) - ey * (px - d[i * 2]);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return sign !== 0;
}

/** Neighbor offsets: [dx, dy, dz, exposedFace] */
/** @type {[number, number, number, string][]} */
const ADJ = [
  [0, -1, 0, "bottom"],
  [0, 1, 0, "top"],
  [-1, 0, 0, "right"],
  [1, 0, 0, "left"],
  [0, 0, -1, "back"],
  [0, 0, 1, "front"],
];

/** The face on the other side of a shared cell wall. */
const OPPOSITE = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
  front: "back",
  back: "front",
};

/** Axis-aligned unit normal → face name. */
const NORMAL_FACE = {
  "1,0,0": "right",
  "-1,0,0": "left",
  "0,-1,0": "top",
  "0,1,0": "bottom",
  "0,0,-1": "front",
  "0,0,1": "back",
};

/**
 * Slope shapes, authored once in local coords (a, y, b) — y = 0 at the top of
 * the cell, y = 1 at its floor — and turned into the four directions by the
 * maps below. Every shape has a full floor.
 *
 * - ramp  (`'+x'`): rises toward a; full wall at a = 1, open at a = 0.
 * - outer (`'outer+x+z'`): two ramps intersected; only the corner a = b = 1
 *   reaches the top. Caps the outside corner where two ramps meet.
 * - inner (`'inner+x+z'`): two ramps joined; only the corner a = b = 0 stays
 *   low. Fills the inside corner where two ramps meet.
 * - tip   (`'tip'`): a pyramid with its apex at the top centre.
 *
 * Triangles are listed with 3 vertices; `_slopeShape` repeats the last one so
 * every face stays a quad for the projectors, renderers and decal warping.
 */
const SLOPE_LOCAL = {
  ramp: {
    inside: [0.75, 0.75, 0.5],
    faces: [
      [
        [0, 1, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 1, 1],
      ],
      [
        [1, 0, 0],
        [1, 0, 1],
        [1, 1, 1],
        [1, 1, 0],
      ],
      [
        [0, 1, 0],
        [1, 1, 0],
        [1, 0, 0],
      ],
      [
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
      ],
    ],
  },
  outer: {
    inside: [0.8, 0.9, 0.8],
    faces: [
      [
        [0, 1, 0],
        [0, 1, 1],
        [1, 0, 1],
      ],
      [
        [0, 1, 0],
        [1, 0, 1],
        [1, 1, 0],
      ],
      [
        [1, 1, 0],
        [1, 1, 1],
        [1, 0, 1],
      ],
      [
        [1, 1, 1],
        [0, 1, 1],
        [1, 0, 1],
      ],
    ],
  },
  inner: {
    inside: [0.75, 0.75, 0.75],
    faces: [
      [
        [0, 1, 0],
        [1, 0, 0],
        [1, 0, 1],
      ],
      [
        [0, 1, 0],
        [1, 0, 1],
        [0, 0, 1],
      ],
      [
        [1, 0, 0],
        [1, 0, 1],
        [1, 1, 1],
        [1, 1, 0],
      ],
      [
        [1, 0, 1],
        [0, 0, 1],
        [0, 1, 1],
        [1, 1, 1],
      ],
      [
        [0, 1, 0],
        [0, 1, 1],
        [0, 0, 1],
      ],
      [
        [0, 1, 0],
        [1, 1, 0],
        [1, 0, 0],
      ],
    ],
  },
  tip: {
    inside: [0.5, 0.8, 0.5],
    faces: [
      [
        [0, 1, 0],
        [1, 1, 0],
        [0.5, 0, 0.5],
      ],
      [
        [1, 1, 0],
        [1, 1, 1],
        [0.5, 0, 0.5],
      ],
      [
        [1, 1, 1],
        [0, 1, 1],
        [0.5, 0, 0.5],
      ],
      [
        [0, 1, 1],
        [0, 1, 0],
        [0.5, 0, 0.5],
      ],
    ],
  },
};
const SLOPE_FLOOR = [
  [0, 1, 1],
  [1, 1, 1],
  [1, 1, 0],
  [0, 1, 0],
];

/**
 * Quarter turns around the cell's vertical axis, keyed by where local +a ends
 * up. Local +b ends up a quarter turn further, so the corner shapes' high
 * corner (+a+b) lands on `+x+z`, `-x+z`, `-x-z` and `+x-z` in turn.
 */
const SLOPE_TURNS = {
  "+x": { p: (a, y, b) => [a, y, b], corner: "+x+z" },
  "+z": { p: (a, y, b) => [1 - b, y, a], corner: "-x+z" },
  "-x": { p: (a, y, b) => [1 - a, y, 1 - b], corner: "-x-z" },
  "-z": { p: (a, y, b) => [b, y, 1 - a], corner: "+x-z" },
};

/** One 90° turn around y, per axis direction (matches `_rot90`). */
const SLOPE_ROT_Y = { "+x": "+z", "+z": "-x", "-x": "-z", "-z": "+x" };

/** Cell side → offset to the neighbour across it. */
const SIDE_DELTA = {
  top: [0, -1, 0],
  bottom: [0, 1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  front: [0, 0, -1],
  back: [0, 0, 1],
};

/**
 * Build one slope shape in cell offsets: its faces (with normal, centre and
 * type) and, per cell side it touches, whether that face is full and a key of
 * its outline within the side's plane, so two neighbours can compare outlines.
 */
function _slopeShape(local, map) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const inside = local.inside && map(...local.inside);
  const faces = [];
  const sides = {};
  const all = [SLOPE_FLOOR, ...local.faces];
  for (let fi = 0; fi < all.length; fi++) {
    const lv = all[fi];
    const verts = lv.map((v) => map(...v));
    const c = [0, 1, 2].map(
      (i) => verts.reduce((s, v) => s + v[i], 0) / verts.length,
    );
    const e1 = sub(verts[1], verts[0]),
      e2 = sub(verts[2], verts[0]);
    let n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const len = Math.hypot(...n);
    n = n.map((k) => k / len);
    // Outward: away from the inside point, or along the face's own `out`
    // direction (mapped like the vertices) when the shape gives one.
    const o = local.outs?.[fi];
    const out = o
      ? sub(
          map(lv[0][0] + o[0], lv[0][1] + o[1], lv[0][2] + o[2]),
          map(...lv[0]),
        )
      : sub(c, inside);
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = n.map((k) => -k);
    n = n.map((k) => (Math.abs(k) < 1e-9 ? 0 : k));
    const type = NORMAL_FACE[n.join(",")] || "slope";
    if (type !== "slope") {
      const axis = n.findIndex((k) => k !== 0);
      // Rounded, so heights like 1/3 match however they were computed.
      const key = verts
        .map((v) =>
          v
            .filter((_, i) => i !== axis)
            .map((k) => Math.round(k * 1e6) / 1e6)
            .join(","),
        )
        .sort()
        .join(";");
      sides[type] = { full: key === FULL_SIDE_KEY, key };
    }
    if (verts.length === 3) verts.push(verts[2]);
    faces.push({ type, verts, n, c });
  }
  return { faces, sides };
}

/** Outline key of a face covering a whole cell side. */
const FULL_SIDE_KEY = "0,0;0,1;1,0;1,1";

/**
 * A piece whose top runs between two heights (fractions of the cell): `from`
 * where the plain piece is low, `to` where it reaches the top. In local
 * coords, by the height at each top corner (a, b):
 *
 * - ramp:  `from` at a = 0, `to` at a = 1
 * - outer: `to` only at the corner a = b = 1
 * - inner: `from` only at the corner a = b = 0
 * - tip:   `from` along all four edges, `to` at the apex in the centre
 *
 * Walls are trapezoids (triangles where a height is 0, left out where both
 * are), so neighbours continue where this piece stops: a row of ramps makes a
 * slope of any angle, and corners join them at the same heights.
 */
function _heightLocal(kind, from, to, corners) {
  const H =
    kind === "corners"
      ? corners
      : kind === "ramp"
        ? [from, to, from, to] // h00, h10, h01, h11
        : kind === "outer"
          ? [from, from, from, to]
          : kind === "inner"
            ? [from, to, to, to]
            : [from, from, from, from];
  const h = (a, b) => H[a + 2 * b];
  const P = (a, b) => [a, 1 - h(a, b), b];
  const faces = [];
  const outs = [[0, 1, 0]]; // the floor
  const add = (verts, out) => {
    faces.push(verts);
    outs.push(out);
  };
  if (kind === "tip") {
    const apex = [0.5, 1 - to, 0.5];
    for (const [p, q] of [
      [P(0, 0), P(1, 0)],
      [P(1, 0), P(1, 1)],
      [P(1, 1), P(0, 1)],
      [P(0, 1), P(0, 0)],
    ])
      add([p, q, apex], [0, -1, 0]);
  } else if (Math.abs(H[0] + H[3] - H[1] - H[2]) < 1e-9) {
    add([P(0, 0), P(1, 0), P(1, 1), P(0, 1)], [0, -1, 0]); // one plane
  } else if (_foldMain(H)) {
    // two triangles, folded along the diagonal 00–11
    add([P(0, 0), P(1, 0), P(1, 1)], [0, -1, 0]);
    add([P(0, 0), P(1, 1), P(0, 1)], [0, -1, 0]);
  } else {
    // folded along the other diagonal, 10–01
    add([P(0, 0), P(1, 0), P(0, 1)], [0, -1, 0]);
    add([P(1, 0), P(1, 1), P(0, 1)], [0, -1, 0]);
  }
  // walls: along each cell edge, from the floor up to the top's heights there
  for (const [[a0, b0], [a1, b1], out] of [
    [
      [0, 0],
      [0, 1],
      [-1, 0, 0],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 0, 0],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 0, -1],
    ],
    [
      [0, 1],
      [1, 1],
      [0, 0, 1],
    ],
  ]) {
    const v = [
      [a0, 1, b0],
      [a1, 1, b1],
      h(a1, b1) > 0 && P(a1, b1),
      h(a0, b0) > 0 && P(a0, b0),
    ].filter(Boolean);
    if (v.length > 2) add(v, out);
  }
  return { faces, outs };
}

/**
 * Which diagonal a top that isn't one plane folds along: true for 00–11.
 * Pieces from corner heights follow The Sentinel (Geoff Crammond, 1986),
 * which derives each landscape tile's shape from its four corner heights:
 * https://thesentinel.bbcelite.com/deep_dives/tile_shapes.html
 * The one with the larger height difference, so a single odd corner gets
 * the fold through it (as outer and inner corners do) and the two slanted
 * triangles lean the way that corner does. A saddle (equal differences)
 * folds along its higher pair, a ridge rather than a valley. Depends only on
 * the heights, so it turns with the piece.
 * @param {number[]} H - h00, h10, h01, h11
 */
function _foldMain(H) {
  const d0 = Math.abs(H[0] - H[3]),
    d1 = Math.abs(H[1] - H[2]);
  if (Math.abs(d0 - d1) > 1e-9) return d0 > d1;
  return H[0] + H[3] >= H[1] + H[2];
}

/** Every slope shape by its normalised key (`'+x'`, `'outer+x+z'`, `'tip'`, …). */
const SLOPE_SHAPES = (() => {
  const out = {};
  // `ceiling:` pieces are the same shapes mirrored top to bottom: a full
  // ceiling instead of a floor, slanted faces pointing down.
  for (const [prefix, flip] of [
    ["", false],
    ["ceiling:", true],
  ]) {
    const turn = (p) => (flip ? (a, y, b) => p(a, 1 - y, b) : p);
    out[prefix + "tip"] = _slopeShape(
      SLOPE_LOCAL.tip,
      turn(SLOPE_TURNS["+x"].p),
    );
    for (const [dir, { p, corner }] of Object.entries(SLOPE_TURNS)) {
      out[prefix + dir] = _slopeShape(SLOPE_LOCAL.ramp, turn(p));
      out[prefix + "outer" + corner] = _slopeShape(SLOPE_LOCAL.outer, turn(p));
      out[prefix + "inner" + corner] = _slopeShape(SLOPE_LOCAL.inner, turn(p));
    }
  }
  return out;
})();

/**
 * Normalise a slope value to its `SLOPE_SHAPES` key: corners may name z
 * before x. Throws on anything else.
 * @param {string} value
 * @returns {string}
 */
function _slopeKey(value) {
  if (value && typeof value === "object" && "corners" in value) {
    const c = value.corners;
    const pre = value.ceiling ? "ceiling:" : "";
    if (
      !Array.isArray(c) ||
      c.length !== 4 ||
      c.some((h) => typeof h !== "number" || !(h >= 0 && h <= 1)) ||
      c.every((h) => h === 0)
    )
      throw new Error(
        `Unknown slope ${JSON.stringify(value)} (use { corners: [h00, h10, h01, h11] }: the top's heights at its corners (x, z), (x+1, z), (x, z+1), (x+1, z+1), each from 0 to 1, not all 0; add ceiling: true to hang it)`,
      );
    const r = (h) => Math.round(h * 1e6) / 1e6;
    return pre + "c:" + c.map(r).join(":");
  }
  if (value && typeof value === "object") {
    const { side, from = 0, to = 1 } = value;
    const base = _sortCorner(String(side));
    const bad = (h) => typeof h !== "number" || !(h >= 0 && h <= 1);
    if (!HEIGHT_KEY.test(`${base}:0:1`) || bad(from) || bad(to))
      throw new Error(
        `Unknown slope ${JSON.stringify(value)} (use { side, from, to } with side "+x", "-x", "+z", "-z", "outer+x+z", "inner-x+z" or "tip", optionally prefixed with "ceiling:", and heights from 0 to 1)`,
      );
    if (from === 0 && to === 1) return base;
    const r = (h) => Math.round(h * 1e6) / 1e6;
    value = `${base}:${r(from)}:${r(to)}`;
  }
  const key = _sortCorner(String(value));
  if (!_slopeShapeOf(key))
    throw new Error(
      `Unknown slope "${value}" (use "+x", "-x", "+z", "-z", "outer+x+z", "inner-x+z", "tip", or any of them prefixed with "ceiling:"; or { side, from, to } for a piece between two heights, which can't both be 0, or equal for corners and tips)`,
    );
  return key;
}

const CORNER_KEY = /^(ceiling:)?c:([\d.]+):([\d.]+):([\d.]+):([\d.]+)$/;

const HEIGHT_KEY =
  /^(ceiling:)?(tip|(?:outer|inner)[+-]x[+-]z|[+-][xz]):([\d.]+):([\d.]+)$/;

/**
 * Shapes of pieces with heights, built on demand. Heights can take any
 * value, so this is capped: past the limit the oldest shape is dropped, and
 * rebuilt if it's needed again. Only costs time, never correctness.
 */
const HEIGHT_SHAPES = new Map();
const HEIGHT_SHAPES_MAX = 4096;
function _keepShape(key, shape) {
  if (HEIGHT_SHAPES.size >= HEIGHT_SHAPES_MAX)
    HEIGHT_SHAPES.delete(HEIGHT_SHAPES.keys().next().value);
  HEIGHT_SHAPES.set(key, shape);
  return shape;
}

/**
 * Look up a slope shape by key, building pieces between two heights
 * (`'+x:0.5:1'`, `'outer+x+z:0:0.5'`, …) the first time they're asked for.
 * Undefined if unknown.
 * @param {string} key
 */
function _slopeShapeOf(key) {
  let shape = SLOPE_SHAPES[key] || HEIGHT_SHAPES.get(key);
  if (shape) return shape;
  const c = CORNER_KEY.exec(key);
  if (c) {
    const H = c.slice(2, 6).map(Number);
    if (H.some((h) => h > 1) || H.every((h) => h === 0)) return undefined;
    const p = SLOPE_TURNS["+x"].p; // local a, b are world x, z
    shape = _slopeShape(
      _heightLocal("corners", 0, 0, H),
      c[1] ? (a, y, b) => p(a, 1 - y, b) : p,
    );
    return _keepShape(key, shape);
  }
  const m = HEIGHT_KEY.exec(key);
  if (!m) return undefined;
  const from = +m[3],
    to = +m[4];
  const kind = /^[+-]/.test(m[2]) ? "ramp" : m[2].slice(0, 5);
  if (!(from <= 1 && to <= 1 && from + to > 0)) return undefined;
  // A flat top: only a ramp may have one (a block of partial height).
  if (from === to && kind !== "ramp") return undefined;
  const dir =
    kind === "ramp"
      ? m[2]
      : kind === "tip"
        ? "+x"
        : Object.keys(SLOPE_TURNS).find(
            (d) => SLOPE_TURNS[d].corner === m[2].slice(5),
          );
  const p = SLOPE_TURNS[dir].p;
  shape = _slopeShape(
    _heightLocal(kind, from, to),
    m[1] ? (a, y, b) => p(a, 1 - y, b) : p,
  );
  return _keepShape(key, shape);
}

/** Put a corner's x direction before its z direction. */
function _sortCorner(key) {
  return key.replace(
    /(outer|inner)([+-]z)([+-]x)(?=$|:)/,
    (_, kind, z, x) => kind + x + z,
  );
}

/**
 * Turn a slope key with the voxels it belongs to (matches `_rot90`). Any
 * quarter turn around y works; around x or z only a half turn keeps the piece
 * horizontal (it flips it between floor and ceiling). Other turns return
 * `null`: the piece would stand on its side, which has no shape.
 * @param {string} key
 * @param {'x'|'y'|'z'} axis
 * @param {number} turns
 * @returns {string|null}
 */
function _rotateSlope(key, axis, turns) {
  const n = ((turns % 4) + 4) % 4;
  if (n === 0) return key;
  const c = CORNER_KEY.exec(key);
  if (c) {
    // Corner heights move with the cell's corners: a quarter turn around y
    // takes corner (a, b) to (1 − b, a); a half turn around x mirrors b,
    // around z mirrors a, and both flip floor and ceiling.
    let [h00, h10, h01, h11] = c.slice(2, 6);
    let ceiling = !!c[1];
    if (axis === "y")
      for (let i = 0; i < n; i++) [h00, h10, h01, h11] = [h01, h00, h11, h10];
    else if (n !== 2) return null;
    else {
      ceiling = !ceiling;
      if (axis === "x") [h00, h10, h01, h11] = [h01, h11, h00, h10];
      else [h00, h10, h01, h11] = [h10, h00, h11, h01];
    }
    return (ceiling ? "ceiling:" : "") + `c:${h00}:${h10}:${h01}:${h11}`;
  }
  if (axis === "y") {
    for (let i = 0; i < n; i++)
      key = key.replace(/[+-][xz]/g, (d) => SLOPE_ROT_Y[d]);
    return _sortCorner(key);
  }
  if (n !== 2) return null;
  // Half turn around x negates y and z; around z it negates y and x.
  const flipped = key.startsWith("ceiling:") ? key.slice(8) : "ceiling:" + key;
  const other = axis === "x" ? "z" : "x";
  return flipped.replace(
    new RegExp(`([+-])${other}`, "g"),
    (_, sign) => (sign === "+" ? "-" : "+") + other,
  );
}

/** Cache entry for voxels that emit no faces, so they aren't re-tested. */
const NO_FACES = [];

/**
 * A tiny engine for 3D voxel scenes rendered to SVG.
 */
/**
 * Builds a function that projects a 3D point with the given render options,
 * writing [x, y] into `out` so sweeping many points allocates nothing.
 * @param {Object} ro - Render options
 * @returns {(x: number, y: number, z: number, out: number[]) => void}
 */
function makeProjector(ro) {
  const { tileW, tileH } = ro;
  if (ro.projection === "oblique") {
    const { depthOffsetX, depthOffsetY } = ro;
    return (x, y, z, out) => {
      out[0] = x * tileW + z * depthOffsetX;
      out[1] = y * tileH + z * depthOffsetY;
    };
  }
  if (ro.projection === "orthographic" || ro.projection === "isometric") {
    const { angle = 0, pitch = 0 } = ro;
    const cosT = Math.cos(angle),
      sinT = Math.sin(angle);
    const cosP = Math.cos(pitch),
      sinP = Math.sin(pitch);
    return (x, y, z, out) => {
      out[0] = (x * cosT - z * sinT + 5) * tileW;
      out[1] = (y * cosP - (x * sinT + z * cosT) * sinP + 5) * tileH;
    };
  }
  const { cameraX, cameraY, cameraDistance } = ro;
  return (x, y, z, out) => {
    const pt = cameraDistance / (z + cameraDistance);
    out[0] = (cameraX + (x - cameraX) * pt) * tileW;
    out[1] = (cameraY + (y - cameraY) * pt) * tileH;
  };
}

// getFitFrame() samples the camera ranges every this many degrees. A view between
// two samples can reach slightly further, by at most 1 / cos(step / 2) on each of
// the two axes it turns around, so the frame is grown by that much.
const FIT_STEP_DEG = 5;
const FIT_MARGIN = 1 / Math.cos(((FIT_STEP_DEG / 2) * Math.PI) / 180) ** 2;

export class Heerich {
  /**
   * @param {Object} [options]
   * @param {number|[number,number]|[number,number,number]} [options.tile=10] - Tile size in pixels. Single number for uniform, [x,y] or [x,y,z] for independent axes.
   * @param {StyleObject} [options.style] - Default face style
   * @param {CameraOptions} [options.camera] - Camera configuration
   */
  constructor(options = {}) {
    const t = options.tile || 10;
    const tile =
      typeof t === "number"
        ? [t, t, t]
        : t.length === 2
          ? [t[0], t[1], t[0]]
          : t;

    /** @type {StyleObject} */
    this.defaultStyle = options.style || {
      fill: "#aaaaaa",
      stroke: "#000000",
      strokeWidth: 1,
    };

    const cam = options.camera || { type: "oblique", angle: 45, distance: 15 };
    /** @type {{projection: string, tileW: number, tileH: number, tileZ: number, depthOffsetX: number, depthOffsetY: number, cameraX: number, cameraY: number, cameraDistance: number}} */
    this.renderOptions = {
      projection: cam.type || "oblique",
      tileW: tile[0],
      tileH: tile[1],
      tileZ: tile[2],
      depthOffsetX: 15,
      depthOffsetY: -15,
      cameraX: 5,
      cameraY: 5,
      cameraDistance: 10,
    };

    /** @type {number} Default gap between voxels (0–<0.5) */
    this.defaultGap = options.gap || 0;

    this.setCamera(cam);
    /** @type {Map<number, Voxel>} */
    this.voxels = new Map();
    /** @type {Map<string, DecalDef>} */
    this.decals = new Map();
    /** @type {boolean} */
    /** @type {number} Monotonically increasing epoch — bumped on every mutation */
    this._epoch = 0;
    /** @type {number} Epoch at which _cachedFaces was computed */
    this._cachedEpoch = -1;
    /** @type {Face[]|null} */
    this._cachedFaces = null;
    /** @type {number} Epoch at which _cachedRawFaces was computed */
    this._cachedRawEpoch = -1;
    /** @type {Face[]|null} */
    this._cachedRawFaces = null;
    /** @type {SVGRenderer|null} */
    this._svgRenderer = null;
    /** @type {boolean} */
    this._batching = false;
    /** @type {Set<number>} Voxel keys that changed since last _buildFaces3D */
    this._dirtyKeys = new Set();
    /** @type {Map<number, Object[]>} Cached 3D faces per voxel key */
    this._faceCache3D = new Map();
    /** @type {Set<number>} Same as _dirtyKeys, for _culledFaceCache */
    this._culledDirtyKeys = new Set();
    /** @type {Map<number, Object[]>} Same as _faceCache3D, holding only the faces the oblique camera can see */
    this._culledFaceCache = new Map();
    /** @type {boolean} Whether faces have been built at least once */
    this._facesBuilt = false;
    /** @type {boolean} Set by the first edit after a build; static scenes never pay for caching */
    this._cachingFaces = false;
  }

  /**
   * Update camera settings. Oblique cameras use angle + distance;
   * perspective cameras use position + distance.
   * @param {CameraOptions} [opts]
   */
  setCamera(opts = {}) {
    Object.assign(this.renderOptions, this._cameraSettings(opts));

    if (this._faceCache3D) this._clearFaceCaches();
    this._invalidate();
  }

  /**
   * The render options a camera sets, without applying them.
   * @param {CameraOptions} opts
   * @returns {Object}
   * @private
   */
  _cameraSettings(opts) {
    const type = opts.type || this.renderOptions.projection;
    if (type === "oblique") {
      const angle = opts.angle !== undefined ? opts.angle : 45;
      const distance = opts.distance !== undefined ? opts.distance : 15;
      const rad = angle * (Math.PI / 180);
      const zScale = this.renderOptions.tileZ / this.renderOptions.tileW;
      return {
        projection: type,
        depthOffsetX: Math.cos(rad) * distance * zScale,
        depthOffsetY: Math.sin(rad) * distance * zScale,
      };
    }
    if (type === "orthographic" || type === "isometric") {
      return {
        projection: type,
        angle: (opts.angle !== undefined ? opts.angle : 45) * (Math.PI / 180),
        pitch:
          type === "isometric"
            ? 35.264 * (Math.PI / 180)
            : (opts.pitch !== undefined ? opts.pitch : 35.264) *
              (Math.PI / 180),
      };
    }
    const pos = opts.position || [5, 5];
    return {
      projection: type,
      cameraX: pos[0],
      cameraY: pos[1],
      cameraDistance: opts.distance !== undefined ? opts.distance : 10,
    };
  }

  /**
   * Pack coordinates into a single integer key for fast Map lookups.
   * Supports coordinates from -512 to 511 on each axis (10 bits + sign).
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  _k(x, y, z) {
    return (
      (((x + 512) & 0x3ff) << 20) |
      (((y + 512) & 0x3ff) << 10) |
      ((z + 512) & 0x3ff)
    );
  }

  /** Mark the scene as modified. */
  _invalidate() {
    this._epoch++;
    if (!this._batching) {
      this._cachedFaces = null;
      this._cachedRawFaces = null;
    }
  }

  /**
   * Mark a voxel and its 6 neighbors as needing face regeneration.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  _markDirty(x, y, z) {
    if (this._facesBuilt) this._cachingFaces = true;
    // An empty cache has nothing to invalidate
    if (this._faceCache3D.size > 0) this._addDirty(this._dirtyKeys, x, y, z);
    if (this._culledFaceCache.size > 0)
      this._addDirty(this._culledDirtyKeys, x, y, z);
  }

  /**
   * Add a voxel and its 6 neighbors to a dirty set.
   * @param {Set<number>} keys
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  _addDirty(keys, x, y, z) {
    keys.add(this._k(x, y, z));
    keys.add(this._k(x, y - 1, z));
    keys.add(this._k(x, y + 1, z));
    keys.add(this._k(x - 1, y, z));
    keys.add(this._k(x + 1, y, z));
    keys.add(this._k(x, y, z - 1));
    keys.add(this._k(x, y, z + 1));
  }

  /**
   * Mark a single voxel whose styles changed. Its faces carry resolved styles,
   * but its geometry and its neighbors are unaffected.
   * @param {number} key
   */
  _markRestyled(key) {
    this._dirtyKeys.add(key);
    this._culledDirtyKeys.add(key);
  }

  /** Drop all cached per-voxel faces. */
  _clearFaceCaches() {
    this._faceCache3D.clear();
    this._culledFaceCache.clear();
  }

  /**
   * Current mutation epoch. Consumers can compare this against their own
   * last-rendered epoch to know whether they need to re-render.
   * @returns {number}
   */
  get epoch() {
    return this._epoch;
  }

  /**
   * Batch multiple operations so face recomputation is deferred until the end.
   * @param {() => void} fn - Operations to batch
   */
  batch(fn) {
    this._batching = true;
    try {
      fn();
    } finally {
      this._batching = false;
      this._cachedFaces = null;
      this._cachedRawFaces = null;
    }
  }

  /**
   * Compute bounding-box center of an iterable of items.
   * @param {Iterable<*>} items - Items to compute bounds for
   * @param {(item: any) => [number,number,number]} get - Extracts [x,y,z] from each item
   * @returns {[number,number,number]} Center of the bounding box
   */
  static _bboxCenter(items, get) {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (const item of items) {
      const [x, y, z] = get(item);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  }

  /**
   * Rotate a point [x,y,z] around a center by N 90° turns on the given axis.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {'x'|'y'|'z'} axis
   * @param {number} turns - Number of 90° turns (1-3)
   * @param {number} cx - Center X
   * @param {number} cy - Center Y
   * @param {number} cz - Center Z
   * @returns {[number, number, number]}
   */
  static _rot90(x, y, z, axis, turns, cx, cy, cz) {
    let dx = x - cx,
      dy = y - cy,
      dz = z - cz;
    const n = ((turns % 4) + 4) % 4;
    for (let i = 0; i < n; i++) {
      if (axis === "z") {
        const t = dx;
        dx = -dy;
        dy = t;
      } else if (axis === "y") {
        const t = dx;
        dx = -dz;
        dz = t;
      } else {
        const t = dy;
        dy = -dz;
        dz = t;
      }
    }
    return [Math.round(cx + dx), Math.round(cy + dy), Math.round(cz + dz)];
  }

  /**
   * Wrap a coordinate iterator with rotation.
   * If no center given, computes bounding box center of the coords.
   * @param {Iterable<number[]>} coords
   * @param {RotateOptions} rotate
   * @returns {Generator<number[], void, unknown>}
   */
  *_rotateCoords(coords, rotate) {
    if (!rotate) {
      yield* coords;
      return;
    }

    // Must collect to compute center if not given
    const all = [...coords];
    const [cx, cy, cz] = rotate.center || Heerich._bboxCenter(all, (c) => c);

    for (const [x, y, z] of all) {
      yield Heerich._rot90(x, y, z, rotate.axis, rotate.turns, cx, cy, cz);
    }
  }

  /**
   * Rotate all existing voxels in place by 90-degree increments.
   * @param {RotateOptions} opts
   */
  rotate(opts) {
    const entries = [...this.voxels.values()];
    const [cx, cy, cz] =
      opts.center || Heerich._bboxCenter(entries, (v) => [v.x, v.y, v.z]);

    this.voxels.clear();
    this._clearFaceCaches();
    for (const v of entries) {
      const [nx, ny, nz] = Heerich._rot90(
        v.x,
        v.y,
        v.z,
        opts.axis,
        opts.turns,
        cx,
        cy,
        cz,
      );
      const moved = { ...v, x: nx, y: ny, z: nz };
      if (v.slope) {
        const turned = _rotateSlope(v.slope, opts.axis, opts.turns);
        // A piece turned onto its side becomes a plain cube.
        if (turned) moved.slope = turned;
        else delete moved.slope;
      }
      this.voxels.set(this._k(nx, ny, nz), moved);
    }
    this._invalidate();
  }

  /**
   * Apply a boolean operation using coordinates from an iterator.
   * @param {Iterable<number[]>} coords
   * @param {BooleanMode} mode
   * @param {StyleParam} [style]
   * @param {string} [content] - SVG content to embed in voxel
   * @param {boolean} [opaque] - Whether voxels occlude neighbors (default true)
   * @param {Object} [meta] - Arbitrary key-value pairs for data-* attributes
   * @param {[number,number,number]|((x: number, y: number, z: number) => [number,number,number])} [scale] - Per-axis scale 0-1
   * @param {[number,number,number]|((x: number, y: number, z: number) => [number,number,number])} [scaleOrigin] - Scale origin within voxel
   * @param {number} [gap] - Per-geometry gap override (undefined = use defaultGap)
   * @param {SlopeDir|((x: number, y: number, z: number) => SlopeDir|null)} [slope] - Make voxels slopes rising toward this direction
   */
  _applyOp(
    coords,
    mode,
    style,
    content,
    opaque,
    meta,
    scale,
    scaleOrigin,
    gap,
    slope,
  ) {
    // Content voxels draw their content instead of faces, so a slope would
    // never show, yet neighbours would treat the voxel as a partial wedge.
    // Checked once per call, not per voxel.
    if (slope && content) {
      console.warn(
        "Heerich: `slope` has no effect on content voxels and is ignored",
      );
      slope = undefined;
    }
    const slopeAt = (x, y, z) => {
      const d = typeof slope === "function" ? slope(x, y, z) : slope;
      return d ? _slopeKey(d) : null;
    };
    if (mode === "intersect") {
      // Collect shape coords, then delete everything not in the set
      const keep = new Set();
      for (const [x, y, z] of coords) {
        const key = this._k(x, y, z);
        if (this.voxels.has(key)) keep.add(key);
      }
      for (const [key, v] of this.voxels.entries()) {
        if (!keep.has(key)) {
          this._markDirty(v.x, v.y, v.z);
          this.voxels.delete(key);
        }
      }
      // Apply style to remaining voxels if provided
      if (style) {
        for (const key of keep) {
          const voxel = this.voxels.get(key);
          if (voxel) {
            this._markRestyled(key);
            voxel.styles = this._resolveStyles(
              style,
              voxel.x,
              voxel.y,
              voxel.z,
              voxel.styles,
            );
          }
        }
      }
    } else {
      for (const [x, y, z] of coords) {
        const key = this._k(x, y, z);
        this._markDirty(x, y, z);
        if (mode === "union") {
          const voxel = {
            x,
            y,
            z,
            styles: this._resolveStyles(style || null, x, y, z),
          };
          if (content) voxel.content = content;
          if (scale) {
            const s = typeof scale === "function" ? scale(x, y, z) : scale;
            if (s) {
              voxel.scale = s;
              voxel.scaleOrigin = (typeof scaleOrigin === "function"
                ? scaleOrigin(x, y, z)
                : scaleOrigin) || [0.5, 0, 0.5];
              voxel.opaque = false;
            }
          } else if (opaque === false) {
            voxel.opaque = false;
          }
          if (meta) voxel.meta = meta;
          if (slope) {
            const d = slopeAt(x, y, z);
            if (d) voxel.slope = d;
          }
          const g = gap !== undefined ? gap : this.defaultGap;
          if (g) voxel.gap = g;
          else if (gap === 0) voxel.gap = 0;
          this.voxels.set(key, voxel);
        } else if (mode === "subtract") {
          if (this.voxels.delete(key) && style) {
            // Style the newly exposed faces of neighboring voxels
            for (const [dx, dy, dz, face] of ADJ) {
              const nx = x + dx,
                ny = y + dy,
                nz = z + dz;
              const nk = this._k(nx, ny, nz);
              const neighbor = this.voxels.get(nk);
              if (neighbor) {
                const resolved = this._resolveStyles(style, nx, ny, nz);
                if (resolved[face]) {
                  neighbor.styles[face] = {
                    ...(neighbor.styles[face] || {}),
                    ...resolved[face],
                  };
                } else if (resolved.default) {
                  neighbor.styles[face] = {
                    ...(neighbor.styles[face] || {}),
                    ...resolved.default,
                  };
                }
              }
            }
          }
        } else if (mode === "exclude") {
          if (this.voxels.has(key)) {
            this.voxels.delete(key);
          } else {
            const voxel = {
              x,
              y,
              z,
              styles: this._resolveStyles(style || null, x, y, z),
            };
            if (content) voxel.content = content;
            if (scale) {
              const s = typeof scale === "function" ? scale(x, y, z) : scale;
              if (s) {
                voxel.scale = s;
                voxel.scaleOrigin = (typeof scaleOrigin === "function"
                  ? scaleOrigin(x, y, z)
                  : scaleOrigin) || [0.5, 0, 0.5];
                voxel.opaque = false;
              }
            } else if (opaque === false) {
              voxel.opaque = false;
            }
            if (meta) voxel.meta = meta;
            if (slope) {
              const d = slopeAt(x, y, z);
              if (d) voxel.slope = d;
            }
            const g = gap !== undefined ? gap : this.defaultGap;
            if (g) voxel.gap = g;
            this.voxels.set(key, voxel);
          }
        }
      }
    }
    this._invalidate();
  }

  /**
   * Resolves a style parameter (which might be a function) into a static style object.
   * @param {StyleParam} styleParam
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {Object|null} [existingStyles] - Existing per-face styles to merge into
   * @returns {Object} Resolved per-face style map (keys: 'default', 'top', etc.)
   *
   * Style objects may key faces individually (`top`, `front`, `left`, …) or use
   * the axis shorthands `x` (left+right), `y` (top+bottom) and `z` (front+back).
   * Precedence is `default` < axis < explicit face, so an explicit face key
   * always overrides the axis shorthand regardless of key order.
   */
  _resolveStyles(styleParam, x, y, z, existingStyles = null) {
    if (!styleParam) {
      return existingStyles
        ? { ...existingStyles }
        : { default: { ...this.defaultStyle } };
    }

    const evaluatedParam =
      typeof styleParam === "function" ? styleParam(x, y, z) : styleParam;
    const baseStyles = existingStyles ? { ...existingStyles } : {};

    const mergeFace = (face, val) => {
      const evaluated = typeof val === "function" ? val(x, y, z) : val;
      if (baseStyles[face]) {
        Object.assign(baseStyles[face], evaluated);
      } else {
        baseStyles[face] = { ...evaluated };
      }
    };

    // Pass 1: expand axis shorthands (x/y/z) onto their two faces.
    for (const [key, val] of Object.entries(evaluatedParam)) {
      const faces = AXIS_FACES[key];
      if (!faces) continue;
      const evaluated = typeof val === "function" ? val(x, y, z) : val;
      for (const face of faces) mergeFace(face, evaluated);
    }
    // Pass 2: explicit face keys (and `default`) merge on top, so they win.
    for (const [key, val] of Object.entries(evaluatedParam)) {
      if (AXIS_FACES[key]) continue;
      mergeFace(key, val);
    }

    return baseStyles;
  }

  /** Remove all voxels. */
  clear() {
    this.voxels.clear();
    this._clearFaceCaches();
    this._invalidate();
  }

  /**
   * Get voxel data at a position.
   * @param {[number,number,number]} pos
   * @returns {Object|null}
   */
  getVoxel(pos) {
    return this.voxels.get(this._k(pos[0], pos[1], pos[2])) || null;
  }

  /**
   * Check if a voxel exists at a position.
   * @param {[number,number,number]} pos
   * @returns {boolean}
   */
  hasVoxel(pos) {
    return this.voxels.has(this._k(pos[0], pos[1], pos[2]));
  }

  /**
   * Get the six axis-aligned neighbors of a position.
   * @param {[number,number,number]} pos
   * @returns {{top:Object|null, bottom:Object|null, left:Object|null, right:Object|null, front:Object|null, back:Object|null}}
   */
  getNeighbors(pos) {
    const [x, y, z] = pos;
    return {
      top: this.getVoxel([x, y - 1, z]),
      bottom: this.getVoxel([x, y + 1, z]),
      left: this.getVoxel([x - 1, y, z]),
      right: this.getVoxel([x + 1, y, z]),
      front: this.getVoxel([x, y, z - 1]),
      back: this.getVoxel([x, y, z + 1]),
    };
  }

  /**
   * Find all voxels matching a predicate.
   * @param {(voxel: Voxel) => boolean} predicate
   * @returns {Voxel[]}
   * @example
   * // Find by meta ID
   * engine.findVoxels(v => v.meta?.id === 'tower')
   * // Find all voxels at a specific Y level
   * engine.findVoxels(v => v.y === 0)
   */
  findVoxels(predicate) {
    const results = [];
    for (const voxel of this.voxels.values()) {
      if (predicate(voxel)) results.push(voxel);
    }
    return results;
  }

  /**
   * Iterate over all voxels. Supports `for (const voxel of heerich)`.
   * @returns {Iterator<Object>}
   */
  *[Symbol.iterator]() {
    for (const voxel of this.voxels.values()) {
      yield voxel;
    }
  }

  /**
   * Serialize the scene to a plain JSON-safe object.
   * Functional styles are omitted with a console warning.
   * @returns {Object}
   */
  toJSON() {
    const voxelData = [];
    for (const [key, voxel] of this.voxels.entries()) {
      const styles = {};
      for (const [face, val] of Object.entries(voxel.styles)) {
        if (typeof val === "function") {
          console.warn(
            `Heerich.toJSON: functional style on face "${face}" at [${voxel.x},${voxel.y},${voxel.z}] will be omitted`,
          );
          continue;
        }
        styles[face] = val;
      }
      const entry = { x: voxel.x, y: voxel.y, z: voxel.z, styles };
      if (voxel.content) entry.content = voxel.content;
      if (voxel.opaque === false) entry.opaque = false;
      if (voxel.meta) entry.meta = voxel.meta;
      if (voxel.scale) entry.scale = voxel.scale;
      if (voxel.scaleOrigin) entry.scaleOrigin = voxel.scaleOrigin;
      if (voxel.gap !== undefined) entry.gap = voxel.gap;
      if (voxel.slope) entry.slope = voxel.slope;
      voxelData.push(entry);
    }

    return {
      tile: [
        this.renderOptions.tileW,
        this.renderOptions.tileH,
        this.renderOptions.tileZ,
      ],
      camera:
        this.renderOptions.projection === "oblique"
          ? {
              type: "oblique",
              depthOffsetX: this.renderOptions.depthOffsetX,
              depthOffsetY: this.renderOptions.depthOffsetY,
            }
          : {
              type: "perspective",
              position: [
                this.renderOptions.cameraX,
                this.renderOptions.cameraY,
              ],
              distance: this.renderOptions.cameraDistance,
            },
      style: { ...this.defaultStyle },
      gap: this.defaultGap || undefined,
      voxels: voxelData,
      decals:
        this.decals.size > 0
          ? Object.fromEntries(this.decals.entries())
          : undefined,
    };
  }

  /**
   * Reconstruct a Heerich instance from serialized data.
   * @param {Object} data - Output of `toJSON()`
   * @returns {Heerich}
   */
  static fromJSON(data) {
    const engine = new Heerich({
      tile: data.tile,
      camera: data.camera,
      style: data.style,
      gap: data.gap,
    });

    for (const v of data.voxels) {
      const voxel = { x: v.x, y: v.y, z: v.z, styles: v.styles };
      if (v.content) voxel.content = v.content;
      if (v.opaque === false) voxel.opaque = false;
      if (v.meta) voxel.meta = v.meta;
      if (v.scale) voxel.scale = v.scale;
      if (v.scaleOrigin) voxel.scaleOrigin = v.scaleOrigin;
      if (v.gap) voxel.gap = v.gap;
      if (v.slope && !v.content) voxel.slope = _slopeKey(v.slope);
      engine.voxels.set(engine._k(v.x, v.y, v.z), voxel);
    }

    if (data.decals) {
      for (const [name, def] of Object.entries(data.decals)) {
        engine.defineDecal(name, def);
      }
    }

    engine._invalidate();
    return engine;
  }

  /**
   * Resolve geometry type to a coordinate iterator.
   * @param {Object} opts
   * @returns {Iterable<number[]>}
   */
  _resolveGeometry(opts) {
    const type = opts.type;
    if (type === "box" || type === "sphere" || type === "fill") {
      const s = opts.bounds
        ? [
            opts.bounds[1][0] - opts.bounds[0][0],
            opts.bounds[1][1] - opts.bounds[0][1],
            opts.bounds[1][2] - opts.bounds[0][2],
          ]
        : opts.size != null
          ? typeof opts.size === "number"
            ? [opts.size, opts.size, opts.size]
            : opts.size
          : [opts.radius * 2 + 1, opts.radius * 2 + 1, opts.radius * 2 + 1];
      const pos = opts.position ??
        (opts.bounds ? opts.bounds[0] : null) ?? [
          opts.center[0] - Math.floor(s[0] / 2),
          opts.center[1] - Math.floor(s[1] / 2),
          opts.center[2] - Math.floor(s[2] / 2),
        ];
      const center = opts.center ?? [
        pos[0] + Math.floor(s[0] / 2),
        pos[1] + Math.floor(s[1] / 2),
        pos[2] + Math.floor(s[2] / 2),
      ];
      const radius = opts.radius ?? Math.floor(s[0] / 2);
      if (type === "box") return boxCoords(pos, s);
      if (type === "sphere") return sphereCoords(center, radius);
      return fillCoords(
        [pos, [pos[0] + s[0], pos[1] + s[1], pos[2] + s[2]]],
        opts.test,
      );
    }
    if (type === "line")
      return lineCoords(
        opts.from,
        opts.to,
        opts.radius || 0,
        opts.shape || "rounded",
      );
    throw new Error(`Unknown geometry type: "${type}"`);
  }

  /**
   * Register a named decal. Content must be one or more <path> elements
   * authored in a 0–1 unit coordinate space. All path commands are supported
   * (M, L, H, V, C, S, Q, T, A, Z). Other SVG shapes (circle, rect, etc.)
   * must be converted to <path> first.
   * @param {string} name - Unique decal name
   * @param {DecalDef|string} def - Decal definition object, or raw SVG string
   */
  defineDecal(name, def) {
    if (typeof def === "string") def = { content: def };
    def._prepared = prepareDecalContent(def.content);
    this.decals.set(name, def);
  }

  /**
   * Apply a geometry operation (union, subtract, intersect, exclude).
   * @param {Object} opts
   * @param {'box'|'sphere'|'line'|'fill'} opts.type - Geometry type
   * @param {BooleanMode} [opts.mode='union'] - Boolean operation
   * @param {StyleParam} [opts.style] - Per-face styles
   * @param {string} [opts.content] - SVG content to render instead of polygon faces
   * @param {boolean} [opts.opaque=true] - Whether voxels occlude neighbors
   * @param {Object} [opts.meta] - Key/value pairs emitted as data-* attributes
   * @param {RotateOptions} [opts.rotate] - Rotate coordinates before placement
   * @param {[number,number,number]|((x: number, y: number, z: number) => [number,number,number])} [opts.scale] - Per-axis scale 0-1
   * @param {[number,number,number]|((x: number, y: number, z: number) => [number,number,number])} [opts.scaleOrigin=[0.5,0,0.5]] - Scale origin
   * @param {number} [opts.gap] - Gap between voxels (0–<0.5). Overrides constructor default.
   * @param {SlopeDir|((x: number, y: number, z: number) => SlopeDir|null)} [opts.slope] - Turn voxels into wedges rising toward this direction (a function picks per voxel; return null for a cube). Ignored, with a warning, together with `content`
   *
   * Box params: position, size
   * Sphere params: center, radius
   * Line params: from, to, radius, shape
   * Fill params: bounds, test
   */
  applyGeometry(opts) {
    let coords = this._resolveGeometry(opts);
    if (opts.rotate) coords = this._rotateCoords(coords, opts.rotate);
    this._applyOp(
      coords,
      opts.mode || "union",
      opts.style,
      opts.content,
      opts.opaque,
      opts.meta,
      opts.scale,
      opts.scaleOrigin,
      opts.gap,
      opts.slope,
    );
  }

  /**
   * Remove geometry (shortcut for applyGeometry with mode: 'subtract').
   * @param {Object} opts - Same as applyGeometry (mode is forced to 'subtract')
   */
  removeGeometry(opts) {
    this.applyGeometry({ ...opts, mode: "subtract" });
  }

  /**
   * Add geometry (shortcut for applyGeometry with mode: 'union').
   * @param {Object} opts - Same as applyGeometry (mode is forced to 'union')
   */
  addGeometry(opts) {
    this.applyGeometry({ ...opts, mode: "union" });
  }

  /**
   * Smooth the scene's surfaces by picking a slope piece for every voxel from
   * its neighbours. Replaces any slopes already set, so it can be run again
   * after editing. A voxel with nothing above it becomes, by its open sides
   * (no neighbour on the same layer):
   *
   * - one open side: a ramp falling toward it
   * - two adjacent open sides: an outer corner
   * - none open but one open diagonal: an inner corner
   * - three open sides: a ramp rising toward the one neighbour
   * - four open sides: a tip (if `tips` is on)
   *
   * Two opposite open sides (a one-wide ridge) stay a cube. Voxels with
   * nothing below get the same treatment with `ceiling:` pieces. Ramps on
   * neighbouring layers line up into one continuous 45° slope.
   *
   * @param {Object} [opts]
   * @param {boolean} [opts.top=true] - Smooth upward-facing surfaces
   * @param {boolean} [opts.bottom=true] - Smooth downward-facing surfaces
   * @param {boolean} [opts.tips=true] - Cap lone columns with a tip
   * @param {(voxel: Voxel) => boolean} [opts.filter] - Only reshape voxels that pass
   */
  autoSlope({ top = true, bottom = true, tips = true, filter } = {}) {
    const solid = (x, y, z) => {
      const v = this.voxels.get(this._k(x, y, z));
      return !!v && v.opaque !== false && !v.content;
    };
    // `dy` points out of the surface: -1 for tops, +1 for undersides.
    const pick = (x, y, z, dy) => {
      const px = solid(x + 1, y, z),
        nx = solid(x - 1, y, z),
        pz = solid(x, y, z + 1),
        nz = solid(x, y, z - 1);
      const open = !px + !nx + !pz + !nz;
      if (open === 4) return tips ? "tip" : null;
      if (open === 3) return px ? "+x" : nx ? "-x" : pz ? "+z" : "-z";
      if (open === 2) {
        if (px === nx) return null; // a one-wide ridge: no piece for it
        // An outer corner only joins up when both its high neighbours are
        // surface too. Against a taller neighbour, a ramp falling away from
        // it reads better; against two, the step stays a cube.
        const sx = px ? 1 : -1,
          sz = pz ? 1 : -1;
        const ex = !solid(x + sx, y + dy, z),
          ez = !solid(x, y + dy, z + sz);
        if (ex && ez) return "outer" + (px ? "+x" : "-x") + (pz ? "+z" : "-z");
        if (ex) return pz ? "+z" : "-z";
        if (ez) return px ? "+x" : "-x";
        return null;
      }
      if (open === 1) return !nx ? "+x" : !px ? "-x" : !nz ? "+z" : "-z";
      // Closed on all four sides: an inner corner if exactly one diagonal is
      // open; it rises away from that diagonal.
      let corner = null;
      for (const [dx, dz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        if (solid(x + dx, y, z + dz)) continue;
        if (corner) return null;
        corner = "inner" + (dx > 0 ? "-x" : "+x") + (dz > 0 ? "-z" : "+z");
      }
      return corner;
    };
    for (const v of this.voxels.values()) {
      if (v.opaque === false || v.content || v.scale) continue;
      if (filter && !filter(v)) continue;
      const { x, y, z } = v;
      let shape = null;
      if (top && !solid(x, y - 1, z)) shape = pick(x, y, z, -1);
      else if (bottom && !solid(x, y + 1, z)) {
        const s = pick(x, y, z, 1);
        if (s) shape = "ceiling:" + s;
      }
      if (shape) v.slope = shape;
      else delete v.slope;
    }
    this._clearFaceCaches();
    this._invalidate();
  }

  /**
   * Restyle existing voxels matching a geometry selection, or all voxels if no type given.
   * @param {Object} opts
   * @param {'box'|'sphere'|'line'|'fill'} [opts.type] - Geometry type (omit to style all voxels)
   * @param {StyleParam} opts.style - Style to apply
   *
   * Box params: position, size
   * Sphere params: center, radius
   * Line params: from, to, radius, shape
   * Fill params: bounds, test
   */
  applyStyle(opts) {
    if (!opts.style) throw new Error("applyStyle requires a style parameter");
    if (!opts.type) {
      // Style all existing voxels
      this._clearFaceCaches();
      for (const voxel of this.voxels.values()) {
        voxel.styles = this._resolveStyles(
          opts.style,
          voxel.x,
          voxel.y,
          voxel.z,
          voxel.styles,
        );
      }
      this._invalidate();
      return;
    }
    const coords = this._resolveGeometry(opts);
    for (const [x, y, z] of coords) {
      const key = this._k(x, y, z);
      const voxel = this.voxels.get(key);
      if (voxel) {
        this._markRestyled(key);
        voxel.styles = this._resolveStyles(opts.style, x, y, z, voxel.styles);
      }
    }
    this._invalidate();
  }

  /**
   * Scale face vertices around an origin within a voxel.
   * @param {[number,number,number][]} vertices - 3D polygon vertices
   * @param {number} x - Voxel x position
   * @param {number} y - Voxel y position
   * @param {number} z - Voxel z position
   * @param {[number,number,number]} scale - Per-axis scale factors [sx, sy, sz]
   * @param {[number,number,number]} origin - Scale origin within voxel (0-1)
   * @returns {[number,number,number][]} Scaled vertices
   */
  static _scaleVertices(vertices, x, y, z, scale, origin) {
    const ox = x + origin[0],
      oy = y + origin[1],
      oz = z + origin[2];
    return vertices.map(([vx, vy, vz]) => [
      ox + (vx - ox) * scale[0],
      oy + (vy - oy) * scale[1],
      oz + (vz - oz) * scale[2],
    ]);
  }

  /**
   * Build all neighbor-exposed 3D faces for every voxel, using the incremental
   * per-voxel cache. Emits up to 6 faces per voxel. The `back` face (normal
   * [0,0,1]) is included so that orthographic/isometric cameras can see it when
   * rotated past ~90°; oblique always culls it via `cullTypes`.
   *
   * Each face carries `n` (normal) and `c` (center) so that `_projectAndSort`
   * can do backface culling and depth computation without extra lookups.
   *
   * @param {Set<string>|null} [cullTypes] - Optional set of face type strings to
   *   skip at generation time (e.g. oblique direction cull). Culled faces go to
   *   their own per-voxel cache so that `_faceCache3D` always stores the full
   *   unculled set. `setCamera` clears both, so the cull set can't go stale.
   * @returns {Object[]} Raw 3D face objects
   */
  _buildFaces3D(cullTypes = null) {
    // Does the voxel at (x,y,z) have a full, opaque face on `side`? Cubes do
    // on every side; a slope only on its floor and its wall.
    const solidSide = (x, y, z, side) => {
      const v = this.voxels.get(this._k(x, y, z));
      if (!v || v.opaque === false) return false;
      return !v.slope || !!_slopeShapeOf(v.slope).sides[side]?.full;
    };

    const cache = cullTypes ? this._culledFaceCache : this._faceCache3D;
    const dirtyKeys = cullTypes ? this._culledDirtyKeys : this._dirtyKeys;
    const caching = this._cachingFaces;
    const useIncremental = cache.size > 0;

    if (useIncremental) {
      for (const dk of dirtyKeys) {
        cache.delete(dk);
      }
    }

    const faces3D = [];

    for (const [key, voxel] of this.voxels.entries()) {
      if (useIncremental && !dirtyKeys.has(key)) {
        const cached = cache.get(key);
        if (cached) {
          for (let i = 0; i < cached.length; i++) faces3D.push(cached[i]);
          continue;
        }
      }

      const { x, y, z, styles } = voxel;

      if (
        !voxel.scale &&
        !voxel.gap &&
        !voxel.slope &&
        solidSide(x - 1, y, z, "right") &&
        solidSide(x + 1, y, z, "left") &&
        solidSide(x, y - 1, z, "bottom") &&
        solidSide(x, y + 1, z, "top") &&
        solidSide(x, y, z - 1, "back") &&
        solidSide(x, y, z + 1, "front")
      ) {
        if (caching) cache.set(key, NO_FACES);
        continue;
      }

      const faceStart = faces3D.length;

      if (voxel.content) {
        faces3D.push({
          type: "content",
          voxel,
          content: voxel.content,
          _pos: [x, y, z],
        });
        if (caching) cache.set(key, faces3D.slice(faceStart));
        continue;
      }

      const base = styles.default
        ? { ...this.defaultStyle, ...styles.default }
        : this.defaultStyle;
      const getStyle = (faceName, n) => {
        // A slanted face falls back to the style of the flat face it leans
        // toward (top, or bottom for ceiling pieces), so terrain styled by
        // `top` keeps its colour where it tilts.
        const faceStyle =
          faceName === "slope"
            ? styles.slope || styles[n[1] > 0 ? "bottom" : "top"]
            : styles[faceName];
        return faceStyle ? { ...base, ...faceStyle } : base;
      };

      const sc = voxel.scale;
      const so = voxel.scaleOrigin;
      const gp = voxel.gap;
      const gs = gp ? 1 - 2 * gp : 1;

      const scaleAround = (c, ox, oy, oz, sx, sy, sz) => [
        ox + (c[0] - ox) * sx,
        oy + (c[1] - oy) * sy,
        oz + (c[2] - oz) * sz,
      ];

      const addFace = (type, vertices, n, cx, cy, cz) => {
        if (cullTypes && cullTypes.has(type)) return;
        let c = [cx, cy, cz];
        if (sc)
          c = scaleAround(
            c,
            x + so[0],
            y + so[1],
            z + so[2],
            sc[0],
            sc[1],
            sc[2],
          );
        if (gp) {
          c = scaleAround(c, x + 0.5, y + 0.5, z + 0.5, gs, gs, gs);
        }
        let verts = sc
          ? Heerich._scaleVertices(vertices, x, y, z, sc, so)
          : vertices;
        if (gp) {
          verts = Heerich._scaleVertices(
            verts,
            x,
            y,
            z,
            [gs, gs, gs],
            [0.5, 0.5, 0.5],
          );
        }
        // Non-uniform scale tilts slanted faces, so their normal must follow:
        // scale it by the inverse (written with cofactors, so a 0 is safe).
        // Axis-aligned normals keep their direction and are left alone.
        if (sc && type === "slope") {
          const m = [
            n[0] * sc[1] * sc[2],
            n[1] * sc[0] * sc[2],
            n[2] * sc[0] * sc[1],
          ];
          const len = Math.hypot(m[0], m[1], m[2]);
          if (len > 0) n = [m[0] / len, m[1] / len, m[2] / len];
        }
        faces3D.push({
          type,
          voxel,
          vertices: verts,
          n,
          c,
          style: getStyle(type, n),
        });
      };

      if (voxel.slope) {
        const shape = _slopeShapeOf(voxel.slope);
        const all = sc || gp;
        // A slanted face is hidden only if the cell's empty part is sealed:
        // every side this shape doesn't fill is backed by a full neighbour face.
        let sealed;
        const isSealed = () => {
          for (const side in SIDE_DELTA) {
            if (shape.sides[side]?.full) continue;
            const [dx, dy, dz] = SIDE_DELTA[side];
            if (!solidSide(x + dx, y + dy, z + dz, OPPOSITE[side]))
              return false;
          }
          return true;
        };
        // A side face is hidden by a full neighbour face, or by a neighbour
        // shape whose face on that wall has exactly the same outline.
        const covered = (side) => {
          const [dx, dy, dz] = SIDE_DELTA[side];
          if (solidSide(x + dx, y + dy, z + dz, OPPOSITE[side])) return true;
          const nb = this.voxels.get(this._k(x + dx, y + dy, z + dz));
          if (!nb || !nb.slope || nb.opaque === false || nb.gap) return false;
          const theirs = _slopeShapeOf(nb.slope).sides[OPPOSITE[side]];
          return !!theirs && theirs.key === shape.sides[side].key;
        };
        for (const f of shape.faces) {
          if (!all) {
            if (f.type === "slope") {
              if (sealed === undefined) sealed = isSealed();
              if (sealed) continue;
            } else if (covered(f.type)) continue;
          }
          addFace(
            f.type,
            f.verts.map((v) => [x + v[0], y + v[1], z + v[2]]),
            f.n,
            x + f.c[0],
            y + f.c[1],
            z + f.c[2],
          );
        }
        if (caching) cache.set(key, faces3D.slice(faceStart));
        continue;
      }

      // Emit up to 5 neighbor-exposed faces (back is always omitted — see JSDoc).
      // Camera-direction filtering for oblique is applied via cullTypes; other
      // projections filter in _projectAndSort via dot-product backface culling.
      if (sc || gp || !solidSide(x, y - 1, z, "bottom"))
        addFace(
          "top",
          [
            [x, y, z],
            [x + 1, y, z],
            [x + 1, y, z + 1],
            [x, y, z + 1],
          ],
          [0, -1, 0],
          x + 0.5,
          y,
          z + 0.5,
        );
      if (sc || gp || !solidSide(x, y + 1, z, "top"))
        addFace(
          "bottom",
          [
            [x, y + 1, z + 1],
            [x + 1, y + 1, z + 1],
            [x + 1, y + 1, z],
            [x, y + 1, z],
          ],
          [0, 1, 0],
          x + 0.5,
          y + 1,
          z + 0.5,
        );
      if (sc || gp || !solidSide(x - 1, y, z, "right"))
        addFace(
          "left",
          [
            [x, y, z + 1],
            [x, y, z],
            [x, y + 1, z],
            [x, y + 1, z + 1],
          ],
          [-1, 0, 0],
          x,
          y + 0.5,
          z + 0.5,
        );
      if (sc || gp || !solidSide(x + 1, y, z, "left"))
        addFace(
          "right",
          [
            [x + 1, y, z],
            [x + 1, y, z + 1],
            [x + 1, y + 1, z + 1],
            [x + 1, y + 1, z],
          ],
          [1, 0, 0],
          x + 1,
          y + 0.5,
          z + 0.5,
        );
      if (sc || gp || !solidSide(x, y, z - 1, "back"))
        addFace(
          "front",
          [
            [x, y, z],
            [x, y + 1, z],
            [x + 1, y + 1, z],
            [x + 1, y, z],
          ],
          [0, 0, -1],
          x + 0.5,
          y + 0.5,
          z,
        );
      if (sc || gp || !solidSide(x, y, z + 1, "front"))
        addFace(
          "back",
          [
            [x + 1, y, z + 1],
            [x + 1, y + 1, z + 1],
            [x, y + 1, z + 1],
            [x, y, z + 1],
          ],
          [0, 0, 1],
          x + 0.5,
          y + 0.5,
          z + 1,
        );
      if (caching) cache.set(key, faces3D.slice(faceStart));
    }

    dirtyKeys.clear();
    this._facesBuilt = true;
    return faces3D;
  }

  /**
   * Generate faces from stored voxels.
   *
   * By default returns projected, depth-sorted 2D faces for SVG rendering.
   * Pass `{ raw: true }` to get all neighbour-exposed 3D faces without any
   * camera-dependent culling or projection — the correct input for
   * GPURenderer, which lets the GPU handle its own backface culling.
   *
   * Both modes are epoch-cached: repeated calls with no scene changes are free.
   *
   * @param {Object} [options]
   * @param {boolean} [options.raw=false] - Return raw 3D faces instead of projected 2D faces.
   * @returns {Face[]}
   */
  getFaces(options = {}) {
    if (options.raw) {
      if (this._cachedRawEpoch === this._epoch && this._cachedRawFaces) {
        return this._cachedRawFaces;
      }
      const result = this._buildFaces3D().filter((f) => f.type !== "content");
      this._cachedRawFaces = result;
      this._cachedRawEpoch = this._epoch;
      return result;
    }

    if (this._cachedEpoch === this._epoch && this._cachedFaces) {
      return this._cachedFaces;
    }

    // For oblique projection, cull invisible faces at generation time so the
    // hot rebuild path never allocates them. Other projections must rely on the
    // per-face dot-product backface check in _projectAndSort, because what they
    // can see depends on where a face is, so cullTypes stays null for them.
    let cullTypes = null;
    if (this.renderOptions.projection === "oblique") {
      const { depthOffsetX, depthOffsetY } = this.renderOptions;
      cullTypes = new Set();
      cullTypes.add("back"); // back face is never visible in oblique
      if (depthOffsetY >= 0) cullTypes.add("top");
      if (depthOffsetY <= 0) cullTypes.add("bottom");
      if (depthOffsetX >= 0) cullTypes.add("left");
      if (depthOffsetX <= 0) cullTypes.add("right");
    }

    const result = this._projectAndSort(this._buildFaces3D(cullTypes));
    this._cachedFaces = result;
    this._cachedEpoch = this._epoch;
    return result;
  }

  /**
   * Generate faces from a test function without storing any voxels.
   * Zero Map allocations — useful for procedural/infinite scenes.
   * @param {Object} opts
   * @param {[[number,number,number],[number,number,number]]} [opts.bounds] - Single scan region
   * @param {Array<[[number,number,number],[number,number,number]]>} [opts.regions] - Multiple scan regions (auto-deduped)
   * @param {(x: number, y: number, z: number) => boolean} opts.test - Inclusion test
   * @param {StyleParam|((x: number, y: number, z: number, face: string) => StyleObject)} [opts.style] - Style per voxel or per face
   * @param {number} [opts.gap] - Gap override (defaults to constructor gap)
   * @param {(x: number, y: number, z: number) => number} [opts.nearZ] - Fractional z of a voxel's camera-facing side (default `z`). Moves its front face and stretches its side faces, so a surface can animate smoothly between layers.
   * @returns {Face[]}
   */
  renderTest(opts) {
    const regions = opts.regions || [opts.bounds];
    const test = opts.test;
    const gp = opts.gap !== undefined ? opts.gap : this.defaultGap;
    const styleFn = typeof opts.style === "function" ? opts.style : null;
    const styleObj = /** @type {FaceStyleMap|null} */ (
      !styleFn ? opts.style || null : null
    );
    const defaultStyle = this.defaultStyle;

    const {
      projection,
      depthOffsetX,
      depthOffsetY,
      cameraX,
      cameraY,
      cameraDistance,
    } = this.renderOptions;
    const isOblique = projection === "oblique";
    const isPerspective = projection === "perspective";
    const nearZ = opts.nearZ || null;

    const faces3D = [];
    const scanned = regions.length > 1 ? new Set() : null;
    const noStyle = !styleFn && !styleObj;

    const gs = gp ? 1 - 2 * gp : 1;
    const gScale = gp ? [gs, gs, gs] : null;
    const gOrigin = [0.5, 0.5, 0.5];
    // Which sides can face the camera is known from position alone, so the
    // (possibly expensive) neighbour test only runs for sides that could show.
    // The margin keeps exact ties for the dot-product check in _projectAndSort.
    const inset = (gp || 0) + 1e-9;

    let x = 0,
      y = 0,
      z = 0;
    let voxel = null;

    const getStyle = (faceName) => {
      if (noStyle) return defaultStyle; // no allocation
      if (styleFn) return { ...defaultStyle, ...styleFn(x, y, z, faceName) };
      const sd = styleObj.default;
      const base = sd
        ? {
            ...defaultStyle,
            ...(typeof sd === "function" ? sd(x, y, z) : sd),
          }
        : defaultStyle;
      const fs = styleObj[faceName];
      return fs
        ? {
            ...base,
            ...(typeof fs === "function" ? fs(x, y, z) : fs),
          }
        : base;
    };

    const addFace = (type, vertices, n, c) => {
      if (!voxel) voxel = { x, y, z };
      let verts = vertices;
      let center = c;
      if (gp) {
        verts = Heerich._scaleVertices(vertices, x, y, z, gScale, gOrigin);
        const gox = x + 0.5,
          goy = y + 0.5,
          goz = z + 0.5;
        center = [
          gox + (c[0] - gox) * gs,
          goy + (c[1] - goy) * gs,
          goz + (c[2] - goz) * gs,
        ];
      }
      faces3D.push({
        type,
        voxel,
        vertices: verts,
        n,
        c: center,
        style: getStyle(type),
      });
    };

    for (const [[minX, minY, minZ], [maxX, maxY, maxZ]] of regions) {
      for (z = minZ; z < maxZ; z++) {
        const seeFront = isPerspective
          ? nearZ !== null || z + inset + cameraDistance > 0
          : true;
        const seeBack = isOblique
          ? false
          : isPerspective
            ? z + 1 - inset + cameraDistance < 0
            : true;

        for (y = minY; y < maxY; y++) {
          const seeTop = isOblique
            ? depthOffsetY < 0
            : !isPerspective || y + inset > cameraY;
          const seeBottom = isOblique
            ? depthOffsetY > 0
            : !isPerspective || y + 1 - inset < cameraY;

          for (x = minX; x < maxX; x++) {
            if (scanned) {
              const k = ((x + 512) << 20) | ((y + 512) << 10) | (z + 512);
              if (scanned.has(k)) continue;
              scanned.add(k);
            }

            if (!test(x, y, z)) continue;

            const seeLeft = isOblique
              ? depthOffsetX < 0
              : !isPerspective || x + inset > cameraX;
            const seeRight = isOblique
              ? depthOffsetX > 0
              : !isPerspective || x + 1 - inset < cameraX;

            const top = seeTop && !test(x, y - 1, z);
            const bottom = seeBottom && !test(x, y + 1, z);
            const left = seeLeft && !test(x - 1, y, z);
            const right = seeRight && !test(x + 1, y, z);
            const front = seeFront && !test(x, y, z - 1);
            const back = seeBack && !test(x, y, z + 1);
            if (!(top || bottom || left || right || front || back)) continue;

            voxel = null;
            const zn = nearZ ? nearZ(x, y, z) : z;

            if (top)
              addFace(
                "top",
                [
                  [x, y, zn],
                  [x + 1, y, zn],
                  [x + 1, y, z + 1],
                  [x, y, z + 1],
                ],
                [0, -1, 0],
                [x + 0.5, y, z + 0.5],
              );
            if (bottom)
              addFace(
                "bottom",
                [
                  [x, y + 1, z + 1],
                  [x + 1, y + 1, z + 1],
                  [x + 1, y + 1, zn],
                  [x, y + 1, zn],
                ],
                [0, 1, 0],
                [x + 0.5, y + 1, z + 0.5],
              );
            if (left)
              addFace(
                "left",
                [
                  [x, y, z + 1],
                  [x, y, zn],
                  [x, y + 1, zn],
                  [x, y + 1, z + 1],
                ],
                [-1, 0, 0],
                [x, y + 0.5, z + 0.5],
              );
            if (right)
              addFace(
                "right",
                [
                  [x + 1, y, zn],
                  [x + 1, y, z + 1],
                  [x + 1, y + 1, z + 1],
                  [x + 1, y + 1, zn],
                ],
                [1, 0, 0],
                [x + 1, y + 0.5, z + 0.5],
              );
            if (front)
              addFace(
                "front",
                [
                  [x, y, zn],
                  [x, y + 1, zn],
                  [x + 1, y + 1, zn],
                  [x + 1, y, zn],
                ],
                [0, 0, -1],
                [x + 0.5, y + 0.5, zn],
              );
            if (back)
              addFace(
                "back",
                [
                  [x + 1, y, z + 1],
                  [x + 1, y + 1, z + 1],
                  [x, y + 1, z + 1],
                  [x, y, z + 1],
                ],
                [0, 0, 1],
                [x + 0.5, y + 0.5, z + 1],
              );
          }
        }
      }
    }

    return this._projectAndSort(faces3D);
  }

  /**
   * Project a 3D point into the 2D coordinate space of the rendered SVG using
   * the current camera. The returned point matches the rendered polygon points
   * (i.e. *before* the `<g transform="translate(offset)">` applied by `toSVG`),
   * so it is the correct space for a `<linearGradient>`/`<radialGradient>` with
   * `gradientUnits="userSpaceOnUse"`.
   *
   * Projection reflects the current camera (set in the constructor or via
   * `setCamera`). Under perspective the projection is non-linear, so to aim a
   * gradient along a wall project the wall's two actual 3D endpoints rather than
   * a direction vector.
   *
   * @example
   * const a = h.project([0, 0, 5]); // {x, y}
   * const b = h.project([0, 8, 5]);
   * h.toSVG({ prepend:
   *   `<defs><linearGradient id="wall" gradientUnits="userSpaceOnUse"
   *      x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}">
   *      <stop offset="0" stop-color="#f70"/><stop offset="1" stop-color="#70f"/>
   *    </linearGradient></defs>` });
   *
   * @param {[number, number, number]} point - 3D point `[x, y, z]` in voxel/world coords
   * @returns {{x: number, y: number}} Projected 2D point
   */
  project(point) {
    return this._projectPoint(point[0], point[1], point[2]);
  }

  /**
   * Build the affine transform that maps the unit square `[0,1]²` onto a face's
   * projected quad, returned as an SVG `matrix(a b c d e f)` string. Drop it on
   * a gradient or pattern as `gradientTransform` / `patternTransform` (with
   * `gradientUnits="userSpaceOnUse"` and coordinates defined in 0–1 space) to
   * align that fill to the face — no per-endpoint projection needed.
   *
   * Where `project()` maps a single point (handy for a linear gradient between
   * two anchors), `faceTransform()` maps the whole quad, so it also covers
   * radial gradients, diagonal axes and patterns. It uses corners 0/1/3 of the
   * quad as origin / +U / +V, an affine (parallelogram) approximation of the
   * projected face — exact for oblique/orthographic, a close fit under
   * perspective.
   *
   * Pass `offset` (a 3D world-space vector) to lift the quad off the surface
   * before projecting — e.g. the face normal times a small distance to float a
   * plane, label or sticker just above the face. The lift happens in 3D, so it
   * foreshortens correctly under perspective (unlike nudging the result in
   * screen space). This requires the face's 3D `vertices` (present on faces from
   * `getFaces()`); without `offset` the cheaper projected-`points` path is used.
   *
   * @example
   * // one gradient defined in unit space, transformed per face
   * const faces = h.getFaces();
   * const defs = faces.map((f, i) =>
   *   `<linearGradient id="g${i}" gradientUnits="userSpaceOnUse"
   *      x1="0" y1="0" x2="1" y2="0" gradientTransform="${h.faceTransform(f)}">
   *      <stop offset="0" stop-color="#f70"/><stop offset="1" stop-color="#70f"/>
   *    </linearGradient>`);
   * h.toSVG({
   *   faces,
   *   faceAttributes: (f) => ({ fill: `url(#g${faces.indexOf(f)})` }),
   *   prepend: `<defs>${defs.join("")}</defs>`,
   * });
   *
   * @example
   * // float a plane 0.2 units off each face, along its normal
   * const m = h.faceTransform(f, [f.n[0] * 0.2, f.n[1] * 0.2, f.n[2] * 0.2]);
   *
   * @param {Face} face - A face from `getFaces()` (must carry a 4-point quad)
   * @param {[number, number, number]} [offset] - World-space lift applied to the
   *   face's 3D vertices before projecting (requires `face.vertices`)
   * @returns {string} SVG transform string `matrix(a b c d e f)`
   */
  faceTransform(face, offset) {
    const t = (v) => Math.round(v * 1e4) / 1e4;
    let p;
    if (offset) {
      const verts = face.vertices;
      p = [];
      for (let i = 0; i < 4; i++) {
        const q = this._projectPoint(
          verts[i][0] + offset[0],
          verts[i][1] + offset[1],
          verts[i][2] + offset[2],
        );
        p.push(q.x, q.y);
      }
    } else {
      p = face.points.data;
    }
    // matrix(a b c d e f): corner 0 = origin (e,f), corner 1 = +U, corner 3 = +V
    const a = t(p[2] - p[0]);
    const b = t(p[3] - p[1]);
    const c = t(p[6] - p[0]);
    const d = t(p[7] - p[1]);
    return `matrix(${a} ${b} ${c} ${d} ${t(p[0])} ${t(p[1])})`;
  }

  /**
   * Project a single 3D point to 2D pixel space using the current camera.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {{x: number, y: number}}
   */
  _projectPoint(x, y, z) {
    const out = [0, 0];
    makeProjector(this.renderOptions)(x, y, z, out);
    const t = (v) => Math.round(v * 1e4) / 1e4;
    return { x: t(out[0]), y: t(out[1]) };
  }

  /**
   * Project 3D faces to 2D and sort by depth (shared by getFaces and renderTest).
   * @param {Object[]} faces3D - Face objects with `vertices` (3D) or `points` (already 2D)
   * @returns {Face[]} Projected, depth-sorted face array
   */
  _projectAndSort(faces3D) {
    const projectedFaces = [];
    const truncate = (v) => Math.round(v * 1e4) / 1e4;
    const {
      projection,
      tileW,
      tileH,
      depthOffsetX,
      depthOffsetY,
      cameraX,
      cameraY,
    } = this.renderOptions;
    const dx_norm = projection === "oblique" ? depthOffsetX / tileW : 0;
    const dy_norm = projection === "oblique" ? depthOffsetY / tileH : 0;

    const { cameraDistance, angle = 0, pitch = 0 } = this.renderOptions;
    const cosT = Math.cos(angle),
      sinT = Math.sin(angle);
    const cosP = Math.cos(pitch),
      sinP = Math.sin(pitch);
    // View vector is Z-axis inversely transformed
    // We know Z extends backward, so we adjust accordingly
    const orthoViewX = sinT * cosP,
      orthoViewY = sinP,
      orthoViewZ = cosT * cosP;

    for (const face of faces3D) {
      if (face.type === "content") {
        const [cx, cy, cz] = face._pos;
        let px, py, scale, depth;
        if (projection === "oblique") {
          px = truncate((cx + 0.5) * tileW + (cz + 0.5) * depthOffsetX);
          py = truncate((cy + 0.5) * tileH + (cz + 0.5) * depthOffsetY);
          scale = 1;
          depth = cz + 0.5 - (cx + 0.5) * dx_norm - (cy + 0.5) * dy_norm;
        } else if (
          projection === "orthographic" ||
          projection === "isometric"
        ) {
          const x1 = (cx + 0.5) * cosT - (cz + 0.5) * sinT;
          const y1 =
            (cy + 0.5) * cosP - ((cx + 0.5) * sinT + (cz + 0.5) * cosT) * sinP;
          px = truncate((x1 + 5) * tileW);
          py = truncate((y1 + 5) * tileH);
          scale = 1;
          depth =
            (cy + 0.5) * sinP + ((cx + 0.5) * sinT + (cz + 0.5) * cosT) * cosP;
        } else {
          const t = cameraDistance / (cz + 0.5 + cameraDistance);
          px = truncate((cameraX + (cx + 0.5 - cameraX) * t) * tileW);
          py = truncate((cameraY + (cy + 0.5 - cameraY) * t) * tileH);
          scale = truncate(t);
          const dx = cx + 0.5 - cameraX,
            dy = cy + 0.5 - cameraY,
            dz = cz + 0.5 + cameraDistance;
          depth = dx * dx + dy * dy + dz * dz;
        }
        const corners = [
          [cx, cy, cz],
          [cx + 1, cy, cz],
          [cx, cy + 1, cz],
          [cx + 1, cy + 1, cz],
        ];
        if (projection === "oblique") {
          const flat = [];
          for (const [vx, vy, vz] of corners) {
            flat.push(
              truncate(vx * tileW + vz * depthOffsetX),
              truncate(vy * tileH + vz * depthOffsetY),
            );
          }
          face.points = new Points(flat);
        } else if (
          projection === "orthographic" ||
          projection === "isometric"
        ) {
          const flat = [];
          for (const [vx, vy, vz] of corners) {
            const x1 = vx * cosT - vz * sinT;
            const y1 = vy * cosP - (vx * sinT + vz * cosT) * sinP;
            flat.push(truncate((x1 + 5) * tileW), truncate((y1 + 5) * tileH));
          }
          face.points = new Points(flat);
        } else {
          const flat = [];
          for (const [vx, vy, vz] of corners) {
            const ct = cameraDistance / (vz + cameraDistance);
            flat.push(
              truncate((cameraX + (vx - cameraX) * ct) * tileW),
              truncate((cameraY + (vy - cameraY) * ct) * tileH),
            );
          }
          face.points = new Points(flat);
        }
        face.depth = depth;
        face._px = px;
        face._py = py;
        face._scale = scale;
        projectedFaces.push(face);
        continue;
      }

      if (projection === "oblique") {
        // Camera-direction cull: oblique only sees one horizontal face, one
        // vertical face, and the front. Back is always hidden.
        if (
          face.type === "back" ||
          (face.type === "top" && depthOffsetY >= 0) ||
          (face.type === "bottom" && depthOffsetY <= 0) ||
          (face.type === "left" && depthOffsetX >= 0) ||
          (face.type === "right" && depthOffsetX <= 0)
        )
          continue;
        // Slanted faces have no fixed side, so test the normal against the
        // oblique view direction (-dx_norm, -dy_norm, 1) instead.
        if (
          face.type === "slope" &&
          // a hair below 0 so faces seen exactly edge-on (zero area) drop out
          face.n[2] - face.n[0] * dx_norm - face.n[1] * dy_norm >= -1e-9
        )
          continue;

        face.depth = face.c[2] - face.c[0] * dx_norm - face.c[1] * dy_norm;
        const [v0, v1, v2, v3] = face.vertices;
        face.points = Points.quad(
          truncate(v0[0] * tileW + v0[2] * depthOffsetX),
          truncate(v0[1] * tileH + v0[2] * depthOffsetY),
          truncate(v1[0] * tileW + v1[2] * depthOffsetX),
          truncate(v1[1] * tileH + v1[2] * depthOffsetY),
          truncate(v2[0] * tileW + v2[2] * depthOffsetX),
          truncate(v2[1] * tileH + v2[2] * depthOffsetY),
          truncate(v3[0] * tileW + v3[2] * depthOffsetX),
          truncate(v3[1] * tileH + v3[2] * depthOffsetY),
        );
      } else if (projection === "orthographic" || projection === "isometric") {
        const dot =
          orthoViewX * face.n[0] +
          orthoViewY * face.n[1] +
          orthoViewZ * face.n[2];
        if (dot >= 0) continue;

        const [v0, v1, v2, v3] = face.vertices;
        const projX = (v) => (v[0] * cosT - v[2] * sinT + 5) * tileW;
        const projY = (v) =>
          (v[1] * cosP - (v[0] * sinT + v[2] * cosT) * sinP + 5) * tileH;
        face.points = Points.quad(
          truncate(projX(v0)),
          truncate(projY(v0)),
          truncate(projX(v1)),
          truncate(projY(v1)),
          truncate(projX(v2)),
          truncate(projY(v2)),
          truncate(projX(v3)),
          truncate(projY(v3)),
        );
        face.depth =
          face.c[1] * sinP + (face.c[0] * sinT + face.c[2] * cosT) * cosP;
      } else if (projection === "perspective") {
        const Cx = cameraX;
        const Cy = cameraY;
        const Cz = -cameraDistance;

        const viewX = face.c[0] - Cx,
          viewY = face.c[1] - Cy,
          viewZ = face.c[2] - Cz;
        const dot = viewX * face.n[0] + viewY * face.n[1] + viewZ * face.n[2];
        if (dot >= 0) continue;

        const minDenom = 0.01;
        const [v0, v1, v2, v3] = face.vertices;
        const d0 = v0[2] + cameraDistance,
          d1 = v1[2] + cameraDistance,
          d2 = v2[2] + cameraDistance,
          d3 = v3[2] + cameraDistance;
        if (d0 < minDenom || d1 < minDenom || d2 < minDenom || d3 < minDenom)
          continue;

        const t0 = cameraDistance / d0,
          t1 = cameraDistance / d1,
          t2 = cameraDistance / d2,
          t3 = cameraDistance / d3;
        face.points = Points.quad(
          truncate((Cx + (v0[0] - Cx) * t0) * tileW),
          truncate((Cy + (v0[1] - Cy) * t0) * tileH),
          truncate((Cx + (v1[0] - Cx) * t1) * tileW),
          truncate((Cy + (v1[1] - Cy) * t1) * tileH),
          truncate((Cx + (v2[0] - Cx) * t2) * tileW),
          truncate((Cy + (v2[1] - Cy) * t2) * tileH),
          truncate((Cx + (v3[0] - Cx) * t3) * tileW),
          truncate((Cy + (v3[1] - Cy) * t3) * tileH),
        );

        face.depth = viewX * viewX + viewY * viewY + viewZ * viewZ;
      }

      projectedFaces.push(face);
    }

    projectedFaces.sort(
      (a, b) =>
        b.depth - a.depth ||
        a.voxel.x - b.voxel.x ||
        a.voxel.y - b.voxel.y ||
        a.voxel.z - b.voxel.z ||
        (a.type < b.type ? -1 : a.type > b.type ? 1 : 0),
    );
    return projectedFaces;
  }

  /**
   * Get the 2D bounding box of rendered faces, with optional padding.
   * @param {number} [padding=0] - Padding to add around the bounds
   * @param {Face[]} [faces] - Pre-computed faces. Uses stored voxels if omitted.
   * @returns {{x: number, y: number, w: number, h: number, faces: Face[]}}
   */
  getBounds(padding = 0, faces) {
    if (!faces) faces = this.getFaces();
    const b = computeBounds(faces);
    return {
      x: b.x - padding,
      y: b.y - padding,
      w: b.w + padding * 2,
      h: b.h + padding * 2,
      faces,
    };
  }

  /**
   * Measure one frame size that holds the current voxels across a range of camera
   * settings, so a shape stays the same size and doesn't wiggle while the camera
   * turns. Pass the result to `toSVG({ fit })` or `updateSVG(target, { fit })`.
   *
   * Measure again when the voxels change; a moving camera can reuse the frame.
   *
   * @param {Object} [options]
   * @param {Array<'oblique'|'orthographic'|'isometric'|'perspective'>} [options.cameras] - Camera types to cover (default: all four)
   * @param {[number,number]} [options.angle=[0,360]] - Angle range in degrees
   * @param {[number,number]} [options.pitch=[0,89]] - Orthographic pitch range in degrees
   * @param {[number,number]} [options.distance=[1,40]] - Oblique and perspective distance range
   * @param {Array<[number,number]>} [options.positions] - Perspective camera positions to cover. For a range, pass its corners. Defaults to the current position if the camera is perspective, otherwise the pivot.
   * @param {[number,number,number]} [options.pivot] - The 3D point to turn around. Defaults to the voxels' average position.
   * @returns {FitFrame}
   */
  getFitFrame(options = {}) {
    const {
      cameras = ["oblique", "orthographic", "isometric", "perspective"],
      angle: angleRange = [0, 360],
      pitch: pitchRange = [0, 89],
      distance: distanceRange = [1, 40],
    } = options;

    // A shape's extremes are always voxel corners, because every camera keeps lines
    // straight. Of those, only each (x, y) column's nearest and farthest z matter.
    const columns = new Map();
    let sumX = 0,
      sumY = 0,
      sumZ = 0,
      minZ = Infinity;
    for (const v of this.voxels.values()) {
      sumX += v.x + 0.5;
      sumY += v.y + 0.5;
      sumZ += v.z + 0.5;
      if (v.z < minZ) minZ = v.z;
      for (let dx = 0; dx <= 1; dx++) {
        for (let dy = 0; dy <= 1; dy++) {
          const key = (v.x + dx) * 4096 + (v.y + dy);
          const column = columns.get(key);
          if (!column) columns.set(key, [v.x + dx, v.y + dy, v.z, v.z + 1]);
          else {
            if (v.z < column[2]) column[2] = v.z;
            if (v.z + 1 > column[3]) column[3] = v.z + 1;
          }
        }
      }
    }
    const count = this.voxels.size;
    const pivot =
      options.pivot ||
      (count
        ? [sumX / count, sumY / count, sumZ / count]
        : /** @type {[number,number,number]} */ ([0, 0, 0]));
    // An oblique camera only slides each depth sideways, so any depth it holds still
    // stays put. Holding the front keeps what you look at from moving with the camera.
    const frontZ = options.pivot ? pivot[2] : minZ;
    if (!count) return { pivot, frontZ: pivot[2], width: 0, height: 0 };

    const points = new Float64Array(columns.size * 6);
    let n = 0;
    for (const [x, y, z0, z1] of columns.values()) {
      points[n++] = x;
      points[n++] = y;
      points[n++] = z0;
      points[n++] = x;
      points[n++] = y;
      points[n++] = z1;
    }

    let width = 0,
      height = 0;
    const out = [0, 0];
    const measure = (camera) => {
      const project = makeProjector({
        ...this.renderOptions,
        ...this._cameraSettings(camera),
      });
      project(
        pivot[0],
        pivot[1],
        camera.type === "oblique" ? frontZ : pivot[2],
        out,
      );
      const cx = out[0],
        cy = out[1];
      for (let i = 0; i < n; i += 3) {
        project(points[i], points[i + 1], points[i + 2], out);
        const w = Math.abs(out[0] - cx) * 2,
          h = Math.abs(out[1] - cy) * 2;
        if (w > width) width = w;
        if (h > height) height = h;
      }
    };
    const steps = ([from, to]) => {
      const values = [];
      for (let v = from; v < to; v += FIT_STEP_DEG) values.push(v);
      values.push(to);
      return values;
    };

    if (cameras.includes("oblique")) {
      // The offset grows with distance, so its extremes are at the ends of the range
      for (const angle of steps(angleRange)) {
        for (const distance of distanceRange) {
          measure({ type: "oblique", angle, distance });
        }
      }
    }
    if (cameras.includes("orthographic")) {
      for (const angle of steps(angleRange)) {
        for (const pitch of steps(pitchRange)) {
          measure({ type: "orthographic", angle, pitch });
        }
      }
    }
    if (cameras.includes("isometric")) {
      for (const angle of steps(angleRange)) {
        measure({ type: "isometric", angle });
      }
    }
    if (cameras.includes("perspective")) {
      const positions =
        options.positions ||
        (this.renderOptions.projection === "perspective"
          ? [[this.renderOptions.cameraX, this.renderOptions.cameraY]]
          : [[pivot[0], pivot[1]]]);
      // A voxel at or past the camera has no finite position, so the sweep starts
      // where the nearest one is scaled at most 2x. Closer views grow the frame.
      const nearest = Math.max(distanceRange[0], minZ < 0 ? -2 * minZ : 0);
      const farthest = Math.max(nearest, distanceRange[1]);
      // Geometric steps, because the view changes fastest when the camera is close
      for (let i = 0; i <= 32; i++) {
        const distance =
          nearest > 0
            ? nearest * (farthest / nearest) ** (i / 32)
            : (farthest * i) / 32;
        for (const position of positions) {
          measure({ type: "perspective", position, distance });
        }
      }
    }

    return {
      pivot,
      frontZ,
      width: width * FIT_MARGIN,
      height: height * FIT_MARGIN,
    };
  }

  /**
   * The viewBox a `getFitFrame()` frame gives under the current camera: centred on
   * the pivot, and grown only if this view reaches past the frame. `toSVG({ fit })`
   * and `updateSVG(target, { fit })` use this for you.
   *
   * @param {FitFrame|Object|true} [fit=true] - A frame, or `getFitFrame()` options (or `true`) to measure one now. With no stored voxels to measure, this is the normal fit around `faces`.
   * @param {Object} [options]
   * @param {number} [options.padding=20] - ViewBox padding in pixels
   * @param {Face[]} [options.faces] - The faces that must stay in frame. Uses the scene's if omitted.
   * @returns {[number,number,number,number]} [x, y, w, h]
   */
  getFitViewBox(fit = true, options = {}) {
    const pad = options.padding ?? 20;
    const b = computeBounds(options.faces || this.getFaces());
    const isFrame = fit !== true && fit.width !== undefined;
    if (!isFrame && !this.voxels.size) {
      return [b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2];
    }
    const frame = isFrame ? fit : this.getFitFrame(fit === true ? {} : fit);
    const { x: cx, y: cy } = this.project(
      this.renderOptions.projection === "oblique"
        ? [frame.pivot[0], frame.pivot[1], frame.frontZ]
        : frame.pivot,
    );
    const w = Math.max(
      frame.width + pad * 2,
      2 * (Math.max(cx - b.x, b.x + b.w - cx) + pad),
    );
    const h = Math.max(
      frame.height + pad * 2,
      2 * (Math.max(cy - b.y, b.y + b.h - cy) + pad),
    );
    return [cx - w / 2, cy - h / 2, w, h];
  }

  /**
   * Query position and size data for a single voxel.
   *
   * Accepts either a `[x, y, z]` coordinate array or a voxel object reference
   * (e.g. one returned by `getVoxel()`, `findVoxels()`, or `face.voxel`).
   *
   * All 2D values are in the same pixel space as `getFaces()` / `getBounds()` —
   * i.e. before any SVG viewBox offset or padding is applied.
   *
   * @param {[number,number,number]|Voxel} posOrVoxel - Coordinate array or voxel reference
   * @returns {{
   *   voxel: Voxel|null,
   *   center3D: [number,number,number],
   *   center2D: {x:number, y:number},
   *   bounds2D: {x:number, y:number, w:number, h:number}|null,
   *   normalizedCenter2D: {x:number, y:number}|null,
   *   normalizedSize2D: {w:number, h:number}|null,
   * }}
   */
  getVoxelInfo(posOrVoxel) {
    const voxel = Array.isArray(posOrVoxel)
      ? this.getVoxel(posOrVoxel)
      : posOrVoxel;

    if (!voxel) {
      return {
        voxel: null,
        center3D: null,
        center2D: null,
        bounds2D: null,
        normalizedCenter2D: null,
        normalizedSize2D: null,
      };
    }

    const { x, y, z } = voxel;
    const cx = x + 0.5,
      cy = y + 0.5,
      cz = z + 0.5;

    const center3D = /** @type {[number,number,number]} */ ([cx, cy, cz]);
    const center2D = this._projectPoint(cx, cy, cz);

    // Collect projected bounds from all visible faces belonging to this voxel.
    // getFaces() is epoch-cached so this filter is the only cost.
    const faces = this.getFaces();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    let hasFaces = false;
    for (let i = 0; i < faces.length; i++) {
      const face = faces[i];
      if (face.voxel !== voxel) continue;
      const d = face.points.data;
      for (let j = 0; j < d.length; j += 2) {
        const px = d[j],
          py = d[j + 1];
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      hasFaces = true;
    }

    const bounds2D = hasFaces
      ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
      : null;

    // Normalize against scene bounds. getBounds() reuses the same getFaces() cache.
    const scene = computeBounds(faces);
    const normalizedCenter2D =
      scene.w > 0 && scene.h > 0
        ? {
            x: (center2D.x - scene.x) / scene.w,
            y: (center2D.y - scene.y) / scene.h,
          }
        : null;
    const normalizedSize2D =
      bounds2D && scene.w > 0 && scene.h > 0
        ? { w: bounds2D.w / scene.w, h: bounds2D.h / scene.h }
        : null;

    return {
      voxel,
      center3D,
      center2D,
      bounds2D,
      normalizedCenter2D,
      normalizedSize2D,
    };
  }

  /**
   * Find the frontmost voxel at a 2D screen-space position.
   *
   * Coordinates are expected in the same raw pixel space that `getFaces()` and
   * `getBounds()` use — i.e. before any SVG viewBox offset or padding. If you
   * are working from a mouse event on a rendered SVG, pass the viewBox origin
   * via `options.offset` to convert automatically:
   *
   * ```js
   * const bounds = h.getBounds(padding)
   * const hit = h.findByPosition([svgX, svgY], { offset: [bounds.x, bounds.y] })
   * ```
   *
   * @param {[number, number]} pos - 2D position [x, y] in screen/SVG space
   * @param {Object} [options]
   * @param {[number, number]} [options.offset] - [dx, dy] added to pos before testing (e.g. viewBox origin from getBounds())
   * @returns {{ voxel: Voxel, face: Face } | null}
   */
  findByPosition(pos, options = {}) {
    const offset = options.offset;
    const px = offset ? pos[0] + offset[0] : pos[0];
    const py = offset ? pos[1] + offset[1] : pos[1];

    const faces = this.getFaces();
    // Faces are sorted back-to-front for rendering; iterate in reverse to hit
    // frontmost faces first and return on the first match.
    for (let i = faces.length - 1; i >= 0; i--) {
      const face = faces[i];
      if (face.type === "content") continue;
      if (_pointInConvexPoly(px, py, face.points)) {
        return { voxel: face.voxel, face };
      }
    }
    return null;
  }

  /**
   * @param {Face[]} faces
   * @param {Object} options - `toSVG()` options
   * @returns {[number,number,number,number]|undefined}
   * @private
   */
  _resolveViewBox(faces, options) {
    if (options.viewBox || !options.fit) return options.viewBox;
    return this.getFitViewBox(options.fit, {
      padding: options.padding,
      faces,
    });
  }

  /**
   * Render the scene (or pre-computed faces) to an SVG string.
   * @param {Object} [options]
   * @param {number} [options.padding=20] - ViewBox padding in pixels
   * @param {Face[]} [options.faces] - Pre-computed faces (skips internal `getFaces()`)
   * @param {[number,number,number,number]} [options.viewBox] - Custom viewBox override [x, y, w, h]
   * @param {FitFrame|Object|true} [options.fit] - Keep one frame while the camera moves: a `getFitFrame()` result, or its options (or `true`) to measure one on each render. `viewBox` takes priority.
   * @param {[number,number]} [options.offset=[0,0]] - Translate all geometry
   * @param {string} [options.prepend] - Raw SVG to insert before faces
   * @param {string} [options.append] - Raw SVG to insert after faces
   * @param {(face: Face) => Object|null} [options.faceAttributes] - Per-face attribute callback
   * @param {boolean} [options.dataAttributes=true] - Write the `data-*` attributes (voxel, x, y, z, face, meta). Turn off when nothing reads them
   * @param {boolean} [options.occlusion=false] - Enable built-in occlusion culling
   * @param {(polygon: number[][], occluders: number[][][]) => string|null} [options.resolveOcclusion] - Custom occlusion resolver (overrides built-in). Providing this implicitly enables occlusion.
   * @returns {string} SVG markup
   */
  toSVG(options = {}) {
    if (!this._svgRenderer) this._svgRenderer = new SVGRenderer();
    const faces = options.faces || this.getFaces();
    return this._svgRenderer.render(faces, {
      ...options,
      viewBox: this._resolveViewBox(faces, options),
      tileW: this.renderOptions.tileW,
      decals: this.decals,
    });
  }

  /**
   * Render the scene into an existing DOM element, reusing its elements between
   * calls and only writing the attributes that changed. Use this instead of
   * `toSVG()` when rendering repeatedly, such as in an animation.
   *
   * The faces go in a `<g>` appended to `target` on the first call, so anything
   * else in `target` is left alone.
   *
   * @param {Element} target - An `<svg>` or `<g>`. An `<svg>` also gets its `viewBox` set.
   * @param {Object} [options] - Same as `toSVG()`, without `prepend` and `append`
   * @returns {Element} The `target`
   */
  updateSVG(target, options = {}) {
    if (!this._svgRenderer) this._svgRenderer = new SVGRenderer();
    const faces = options.faces || this.getFaces();
    return this._svgRenderer.update(target, faces, {
      ...options,
      // A <g> has no viewBox, so don't measure a frame for one
      viewBox:
        target.tagName.toLowerCase() === "svg"
          ? this._resolveViewBox(faces, options)
          : options.viewBox,
      tileW: this.renderOptions.tileW,
      decals: this.decals,
    });
  }
}
