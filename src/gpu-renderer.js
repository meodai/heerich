/**
 * Face normals inferred from face type, used when face.n is absent (oblique projection).
 * Heerich coordinate system: X right, Y down, Z into screen.
 * @type {Record<string, [number,number,number]>}
 */
const FACE_NORMALS = {
  top:    [ 0, -1,  0],
  bottom: [ 0,  1,  0],
  left:   [-1,  0,  0],
  right:  [ 1,  0,  0],
  front:  [ 0,  0, -1],
  back:   [ 0,  0,  1],
};

/**
 * UV coordinates for a quad's 4 vertices, in vertex order.
 * U goes 0→1 left-to-right, V goes 0→1 top-to-bottom along the face.
 */
const QUAD_UVS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

/**
 * Parse a CSS color string into [r, g, b] floats in 0–1 range.
 * Handles #rrggbb, #rgb, rgb(r,g,b), and rgba(r,g,b,a).
 * Returns null for unrecognised formats.
 * @param {string} color
 * @returns {[number,number,number]|null}
 */
function parseCSSColor(color) {
  if (!color || typeof color !== "string") return null;
  color = color.trim();

  if (color[0] === "#") {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16) / 255,
        parseInt(hex[1] + hex[1], 16) / 255,
        parseInt(hex[2] + hex[2], 16) / 255,
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
      ];
    }
    return null;
  }

  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
  }

  return null;
}

/**
 * @typedef {Object} GPUGeometry
 * @property {Float32Array} position - XYZ vertex positions (3 floats per vertex)
 * @property {Float32Array} normal   - XYZ face normals (3 floats per vertex, flat-shaded)
 * @property {Float32Array} uv       - UV texture coordinates (2 floats per vertex)
 * @property {Uint32Array}  index    - Triangle indices (3 indices per triangle)
 * @property {Float32Array} [color]  - RGB vertex colours (3 floats per vertex), present when options.color is true
 * @property {number} faceCount      - Number of quad faces encoded
 * @property {number} vertexCount    - Total number of vertices (faceCount × 4)
 */

/**
 * GPU renderer for Heerich voxel scenes.
 *
 * Converts the output of `getFaces({ raw: true })` into typed arrays ready
 * to upload to a WebGL or WebGPU buffer (e.g. Three.js BufferGeometry).
 *
 * Each visible quad face is triangulated into two CCW triangles.
 *
 * ## Coordinate systems
 *
 * Heerich uses X-right / Y-down / Z-into-screen.
 * Three.js (and most real-time engines) use X-right / Y-up / Z-toward-viewer.
 *
 * Pass `options.yUp = true` to convert automatically. This negates Y and Z,
 * which is equivalent to `mesh.rotation.x = Math.PI` and has determinant +1
 * (proper rotation), so winding is preserved without any extra flip.
 *
 * Without `yUp`, raw Heerich coordinates are output. In that case you must
 * apply `mesh.rotation.x = Math.PI` (or equivalent) in Three.js yourself —
 * do **not** use `scale.y = -1`, which changes handedness and breaks winding.
 *
 * @example <caption>Three.js — recommended usage</caption>
 * import { Heerich, GPURenderer } from 'heerich';
 * import * as THREE from 'three';
 *
 * const engine = new Heerich();
 * engine.addGeometry({ type: 'box', position: [0,0,0], size: [4,4,4] });
 *
 * const { position, normal, uv, index } = new GPURenderer().render(
 *   engine.getFaces({ raw: true }),  // all 6 neighbour-exposed faces, no camera pre-culling
 *   { yUp: true },                   // convert to Three.js coordinate space
 * );
 *
 * const geo = new THREE.BufferGeometry();
 * geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
 * geo.setAttribute('normal',   new THREE.BufferAttribute(normal,   3));
 * geo.setAttribute('uv',       new THREE.BufferAttribute(uv,       2));
 * geo.setIndex(new THREE.BufferAttribute(index, 1));
 * scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
 */
export class GPURenderer {
  /**
   * Convert raw faces to typed arrays.
   *
   * @param {import('./heerich.js').Face[]} faces
   *   Output of `Heerich.getFaces({ raw: true })` (recommended — all 6
   *   neighbour-exposed faces, no camera culling). Plain `getFaces()` /
   *   `renderTest()` also work but will be missing camera-culled faces.
   * @param {Object} [options]
   * @param {boolean} [options.yUp=false]
   *   Convert from Heerich's Y-down/Z-into-screen space to Three.js
   *   Y-up/Z-toward-viewer space by negating Y and Z. Use this when feeding
   *   geometry directly to Three.js without any mesh transform.
   * @param {number} [options.scale=1]
   *   Uniform scale applied to vertex positions. Useful for converting
   *   voxel grid units to world-space metres, etc.
   * @param {boolean} [options.color=false]
   *   When true, parse `face.style.fill` and include a `color` Float32Array
   *   with RGB values (0–1) for each vertex. Unparseable colours fall back
   *   to `options.defaultColor`.
   * @param {[number,number,number]} [options.defaultColor=[1,1,1]]
   *   Fallback colour used when `options.color` is true and a face has no
   *   parseable fill value.
   * @returns {GPUGeometry}
   */
  render(faces, options = {}) {
    const scale = options.scale ?? 1;
    const yUp = options.yUp === true;
    const wantColor = options.color === true;
    const defaultColor = options.defaultColor ?? [1, 1, 1];

    // Negating both Y and Z converts Heerich→Three.js space.
    // det(diag(1,-1,-1)) = +1 (proper rotation = rotation.x of PI),
    // so winding is preserved and the crossDotN check below is unchanged.
    const ySign = yUp ? -1 : 1;
    const zSign = yUp ? -1 : 1;

    // Count renderable quad faces (skip 'content' faces — they have no vertices)
    let faceCount = 0;
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      if (f.type !== "content" && f.vertices) faceCount++;
    }

    const vertexCount = faceCount * 4; // 4 verts per quad
    const indexCount  = faceCount * 6; // 6 indices per quad (2 triangles)

    const position = new Float32Array(vertexCount * 3);
    const normal   = new Float32Array(vertexCount * 3);
    const uv       = new Float32Array(vertexCount * 2);
    const index    = new Uint32Array(indexCount);
    const color    = wantColor ? new Float32Array(vertexCount * 3) : null;

    let vi = 0; // next vertex slot
    let ii = 0; // next index slot

    for (let fi = 0; fi < faces.length; fi++) {
      const face = faces[fi];
      if (face.type === "content" || !face.vertices) continue;

      const verts = face.vertices;
      const n = face.n ?? FACE_NORMALS[face.type] ?? [0, 0, 0];

      // Resolve face colour once, shared across all 4 vertices
      let cr = defaultColor[0], cg = defaultColor[1], cb = defaultColor[2];
      if (wantColor && face.style) {
        const parsed = parseCSSColor(face.style.fill);
        if (parsed) { cr = parsed[0]; cg = parsed[1]; cb = parsed[2]; }
      }

      const baseVertex = vi;

      for (let i = 0; i < 4; i++) {
        const v = verts[i];
        const p = vi * 3;

        position[p]     = v[0] * scale;
        position[p + 1] = v[1] * scale * ySign;
        position[p + 2] = v[2] * scale * zSign;

        normal[p]     = n[0];
        normal[p + 1] = n[1] * ySign;
        normal[p + 2] = n[2] * zSign;

        const u = vi * 2;
        uv[u]     = QUAD_UVS[i * 2];
        uv[u + 1] = QUAD_UVS[i * 2 + 1];

        if (color) {
          color[p]     = cr;
          color[p + 1] = cg;
          color[p + 2] = cb;
        }

        vi++;
      }

      // Check winding: cross(e01, e02) must agree with the face normal.
      // Left and right faces are CW in Heerich's vertex ordering — flip those.
      // This check uses the original (un-transformed) vertices; the result is
      // identical after the yUp transform because det(diag(1,-1,-1)) = +1.
      const v0 = verts[0], v1 = verts[1], v2 = verts[2];
      const e1x = v1[0] - v0[0], e1y = v1[1] - v0[1], e1z = v1[2] - v0[2];
      const e2x = v2[0] - v0[0], e2y = v2[1] - v0[1], e2z = v2[2] - v0[2];
      const crossDotN =
        (e1y * e2z - e1z * e2y) * n[0] +
        (e1z * e2x - e1x * e2z) * n[1] +
        (e1x * e2y - e1y * e2x) * n[2];

      if (crossDotN >= 0) {
        // CCW — standard winding
        index[ii++] = baseVertex;
        index[ii++] = baseVertex + 1;
        index[ii++] = baseVertex + 2;
        index[ii++] = baseVertex;
        index[ii++] = baseVertex + 2;
        index[ii++] = baseVertex + 3;
      } else {
        // CW — flip to make CCW
        index[ii++] = baseVertex;
        index[ii++] = baseVertex + 2;
        index[ii++] = baseVertex + 1;
        index[ii++] = baseVertex;
        index[ii++] = baseVertex + 3;
        index[ii++] = baseVertex + 2;
      }
    }

    /** @type {GPUGeometry} */
    const result = { position, normal, uv, index, faceCount, vertexCount };
    if (color) result.color = color;
    return result;
  }
}
