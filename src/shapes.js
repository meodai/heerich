/**
 * Shape coordinate generators.
 * Each generator yields [x, y, z] integer coordinates for a shape primitive.
 */

/**
 * Iterate coordinates for a box shape.
 * @param {[number,number,number]} position
 * @param {[number,number,number]} size
 * @returns {Generator<number[], void, unknown>}
 */
export function* boxCoords(position, size) {
  const [sx, sy, sz] = position;
  const [w, h, d] = size;
  for (let z = sz; z < sz + d; z++)
    for (let y = sy; y < sy + h; y++)
      for (let x = sx; x < sx + w; x++) yield [x, y, z];
}

/**
 * Iterate coordinates for a sphere shape.
 * @param {[number,number,number]} center
 * @param {number} radius
 * @returns {Generator<number[], void, unknown>}
 */
export function* sphereCoords(center, radius) {
  const [cx, cy, cz] = center;
  for (let z = Math.ceil(cz - radius); z <= Math.floor(cz + radius); z++)
    for (let y = Math.ceil(cy - radius); y <= Math.floor(cy + radius); y++)
      for (
        let x = Math.ceil(cx - radius);
        x <= Math.floor(cx + radius);
        x++
      ) {
        const dx = cx - x,
          dy = cy - y,
          dz = cz - z;
        if (dx * dx + dy * dy + dz * dz <= radius * radius) yield [x, y, z];
      }
}

/**
 * Iterate coordinates for a line shape (with optional radius/shape).
 * Collects all unique coords via a Set to avoid redundant writes from overlapping stamps.
 * @param {[number,number,number]} from
 * @param {[number,number,number]} to
 * @param {number} radius
 * @param {'rounded'|'square'} shape
 * @returns {Generator<number[], void, unknown>}
 */
export function* lineCoords(from, to, radius, shape) {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;
  const dx = x1 - x0,
    dy = y1 - y0,
    dz = z1 - z0;
  const N = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  const seen = radius > 0 ? new Set() : null;

  const emit = function* (coords) {
    if (!seen) {
      yield* coords;
      return;
    }
    for (const c of coords) {
      const k = ((c[0] + 512) << 20) | ((c[1] + 512) << 10) | (c[2] + 512);
      if (!seen.has(k)) {
        seen.add(k);
        yield c;
      }
    }
  };

  const steps =
    N === 0
      ? [[x0, y0, z0]]
      : Array.from({ length: N + 1 }, (_, i) => {
          const t = i / N;
          return [
            Math.round(x0 + t * dx),
            Math.round(y0 + t * dy),
            Math.round(z0 + t * dz),
          ];
        });

  for (const [cx, cy, cz] of steps) {
    if (shape === "rounded" && radius > 0) {
      yield* emit(sphereCoords([cx, cy, cz], radius));
    } else if (shape === "square" && radius > 0) {
      const r = Math.floor(radius);
      yield* emit(
        boxCoords(
          [cx - r, cy - r, cz - r],
          [r * 2 + 1, r * 2 + 1, r * 2 + 1],
        ),
      );
    } else {
      yield [cx, cy, cz];
    }
  }
}

/**
 * Iterate coordinates within bounds where test returns true.
 * @param {[[number,number,number],[number,number,number]]} bounds - [min, max] corners
 * @param {function(number,number,number): boolean} test
 * @returns {Generator<number[], void, unknown>}
 */
export function* whereCoords(bounds, test) {
  const [[minX, minY, minZ], [maxX, maxY, maxZ]] = bounds;
  for (let z = minZ; z < maxZ; z++)
    for (let y = minY; y < maxY; y++)
      for (let x = minX; x < maxX; x++) if (test(x, y, z)) yield [x, y, z];
}
