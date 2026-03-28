export class Heerich {
  constructor(options = {}) {
    const tile = options.tile || [40, 40];

    this.defaultStyle = options.style || {
      fill: '#aaaaaa',
      stroke: '#000000',
      strokeWidth: 1
    };

    const cam = options.camera || { type: 'oblique', angle: 45, distance: 15 };
    this.renderOptions = {
      projection: cam.type || 'oblique',
      tileW: tile[0],
      tileH: tile[1],
      depthOffsetX: 15,
      depthOffsetY: -15,
      cameraX: 5,
      cameraY: 5,
      cameraDistance: 10,
    };

    this.setCamera(cam);
    this.voxels = new Map();
    this._dirty = true;
    this._cachedFaces = null;
  }

  setCamera(opts = {}) {
    const type = opts.type || this.renderOptions.projection;
    this.renderOptions.projection = type;

    if (type === 'oblique') {
      const angle = opts.angle !== undefined ? opts.angle : 45;
      const distance = opts.distance !== undefined ? opts.distance : 15;
      const rad = angle * (Math.PI / 180);
      this.renderOptions.depthOffsetX = Math.cos(rad) * distance;
      this.renderOptions.depthOffsetY = Math.sin(rad) * distance;
    } else {
      const pos = opts.position || [5, 5];
      this.renderOptions.cameraX = pos[0];
      this.renderOptions.cameraY = pos[1];
      this.renderOptions.cameraDistance = opts.distance !== undefined ? opts.distance : 10;
    }

    this._dirty = true;
  }

  /**
   * Pack coordinates into a single integer key for fast Map lookups.
   * Supports coordinates from -512 to 511 on each axis (10 bits + sign).
   */
  _k(x, y, z) {
    return ((x + 512) << 20) | ((y + 512) << 10) | (z + 512);
  }

  _invalidate() {
    this._dirty = true;
    this._cachedFaces = null;
  }

  /**
   * Rotate a point [x,y,z] around a center by N 90° turns on the given axis.
   */
  static _rot90(x, y, z, axis, turns, cx, cy, cz) {
    let dx = x - cx, dy = y - cy, dz = z - cz;
    const n = ((turns % 4) + 4) % 4;
    for (let i = 0; i < n; i++) {
      if (axis === 'z')      { const t = dx; dx = -dy; dy = t; }
      else if (axis === 'y') { const t = dx; dx = -dz; dz = t; }
      else                   { const t = dy; dy = -dz; dz = t; }
    }
    return [Math.round(cx + dx), Math.round(cy + dy), Math.round(cz + dz)];
  }

  /**
   * Wrap a coordinate iterator with rotation.
   * rotate: { axis: 'x'|'y'|'z', turns: 1-3, center?: [cx,cy,cz] }
   * If no center given, computes bounding box center of the coords.
   */
  *_rotateCoords(coords, rotate) {
    if (!rotate) { yield* coords; return; }

    // Must collect to compute center if not given
    const all = [...coords];
    let [cx, cy, cz] = rotate.center || [0, 0, 0];

    if (!rotate.center) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const [x, y, z] of all) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      cx = (minX + maxX) / 2;
      cy = (minY + maxY) / 2;
      cz = (minZ + maxZ) / 2;
    }

    for (const [x, y, z] of all) {
      yield Heerich._rot90(x, y, z, rotate.axis, rotate.turns, cx, cy, cz);
    }
  }

  /**
   * Rotate all existing voxels in place.
   * opts: { axis: 'x'|'y'|'z', turns: 1-3, center?: [cx,cy,cz] }
   * If no center, rotates around the bounding box center.
   */
  rotate(opts) {
    const entries = [...this.voxels.values()];
    let [cx, cy, cz] = opts.center || [0, 0, 0];

    if (!opts.center) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const v of entries) {
        if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
      }
      cx = (minX + maxX) / 2;
      cy = (minY + maxY) / 2;
      cz = (minZ + maxZ) / 2;
    }

    this.voxels.clear();
    for (const v of entries) {
      const [nx, ny, nz] = Heerich._rot90(v.x, v.y, v.z, opts.axis, opts.turns, cx, cy, cz);
      this.voxels.set(this._k(nx, ny, nz), { ...v, x: nx, y: ny, z: nz });
    }
    this._invalidate();
  }

  /**
   * Apply a boolean operation using coordinates from an iterator.
   * coords: iterable of [x, y, z]
   * mode: 'union' | 'subtract' | 'intersect' | 'exclude'
   * style: optional style param
   */
  _applyOp(coords, mode, style, content, opaque, meta) {
    if (mode === 'intersect') {
      // Collect shape coords, then delete everything not in the set
      const keep = new Set();
      for (const [x, y, z] of coords) {
        const key = this._k(x, y, z);
        if (this.voxels.has(key)) keep.add(key);
      }
      for (const key of this.voxels.keys()) {
        if (!keep.has(key)) this.voxels.delete(key);
      }
      // Apply style to remaining voxels if provided
      if (style) {
        for (const key of keep) {
          const voxel = this.voxels.get(key);
          if (voxel) voxel.styles = this._resolveStyles(style, voxel.x, voxel.y, voxel.z, voxel.styles);
        }
      }
    } else {
      for (const [x, y, z] of coords) {
        const key = this._k(x, y, z);
        if (mode === 'union') {
          const voxel = { x, y, z, styles: this._resolveStyles(style || null, x, y, z) };
          if (content) voxel.content = content;
          if (opaque === false) voxel.opaque = false;
          if (meta) voxel.meta = meta;
          this.voxels.set(key, voxel);
        } else if (mode === 'subtract') {
          this.voxels.delete(key);
        } else if (mode === 'exclude') {
          if (this.voxels.has(key)) {
            this.voxels.delete(key);
          } else {
            const voxel = { x, y, z, styles: this._resolveStyles(style || null, x, y, z) };
            if (content) voxel.content = content;
            if (opaque === false) voxel.opaque = false;
            if (meta) voxel.meta = meta;
            this.voxels.set(key, voxel);
          }
        }
      }
    }
    this._invalidate();
  }

  /**
   * Resolves a style parameter (which might be a function) into a static style object
   */
  _resolveStyles(styleParam, x, y, z, existingStyles = null) {
    if (!styleParam) {
      return existingStyles ? { ...existingStyles } : { default: { ...this.defaultStyle } };
    }

    const evaluatedParam = typeof styleParam === 'function' ? styleParam(x, y, z) : styleParam;
    const baseStyles = existingStyles ? { ...existingStyles } : {};

    for (const [face, val] of Object.entries(evaluatedParam)) {
      const evaluatedFace = typeof val === 'function' ? val(x, y, z) : val;
      baseStyles[face] = baseStyles[face] 
        ? { ...baseStyles[face], ...evaluatedFace } 
        : { ...evaluatedFace };
    }

    return baseStyles;
  }

  clear() {
    this.voxels.clear();
    this._invalidate();
  }

  getVoxel(pos) {
    const key = this._k(pos[0], pos[1], pos[2]);
    return this.voxels.get(key) || null;
  }

  hasVoxel(pos) {
    return this.voxels.has(this._k(pos[0], pos[1], pos[2]));
  }

  getNeighbors(pos) {
    const [x, y, z] = pos;
    return {
      top:    this.getVoxel([x, y - 1, z]),
      bottom: this.getVoxel([x, y + 1, z]),
      left:   this.getVoxel([x - 1, y, z]),
      right:  this.getVoxel([x + 1, y, z]),
      front:  this.getVoxel([x, y, z - 1]),
      back:   this.getVoxel([x, y, z + 1]),
    };
  }

  forEach(callback) {
    for (const [key, voxel] of this.voxels.entries()) {
      callback(voxel, [voxel.x, voxel.y, voxel.z]);
    }
  }

  toJSON() {
    const voxelData = [];
    for (const [key, voxel] of this.voxels.entries()) {
      const styles = {};
      for (const [face, val] of Object.entries(voxel.styles)) {
        if (typeof val === 'function') {
          console.warn(`Heerich.toJSON: functional style on face "${face}" at [${voxel.x},${voxel.y},${voxel.z}] will be omitted`);
          continue;
        }
        styles[face] = val;
      }
      const entry = { x: voxel.x, y: voxel.y, z: voxel.z, styles };
      if (voxel.content) entry.content = voxel.content;
      if (voxel.opaque === false) entry.opaque = false;
      if (voxel.meta) entry.meta = voxel.meta;
      voxelData.push(entry);
    }

    return {
      tile: [this.renderOptions.tileW, this.renderOptions.tileH],
      camera: this.renderOptions.projection === 'oblique'
        ? { type: 'oblique', depthOffsetX: this.renderOptions.depthOffsetX, depthOffsetY: this.renderOptions.depthOffsetY }
        : { type: 'perspective', position: [this.renderOptions.cameraX, this.renderOptions.cameraY], distance: this.renderOptions.cameraDistance },
      style: { ...this.defaultStyle },
      voxels: voxelData
    };
  }

  static fromJSON(data) {
    const engine = new Heerich({
      tile: data.tile,
      camera: data.camera,
      style: data.style
    });

    for (const v of data.voxels) {
      const voxel = { x: v.x, y: v.y, z: v.z, styles: v.styles };
      if (v.content) voxel.content = v.content;
      if (v.opaque === false) voxel.opaque = false;
      if (v.meta) voxel.meta = v.meta;
      engine.voxels.set(engine._k(v.x, v.y, v.z), voxel);
    }

    engine._invalidate();
    return engine;
  }

  /**
   * Iterate coordinates for a box shape
   */
  *_boxCoords(position, size) {
    const [sx, sy, sz] = position;
    const [w, h, d] = size;
    for (let z = sz; z < sz + d; z++)
      for (let y = sy; y < sy + h; y++)
        for (let x = sx; x < sx + w; x++)
          yield [x, y, z];
  }

  /**
   * Iterate coordinates for a sphere shape
   */
  *_sphereCoords(center, radius) {
    const [cx, cy, cz] = center;
    for (let z = Math.ceil(cz - radius); z <= Math.floor(cz + radius); z++)
      for (let y = Math.ceil(cy - radius); y <= Math.floor(cy + radius); y++)
        for (let x = Math.ceil(cx - radius); x <= Math.floor(cx + radius); x++) {
          const dx = cx - x, dy = cy - y, dz = cz - z;
          if (dx * dx + dy * dy + dz * dz <= radius * radius) yield [x, y, z];
        }
  }

  addBox(opts) {
    const coords = this._rotateCoords(this._boxCoords(opts.position, opts.size), opts.rotate);
    this._applyOp(coords, opts.mode || 'union', opts.style, opts.content, opts.opaque, opts.meta);
  }

  removeBox(opts) {
    this._applyOp(this._boxCoords(opts.position, opts.size), 'subtract');
  }

  addSphere(opts) {
    const coords = this._rotateCoords(this._sphereCoords(opts.center, opts.radius), opts.rotate);
    this._applyOp(coords, opts.mode || 'union', opts.style, opts.content, opts.opaque, opts.meta);
  }

  removeSphere(opts) {
    this._applyOp(this._sphereCoords(opts.center, opts.radius), 'subtract');
  }

  /**
   * Iterate coordinates for a line shape (with optional radius/shape).
   * Collects all unique coords via a Set to avoid redundant writes from overlapping stamps.
   */
  *_lineCoords(from, to, radius, shape) {
    const [x0, y0, z0] = from;
    const [x1, y1, z1] = to;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const N = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const seen = radius > 0 ? new Set() : null;

    const emit = function*(coords) {
      if (!seen) { yield* coords; return; }
      for (const c of coords) {
        const k = ((c[0] + 512) << 20) | ((c[1] + 512) << 10) | (c[2] + 512);
        if (!seen.has(k)) { seen.add(k); yield c; }
      }
    };

    const steps = N === 0 ? [[x0, y0, z0]] :
      Array.from({ length: N + 1 }, (_, i) => {
        const t = i / N;
        return [Math.round(x0 + t * dx), Math.round(y0 + t * dy), Math.round(z0 + t * dz)];
      });

    for (const [cx, cy, cz] of steps) {
      if (shape === 'rounded' && radius > 0) {
        yield* emit(this._sphereCoords([cx, cy, cz], radius));
      } else if (shape === 'square' && radius > 0) {
        const r = Math.floor(radius);
        yield* emit(this._boxCoords([cx - r, cy - r, cz - r], [r * 2 + 1, r * 2 + 1, r * 2 + 1]));
      } else {
        yield [cx, cy, cz];
      }
    }
  }

  addLine(opts) {
    const radius = opts.radius || 0;
    const shape = opts.shape || 'rounded';
    const coords = this._rotateCoords(
      this._lineCoords(opts.from, opts.to, radius, shape),
      opts.rotate
    );
    this._applyOp(coords, opts.mode || 'union', opts.style, opts.content, opts.opaque, opts.meta);
  }

  removeLine(opts) {
    this.addLine({ ...opts, mode: 'subtract' });
  }

  /**
   * Iterate coordinates within bounds where test returns true.
   */
  *_whereCoords(bounds, test) {
    const [[minX, minY, minZ], [maxX, maxY, maxZ]] = bounds;
    for (let z = minZ; z < maxZ; z++)
      for (let y = minY; y < maxY; y++)
        for (let x = minX; x < maxX; x++)
          if (test(x, y, z)) yield [x, y, z];
  }

  /**
   * Add voxels within a bounding box where a test function returns true.
   * opts: { bounds: [[minX,minY,minZ], [maxX,maxY,maxZ]], test: (x,y,z) => bool, style?, mode?, content?, opaque?, meta? }
   */
  addWhere(opts) {
    const coords = this._whereCoords(opts.bounds, opts.test);
    this._applyOp(coords, opts.mode || 'union', opts.style, opts.content, opts.opaque, opts.meta);
  }

  /**
   * Remove voxels within a bounding box where a test function returns true.
   * opts: { bounds: [[minX,minY,minZ], [maxX,maxY,maxZ]], test: (x,y,z) => bool }
   */
  removeWhere(opts) {
    this._applyOp(this._whereCoords(opts.bounds, opts.test), 'subtract');
  }

  styleBox(opts) {
    const [sx, sy, sz] = opts.position;
    const [w, h, d] = opts.size;
    for (let z = sz; z < sz + d; z++) {
      for (let y = sy; y < sy + h; y++) {
        for (let x = sx; x < sx + w; x++) {
          const key = this._k(x, y, z);
          if (this.voxels.has(key)) {
            const voxel = this.voxels.get(key);
            voxel.styles = this._resolveStyles(opts.style, x, y, z, voxel.styles);
          }
        }
      }
    }
    this._invalidate();
  }

  styleSphere(opts) {
    const [cx, cy, cz] = opts.center;
    const radius = opts.radius;
    const top = Math.ceil(cy - radius);
    const bottom = Math.floor(cy + radius);
    const left = Math.ceil(cx - radius);
    const right = Math.floor(cx + radius);
    const front = Math.ceil(cz - radius);
    const back = Math.floor(cz + radius);

    for (let z = front; z <= back; z++) {
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          const dx = cx - x;
          const dy = cy - y;
          const dz = cz - z;
          if (dx * dx + dy * dy + dz * dz <= radius * radius) {
            const key = this._k(x, y, z);
            if (this.voxels.has(key)) {
              const voxel = this.voxels.get(key);
              voxel.styles = this._resolveStyles(opts.style, x, y, z, voxel.styles);
            }
          }
        }
      }
    }
    this._invalidate();
  }

  styleLine(opts) {
    const [x0, y0, z0] = opts.from;
    const [x1, y1, z1] = opts.to;
    const radius = opts.radius || 0;
    const shape = opts.shape || 'rounded';
    const style = opts.style;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const N = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));

    if (N === 0) {
      if (shape === 'rounded' && radius > 0) {
        this.styleSphere({ center: [x0, y0, z0], radius, style });
      } else {
        const r = Math.floor(radius);
        this.styleBox({ position: [x0 - r, y0 - r, z0 - r], size: [r * 2 + 1, r * 2 + 1, r * 2 + 1], style });
      }
      return;
    }

    for (let step = 0; step <= N; step++) {
      const t = step / N;
      const cx = Math.round(x0 + t * dx);
      const cy = Math.round(y0 + t * dy);
      const cz = Math.round(z0 + t * dz);

      if (shape === 'rounded' && radius > 0) {
        this.styleSphere({ center: [cx, cy, cz], radius, style });
      } else if (shape === 'square' && radius > 0) {
        const r = Math.floor(radius);
        this.styleBox({ position: [cx - r, cy - r, cz - r], size: [r * 2 + 1, r * 2 + 1, r * 2 + 1], style });
      } else {
        this.styleBox({ position: [cx, cy, cz], size: [1, 1, 1], style });
      }
    }
  }

  /**
   * Generate an array of renderable 2D polygon faces, properly Z-sorted
   */
  getFaces() {
    if (!this._dirty && this._cachedFaces) {
      return this._cachedFaces;
    }

    const projectedFaces = [];
    const { projection, tileW, tileH, depthOffsetX, depthOffsetY, cameraX, cameraY, cameraDistance } = this.renderOptions;

    const hasVoxel = (x, y, z) => {
      const v = this.voxels.get(this._k(x, y, z));
      return v && v.opaque !== false;
    };

    // Oblique depth constants (used in face gen and content projection)
    const dx_norm = projection === 'oblique' ? depthOffsetX / tileW : 0;
    const dy_norm = projection === 'oblique' ? depthOffsetY / tileH : 0;

    // First: Generate all exposed 3D Faces
    const faces3D = [];
    for (const [key, voxel] of this.voxels.entries()) {
      const { x, y, z, styles } = voxel;

      // Content voxels: emit a content entry instead of polygon faces
      if (voxel.content) {
        faces3D.push({ type: 'content', voxel, content: voxel.content, _pos: [x, y, z] });
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

      if (projection === 'oblique') {
        const getDepth = (cx, cy, cz) => cz - (cx * dx_norm) - (cy * dy_norm);

        const addObliqueFace = (type, vertices, cx, cy, cz) => {
           faces3D.push({
             type, voxel, vertices, depth: getDepth(cx, cy, cz),
             style: getStyles(type)
           });
        };

        // For oblique, we strictly cull invisible orientations
        if (depthOffsetY < 0 && !hasVoxel(x, y - 1, z)) addObliqueFace('top',    [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]], x + 0.5, y, z + 0.5);
        if (depthOffsetY > 0 && !hasVoxel(x, y + 1, z)) addObliqueFace('bottom', [[x, y + 1, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z], [x, y + 1, z]], x + 0.5, y + 1, z + 0.5);

        if (depthOffsetX < 0 && !hasVoxel(x - 1, y, z)) addObliqueFace('left',   [[x, y, z + 1], [x, y, z], [x, y + 1, z], [x, y + 1, z + 1]], x, y + 0.5, z + 0.5);
        if (depthOffsetX > 0 && !hasVoxel(x + 1, y, z)) addObliqueFace('right',  [[x + 1, y, z], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]], x + 1, y + 0.5, z + 0.5);

        if (!hasVoxel(x, y, z - 1)) addObliqueFace('front',  [[x, y, z], [x, y + 1, z], [x + 1, y + 1, z], [x + 1, y, z]], x + 0.5, y + 0.5, z);
        if (!hasVoxel(x, y, z + 1)) addObliqueFace('back',   [[x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1], [x, y, z + 1]], x + 0.5, y + 0.5, z + 1);

      } else {
        // Perspective Mode uses robust 3D math and backface culling
        const addPerspFace = (type, vertices, n, c) => faces3D.push({ type, voxel, vertices, n, c, style: getStyles(type) });

        if (!hasVoxel(x, y - 1, z)) addPerspFace('top',    [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]], [0, -1, 0], [x + 0.5, y, z + 0.5]);
        if (!hasVoxel(x, y + 1, z)) addPerspFace('bottom', [[x, y + 1, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z], [x, y + 1, z]], [0, 1, 0], [x + 0.5, y + 1, z + 0.5]);
        if (!hasVoxel(x - 1, y, z)) addPerspFace('left',   [[x, y, z + 1], [x, y, z], [x, y + 1, z], [x, y + 1, z + 1]], [-1, 0, 0], [x, y + 0.5, z + 0.5]);
        if (!hasVoxel(x + 1, y, z)) addPerspFace('right',  [[x + 1, y, z], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]], [1, 0, 0], [x + 1, y + 0.5, z + 0.5]);
        if (!hasVoxel(x, y, z - 1)) addPerspFace('front',  [[x, y, z], [x, y + 1, z], [x + 1, y + 1, z], [x + 1, y, z]], [0, 0, -1], [x + 0.5, y + 0.5, z]);
        if (!hasVoxel(x, y, z + 1)) addPerspFace('back',   [[x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1], [x, y, z + 1]], [0, 0, 1], [x + 0.5, y + 0.5, z + 1]);
      }
    }

    const result = this._projectAndSort(faces3D);
    this._cachedFaces = result;
    this._dirty = false;
    return result;
  }

  /**
   * Generate faces from a test function without storing any voxels.
   * Zero allocations in the Map — purely functional rendering.
   *
   * opts: {
   *   bounds: [[minX,minY,minZ], [maxX,maxY,maxZ]],  — single scan region
   *   regions: [[[minX,minY,minZ],[maxX,maxY,maxZ]], ...], — multiple scan regions (deduped)
   *   test: (x,y,z) => bool,
   *   style?: (x,y,z,faceName) => styleObj | styleObj
   * }
   */
  getFacesFrom(opts) {
    const regions = opts.regions || [opts.bounds];
    const test = opts.test;
    const styleFn = typeof opts.style === 'function' ? opts.style : null;
    const styleObj = !styleFn ? (opts.style || null) : null;
    const defaultStyle = this.defaultStyle;

    const { projection, depthOffsetX, depthOffsetY, tileW, tileH } = this.renderOptions;
    const dx_norm = projection === 'oblique' ? depthOffsetX / tileW : 0;
    const dy_norm = projection === 'oblique' ? depthOffsetY / tileH : 0;
    const isOblique = projection === 'oblique';

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
                  if (styleFn) return { ...defaultStyle, ...styleFn(x, y, z, faceName) };
                  const sd = styleObj.default;
                  const base = sd ? { ...defaultStyle, ...(typeof sd === 'function' ? sd(x, y, z) : sd) } : defaultStyle;
                  const fs = styleObj[faceName];
                  return fs ? { ...base, ...(typeof fs === 'function' ? fs(x, y, z) : fs) } : base;
                };

            // Neighbor test — just call the test function directly (it handles its own bounds)
            if (isOblique) {
              const getDepth = (cx, cy, cz) => cz - (cx * dx_norm) - (cy * dy_norm);
              const addFace = (type, vertices, cx, cy, cz) => {
                faces3D.push({ type, voxel, vertices, depth: getDepth(cx, cy, cz), style: getStyles(type) });
              };

              if (depthOffsetY < 0 && !test(x, y-1, z)) addFace('top',    [[x,y,z],[x+1,y,z],[x+1,y,z+1],[x,y,z+1]], x+.5,y,z+.5);
              if (depthOffsetY > 0 && !test(x, y+1, z)) addFace('bottom', [[x,y+1,z+1],[x+1,y+1,z+1],[x+1,y+1,z],[x,y+1,z]], x+.5,y+1,z+.5);
              if (depthOffsetX < 0 && !test(x-1, y, z)) addFace('left',   [[x,y,z+1],[x,y,z],[x,y+1,z],[x,y+1,z+1]], x,y+.5,z+.5);
              if (depthOffsetX > 0 && !test(x+1, y, z)) addFace('right',  [[x+1,y,z],[x+1,y,z+1],[x+1,y+1,z+1],[x+1,y+1,z]], x+1,y+.5,z+.5);
              if (!test(x, y, z-1)) addFace('front', [[x,y,z],[x,y+1,z],[x+1,y+1,z],[x+1,y,z]], x+.5,y+.5,z);
              if (!test(x, y, z+1)) addFace('back',  [[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1],[x,y,z+1]], x+.5,y+.5,z+1);

            } else {
              const addFace = (type, vertices, n, c) => {
                faces3D.push({ type, voxel, vertices, n, c, style: getStyles(type) });
              };

              if (!test(x, y-1, z)) addFace('top',    [[x,y,z],[x+1,y,z],[x+1,y,z+1],[x,y,z+1]], [0,-1,0], [x+.5,y,z+.5]);
              if (!test(x, y+1, z)) addFace('bottom', [[x,y+1,z+1],[x+1,y+1,z+1],[x+1,y+1,z],[x,y+1,z]], [0,1,0], [x+.5,y+1,z+.5]);
              if (!test(x-1, y, z)) addFace('left',   [[x,y,z+1],[x,y,z],[x,y+1,z],[x,y+1,z+1]], [-1,0,0], [x,y+.5,z+.5]);
              if (!test(x+1, y, z)) addFace('right',  [[x+1,y,z],[x+1,y,z+1],[x+1,y+1,z+1],[x+1,y+1,z]], [1,0,0], [x+1,y+.5,z+.5]);
              if (!test(x, y, z-1)) addFace('front',  [[x,y,z],[x,y+1,z],[x+1,y+1,z],[x+1,y,z]], [0,0,-1], [x+.5,y+.5,z]);
              if (!test(x, y, z+1)) addFace('back',   [[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1],[x,y,z+1]], [0,0,1], [x+.5,y+.5,z+1]);
            }
          }
        }
      }
    }

    return this._projectAndSort(faces3D);
  }

  /**
   * Project 3D faces to 2D and sort by depth (shared by getFaces and getFacesFrom).
   */
  _projectAndSort(faces3D) {
    const projectedFaces = [];
    const { projection, tileW, tileH, depthOffsetX, depthOffsetY, cameraX, cameraY, cameraDistance } = this.renderOptions;
    const dx_norm = projection === 'oblique' ? depthOffsetX / tileW : 0;
    const dy_norm = projection === 'oblique' ? depthOffsetY / tileH : 0;

    for (const face of faces3D) {
      if (face.type === 'content') {
        const [cx, cy, cz] = face._pos;
        let px, py, scale, depth;
        if (projection === 'oblique') {
          px = (cx + 0.5) * tileW + (cz + 0.5) * depthOffsetX;
          py = (cy + 0.5) * tileH + (cz + 0.5) * depthOffsetY;
          scale = 1;
          depth = (cz + 0.5) - ((cx + 0.5) * dx_norm) - ((cy + 0.5) * dy_norm);
        } else {
          const t = cameraDistance / (cz + 0.5 + cameraDistance);
          px = (cameraX + (cx + 0.5 - cameraX) * t) * tileW;
          py = (cameraY + (cy + 0.5 - cameraY) * t) * tileH;
          scale = t;
          const dx = cx + 0.5 - cameraX, dy = cy + 0.5 - cameraY, dz = cz + 0.5 + cameraDistance;
          depth = dx * dx + dy * dy + dz * dz;
        }
        const corners = [[cx, cy, cz], [cx + 1, cy, cz], [cx, cy + 1, cz], [cx + 1, cy + 1, cz]];
        if (projection === 'oblique') {
          face.points = corners.map(([vx, vy, vz]) => [vx * tileW + vz * depthOffsetX, vy * tileH + vz * depthOffsetY]);
        } else {
          face.points = corners.map(([vx, vy, vz]) => {
            const ct = cameraDistance / (vz + cameraDistance);
            return [(cameraX + (vx - cameraX) * ct) * tileW, (cameraY + (vy - cameraY) * ct) * tileH];
          });
        }
        face.depth = depth;
        face._px = px;
        face._py = py;
        face._scale = scale;
        projectedFaces.push(face);
        continue;
      }

      if (projection === 'oblique') {
        face.points = face.vertices.map(v => [
          v[0] * tileW + v[2] * depthOffsetX,
          v[1] * tileH + v[2] * depthOffsetY
        ]);

      } else if (projection === 'perspective') {
        const Cx = cameraX;
        const Cy = cameraY;
        const Cz = -cameraDistance;

        const viewVec = [face.c[0] - Cx, face.c[1] - Cy, face.c[2] - Cz];
        const dot = viewVec[0] * face.n[0] + viewVec[1] * face.n[1] + viewVec[2] * face.n[2];
        if (dot >= 0) continue;

        const minDenom = 0.01;
        if (face.vertices.some(v => v[2] + cameraDistance < minDenom)) continue;

        face.points = face.vertices.map(v => {
          const t = cameraDistance / (v[2] + cameraDistance);
          const px = Cx + (v[0] - Cx) * t;
          const py = Cy + (v[1] - Cy) * t;
          return [px * tileW, py * tileH];
        });

        face.depth = viewVec[0] * viewVec[0] + viewVec[1] * viewVec[1] + viewVec[2] * viewVec[2];
      }

      projectedFaces.push(face);
    }

    projectedFaces.sort((a, b) => b.depth - a.depth);
    return projectedFaces;
  }

  /**
   * Calculate exact 2D bounding box of all generated geometry faces
   */
  getViewBoxBounds() {
    const faces = this.getFaces();
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    if (faces.length === 0) return { x: 0, y: 0, w: 100, h: 100, faces };

    for (const face of faces) {
      for (const [px, py] of face.points) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }

    return {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
      faces
    };
  }

  /**
   * Returns a ready-to-use viewBox array [x, y, w, h] with padding.
   * Accepts pre-computed faces or uses stored voxels.
   */
  getOptimalViewBox(padding = 20, faces) {
    const b = faces ? this._boundsFromFaces(faces) : this.getViewBoxBounds();
    return [b.x - padding, b.y - padding, b.w + padding * 2, b.h + padding * 2];
  }

  _boundsFromFaces(faces) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    if (faces.length === 0) return { x: 0, y: 0, w: 100, h: 100, faces };
    for (const face of faces) {
      for (const [px, py] of face.points) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, faces };
  }

  /**
   * Helper to convert an object of styles to an SVG attribute string.
   * Caches both camelCase → kebab-case key conversions and full style-string results.
   */
  _buildSvgAttributes(styleObj) {
    // Check style-string cache — same object identity = same result
    const cached = Heerich._styleCache.get(styleObj);
    if (cached) return cached;

    const merged = { strokeLinejoin: 'round', ...styleObj };
    let attrStr = '';
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== null) {
        const kebabKey = Heerich._kebabCache[key] ||
          (Heerich._kebabCache[key] = key.replace(/([A-Z])/g, '-$1').toLowerCase());
        attrStr += ` ${kebabKey}="${value}"`;
      }
    }

    Heerich._styleCache.set(styleObj, attrStr);
    return attrStr;
  }

  toSVG(options = {}) {
    const pad = options.padding || 20;
    // Allow passing pre-computed faces (e.g. from getFacesFrom)
    const bounds = options.faces
      ? this._boundsFromFaces(options.faces)
      : this.getViewBoxBounds();
    const faces = bounds.faces;

    // Allow custom viewBox override
    const vbX = options.viewBox ? options.viewBox[0] : bounds.x - pad;
    const vbY = options.viewBox ? options.viewBox[1] : bounds.y - pad;
    const vbW = options.viewBox ? options.viewBox[2] : bounds.w + (pad * 2);
    const vbH = options.viewBox ? options.viewBox[3] : bounds.h + (pad * 2);

    const offset = options.offset || [0, 0];
    const tw = this.renderOptions.tileW;
    const faceAttrFn = options.faceAttributes || null;
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" style="width:100%; height:100%;">`
    ];

    if (options.prepend) parts.push(options.prepend);

    parts.push(`<g transform="translate(${offset[0]}, ${offset[1]})">`);


    for (const face of faces) {
      if (face.type === 'content') {
        parts.push(
          `<g transform="translate(${face._px}, ${face._py}) scale(${face._scale})" style="--x:${face._px};--y:${face._py};--z:${face._pos[2]};--scale:${face._scale};--tile:${tw}">`,
          face.content,
          '</g>'
        );
        continue;
      }

      const ptsStr = face.points.map(p => `${p[0]},${p[1]}`).join(' ');
      const v = face.voxel;

      // faceAttributes can override style props (fill, stroke, etc.) and add extra SVG attrs
      let style = face.style;
      let extraAttrs = '';
      if (faceAttrFn) {
        const custom = faceAttrFn(face);
        if (custom) {
          const styleOverrides = {};
          for (const [key, value] of Object.entries(custom)) {
            if (value === undefined || value === null) continue;
            // Known SVG presentation attributes → merge into style
            if (key === 'fill' || key === 'stroke' || key === 'strokeWidth' || key === 'opacity' ||
                key === 'strokeDasharray' || key === 'strokeLinecap' || key === 'strokeLinejoin' ||
                key === 'fillOpacity' || key === 'strokeOpacity') {
              styleOverrides[key] = value;
            } else {
              extraAttrs += ` ${key}="${value}"`;
            }
          }
          if (Object.keys(styleOverrides).length > 0) {
            style = { ...style, ...styleOverrides };
          }
        }
      }

      // Map voxel meta to data-* attributes
      let metaAttrs = '';
      if (v.meta) {
        for (const [mk, mv] of Object.entries(v.meta)) {
          metaAttrs += ` data-${mk}="${mv}"`;
        }
      }

      parts.push(`<polygon points="${ptsStr}"${this._buildSvgAttributes(style)} data-voxel="${v.x},${v.y},${v.z}" data-x="${v.x}" data-y="${v.y}" data-z="${v.z}" data-face="${face.type}"${metaAttrs}${extraAttrs} />`);
    }

    parts.push('</g>');
    if (options.append) parts.push(options.append);
    parts.push('</svg>');
    return parts.join('');
  }
}

Heerich._kebabCache = {};
Heerich._styleCache = new WeakMap();