import { computeBounds } from "./svg.js";

/**
 * Canvas 2D renderer for Heerich voxel scenes.
 * Consumes the output of `getFaces()` / `getFacesFrom()` and draws to a canvas element.
 */
export class Canvas2dRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    /** @type {import('../heerich.js').Face[]|null} */
    this._lastFaces = null;
    /** @type {{scaleX: number, scaleY: number, tx: number, ty: number}|null} */
    this._transform = null;
  }

  /**
   * Render projected faces to the canvas.
   * @param {import('../heerich.js').Face[]} faces - Projected, depth-sorted face array
   * @param {Object} [options]
   * @param {boolean} [options.clear=true] - Clear the canvas before drawing
   * @param {[number,number]} [options.offset=[0,0]] - Translate all geometry
   * @param {number} [options.padding=20] - Padding in scene-space units
   * @param {function(import('../heerich.js').Face): Object|null} [options.faceAttributes] - Per-face style override callback (only style keys are applied; arbitrary attributes like class/data-* are ignored unlike SVGRenderer)
   * @param {boolean} [options.fitCanvas=true] - Scale to fit canvas dimensions
   */
  render(faces, options = {}) {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const pad = options.padding || 20;
    const offset = options.offset || [0, 0];
    const faceAttrFn = options.faceAttributes || null;
    const fitCanvas = options.fitCanvas !== false;

    const bounds = computeBounds(faces);
    const vpX = bounds.x - pad;
    const vpY = bounds.y - pad;
    const vpW = bounds.w + pad * 2;
    const vpH = bounds.h + pad * 2;

    if (options.clear !== false) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    let scaleX = 1,
      scaleY = 1,
      tx = 0,
      ty = 0;
    if (fitCanvas && vpW > 0 && vpH > 0) {
      const scale = Math.min(canvas.width / vpW, canvas.height / vpH);
      scaleX = scale;
      scaleY = scale;
      tx = (canvas.width - vpW * scale) / 2 - vpX * scale;
      ty = (canvas.height - vpH * scale) / 2 - vpY * scale;
    }

    this._transform = { scaleX, scaleY, tx, ty };
    this._lastFaces = faces;

    ctx.save();
    ctx.setTransform(
      scaleX,
      0,
      0,
      scaleY,
      tx + offset[0] * scaleX,
      ty + offset[1] * scaleY,
    );
    ctx.lineJoin = "round";

    // Track previous style to avoid redundant canvas state changes
    let prevFill = "";
    let prevStroke = "";
    let prevLineWidth = -1;
    let prevAlpha = 1;

    for (let fi = 0; fi < faces.length; fi++) {
      const face = faces[fi];
      if (face.type === "content") continue;

      let style = face.style;

      if (faceAttrFn) {
        const custom = faceAttrFn(face);
        if (custom) {
          let hasOverrides = false;
          const styleOverrides = {};
          for (const key in custom) {
            const value = custom[key];
            if (value === undefined || value === null) continue;
            if (
              key === "fill" ||
              key === "stroke" ||
              key === "strokeWidth" ||
              key === "opacity" ||
              key === "strokeDasharray" ||
              key === "strokeLinecap" ||
              key === "strokeLinejoin" ||
              key === "fillOpacity" ||
              key === "strokeOpacity"
            ) {
              styleOverrides[key] = value;
              hasOverrides = true;
            }
          }
          if (hasOverrides) style = { ...style, ...styleOverrides };
        }
      }

      const d = face.points.data;

      // Build path
      ctx.beginPath();
      ctx.moveTo(d[0], d[1]);
      ctx.lineTo(d[2], d[3]);
      ctx.lineTo(d[4], d[5]);
      ctx.lineTo(d[6], d[7]);
      ctx.closePath();

      // Opacity
      const alpha = style.opacity !== undefined ? style.opacity : 1;
      if (alpha !== prevAlpha) {
        ctx.globalAlpha = alpha;
        prevAlpha = alpha;
      }

      // Fill
      if (style.fill && style.fill !== "none") {
        if (style.fill !== prevFill) {
          ctx.fillStyle = style.fill;
          prevFill = style.fill;
        }
        if (style.fillOpacity !== undefined) {
          const a = alpha * style.fillOpacity;
          ctx.globalAlpha = a;
          ctx.fill();
          ctx.globalAlpha = alpha;
        } else {
          ctx.fill();
        }
      }

      // Stroke
      if (style.stroke && style.stroke !== "none") {
        if (style.stroke !== prevStroke) {
          ctx.strokeStyle = style.stroke;
          prevStroke = style.stroke;
        }
        const lw = style.strokeWidth !== undefined ? style.strokeWidth : 1;
        if (lw !== prevLineWidth) {
          ctx.lineWidth = lw;
          prevLineWidth = lw;
        }
        ctx.lineJoin = /** @type {CanvasLineJoin} */ (
          style.strokeLinejoin || "round"
        );
        ctx.lineCap = /** @type {CanvasLineCap} */ (
          style.strokeLinecap || "butt"
        );
        if (style.strokeDasharray) {
          ctx.setLineDash(style.strokeDasharray.split(/[\s,]+/).map(Number));
        } else {
          ctx.setLineDash([]);
        }
        if (style.strokeOpacity !== undefined) {
          const a = alpha * style.strokeOpacity;
          ctx.globalAlpha = a;
          ctx.stroke();
          ctx.globalAlpha = alpha;
        } else {
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  /**
   * Hit-test: find the topmost face under the given canvas-space coordinate.
   * @param {number} canvasX - X coordinate in canvas pixel space
   * @param {number} canvasY - Y coordinate in canvas pixel space
   * @returns {import('../heerich.js').Face|null} The topmost face under the point, or null
   */
  hitTest(canvasX, canvasY) {
    if (!this._lastFaces || !this._transform) return null;

    const { scaleX, scaleY, tx, ty } = this._transform;
    const sceneX = (canvasX - tx) / scaleX;
    const sceneY = (canvasY - ty) / scaleY;

    for (let i = this._lastFaces.length - 1; i >= 0; i--) {
      const face = this._lastFaces[i];
      if (face.type === "content") continue;
      if (_pointInPolygon(sceneX, sceneY, face.points.data)) {
        return face;
      }
    }
    return null;
  }
}

/**
 * Ray-casting point-in-polygon test on flat point data.
 * @param {number} x
 * @param {number} y
 * @param {number[]} d - Flat point data [x0,y0,x1,y1,...]
 * @returns {boolean}
 */
function _pointInPolygon(x, y, d) {
  let inside = false;
  const n = d.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = d[i],
      yi = d[i + 1];
    const xj = d[j],
      yj = d[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
