/**
 * CSS 3D renderer for Heerich voxel scenes.
 * Renders each exposed voxel face as a positioned <div> using CSS 3D transforms.
 * The browser handles depth sorting via the Z-buffer — no painter's algorithm needed.
 */
export class CSS3DRenderer {
  /**
   * @param {HTMLElement} container - Element to render into
   */
  constructor(container) {
    this.container = container;

    this.scene = document.createElement("div");
    this.scene.style.cssText =
      "position:relative;width:100%;height:100%;overflow:hidden;";

    this.world = document.createElement("div");
    this.world.style.cssText =
      "position:absolute;top:50%;left:50%;transform-style:preserve-3d;";

    this.scene.appendChild(this.world);
    container.appendChild(this.scene);
  }

  /**
   * Render a Heerich scene using CSS 3D transforms.
   * @param {import('../../src/heerich.js').Heerich} heerich - Heerich instance
   * @param {Object} [options]
   * @param {number} [options.tileSize=40] - Size of each voxel in pixels
   * @param {number} [options.perspective=800] - CSS perspective distance in pixels
   * @param {number} [options.rotateX=-25] - Scene X rotation in degrees
   * @param {number} [options.rotateY=45] - Scene Y rotation in degrees
   */
  render(heerich, options = {}) {
    const s = options.tileSize || 40;
    const perspective = options.perspective || 800;
    const rx = options.rotateX !== undefined ? options.rotateX : -25;
    const ry = options.rotateY !== undefined ? options.rotateY : 45;

    this.scene.style.perspective = perspective + "px";
    this.world.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;

    // Clear previous render
    this.world.innerHTML = "";

    // Compute scene center for centering the world
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

    const frag = document.createDocumentFragment();

    for (const voxel of heerich) {
      const { x, y, z, styles } = voxel;
      if (voxel.content) continue;

      const hasNeighbor = (nx, ny, nz) => {
        const n = heerich.getVoxel([nx, ny, nz]);
        return n && n.opaque !== false;
      };

      const sc = voxel.scale;
      const so = voxel.scaleOrigin || [0.5, 0, 0.5];

      // Check each face
      if (sc || !hasNeighbor(x, y - 1, z))
        this._addFace(
          frag,
          "top",
          x,
          y,
          z,
          s,
          cx,
          cy,
          cz,
          styles,
          heerich.defaultStyle,
          sc,
          so,
        );
      if (sc || !hasNeighbor(x, y + 1, z))
        this._addFace(
          frag,
          "bottom",
          x,
          y,
          z,
          s,
          cx,
          cy,
          cz,
          styles,
          heerich.defaultStyle,
          sc,
          so,
        );
      if (sc || !hasNeighbor(x - 1, y, z))
        this._addFace(
          frag,
          "left",
          x,
          y,
          z,
          s,
          cx,
          cy,
          cz,
          styles,
          heerich.defaultStyle,
          sc,
          so,
        );
      if (sc || !hasNeighbor(x + 1, y, z))
        this._addFace(
          frag,
          "right",
          x,
          y,
          z,
          s,
          cx,
          cy,
          cz,
          styles,
          heerich.defaultStyle,
          sc,
          so,
        );
      if (sc || !hasNeighbor(x, y, z - 1))
        this._addFace(
          frag,
          "front",
          x,
          y,
          z,
          s,
          cx,
          cy,
          cz,
          styles,
          heerich.defaultStyle,
          sc,
          so,
        );
      if (sc || !hasNeighbor(x, y, z + 1))
        this._addFace(
          frag,
          "back",
          x,
          y,
          z,
          s,
          cx,
          cy,
          cz,
          styles,
          heerich.defaultStyle,
          sc,
          so,
        );
    }

    this.world.appendChild(frag);
  }

  /** @private */
  _addFace(
    frag,
    type,
    x,
    y,
    z,
    s,
    cx,
    cy,
    cz,
    styles,
    defaultStyle,
    scale,
    scaleOrigin,
  ) {
    const div = document.createElement("div");

    // Resolve style
    const base = styles.default
      ? { ...defaultStyle, ...styles.default }
      : defaultStyle;
    const style = styles[type] ? { ...base, ...styles[type] } : base;

    // Face dimensions (may be scaled)
    let fw = s,
      fh = s;

    // Cube center in CSS coordinates (Z negated: heerich +Z = CSS -Z)
    const cubeX = (x + 0.5) * s - cx;
    const cubeY = (y + 0.5) * s - cy;
    const cubeZ = -((z + 0.5) * s - cz);
    const half = s / 2;

    // Strategy: translate div center to cube center, rotate to orient face,
    // then push outward along local Z. transform-origin is center (default).
    const pos = `translate3d(${cubeX - half}px,${cubeY - half}px,${cubeZ}px)`;
    let faceTransform;
    switch (type) {
      case "front":
        faceTransform = `translateZ(${half}px)`;
        break;
      case "back":
        faceTransform = `rotateY(180deg) translateZ(${half}px)`;
        break;
      case "right":
        faceTransform = `rotateY(90deg) translateZ(${half}px)`;
        break;
      case "left":
        faceTransform = `rotateY(-90deg) translateZ(${half}px)`;
        break;
      case "top":
        faceTransform = `rotateX(90deg) translateZ(${half}px)`;
        break;
      case "bottom":
        faceTransform = `rotateX(-90deg) translateZ(${half}px)`;
        break;
    }
    const transform = `${pos} ${faceTransform}`;

    if (scale) {
      const sx = scale[0],
        sy = scale[1],
        sz = scale[2];
      // Adjust face size based on which axes the face spans
      if (type === "top" || type === "bottom") {
        fw *= sx;
        fh *= sz;
      } else if (type === "left" || type === "right") {
        fw *= sz;
        fh *= sy;
      } else {
        fw *= sx;
        fh *= sy;
      }
    }

    div.style.cssText = `
      position:absolute;
      width:${fw}px;height:${fh}px;
      transform-origin:center;
      transform:${transform};
      backface-visibility:hidden;
      background:${style.fill || "#aaa"};
      box-sizing:border-box;
    `;

    if (style.stroke && style.stroke !== "none") {
      const sw = style.strokeWidth || 1;
      div.style.outline = `${sw}px solid ${style.stroke}`;
      div.style.outlineOffset = `-${sw}px`;
    }

    if (style.opacity !== undefined) {
      div.style.opacity = style.opacity;
    }

    div.dataset.voxel = `${x},${y},${z}`;
    div.dataset.face = type;

    frag.appendChild(div);
  }

  /**
   * Hit-test: find the face div under the given point.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {HTMLElement|null}
   */
  hitTest(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    return el && el.dataset.face ? el : null;
  }

  /** Remove all rendered content. */
  clear() {
    this.world.innerHTML = "";
  }

  /** Remove the renderer from the DOM. */
  destroy() {
    this.container.removeChild(this.scene);
  }
}
