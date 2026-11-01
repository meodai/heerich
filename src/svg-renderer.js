import { OccluderIndex } from "./bsp.js";
import { warpPreparedContent } from "./decal-warp.js";
import { buildHatchSVG } from "./hatch.js";

const _kebabCache = {};
const _styleCache = new WeakMap();
const SVG_NS = "http://www.w3.org/2000/svg";

// Reusable elements per update() target. Kept by element, not by renderer, so a
// scene can build a new engine every frame and still draw into the same target.
const _targets = new WeakMap();

// faceAttributes keys that override the face style instead of being raw attributes
const STYLE_ATTRS = new Set([
  "fill",
  "stroke",
  "strokeWidth",
  "opacity",
  "strokeDasharray",
  "strokeLinecap",
  "strokeLinejoin",
  "fillOpacity",
  "strokeOpacity",
]);

/**
 * SVG renderer for Heerich voxel scenes.
 * Consumes the output of `getFaces()` / `renderTest()` and produces an SVG string.
 */
export class SVGRenderer {
  /**
   * Render projected faces to an SVG string.
   * @param {import('./heerich.js').Face[]} faces - Projected, depth-sorted face array
   * @param {Object} [options]
   * @param {number} [options.padding=20] - ViewBox padding in pixels
   * @param {[number,number,number,number]} [options.viewBox] - Custom viewBox override
   * @param {[number,number]} [options.offset=[0,0]] - Translate all geometry
   * @param {string} [options.prepend] - Raw SVG to insert before faces
   * @param {string} [options.append] - Raw SVG to insert after faces
   * @param {boolean} [options.occlusion=false] - Enable built-in occlusion culling (no external dependency needed)
   * @param {(polygon: number[][], occluders: number[][][]) => string|null} [options.resolveOcclusion] - Custom occlusion resolver (overrides built-in). Providing this implicitly enables occlusion.
   * @param {(face: import('./heerich.js').Face) => Object|null} [options.faceAttributes] - Per-face attribute callback
   * @param {number} [options.tileW] - Voxel tile pixel width (for content face transforms)
   * @param {Map<string, import('./heerich.js').DecalDef>} [options.decals] - Registered decal definitions
   * @returns {string} SVG markup
   */
  render(faces, options = {}) {
    const pad = options.padding ?? 20;

    const renderFaces = this._applyOcclusion(faces, options);

    const bounds = computeBounds(renderFaces);

    const vbX = options.viewBox ? options.viewBox[0] : bounds.x - pad;
    const vbY = options.viewBox ? options.viewBox[1] : bounds.y - pad;
    const vbW = options.viewBox ? options.viewBox[2] : bounds.w + pad * 2;
    const vbH = options.viewBox ? options.viewBox[3] : bounds.h + pad * 2;

    const offset = options.offset || [0, 0];
    const tw = options.tileW || 1;
    const faceAttrFn = options.faceAttributes || null;
    const decalDefs = options.decals || null;
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" style="width:100%; height:100%;">`,
    ];

    if (options.prepend) parts.push(options.prepend);
    parts.push(`<g transform="translate(${offset[0]}, ${offset[1]})">`);

    const ctx = { tw, faceAttrFn, decalDefs };
    for (let fi = 0; fi < renderFaces.length; fi++) {
      this._pushFaceMarkup(parts, renderFaces[fi], ctx);
    }

    parts.push("</g>");
    if (options.append) parts.push(options.append);
    parts.push("</svg>");
    return parts.join("");
  }

  /**
   * Render faces into an existing DOM element, reusing its elements between
   * calls and only writing the attributes that changed. Produces the same faces
   * as `render()`. Faces with content, decals, hatching or occlusion clipping
   * can't be a single polygon, so they are kept as `<g>` wrappers around their
   * `render()` markup, which is rewritten only when it changes.
   *
   * @param {Element} target - An `<svg>` or `<g>`. An `<svg>` also gets its `viewBox` set.
   * @param {import('./heerich.js').Face[]} faces - Projected, depth-sorted face array
   * @param {Object} [options] - Same as `render()`, without `prepend` and `append`
   * @returns {Element} The `target`
   */
  update(target, faces, options = {}) {
    const doc = target.ownerDocument;
    let state = _targets.get(target);
    // Start over if the caller cleared the target since the last call
    if (!state || state.group.parentNode !== target) {
      const group = doc.createElementNS(SVG_NS, "g");
      target.appendChild(group);
      state = { group, slots: [], attached: 0, gen: 0 };
      _targets.set(target, state);
    }

    const renderFaces = this._applyOcclusion(faces, options);

    if (target.tagName.toLowerCase() === "svg") {
      const pad = options.padding ?? 20;
      let box = options.viewBox;
      if (!box) {
        const b = computeBounds(renderFaces);
        box = [b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2];
      }
      const viewBox = `${box[0]} ${box[1]} ${box[2]} ${box[3]}`;
      if (state.viewBox !== viewBox) {
        state.viewBox = viewBox;
        target.setAttribute("viewBox", viewBox);
      }
    }

    const offset = options.offset || [0, 0];
    const transform = `translate(${offset[0]}, ${offset[1]})`;
    if (state.transform !== transform) {
      state.transform = transform;
      state.group.setAttribute("transform", transform);
    }

    const ctx = {
      tw: options.tileW || 1,
      faceAttrFn: options.faceAttributes || null,
      decalDefs: options.decals || null,
    };
    const { group, slots } = state;
    const gen = ++state.gen;

    for (let i = 0; i < renderFaces.length; i++) {
      const face = renderFaces[i];
      const style = face.style;
      const isPolygon =
        face.type !== "content" &&
        !face._pathD &&
        !(style && (style.hatch || style.decal));

      let slot = slots[i];
      if (!slot || slot.isPolygon !== isPolygon) {
        const node = doc.createElementNS(SVG_NS, isPolygon ? "polygon" : "g");
        // Swap an attached element of the wrong kind in place
        if (slot && i < state.attached) group.replaceChild(node, slot.node);
        slot = slots[i] = { node, isPolygon, values: {}, gens: {}, html: null };
      }

      if (isPolygon) {
        _writePolygon(slot, face, ctx.faceAttrFn, gen);
      } else {
        const parts = [];
        this._pushFaceMarkup(parts, face, ctx);
        const html = parts.join("");
        if (slot.html !== html) {
          slot.html = html;
          slot.node.innerHTML = html;
        }
      }

      if (i >= state.attached) group.appendChild(slot.node);
    }

    // Detach what this frame doesn't need, but keep it for the next one
    for (let i = renderFaces.length; i < state.attached; i++) {
      group.removeChild(slots[i].node);
    }
    state.attached = renderFaces.length;

    return target;
  }

  /**
   * Run the optional occlusion pass over the faces.
   * @param {import('./heerich.js').Face[]} faces
   * @param {Object} options
   * @returns {import('./heerich.js').Face[]}
   */
  _applyOcclusion(faces, options) {
    let renderFaces = faces;
    const useOcclusion = options.occlusion || options.resolveOcclusion;
    if (useOcclusion) {
      renderFaces = [];
      const frontToBack = [...faces].reverse();
      const bsp = new OccluderIndex();

      for (const face of frontToBack) {
        if (!face.points) continue;

        const pts = face.points.data;
        const len = face.points.length;
        const poly = [];
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;

        for (let i = 0; i < len; i++) {
          const x = pts[i * 2],
            y = pts[i * 2 + 1];
          poly.push([x, y]);
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }

        const overlapping = bsp.getOverlapping(minX, minY, maxX, maxY);

        let isVisible = true;
        let pathD = null;

        if (overlapping.length > 0) {
          if (options.resolveOcclusion) {
            // User-provided clipping (e.g. polygon-clipping library)
            pathD = options.resolveOcclusion(
              poly,
              overlapping.map((idx) => bsp.nodes[idx].poly),
            );
            if (!pathD) {
              isVisible = false;
            }
          } else {
            // Built-in convex polygon subtraction
            const fragments = bsp.clip(poly, overlapping);
            if (fragments.length === 0) {
              isVisible = false; // Fully occluded
            } else {
              // Compare fragment area to original to detect whether the face
              // was actually occluded vs merely split along shared edges
              let fragArea = 0;
              for (const frag of fragments) fragArea += bsp.calcArea(frag);
              const origArea = bsp.calcArea(poly);

              if (fragArea < origArea * 0.999) {
                // Face is actually partially occluded — use clipped path
                let d = "";
                for (const frag of fragments) {
                  for (let i = 0; i < frag.length; i++) {
                    d +=
                      i === 0
                        ? `M${frag[i][0]} ${frag[i][1]}`
                        : `L${frag[i][0]} ${frag[i][1]}`;
                  }
                  d += "Z";
                }
                pathD = d;
              }
              // else: face not actually occluded, render as original polygon
            }
          }
        }

        if (isVisible) {
          bsp.insert(poly, minX, minY, maxX, maxY);
          if (pathD && typeof pathD === "string") {
            renderFaces.push({ ...face, _pathD: pathD });
          } else {
            renderFaces.push(face);
          }
        }
      }
      renderFaces.reverse();
    }
    return renderFaces;
  }

  /**
   * Append the markup of one face to `parts`.
   * @param {string[]} parts
   * @param {import('./heerich.js').Face} face
   * @param {{tw: number, faceAttrFn: Function|null, decalDefs: Map<string, import('./heerich.js').DecalDef>|null}} ctx
   */
  _pushFaceMarkup(parts, face, { tw, faceAttrFn, decalDefs }) {
    if (face.type === "content") {
      parts.push(
        `<g transform="translate(${face._px}, ${face._py}) scale(${face._scale})" style="--x:${face._px};--y:${face._py};--z:${face._pos[2]};--scale:${face._scale};--tile:${tw}">`,
        face.content,
        "</g>",
      );
      return;
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
          if (value === undefined || value === null || key === "decal")
            continue;
          if (STYLE_ATTRS.has(key)) {
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

    if (face._pathD) {
      parts.push(
        `<path d="${face._pathD}"${_buildSvgAttributes(style)} data-voxel="${v.x},${v.y},${v.z}" data-x="${v.x}" data-y="${v.y}" data-z="${v.z}" data-face="${face.type}"${metaAttrs}${extraAttrs} />`,
      );
    } else {
      parts.push(
        `<polygon points="${d[0]},${d[1]} ${d[2]},${d[3]} ${d[4]},${d[5]} ${d[6]},${d[7]}"${_buildSvgAttributes(style)} data-voxel="${v.x},${v.y},${v.z}" data-x="${v.x}" data-y="${v.y}" data-z="${v.z}" data-face="${face.type}"${metaAttrs}${extraAttrs} />`,
      );
    }

    // Emit hatch lines clipped to the face shape
    if (style && style.hatch) {
      parts.push(buildHatchSVG(d, style.hatch, face._pathD || null, style));
    }

    // Emit warped decal paths if this face has a decal reference
    if (style && style.decal && decalDefs) {
      const decalRef = style.decal;
      const decalName = typeof decalRef === "string" ? decalRef : decalRef.name;
      const decalDef = decalDefs && decalDefs.get(decalName);
      if (decalDef) {
        let overrideAttrs = "";
        if (typeof decalRef === "object" && decalRef.style) {
          overrideAttrs = _buildSvgAttributes(decalRef.style);
        }
        // Bilinear warp: remap all path coordinates from 0–1 unit
        // space onto the projected face quad — perspective-correct.
        // Uses pre-parsed ops (no regex/parsing per frame).
        const warped = warpPreparedContent(decalDef._prepared, d);
        // Inject per-use style overrides + faceAttributes onto each path
        const inject = overrideAttrs + extraAttrs;
        if (inject) {
          parts.push(warped.replace(/<path\b/gi, `<path${inject}`));
        } else {
          parts.push(warped);
        }
      }
    }
  }
}

/**
 * Compute 2D bounding box from projected faces.
 * @param {import('./heerich.js').Face[]} faces
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
 * @param {string} key - camelCase style key
 * @returns {string} kebab-case SVG attribute name
 */
function _kebab(key) {
  return (
    _kebabCache[key] ||
    (_kebabCache[key] = key.replace(/([A-Z])/g, "-$1").toLowerCase())
  );
}

/**
 * Write a value to a reused element, skipping it if the element already has it.
 * @param {{node: Element, values: Object, gens: Object}} slot
 * @param {string} name
 * @param {string|number} value
 * @param {number} gen - Current update, used to find attributes that went away
 */
function _setAttr(slot, name, value, gen) {
  slot.gens[name] = gen;
  if (slot.values[name] === value) return;
  slot.values[name] = value;
  slot.node.setAttribute(name, value);
}

/**
 * Update a reused `<polygon>` to show a face, with the attributes `render()`
 * would give it.
 * @param {{node: Element, values: Object, gens: Object}} slot
 * @param {import('./heerich.js').Face} face
 * @param {((face: import('./heerich.js').Face) => Object|null)|null} faceAttrFn
 * @param {number} gen
 */
function _writePolygon(slot, face, faceAttrFn, gen) {
  const d = face.points.data;
  const v = face.voxel;
  const style = face.style;
  const custom = faceAttrFn ? faceAttrFn(face) : null;

  _setAttr(
    slot,
    "points",
    `${d[0]},${d[1]} ${d[2]},${d[3]} ${d[4]},${d[5]} ${d[6]},${d[7]}`,
    gen,
  );
  _setAttr(slot, "stroke-linejoin", "round", gen);

  for (const key in style) {
    const value = style[key];
    if (value === undefined || value === null) continue;
    // Skip what faceAttributes overrides below
    if (custom && STYLE_ATTRS.has(key) && custom[key] != null) continue;
    _setAttr(slot, _kebab(key), value, gen);
  }

  if (custom) {
    for (const key in custom) {
      const value = custom[key];
      if (value === undefined || value === null || key === "decal") continue;
      _setAttr(slot, STYLE_ATTRS.has(key) ? _kebab(key) : key, value, gen);
    }
  }

  _setAttr(slot, "data-voxel", `${v.x},${v.y},${v.z}`, gen);
  _setAttr(slot, "data-x", v.x, gen);
  _setAttr(slot, "data-y", v.y, gen);
  _setAttr(slot, "data-z", v.z, gen);
  _setAttr(slot, "data-face", face.type, gen);
  if (v.meta) {
    for (const key in v.meta) _setAttr(slot, `data-${key}`, v.meta[key], gen);
  }

  // Remove what the previous face on this element had and this one doesn't
  for (const name in slot.values) {
    if (slot.gens[name] !== gen) {
      slot.node.removeAttribute(name);
      delete slot.values[name];
      delete slot.gens[name];
    }
  }
}

/**
 * Convert a style object to an SVG attribute string.
 * @param {import('./heerich.js').StyleObject} styleObj
 * @returns {string}
 */
function _buildSvgAttributes(styleObj) {
  const cached = _styleCache.get(styleObj);
  if (cached) return cached;

  const merged = { strokeLinejoin: "round", ...styleObj };
  let attrStr = "";
  for (const key in merged) {
    if (key === "decal" || key === "hatch") continue;
    const value = merged[key];
    if (value !== undefined && value !== null) {
      attrStr += ` ${_kebab(key)}="${value}"`;
    }
  }

  _styleCache.set(styleObj, attrStr);
  return attrStr;
}
