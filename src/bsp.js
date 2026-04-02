// Robust 2D Polygon Subtraction for culling occluded faces
// We treat earlier faces as "solid" and subtract them from later faces.

const EPSILON = 1e-4;

export class BSPTree {
  constructor() {
    this.nodes = []; // Convex polygons representing front-most faces
  }

  /**
   * Find all previously inserted occluders whose bounding boxes overlap with the given face bounds.
   * Useful for broad-phase rejection before performing exact clipping.
   */
  getOverlapping(minX, minY, maxX, maxY) {
    const overlapping = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const occ = this.nodes[i];
      // AABB overlap test
      if (
        !(
          maxX < occ.bounds.minX ||
          minX > occ.bounds.maxX ||
          maxY < occ.bounds.minY ||
          minY > occ.bounds.maxY
        )
      ) {
        overlapping.push(occ.poly);
      }
    }
    return overlapping;
  }

  /**
   * Clip a polygon against all previously inserted occluders.
   * Returns an array of visible polygon fragments.
   */
  clip(poly) {
    let result = [poly];

    for (const occluderObj of this.nodes) {
      if (result.length === 0) return [];
      const nextResult = [];
      const occluder = occluderObj.poly;
      const ob = occluderObj.bounds;

      for (const p of result) {
        // Broad phase: AABB check
        let pMinX = Infinity,
          pMinY = Infinity,
          pMaxX = -Infinity,
          pMaxY = -Infinity;
        for (let i = 0; i < p.length; i++) {
          const pt = p[i];
          if (pt[0] < pMinX) pMinX = pt[0];
          if (pt[1] < pMinY) pMinY = pt[1];
          if (pt[0] > pMaxX) pMaxX = pt[0];
          if (pt[1] > pMaxY) pMaxY = pt[1];
        }

        if (
          pMaxX < ob.minX ||
          pMinX > ob.maxX ||
          pMaxY < ob.minY ||
          pMinY > ob.maxY
        ) {
          // No AABB overlap, skip expensive narrow-phase polygon clipping
          nextResult.push(p);
          continue;
        }

        const clipped = this.subtractConvex(p, occluder);
        nextResult.push(...clipped);
      }
      result = nextResult;
    }

    // Filter out degenerate polygons (lines/points/slivers)
    return result.filter((p) => this.calcArea(p) > EPSILON);
  }

  /**
   * Add a polygon as an occluder to the BSP tree.
   * Optionally provide pre-calculated bounding box to save processing time.
   */
  insert(poly, minX, minY, maxX, maxY) {
    // Enforce Clockwise (CW) winding so that the "inside" is always to the right of the edges.
    const area = this.calcSignedArea(poly);
    if (Math.abs(area) < EPSILON) return; // Degenerate polygon doesn't occlude anything

    let orientedPoly = poly;
    if (area > 0) {
      // Area is CCW, reverse points to make it CW
      orientedPoly = [...poly].reverse();
    }

    // Pre-calculate AABB for broad-phase occlusion tests if not provided
    if (minX === undefined) {
      minX = Infinity;
      minY = Infinity;
      maxX = -Infinity;
      maxY = -Infinity;
      for (let i = 0; i < orientedPoly.length; i++) {
        const pt = orientedPoly[i];
        if (pt[0] < minX) minX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] > maxY) maxY = pt[1];
      }
    }

    this.nodes.push({ poly: orientedPoly, bounds: { minX, minY, maxX, maxY } });
  }

  /**
   * Subtracts an occluder (must be convex and CW) from a subject polygon.
   * Returns an array of fragments of the subject that reside OUTSIDE the occluder.
   */
  subtractConvex(subject, occluder) {
    const fragments = [];
    let insideFrag = subject; // The portion of the subject currently "inside" the occluder's planes

    for (let i = 0; i < occluder.length; i++) {
      if (!insideFrag || insideFrag.length < 3) break;

      const p1 = occluder[i];
      const p2 = occluder[(i + 1) % occluder.length];

      const split = this.splitPolygonByLine(insideFrag, p1, p2);

      // 'front' is mathematically to the left of the edge p1->p2
      // Because occluder is CW, 'left' is OUTSIDE the occluder.
      // Therefore, the front piece has escaped the occluder and is visible!
      if (
        split.front &&
        split.front.length > 2 &&
        this.calcArea(split.front) > EPSILON
      ) {
        fragments.push(split.front);
      }

      // 'back' is to the right of the edge (INSIDE the occluder).
      // We continue to test this remaining piece against the other edges of the occluder.
      insideFrag = split.back && split.back.length > 2 ? split.back : null;
    }

    // Any piece of the subject that makes it through all edges is 100% inside the occluder.
    // We do *not* add it to fragments, effectively erasing it.

    return fragments;
  }

  /**
   * Splits a polygon by an infinite line passing through p1 and p2.
   * Returns { front: [...], back: [...] }.
   */
  splitPolygonByLine(poly, p1, p2) {
    const front = [];
    const back = [];

    const classify = (pt) => {
      // Cross product of (p2 - p1) x (pt - p1)
      const cross =
        (p2[0] - p1[0]) * (pt[1] - p1[1]) - (p2[1] - p1[1]) * (pt[0] - p1[0]);
      if (cross > EPSILON) return 1; // Left (Outside)
      if (cross < -EPSILON) return -1; // Right (Inside)
      return 0; // On the line
    };

    let ptA = poly[poly.length - 1];
    let sideA = classify(ptA);

    for (let i = 0; i < poly.length; i++) {
      const ptB = poly[i];
      const sideB = classify(ptB);

      if (sideB > 0) {
        // B is in front (left/outside)
        if (sideA < 0) {
          // A was in back (right/inside)
          const isect = this.lineIntersect(p1, p2, ptA, ptB);
          if (isect) {
            front.push(isect);
            back.push(isect);
          }
        }
        front.push(ptB);
      } else if (sideB < 0) {
        // B is in back (right/inside)
        if (sideA > 0) {
          // A was in front (left/outside)
          const isect = this.lineIntersect(p1, p2, ptA, ptB);
          if (isect) {
            front.push(isect);
            back.push(isect);
          }
        }
        back.push(ptB);
      } else {
        // B is exactly on the line
        front.push(ptB);
        back.push(ptB);
      }

      ptA = ptB;
      sideA = sideB;
    }

    return { front, back };
  }

  lineIntersect(p1, p2, p3, p4) {
    const dx12 = p2[0] - p1[0];
    const dy12 = p2[1] - p1[1];
    const dx34 = p4[0] - p3[0];
    const dy34 = p4[1] - p3[1];

    const det = dx12 * dy34 - dy12 * dx34;
    if (Math.abs(det) < EPSILON) return null; // Parallel lines

    const dx31 = p3[0] - p1[0];
    const dy31 = p3[1] - p1[1];

    const t = (dx31 * dy34 - dy31 * dx34) / det;
    return [p1[0] + t * dx12, p1[1] + t * dy12];
  }

  calcSignedArea(poly) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const pA = poly[i];
      const pB = poly[(i + 1) % poly.length];
      area += pA[0] * pB[1] - pB[0] * pA[1];
    }
    return area / 2;
  }

  calcArea(poly) {
    return Math.abs(this.calcSignedArea(poly));
  }
}
