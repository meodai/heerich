/**
 * Flat 2D point array. Stores [x0, y0, x1, y1, ...] internally,
 * eliminating per-point array allocations.
 */
export class Points {
  /** @param {number[]} data — flat [x0, y0, x1, y1, ...] */
  constructor(data) {
    this.data = data;
  }

  /** Number of points. */
  get length() {
    return this.data.length >> 1;
  }

  /**
   * X coordinate of point i.
   * @param {number} i
   * @returns {number}
   */
  x(i) {
    return this.data[i * 2];
  }

  /**
   * Y coordinate of point i.
   * @param {number} i
   * @returns {number}
   */
  y(i) {
    return this.data[i * 2 + 1];
  }

  /**
   * Iterate [x, y] pairs. Convenient for non-hot-path code;
   * prefer x(i)/y(i) accessors in performance-critical loops.
   * @returns {Iterator<[number, number]>}
   */
  *[Symbol.iterator]() {
    const d = this.data;
    for (let i = 0; i < d.length; i += 2) {
      yield [d[i], d[i + 1]];
    }
  }

  /**
   * Create a Points from 4 coordinate pairs (the common quad case).
   * @param {number} x0
   * @param {number} y0
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {number} x3
   * @param {number} y3
   * @returns {Points}
   */
  static quad(x0, y0, x1, y1, x2, y2, x3, y3) {
    return new Points([x0, y0, x1, y1, x2, y2, x3, y3]);
  }
}
