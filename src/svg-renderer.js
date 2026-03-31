const _kebabCache = {};
const _styleCache = new WeakMap();

/**
 * SVG renderer for Heerich voxel scenes.
 * Consumes the output of `getFaces()` / `renderTest()` and produces an SVG string.
 */
export class SVGRenderer {
  /**
   * Render projected faces to an SVG string.
   * @param {import('../heerich.js').Face[]} faces - Projected, depth-sorted face array
   * @param {Object} [options]
   * @param {number} [options.padding=20] - ViewBox padding in pixels
   * @param {[number,number,number,number]} [options.viewBox] - Custom viewBox override
   * @param {[number,number]} [options.offset=[0,0]] - Translate all geometry
   * @param {string} [options.prepend] - Raw SVG to insert before faces
   * @param {string} [options.append] - Raw SVG to insert after faces
   * @param {function(import('../heerich.js').Face): Object|null} [options.faceAttributes] - Per-face attribute callback
   * @param {number} [options.tileW] - Voxel tile pixel width (for content face transforms)
   * @returns {string} SVG markup
   */
  render(faces, options = {}) {
    const pad = options.padding || 20;
    const bounds = computeBounds(faces);

    const vbX = options.viewBox ? options.viewBox[0] : bounds.x - pad;
    const vbY = options.viewBox ? options.viewBox[1] : bounds.y - pad;
    const vbW = options.viewBox ? options.viewBox[2] : bounds.w + pad * 2;
    const vbH = options.viewBox ? options.viewBox[3] : bounds.h + pad * 2;

    const offset = options.offset || [0, 0];
    const tw = options.tileW || 1;
    const faceAttrFn = options.faceAttributes || null;

    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" style="width:100%; height:100%;">`,
    ];
    if (options.prepend) parts.push(options.prepend);
    parts.push(`<g transform="translate(${offset[0]}, ${offset[1]})">`);

    for (let fi = 0; fi < faces.length; fi++) {
      const face = faces[fi];

      if (face.type === "content") {
        parts.push(
          `<g transform="translate(${face._px}, ${face._py}) scale(${face._scale})" style="--x:${face._px};--y:${face._py};--z:${face._pos[2]};--scale:${face._scale};--tile:${tw}">`,
          face.content,
          "</g>",
        );
        continue;
      }

      const d = face.points.data;
      const v = face.voxel;

      let style = face.style;
      let extraAttrs = "";
      if (faceAttrFn) {
        const custom = faceAttrFn(face);
        if (custom) {
          const styleOverrides = {};
          for (const [key, value] of Object.entries(custom)) {
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
            } else {
              extraAttrs += ` ${key}="${value}"`;
            }
          }
          if (Object.keys(styleOverrides).length > 0) {
            style = { ...style, ...styleOverrides };
          }
        }
      }

      let metaAttrs = "";
      if (v.meta) {
        for (const [mk, mv] of Object.entries(v.meta)) {
          metaAttrs += ` data-${mk}="${mv}"`;
        }
      }

      parts.push(
        `<polygon points="${d[0]},${d[1]} ${d[2]},${d[3]} ${d[4]},${d[5]} ${d[6]},${d[7]}"${_buildSvgAttributes(style)} data-voxel="${v.x},${v.y},${v.z}" data-x="${v.x}" data-y="${v.y}" data-z="${v.z}" data-face="${face.type}"${metaAttrs}${extraAttrs} />`,
      );
    }

    parts.push("</g>");
    if (options.append) parts.push(options.append);
    parts.push("</svg>");
    return parts.join("");
  }
}

/**
 * Compute 2D bounding box from projected faces.
 * @param {import('../heerich.js').Face[]} faces
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function computeBounds(faces) {
  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;
  if (faces.length === 0) return { x: 0, y: 0, w: 100, h: 100 };
  for (let fi = 0; fi < faces.length; fi++) {
    const d = faces[fi].points.data;
    for (let i = 0; i < d.length; i += 2) {
      const px = d[i],
        py = d[i + 1];
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Convert a style object to an SVG attribute string.
 * @param {import('../heerich.js').StyleObject} styleObj
 * @returns {string}
 */
function _buildSvgAttributes(styleObj) {
  const cached = _styleCache.get(styleObj);
  if (cached) return cached;

  const merged = { strokeLinejoin: "round", ...styleObj };
  let attrStr = "";
  for (const key in merged) {
    const value = merged[key];
    if (value !== undefined && value !== null) {
      const kebabKey =
        _kebabCache[key] ||
        (_kebabCache[key] = key.replace(/([A-Z])/g, "-$1").toLowerCase());
      attrStr += ` ${kebabKey}="${value}"`;
    }
  }

  _styleCache.set(styleObj, attrStr);
  return attrStr;
}
