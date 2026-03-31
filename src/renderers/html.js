/**
 * HTML/CSS 3D string renderer for Heerich voxel scenes.
 * Returns an HTML string of positioned divs using CSS 3D transforms.
 */

const FACE_TRANSFORMS = {
  front: (half) => `translateZ(${half}px)`,
  back: (half) => `rotateY(180deg) translateZ(${half}px)`,
  right: (half) => `rotateY(90deg) translateZ(${half}px)`,
  left: (half) => `rotateY(-90deg) translateZ(${half}px)`,
  top: (half) => `rotateX(90deg) translateZ(${half}px)`,
  bottom: (half) => `rotateX(-90deg) translateZ(${half}px)`,
};

/**
 * @param {import('../heerich.js').Heerich} heerich
 * @param {Object} [options]
 * @param {number} [options.tileSize=40] - Voxel size in pixels
 * @param {number} [options.perspective=800] - CSS perspective in pixels
 * @param {number} [options.rotateX=-25] - Scene X rotation in degrees
 * @param {number} [options.rotateY=45] - Scene Y rotation in degrees
 * @returns {string} HTML string
 */
export function renderHTML(heerich, options = {}) {
  const s = options.tileSize || 40;
  const perspective = options.perspective || 800;
  const rx = options.rotateX !== undefined ? options.rotateX : -25;
  const ry = options.rotateY !== undefined ? options.rotateY : 45;
  const half = s / 2;

  // Compute scene center
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const v of heerich) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
  }
  const cx = ((minX + maxX + 1) / 2) * s;
  const cy = ((minY + maxY + 1) / 2) * s;
  const cz = ((minZ + maxZ + 1) / 2) * s;

  const parts = [
    `<div style="position:relative;width:100%;height:100%;overflow:hidden;perspective:${perspective}px">`,
    `<div style="position:absolute;top:50%;left:50%;transform-style:preserve-3d;transform:rotateX(${rx}deg) rotateY(${ry}deg)">`,
  ];

  const defaultStyle = heerich.defaultStyle;

  for (const voxel of heerich) {
    const { x, y, z, styles } = voxel;
    if (voxel.content) continue;

    const hasNeighbor = (nx, ny, nz) => {
      const n = heerich.getVoxel([nx, ny, nz]);
      return n && n.opaque !== false;
    };

    const sc = voxel.scale;
    const faces = [];
    if (sc || !hasNeighbor(x, y - 1, z)) faces.push("top");
    if (sc || !hasNeighbor(x, y + 1, z)) faces.push("bottom");
    if (sc || !hasNeighbor(x - 1, y, z)) faces.push("left");
    if (sc || !hasNeighbor(x + 1, y, z)) faces.push("right");
    if (sc || !hasNeighbor(x, y, z - 1)) faces.push("front");
    if (sc || !hasNeighbor(x, y, z + 1)) faces.push("back");

    if (faces.length === 0) continue;

    const base = styles.default
      ? { ...defaultStyle, ...styles.default }
      : defaultStyle;

    const cubeX = (x + 0.5) * s - cx;
    const cubeY = (y + 0.5) * s - cy;
    const cubeZ = -((z + 0.5) * s - cz);
    const pos = `translate3d(${cubeX - half}px,${cubeY - half}px,${cubeZ}px)`;

    for (const type of faces) {
      const style = styles[type] ? { ...base, ...styles[type] } : base;
      let fw = s,
        fh = s;

      if (sc) {
        if (type === "top" || type === "bottom") {
          fw *= sc[0];
          fh *= sc[2];
        } else if (type === "left" || type === "right") {
          fw *= sc[2];
          fh *= sc[1];
        } else {
          fw *= sc[0];
          fh *= sc[1];
        }
      }

      const transform = `${pos} ${FACE_TRANSFORMS[type](half)}`;
      let css = `position:absolute;width:${fw}px;height:${fh}px;transform-origin:center;transform:${transform};backface-visibility:hidden;background:${style.fill || "#aaa"};box-sizing:border-box`;

      if (style.stroke && style.stroke !== "none") {
        const sw = style.strokeWidth || 1;
        css += `;outline:${sw}px solid ${style.stroke};outline-offset:-${sw}px`;
      }
      if (style.opacity !== undefined) {
        css += `;opacity:${style.opacity}`;
      }

      parts.push(
        `<div style="${css}" data-voxel="${x},${y},${z}" data-face="${type}"></div>`,
      );
    }
  }

  parts.push("</div></div>");
  return parts.join("");
}
