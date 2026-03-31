import { SVGRenderer, computeBounds } from "./svg-renderer.js";
import { Points } from "./points.js";
import { boxCoords, sphereCoords, lineCoords, fillCoords } from "./shapes.js";
export { boxCoords, sphereCoords, lineCoords, fillCoords };

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
 */

/**
 * @typedef {Object} FaceStyleMap
 * @property {StyleObject | function(number,number,number): StyleObject} [default]
 * @property {StyleObject | function(number,number,number): StyleObject} [top]
 * @property {StyleObject | function(number,number,number): StyleObject} [bottom]
 * @property {StyleObject | function(number,number,number): StyleObject} [left]
 * @property {StyleObject | function(number,number,number): StyleObject} [right]
 * @property {StyleObject | function(number,number,number): StyleObject} [front]
 * @property {StyleObject | function(number,number,number): StyleObject} [back]
 */

/**
 * @typedef {FaceStyleMap | function(number,number,number): FaceStyleMap} StyleParam
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
 * @property {number} [scale] - Voxel scale factor
 * @property {[number,number,number]} [scaleOrigin] - Scale transform origin
 */

/**
 * @typedef {'top'|'bottom'|'left'|'right'|'front'|'back'|'content'} FaceType
 */

/**
 * @typedef {Object} CameraOptions
 * @property {'oblique'|'perspective'} [type='oblique'] - Projection type
 * @property {number} [angle=45] - Oblique camera angle in degrees
 * @property {number} [distance=15] - Camera distance
 * @property {[number,number]} [position] - Perspective camera position [x, y]
 */

/**
 * @typedef {Object} Face
 * @property {FaceType} type - Face name
 * @property {Voxel} voxel - Source voxel data
 * @property {import('./points.js').Points} points - Projected 2D polygon points
 * @property {number} depth - Depth value for sorting
 * @property {StyleObject} [style] - Resolved style for this face
 * @property {string} [content] - SVG content string (content faces only)
 * @property {[number,number,number]} [_pos] - Original 3D position (content faces only)
 * @property {number} [_px] - Projected 2D x (content faces only)
 * @property {number} [_py] - Projected 2D y (content faces only)
 * @property {number} [_scale] - Perspective scale factor (content faces only)
 */

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

/**
 * A tiny engine for 3D voxel scenes rendered to SVG.
 */
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

    this.setCamera(cam);
    /** @type {Map<number, Voxel>} */
    this.voxels = new Map();
    /** @type {boolean} */
    /** @type {number} Monotonically increasing epoch — bumped on every mutation */
    this._epoch = 0;
    /** @type {number} Epoch at which _cachedFaces was computed */
    this._cachedEpoch = -1;
    /** @type {Face[]|null} */
    this._cachedFaces = null;
    /** @type {SVGRenderer|null} */
    this._svgRenderer = null;
    /** @type {boolean} */
    this._batching = false;
    /** @type {Set<number>} Voxel keys that changed since last getFaces */
    this._dirtyKeys = new Set();
    /** @type {Map<number, Object[]>} Cached 3D faces per voxel key */
    this._faceCache3D = new Map();
    /** @type {number} Epoch at which the full cache was last valid */
    this._faceCacheEpoch = -1;
  }

  /**
   * Update camera settings. Oblique cameras use angle + distance;
   * perspective cameras use position + distance.
   * @param {CameraOptions} [opts]
   */
  setCamera(opts = {}) {
    const type = opts.type || this.renderOptions.projection;
    this.renderOptions.projection = type;

    if (type === "oblique") {
      const angle = opts.angle !== undefined ? opts.angle : 45;
      const distance = opts.distance !== undefined ? opts.distance : 15;
      const rad = angle * (Math.PI / 180);
      const zScale = this.renderOptions.tileZ / this.renderOptions.tileW;
      this.renderOptions.depthOffsetX = Math.cos(rad) * distance * zScale;
      this.renderOptions.depthOffsetY = Math.sin(rad) * distance * zScale;
    } else {
      const pos = opts.position || [5, 5];
      this.renderOptions.cameraX = pos[0];
      this.renderOptions.cameraY = pos[1];
      this.renderOptions.cameraDistance =
        opts.distance !== undefined ? opts.distance : 10;
    }

    if (this._faceCache3D) this._faceCache3D.clear();
    this._invalidate();
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
    if (!this._batching) this._cachedFaces = null;
  }

  /**
   * Mark a voxel and its 6 neighbors as needing face regeneration.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  _markDirty(x, y, z) {
    this._dirtyKeys.add(this._k(x, y, z));
    for (const [dx, dy, dz] of ADJ) {
      this._dirtyKeys.add(this._k(x + dx, y + dy, z + dz));
    }
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
   * @param {function(): void} fn - Operations to batch
   */
  batch(fn) {
    this._batching = true;
    try {
      fn();
    } finally {
      this._batching = false;
      this._cachedFaces = null;
    }
  }

  /**
   * Compute bounding-box center of an iterable of items.
   * `get` extracts [x,y,z] from each item.
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
    this._faceCache3D.clear();
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
      this.voxels.set(this._k(nx, ny, nz), { ...v, x: nx, y: ny, z: nz });
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
   * @param {[number,number,number]|function(number,number,number): [number,number,number]} [scale] - Per-axis scale 0-1
   * @param {[number,number,number]|function(number,number,number): [number,number,number]} [scaleOrigin] - Scale origin within voxel
   */
  _applyOp(coords, mode, style, content, opaque, meta, scale, scaleOrigin) {
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
          if (voxel)
            voxel.styles = this._resolveStyles(
              style,
              voxel.x,
              voxel.y,
              voxel.z,
              voxel.styles,
            );
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

    for (const [face, val] of Object.entries(evaluatedParam)) {
      const evaluatedFace = typeof val === "function" ? val(x, y, z) : val;
      if (baseStyles[face]) {
        Object.assign(baseStyles[face], evaluatedFace);
      } else {
        baseStyles[face] = { ...evaluatedFace };
      }
    }

    return baseStyles;
  }

  /** Remove all voxels. */
  clear() {
    this.voxels.clear();
    this._faceCache3D.clear();
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
      voxels: voxelData,
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
    });

    for (const v of data.voxels) {
      const voxel = { x: v.x, y: v.y, z: v.z, styles: v.styles };
      if (v.content) voxel.content = v.content;
      if (v.opaque === false) voxel.opaque = false;
      if (v.meta) voxel.meta = v.meta;
      if (v.scale) voxel.scale = v.scale;
      if (v.scaleOrigin) voxel.scaleOrigin = v.scaleOrigin;
      engine.voxels.set(engine._k(v.x, v.y, v.z), voxel);
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
   * Apply a geometry operation (union, subtract, intersect, exclude).
   * @param {Object} opts
   * @param {'box'|'sphere'|'line'|'fill'} opts.type - Geometry type
   * @param {BooleanMode} [opts.mode='union'] - Boolean operation
   * @param {StyleParam} [opts.style] - Per-face styles
   * @param {string} [opts.content] - SVG content to render instead of polygon faces
   * @param {boolean} [opts.opaque=true] - Whether voxels occlude neighbors
   * @param {Object} [opts.meta] - Key/value pairs emitted as data-* attributes
   * @param {RotateOptions} [opts.rotate] - Rotate coordinates before placement
   * @param {[number,number,number]|function} [opts.scale] - Per-axis scale 0-1
   * @param {[number,number,number]|function} [opts.scaleOrigin=[0.5,0,0.5]] - Scale origin
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
      for (const [key, voxel] of this.voxels.entries()) {
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
        voxel.styles = this._resolveStyles(opts.style, x, y, z, voxel.styles);
      }
    }
    this._invalidate();
  }

  /**
   * Scale face vertices around an origin within a voxel.
   * scale: [sx, sy, sz], origin: [ox, oy, oz] (0-1 within voxel)
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
   * Generate an array of renderable 2D polygon faces from stored voxels, properly depth-sorted.
   * Results are cached until the scene is modified.
   * @returns {Face[]}
   */
  getFaces() {
    if (this._cachedEpoch === this._epoch && this._cachedFaces) {
      return this._cachedFaces;
    }

    const projectedFaces = [];
    const {
      projection,
      tileW,
      tileH,
      depthOffsetX,
      depthOffsetY,
      cameraX,
      cameraY,
      cameraDistance,
    } = this.renderOptions;

    const hasVoxel = (x, y, z) => {
      const v = this.voxels.get(this._k(x, y, z));
      return v && v.opaque !== false;
    };

    // Oblique depth constants (used in face gen and content projection)
    const dx_norm = projection === "oblique" ? depthOffsetX / tileW : 0;
    const dy_norm = projection === "oblique" ? depthOffsetY / tileH : 0;

    // Incremental: only regenerate 3D faces for dirty voxels
    const dirtyKeys = this._dirtyKeys;
    const useIncremental = dirtyKeys.size > 0 && this._faceCache3D.size > 0;

    // Remove cache entries for deleted voxels
    if (useIncremental) {
      for (const dk of dirtyKeys) {
        this._faceCache3D.delete(dk);
      }
    }

    const faces3D = [];
    for (const [key, voxel] of this.voxels.entries()) {
      // Reuse cached 3D faces for unchanged voxels
      if (useIncremental && !dirtyKeys.has(key)) {
        const cached = this._faceCache3D.get(key);
        if (cached) {
          for (let i = 0; i < cached.length; i++) faces3D.push(cached[i]);
          continue;
        }
      }

      const { x, y, z, styles } = voxel;
      const faceStart = faces3D.length;

      // Content voxels: emit a content entry instead of polygon faces
      if (voxel.content) {
        faces3D.push({
          type: "content",
          voxel,
          content: voxel.content,
          _pos: [x, y, z],
        });
        this._faceCache3D.set(key, faces3D.slice(faceStart));
        continue;
      }

      // Precompute base style (default + styles.default) once per voxel
      const base = styles.default
        ? { ...this.defaultStyle, ...styles.default }
        : this.defaultStyle;
      const getStyles = (faceName) => {
        const faceStyle = styles[faceName];
        return faceStyle ? { ...base, ...faceStyle } : base;
      };

      // In Oblique projection:
      // A standard grid relies on absolute occlusion to decide boundaries.
      // If we just mapped raw vectors, parallel walls get confused by the math.
      // We fall back conditionally to explicit voxel checking for oblique, but true vector calculation for perspective.

      const sc = voxel.scale;
      const so = voxel.scaleOrigin;

      if (projection === "oblique") {
        const getDepth = (cx, cy, cz) => cz - cx * dx_norm - cy * dy_norm;

        const addObliqueFace = (type, vertices, cx, cy, cz) => {
          faces3D.push({
            type,
            voxel,
            vertices: sc
              ? Heerich._scaleVertices(vertices, x, y, z, sc, so)
              : vertices,
            depth: getDepth(cx, cy, cz),
            style: getStyles(type),
          });
        };

        // For oblique, we strictly cull invisible orientations
        // Scaled voxels bypass neighbor occlusion (they don't fill the cell)
        if (depthOffsetY < 0 && (sc || !hasVoxel(x, y - 1, z)))
          addObliqueFace(
            "top",
            [
              [x, y, z],
              [x + 1, y, z],
              [x + 1, y, z + 1],
              [x, y, z + 1],
            ],
            x + 0.5,
            y,
            z + 0.5,
          );
        if (depthOffsetY > 0 && (sc || !hasVoxel(x, y + 1, z)))
          addObliqueFace(
            "bottom",
            [
              [x, y + 1, z + 1],
              [x + 1, y + 1, z + 1],
              [x + 1, y + 1, z],
              [x, y + 1, z],
            ],
            x + 0.5,
            y + 1,
            z + 0.5,
          );

        if (depthOffsetX < 0 && (sc || !hasVoxel(x - 1, y, z)))
          addObliqueFace(
            "left",
            [
              [x, y, z + 1],
              [x, y, z],
              [x, y + 1, z],
              [x, y + 1, z + 1],
            ],
            x,
            y + 0.5,
            z + 0.5,
          );
        if (depthOffsetX > 0 && (sc || !hasVoxel(x + 1, y, z)))
          addObliqueFace(
            "right",
            [
              [x + 1, y, z],
              [x + 1, y, z + 1],
              [x + 1, y + 1, z + 1],
              [x + 1, y + 1, z],
            ],
            x + 1,
            y + 0.5,
            z + 0.5,
          );

        if (sc || !hasVoxel(x, y, z - 1))
          addObliqueFace(
            "front",
            [
              [x, y, z],
              [x, y + 1, z],
              [x + 1, y + 1, z],
              [x + 1, y, z],
            ],
            x + 0.5,
            y + 0.5,
            z,
          );
        if (sc || !hasVoxel(x, y, z + 1))
          addObliqueFace(
            "back",
            [
              [x + 1, y, z + 1],
              [x + 1, y + 1, z + 1],
              [x, y + 1, z + 1],
              [x, y, z + 1],
            ],
            x + 0.5,
            y + 0.5,
            z + 1,
          );
      } else {
        // Perspective Mode uses robust 3D math and backface culling
        const addPerspFace = (type, vertices, n, c) => {
          if (sc) {
            const ox = x + so[0],
              oy = y + so[1],
              oz = z + so[2];
            c = [
              ox + (c[0] - ox) * sc[0],
              oy + (c[1] - oy) * sc[1],
              oz + (c[2] - oz) * sc[2],
            ];
          }
          faces3D.push({
            type,
            voxel,
            vertices: sc
              ? Heerich._scaleVertices(vertices, x, y, z, sc, so)
              : vertices,
            n,
            c,
            style: getStyles(type),
          });
        };

        if (sc || !hasVoxel(x, y - 1, z))
          addPerspFace(
            "top",
            [
              [x, y, z],
              [x + 1, y, z],
              [x + 1, y, z + 1],
              [x, y, z + 1],
            ],
            [0, -1, 0],
            [x + 0.5, y, z + 0.5],
          );
        if (sc || !hasVoxel(x, y + 1, z))
          addPerspFace(
            "bottom",
            [
              [x, y + 1, z + 1],
              [x + 1, y + 1, z + 1],
              [x + 1, y + 1, z],
              [x, y + 1, z],
            ],
            [0, 1, 0],
            [x + 0.5, y + 1, z + 0.5],
          );
        if (sc || !hasVoxel(x - 1, y, z))
          addPerspFace(
            "left",
            [
              [x, y, z + 1],
              [x, y, z],
              [x, y + 1, z],
              [x, y + 1, z + 1],
            ],
            [-1, 0, 0],
            [x, y + 0.5, z + 0.5],
          );
        if (sc || !hasVoxel(x + 1, y, z))
          addPerspFace(
            "right",
            [
              [x + 1, y, z],
              [x + 1, y, z + 1],
              [x + 1, y + 1, z + 1],
              [x + 1, y + 1, z],
            ],
            [1, 0, 0],
            [x + 1, y + 0.5, z + 0.5],
          );
        if (sc || !hasVoxel(x, y, z - 1))
          addPerspFace(
            "front",
            [
              [x, y, z],
              [x, y + 1, z],
              [x + 1, y + 1, z],
              [x + 1, y, z],
            ],
            [0, 0, -1],
            [x + 0.5, y + 0.5, z],
          );
        if (sc || !hasVoxel(x, y, z + 1))
          addPerspFace(
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

      // Cache this voxel's 3D faces for incremental updates
      if (faces3D.length > faceStart) {
        this._faceCache3D.set(key, faces3D.slice(faceStart));
      }
    }

    this._dirtyKeys.clear();
    this._faceCacheEpoch = this._epoch;

    const result = this._projectAndSort(faces3D);
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
   * @param {function(number,number,number): boolean} opts.test - Inclusion test
   * @param {StyleParam|function(number,number,number,string): StyleObject} [opts.style] - Style per voxel or per face
   * @returns {Face[]}
   */
  renderTest(opts) {
    const regions = opts.regions || [opts.bounds];
    const test = opts.test;
    const styleFn = typeof opts.style === "function" ? opts.style : null;
    const styleObj = /** @type {FaceStyleMap|null} */ (
      !styleFn ? opts.style || null : null
    );
    const defaultStyle = this.defaultStyle;

    const { projection, depthOffsetX, depthOffsetY, tileW, tileH } =
      this.renderOptions;
    const dx_norm = projection === "oblique" ? depthOffsetX / tileW : 0;
    const dy_norm = projection === "oblique" ? depthOffsetY / tileH : 0;
    const isOblique = projection === "oblique";

    const faces3D = [];
    const scanned = regions.length > 1 ? new Set() : null;
    const noStyle = !styleFn && !styleObj;

    for (const [[minX, minY, minZ], [maxX, maxY, maxZ]] of regions) {
      for (let z = minZ; z < maxZ; z++) {
        for (let y = minY; y < maxY; y++) {
          for (let x = minX; x < maxX; x++) {
            if (scanned) {
              const k = ((x + 512) << 20) | ((y + 512) << 10) | (z + 512);
              if (scanned.has(k)) continue;
              scanned.add(k);
            }

            if (!test(x, y, z)) continue;

            const voxel = { x, y, z };

            // Fast path: no custom style — just return defaultStyle (no allocation)
            const getStyles = noStyle
              ? () => defaultStyle
              : (faceName) => {
                  if (styleFn)
                    return { ...defaultStyle, ...styleFn(x, y, z, faceName) };
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

            // Neighbor test — just call the test function directly (it handles its own bounds)
            if (isOblique) {
              const getDepth = (cx, cy, cz) => cz - cx * dx_norm - cy * dy_norm;
              const addFace = (type, vertices, cx, cy, cz) => {
                faces3D.push({
                  type,
                  voxel,
                  vertices,
                  depth: getDepth(cx, cy, cz),
                  style: getStyles(type),
                });
              };

              if (depthOffsetY < 0 && !test(x, y - 1, z))
                addFace(
                  "top",
                  [
                    [x, y, z],
                    [x + 1, y, z],
                    [x + 1, y, z + 1],
                    [x, y, z + 1],
                  ],
                  x + 0.5,
                  y,
                  z + 0.5,
                );
              if (depthOffsetY > 0 && !test(x, y + 1, z))
                addFace(
                  "bottom",
                  [
                    [x, y + 1, z + 1],
                    [x + 1, y + 1, z + 1],
                    [x + 1, y + 1, z],
                    [x, y + 1, z],
                  ],
                  x + 0.5,
                  y + 1,
                  z + 0.5,
                );
              if (depthOffsetX < 0 && !test(x - 1, y, z))
                addFace(
                  "left",
                  [
                    [x, y, z + 1],
                    [x, y, z],
                    [x, y + 1, z],
                    [x, y + 1, z + 1],
                  ],
                  x,
                  y + 0.5,
                  z + 0.5,
                );
              if (depthOffsetX > 0 && !test(x + 1, y, z))
                addFace(
                  "right",
                  [
                    [x + 1, y, z],
                    [x + 1, y, z + 1],
                    [x + 1, y + 1, z + 1],
                    [x + 1, y + 1, z],
                  ],
                  x + 1,
                  y + 0.5,
                  z + 0.5,
                );
              if (!test(x, y, z - 1))
                addFace(
                  "front",
                  [
                    [x, y, z],
                    [x, y + 1, z],
                    [x + 1, y + 1, z],
                    [x + 1, y, z],
                  ],
                  x + 0.5,
                  y + 0.5,
                  z,
                );
              if (!test(x, y, z + 1))
                addFace(
                  "back",
                  [
                    [x + 1, y, z + 1],
                    [x + 1, y + 1, z + 1],
                    [x, y + 1, z + 1],
                    [x, y, z + 1],
                  ],
                  x + 0.5,
                  y + 0.5,
                  z + 1,
                );
            } else {
              const addFace = (type, vertices, n, c) => {
                faces3D.push({
                  type,
                  voxel,
                  vertices,
                  n,
                  c,
                  style: getStyles(type),
                });
              };

              if (!test(x, y - 1, z))
                addFace(
                  "top",
                  [
                    [x, y, z],
                    [x + 1, y, z],
                    [x + 1, y, z + 1],
                    [x, y, z + 1],
                  ],
                  [0, -1, 0],
                  [x + 0.5, y, z + 0.5],
                );
              if (!test(x, y + 1, z))
                addFace(
                  "bottom",
                  [
                    [x, y + 1, z + 1],
                    [x + 1, y + 1, z + 1],
                    [x + 1, y + 1, z],
                    [x, y + 1, z],
                  ],
                  [0, 1, 0],
                  [x + 0.5, y + 1, z + 0.5],
                );
              if (!test(x - 1, y, z))
                addFace(
                  "left",
                  [
                    [x, y, z + 1],
                    [x, y, z],
                    [x, y + 1, z],
                    [x, y + 1, z + 1],
                  ],
                  [-1, 0, 0],
                  [x, y + 0.5, z + 0.5],
                );
              if (!test(x + 1, y, z))
                addFace(
                  "right",
                  [
                    [x + 1, y, z],
                    [x + 1, y, z + 1],
                    [x + 1, y + 1, z + 1],
                    [x + 1, y + 1, z],
                  ],
                  [1, 0, 0],
                  [x + 1, y + 0.5, z + 0.5],
                );
              if (!test(x, y, z - 1))
                addFace(
                  "front",
                  [
                    [x, y, z],
                    [x, y + 1, z],
                    [x + 1, y + 1, z],
                    [x + 1, y, z],
                  ],
                  [0, 0, -1],
                  [x + 0.5, y + 0.5, z],
                );
              if (!test(x, y, z + 1))
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
    }

    return this._projectAndSort(faces3D);
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

    const { cameraDistance } = this.renderOptions;

    for (const face of faces3D) {
      if (face.type === "content") {
        const [cx, cy, cz] = face._pos;
        let px, py, scale, depth;
        if (projection === "oblique") {
          px = truncate((cx + 0.5) * tileW + (cz + 0.5) * depthOffsetX);
          py = truncate((cy + 0.5) * tileH + (cz + 0.5) * depthOffsetY);
          scale = 1;
          depth = cz + 0.5 - (cx + 0.5) * dx_norm - (cy + 0.5) * dy_norm;
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
        const flat = [];
        for (const v of face.vertices) {
          flat.push(
            truncate(v[0] * tileW + v[2] * depthOffsetX),
            truncate(v[1] * tileH + v[2] * depthOffsetY),
          );
        }
        face.points = new Points(flat);
      } else if (projection === "perspective") {
        const Cx = cameraX;
        const Cy = cameraY;
        const Cz = -cameraDistance;

        const viewVec = [face.c[0] - Cx, face.c[1] - Cy, face.c[2] - Cz];
        const dot =
          viewVec[0] * face.n[0] +
          viewVec[1] * face.n[1] +
          viewVec[2] * face.n[2];
        if (dot >= 0) continue;

        const minDenom = 0.01;
        if (face.vertices.some((v) => v[2] + cameraDistance < minDenom))
          continue;

        const flat = [];
        for (const v of face.vertices) {
          const t = cameraDistance / (v[2] + cameraDistance);
          flat.push(
            truncate((Cx + (v[0] - Cx) * t) * tileW),
            truncate((Cy + (v[1] - Cy) * t) * tileH),
          );
        }
        face.points = new Points(flat);

        face.depth =
          viewVec[0] * viewVec[0] +
          viewVec[1] * viewVec[1] +
          viewVec[2] * viewVec[2];
      }

      projectedFaces.push(face);
    }

    projectedFaces.sort(
      (a, b) =>
        b.depth - a.depth ||
        a.voxel.x - b.voxel.x ||
        a.voxel.y - b.voxel.y ||
        a.voxel.z - b.voxel.z,
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
   * Render the scene (or pre-computed faces) to an SVG string.
   * @param {Object} [options]
   * @param {number} [options.padding=20] - ViewBox padding in pixels
   * @param {Face[]} [options.faces] - Pre-computed faces (skips internal `getFaces()`)
   * @param {[number,number,number,number]} [options.viewBox] - Custom viewBox override [x, y, w, h]
   * @param {[number,number]} [options.offset=[0,0]] - Translate all geometry
   * @param {string} [options.prepend] - Raw SVG to insert before faces
   * @param {string} [options.append] - Raw SVG to insert after faces
   * @param {function(Face): Object|null} [options.faceAttributes] - Per-face attribute callback
   * @returns {string} SVG markup
   */
  toSVG(options = {}) {
    if (!this._svgRenderer) this._svgRenderer = new SVGRenderer();
    const faces = options.faces || this.getFaces();
    return this._svgRenderer.render(faces, {
      ...options,
      tileW: this.renderOptions.tileW,
    });
  }
}
