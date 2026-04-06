/**
 * Hatching support for Heerich SVG faces.
 *
 * Generates parallel lines clipped precisely to the face polygon edges.
 * Line endpoints are computed analytically, making the output suitable for pen plotters.
 */

/**
 * @typedef {Object} HatchOptions
 * @property {number} [angle=45] - Hatch line angle in degrees
 * @property {number} [period=2] - Spacing between hatch lines in pixels
 * @property {string} [stroke] - Hatch line color (defaults to face stroke or "currentColor")
 * @property {number} [strokeWidth] - Hatch line width (defaults to face strokeWidth)
 * @property {number} [opacity] - Hatch line opacity
 */

/**
 * Parse an SVG path string (absolute M/L/Z only) into polygon vertex arrays.
 * @param {string} d
 * @returns {number[][][]} Array of polygons, each [[x,y],...]
 */
function parsePathD(d) {
  const polys = [];
  let current = null;
  const re = /([MLZmlz])([-0-9.e\s]*)/gi;
  let m;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1].toUpperCase();
    const args = m[2].trim()
      ? m[2]
          .trim()
          .split(/[\s,]+/)
          .filter(Boolean)
          .map(Number)
      : [];
    if (cmd === "M") {
      if (current && current.length) polys.push(current);
      current = args.length >= 2 ? [[args[0], args[1]]] : [];
    } else if (cmd === "L") {
      if (current && args.length >= 2) current.push([args[0], args[1]]);
    } else if (cmd === "Z") {
      if (current && current.length) {
        polys.push(current);
        current = null;
      }
    }
  }
  if (current && current.length) polys.push(current);
  return polys;
}

/**
 * Find all intersections of a hatch line with a polygon's edges and return
 * clipped line segments inside the polygon. Works for convex and non-convex
 * simple polygons (even-odd rule).
 *
 * @param {number} ox - Point on hatch line, x
 * @param {number} oy - Point on hatch line, y
 * @param {number} cosA - Line direction x (unit vector)
 * @param {number} sinA - Line direction y (unit vector)
 * @param {number[][]} poly - Polygon vertices [[x,y],...]
 * @returns {number[][]} Array of [x1,y1,x2,y2] segments
 */
function clipLineToPolygon(ox, oy, cosA, sinA, poly) {
  const ts = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const ax = poly[i][0],
      ay = poly[i][1];
    const bx = poly[(i + 1) % n][0],
      by = poly[(i + 1) % n][1];
    const edx = bx - ax,
      edy = by - ay;
    // D = (cosA, sinA), solve: P + t*D = A + s*E
    const denom = cosA * edy - sinA * edx;
    if (Math.abs(denom) < 1e-10) continue; // parallel
    const dx = ax - ox,
      dy = ay - oy;
    const t = (dx * edy - dy * edx) / denom;
    const s = (dx * sinA - dy * cosA) / denom;
    if (s >= -1e-10 && s < 1 - 1e-10) {
      ts.push(t);
    }
  }
  if (ts.length < 2) return [];
  ts.sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i + 1 < ts.length; i += 2) {
    const t1 = ts[i],
      t2 = ts[i + 1];
    if (t2 - t1 < 1e-10) continue;
    segs.push([ox + t1 * cosA, oy + t1 * sinA, ox + t2 * cosA, oy + t2 * sinA]);
  }
  return segs;
}

/**
 * Generate SVG markup for hatch lines clipped to a face polygon.
 *
 * @param {number[]} pts - Flat [x0,y0,x1,y1,...] array of projected face corners
 * @param {HatchOptions} hatch
 * @param {string|null} pathD - Occluded face path data; when non-null, clips to this shape instead of the full quad
 * @param {Object|null} faceStyle - Face style object (used for stroke/strokeWidth defaults)
 * @returns {string} SVG markup: line elements
 */
export function buildHatchSVG(pts, hatch, pathD, faceStyle) {
  const angle = hatch.angle !== undefined ? hatch.angle : 45;
  const period = hatch.period !== undefined ? hatch.period : 2;
  if (period <= 0) return "";
  const rad = (angle * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  // Build polygon(s) to clip against
  const polys = pathD
    ? parsePathD(pathD)
    : [
        [
          [pts[0], pts[1]],
          [pts[2], pts[3]],
          [pts[4], pts[5]],
          [pts[6], pts[7]],
        ],
      ];

  // Bounding box of all polygons for line range computation
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const poly of polys) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  // Project bbox corners onto the axis perpendicular to the lines to find t range
  const bx = [minX, maxX, maxX, minX];
  const by = [minY, minY, maxY, maxY];
  let pMin = Infinity,
    pMax = -Infinity;
  for (let i = 0; i < 4; i++) {
    const p = -bx[i] * sinA + by[i] * cosA;
    if (p < pMin) pMin = p;
    if (p > pMax) pMax = p;
  }

  const stroke = hatch.stroke ?? faceStyle?.stroke ?? "currentColor";
  const sw = hatch.strokeWidth ?? faceStyle?.strokeWidth ?? 1;
  const baseAttrs = ` stroke="${stroke}" stroke-width="${sw}" fill="none"${hatch.opacity !== undefined ? ` opacity="${hatch.opacity}"` : ""}`;

  const r = (v) => Math.round(v * 1e4) / 1e4;
  let lines = "";
  const t0 = Math.ceil(pMin / period) * period;
  for (let t = t0; t <= pMax; t += period) {
    const ox = -t * sinA;
    const oy = t * cosA;
    for (const poly of polys) {
      const segs = clipLineToPolygon(ox, oy, cosA, sinA, poly);
      for (const [x1, y1, x2, y2] of segs) {
        lines += `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}"${baseAttrs}/>`;
      }
    }
  }

  return lines;
}
