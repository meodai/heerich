import { computeBounds } from "./svg.js";
import { parseColor } from "./color.js";

const SHADER = /* wgsl */ `
struct Uniforms { scale: vec2f, offset: vec2f }
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VOut { @builtin(position) pos: vec4f, @location(0) color: vec4f }

@vertex fn vs_fill(
  @location(0) pos: vec2f,
  @location(1) color: vec4f,
  @location(2) z: f32,
) -> VOut {
  var o: VOut;
  o.pos = vec4f(pos * u.scale + u.offset, z, 1.0);
  o.color = color;
  return o;
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  return vec4f(in.color.rgb * in.color.a, in.color.a);
}
`;

// Fill: 7 floats per vertex (x, y, r, g, b, a, z)
const FILL_FPV = 7;
const FILL_BPV = FILL_FPV * 4; // 28

const INITIAL_FACE_CAPACITY = 1024;
const MSAA_SAMPLES = 4;

export class WebGPURenderer {
  /** @private -- use WebGPURenderer.create() */
  constructor(canvas, device, context, fillPipeline, uniformBuffer, bindGroup) {
    this.canvas = canvas;
    this._device = device;
    this._context = context;
    this._fillPipeline = fillPipeline;
    this._uniformBuffer = uniformBuffer;
    this._bindGroup = bindGroup;
    this._lastFaces = null;
    this._transform = null;

    // Frame cache
    this._cachedFacesRef = null;
    this._cachedFaceAttrFn = null;
    this._cachedFillVerts = 0;
    this._cachedBounds = null;

    // Fill vertex buffer (holds both fill triangles and stroke triangles)
    // Each face can need up to 6 (fill) + 24 (stroke, 4 edges * 6 verts) = 30 verts
    this._fillCap = INITIAL_FACE_CAPACITY * 30;
    this._fillBuf = device.createBuffer({
      size: this._fillCap * FILL_BPV,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this._fillCpu = new Float32Array(this._fillCap * FILL_FPV);

    // Reusable uniform upload buffer (scale.xy + offset.xy = 4 floats)
    this._uniformCpu = new Float32Array(4);

    // MSAA texture (created/resized lazily in render)
    this._msaaTexture = null;
    this._texW = 0;
  }

  /**
   * Create a WebGPU renderer bound to the given canvas.
   * @param {HTMLCanvasElement} canvas
   * @returns {Promise<WebGPURenderer>}
   */
  static async create(canvas) {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("WebGPU: no adapter found");
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "premultiplied" });

    const module = device.createShaderModule({ code: SHADER });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    /** @type {GPUBlendState} */
    const blend = {
      color: {
        srcFactor: "one",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
      },
      alpha: {
        srcFactor: "one",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
      },
    };

    const multisample = { count: MSAA_SAMPLES };

    const fillPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: "vs_fill",
        buffers: [
          {
            arrayStride: FILL_BPV,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" }, // pos
              { shaderLocation: 1, offset: 8, format: "float32x4" }, // color
              { shaderLocation: 2, offset: 24, format: "float32" }, // z
            ],
          },
        ],
      },
      fragment: { module, entryPoint: "fs", targets: [{ format, blend }] },
      primitive: { topology: "triangle-list" },
      multisample,
    });

    const uniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    return new WebGPURenderer(
      canvas,
      device,
      context,
      fillPipeline,
      uniformBuffer,
      bindGroup,
    );
  }

  /**
   * Render projected faces to the canvas.
   * @param {import('../heerich.js').Face[]} faces - Projected, depth-sorted face array
   * @param {Object} [options]
   * @param {number} [options.padding=20] - ViewBox padding in pixels
   * @param {[number,number]} [options.offset=[0,0]] - Translate all geometry
   * @param {function(import('../heerich.js').Face): Object|null} [options.faceAttributes] - Per-face style override callback (only style keys are applied; arbitrary attributes like class/data-* are ignored unlike SVGRenderer)
   * @param {boolean} [options.fitCanvas=true] - Scale geometry to fit canvas
   * @param {boolean} [options.clear=true] - Clear the canvas before drawing
   */
  render(faces, options = {}) {
    const device = this._device;
    const canvas = this.canvas;
    const pad = options.padding || 20;
    const offset = options.offset || [0, 0];
    const faceAttrFn = options.faceAttributes || null;
    const fitCanvas = options.fitCanvas !== false;

    // Compute bounds (cached alongside geometry)
    const cacheHit =
      faces === this._cachedFacesRef && faceAttrFn === this._cachedFaceAttrFn;
    const bounds =
      cacheHit && this._cachedBounds
        ? this._cachedBounds
        : computeBounds(faces);
    const vpX = bounds.x - pad;
    const vpY = bounds.y - pad;
    const vpW = bounds.w + pad * 2;
    const vpH = bounds.h + pad * 2;

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

    // Upload uniforms (single write, reusable buffer)
    const u = this._uniformCpu;
    u[0] = (scaleX * 2) / canvas.width;
    u[1] = (-scaleY * 2) / canvas.height;
    u[2] = ((tx + offset[0] * scaleX) * 2) / canvas.width - 1;
    u[3] = 1 - ((ty + offset[1] * scaleY) * 2) / canvas.height;
    device.queue.writeBuffer(this._uniformBuffer, 0, u);

    // Geometry cache
    let fillVerts;

    if (cacheHit) {
      fillVerts = this._cachedFillVerts;
    } else {
      const result = this._buildGeometry(faces, faceAttrFn);
      fillVerts = result.fillVerts;
      this._cachedFacesRef = faces;
      this._cachedFaceAttrFn = faceAttrFn;
      this._cachedFillVerts = fillVerts;
      this._cachedBounds = bounds;

      if (fillVerts > 0) {
        device.queue.writeBuffer(
          this._fillBuf,
          0,
          this._fillCpu.buffer,
          this._fillCpu.byteOffset,
          fillVerts * FILL_BPV,
        );
      }
    }

    if (fillVerts === 0) return;

    // Ensure MSAA texture matches canvas size
    if (!this._msaaTexture || this._texW !== canvas.width) {
      if (this._msaaTexture) this._msaaTexture.destroy();
      const format = this._context.getCurrentTexture().format;
      this._msaaTexture = device.createTexture({
        size: [canvas.width, canvas.height],
        format,
        sampleCount: MSAA_SAMPLES,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this._texW = canvas.width;
    }

    // Render pass — no depth buffer, pure back-to-front painter's algorithm
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this._msaaTexture.createView(),
          resolveTarget: this._context.getCurrentTexture().createView(),
          clearValue:
            options.clear !== false ? { r: 0, g: 0, b: 0, a: 0 } : undefined,
          loadOp: options.clear !== false ? "clear" : "load",
          storeOp: "discard",
        },
      ],
    });

    pass.setPipeline(this._fillPipeline);
    pass.setBindGroup(0, this._bindGroup);
    pass.setVertexBuffer(0, this._fillBuf);
    pass.draw(fillVerts);

    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  /** @private */
  _buildGeometry(faces, faceAttrFn) {
    const device = this._device;
    let fv = 0; // fill vertex count
    let fbuf = this._fillCpu;

    const totalFaces = faces.length;
    const zScale = 1 / (totalFaces + 1);
    let faceIdx = 0;

    // Cache parsed colors per style reference -- avoids repeated parseColor
    // lookups for the thousands of faces sharing the same few style objects.
    let prevStyle = null;
    let hasFill = false,
      fc0 = 0,
      fc1 = 0,
      fc2 = 0,
      fAlpha = 0;
    let hasStroke = false,
      sc0 = 0,
      sc1 = 0,
      sc2 = 0,
      sAlpha = 0,
      sHw = 0,
      sDashLen = 0,
      sGapLen = 0;

    for (let fi = 0; fi < totalFaces; fi++) {
      const face = faces[fi];
      if (face.type === "content") {
        faceIdx++;
        continue;
      }

      let style = face.style;
      if (faceAttrFn) {
        const custom = faceAttrFn(face);
        if (custom) {
          let hasOverrides = false;
          const overrides = {};
          for (const key in custom) {
            const value = custom[key];
            if (value === undefined || value === null) continue;
            if (
              key === "fill" ||
              key === "stroke" ||
              key === "strokeWidth" ||
              key === "opacity" ||
              key === "fillOpacity" ||
              key === "strokeOpacity"
            ) {
              overrides[key] = value;
              hasOverrides = true;
            }
          }
          if (hasOverrides) {
            style = { ...style, ...overrides };
          }
        }
      }

      const d = face.points.data;
      const nPts = d.length >> 1;
      if (nPts < 3) {
        faceIdx++;
        continue;
      }

      // Recompute fill/stroke colors only when style reference changes
      if (style !== prevStyle) {
        prevStyle = style;
        const fillStr = style.fill || "#000";
        if (fillStr !== "none") {
          hasFill = true;
          const c = parseColor(fillStr);
          const opacity =
            (style.opacity !== undefined ? style.opacity : 1) *
            (style.fillOpacity !== undefined ? style.fillOpacity : 1);
          fc0 = c[0];
          fc1 = c[1];
          fc2 = c[2];
          fAlpha = c[3] * opacity;
        } else {
          hasFill = false;
        }
        const strokeStr = style.stroke;
        const sw = style.strokeWidth !== undefined ? style.strokeWidth : 0;
        if (strokeStr && strokeStr !== "none" && sw > 0) {
          hasStroke = true;
          const sc = parseColor(strokeStr);
          const opacity =
            (style.opacity !== undefined ? style.opacity : 1) *
            (style.strokeOpacity !== undefined ? style.strokeOpacity : 1);
          sc0 = sc[0];
          sc1 = sc[1];
          sc2 = sc[2];
          sAlpha = sc[3] * opacity;
          sHw = sw / 2;
          if (style.strokeDasharray) {
            const dashes = style.strokeDasharray.split(/[\s,]+/).map(Number);
            sDashLen = dashes[0] || 0;
            sGapLen = dashes[1] || 0;
          } else {
            sDashLen = 0;
            sGapLen = 0;
          }
        } else {
          hasStroke = false;
        }
      }

      const z = 1 - faceIdx * zScale;
      // Strokes get a slight z-bias toward the camera so they render
      // on top of their fill AND on top of occluding transparent fills behind them
      const zStroke = z - zScale * 0.5;

      // ── Fills ──
      if (hasFill) {
        const triCount = nPts - 2;
        const needed = fv + triCount * 3;

        if (needed > this._fillCap) {
          while (this._fillCap < needed) this._fillCap *= 2;
          this._fillBuf.destroy();
          this._fillBuf = device.createBuffer({
            size: this._fillCap * FILL_BPV,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          });
          const newBuf = new Float32Array(this._fillCap * FILL_FPV);
          newBuf.set(fbuf.subarray(0, fv * FILL_FPV));
          this._fillCpu = newBuf;
          fbuf = newBuf;
        }

        // Unrolled quad fast path (covers all voxel faces)
        if (nPts === 4) {
          let b = fv * FILL_FPV;
          // Triangle 0-1-2
          fbuf[b] = d[0];
          fbuf[b + 1] = d[1];
          fbuf[b + 2] = fc0;
          fbuf[b + 3] = fc1;
          fbuf[b + 4] = fc2;
          fbuf[b + 5] = fAlpha;
          fbuf[b + 6] = z;
          b += FILL_FPV;
          fbuf[b] = d[2];
          fbuf[b + 1] = d[3];
          fbuf[b + 2] = fc0;
          fbuf[b + 3] = fc1;
          fbuf[b + 4] = fc2;
          fbuf[b + 5] = fAlpha;
          fbuf[b + 6] = z;
          b += FILL_FPV;
          fbuf[b] = d[4];
          fbuf[b + 1] = d[5];
          fbuf[b + 2] = fc0;
          fbuf[b + 3] = fc1;
          fbuf[b + 4] = fc2;
          fbuf[b + 5] = fAlpha;
          fbuf[b + 6] = z;
          b += FILL_FPV;
          // Triangle 0-2-3
          fbuf[b] = d[0];
          fbuf[b + 1] = d[1];
          fbuf[b + 2] = fc0;
          fbuf[b + 3] = fc1;
          fbuf[b + 4] = fc2;
          fbuf[b + 5] = fAlpha;
          fbuf[b + 6] = z;
          b += FILL_FPV;
          fbuf[b] = d[4];
          fbuf[b + 1] = d[5];
          fbuf[b + 2] = fc0;
          fbuf[b + 3] = fc1;
          fbuf[b + 4] = fc2;
          fbuf[b + 5] = fAlpha;
          fbuf[b + 6] = z;
          b += FILL_FPV;
          fbuf[b] = d[6];
          fbuf[b + 1] = d[7];
          fbuf[b + 2] = fc0;
          fbuf[b + 3] = fc1;
          fbuf[b + 4] = fc2;
          fbuf[b + 5] = fAlpha;
          fbuf[b + 6] = z;
          fv += 6;
        } else {
          const p0x = d[0],
            p0y = d[1];
          for (let i = 0; i < triCount; i++) {
            const k = (i + 1) * 2;
            let b = fv * FILL_FPV;
            fbuf[b] = p0x;
            fbuf[b + 1] = p0y;
            fbuf[b + 2] = fc0;
            fbuf[b + 3] = fc1;
            fbuf[b + 4] = fc2;
            fbuf[b + 5] = fAlpha;
            fbuf[b + 6] = z;
            b += FILL_FPV;
            fbuf[b] = d[k];
            fbuf[b + 1] = d[k + 1];
            fbuf[b + 2] = fc0;
            fbuf[b + 3] = fc1;
            fbuf[b + 4] = fc2;
            fbuf[b + 5] = fAlpha;
            fbuf[b + 6] = z;
            b += FILL_FPV;
            fbuf[b] = d[k + 2];
            fbuf[b + 1] = d[k + 3];
            fbuf[b + 2] = fc0;
            fbuf[b + 3] = fc1;
            fbuf[b + 4] = fc2;
            fbuf[b + 5] = fAlpha;
            fbuf[b + 6] = z;
            fv += 3;
          }
        }
      }

      // ── Strokes (emitted as fill triangles into the same buffer) ──
      if (hasStroke) {
        // Each edge produces 6 vertices (2 triangles forming a quad).
        // For dashed strokes, each dash segment also produces 6 vertices.
        // Worst case for solid: nPts edges * 6 verts = nPts * 6
        // For dashes, we over-estimate; grow buffer as needed.
        const maxStrokeVerts = nPts * 6;
        const needed = fv + maxStrokeVerts;

        if (needed > this._fillCap) {
          while (this._fillCap < needed) this._fillCap *= 2;
          this._fillBuf.destroy();
          this._fillBuf = device.createBuffer({
            size: this._fillCap * FILL_BPV,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          });
          const newBuf = new Float32Array(this._fillCap * FILL_FPV);
          newBuf.set(fbuf.subarray(0, fv * FILL_FPV));
          this._fillCpu = newBuf;
          fbuf = newBuf;
        }

        const hw = sHw;
        const isDashed = sDashLen > 0 && sGapLen > 0;

        // Unrolled quad stroke path (4 edges, no modulo)
        if (nPts === 4 && !isDashed) {
          // Edges: 0->1 (prev=3,next=2), 1->2 (prev=0,next=3),
          //        2->3 (prev=1,next=0), 3->0 (prev=2,next=1)
          const edgeIndices = [
            0, 1, 2, 3, 6, 7, 4, 5, // edge 0->1: p0=0, p1=1, prev=3, next=2
            2, 3, 4, 5, 0, 1, 6, 7, // edge 1->2: p0=1, p1=2, prev=0, next=3
            4, 5, 6, 7, 2, 3, 0, 1, // edge 2->3: p0=2, p1=3, prev=1, next=0
            6, 7, 0, 1, 4, 5, 2, 3, // edge 3->0: p0=3, p1=0, prev=2, next=1
          ];

          for (let ei = 0; ei < 4; ei++) {
            const base = ei * 8;
            const p0x = d[edgeIndices[base]],
              p0y = d[edgeIndices[base + 1]];
            const p1x = d[edgeIndices[base + 2]],
              p1y = d[edgeIndices[base + 3]];
            const prevX = d[edgeIndices[base + 4]],
              prevY = d[edgeIndices[base + 5]];
            const nextX = d[edgeIndices[base + 6]],
              nextY = d[edgeIndices[base + 7]];

            // Edge direction and normal
            const ex = p1x - p0x,
              ey = p1y - p0y;
            const eLen = Math.sqrt(ex * ex + ey * ey) || 1e-6;
            const ddx = ex / eLen,
              ddy = ey / eLen;
            const nx = -ddy * hw,
              ny = ddx * hw;

            // Previous edge normal
            const pex = p0x - prevX,
              pey = p0y - prevY;
            const peLen = Math.sqrt(pex * pex + pey * pey) || 1e-6;
            const dpx = pex / peLen,
              dpy = pey / peLen;
            const npx = -dpy * hw,
              npy = dpx * hw;

            // Next edge normal
            const nex = nextX - p1x,
              ney = nextY - p1y;
            const neLen = Math.sqrt(nex * nex + ney * ney) || 1e-6;
            const dnx = nex / neLen,
              dny = ney / neLen;
            const nnx = -dny * hw,
              nny = dnx * hw;

            // Miter at p0
            const m0sx = npx + nx,
              m0sy = npy + ny;
            const m0sLen = Math.sqrt(m0sx * m0sx + m0sy * m0sy) || 1e-6;
            const m0hx = m0sx / m0sLen,
              m0hy = m0sy / m0sLen;
            const nLen = Math.sqrt(nx * nx + ny * ny);
            const dot0 = Math.abs(m0hx * nx + m0hy * ny) || 1e-6;
            const miter0Len = Math.min(nLen / dot0, hw * 2);
            const miter0x = m0hx * miter0Len,
              miter0y = m0hy * miter0Len;

            // Miter at p1
            const m1sx = nx + nnx,
              m1sy = ny + nny;
            const m1sLen = Math.sqrt(m1sx * m1sx + m1sy * m1sy) || 1e-6;
            const m1hx = m1sx / m1sLen,
              m1hy = m1sy / m1sLen;
            const dot1 = Math.abs(m1hx * nx + m1hy * ny) || 1e-6;
            const miter1Len = Math.min(nLen / dot1, hw * 2);
            const miter1x = m1hx * miter1Len,
              miter1y = m1hy * miter1Len;

            // Quad vertices
            const v0x = p0x + miter0x,
              v0y = p0y + miter0y;
            const v1x = p1x + miter1x,
              v1y = p1y + miter1y;
            const v2x = p1x - miter1x,
              v2y = p1y - miter1y;
            const v3x = p0x - miter0x,
              v3y = p0y - miter0y;

            // Triangle (v0, v1, v2)
            let b = fv * FILL_FPV;
            fbuf[b] = v0x;
            fbuf[b + 1] = v0y;
            fbuf[b + 2] = sc0;
            fbuf[b + 3] = sc1;
            fbuf[b + 4] = sc2;
            fbuf[b + 5] = sAlpha;
            fbuf[b + 6] = zStroke;
            b += FILL_FPV;
            fbuf[b] = v1x;
            fbuf[b + 1] = v1y;
            fbuf[b + 2] = sc0;
            fbuf[b + 3] = sc1;
            fbuf[b + 4] = sc2;
            fbuf[b + 5] = sAlpha;
            fbuf[b + 6] = zStroke;
            b += FILL_FPV;
            fbuf[b] = v2x;
            fbuf[b + 1] = v2y;
            fbuf[b + 2] = sc0;
            fbuf[b + 3] = sc1;
            fbuf[b + 4] = sc2;
            fbuf[b + 5] = sAlpha;
            fbuf[b + 6] = zStroke;
            b += FILL_FPV;
            // Triangle (v0, v2, v3)
            fbuf[b] = v0x;
            fbuf[b + 1] = v0y;
            fbuf[b + 2] = sc0;
            fbuf[b + 3] = sc1;
            fbuf[b + 4] = sc2;
            fbuf[b + 5] = sAlpha;
            fbuf[b + 6] = zStroke;
            b += FILL_FPV;
            fbuf[b] = v2x;
            fbuf[b + 1] = v2y;
            fbuf[b + 2] = sc0;
            fbuf[b + 3] = sc1;
            fbuf[b + 4] = sc2;
            fbuf[b + 5] = sAlpha;
            fbuf[b + 6] = zStroke;
            b += FILL_FPV;
            fbuf[b] = v3x;
            fbuf[b + 1] = v3y;
            fbuf[b + 2] = sc0;
            fbuf[b + 3] = sc1;
            fbuf[b + 4] = sc2;
            fbuf[b + 5] = sAlpha;
            fbuf[b + 6] = zStroke;
            fv += 6;
          }
        } else {
          for (let i = 0; i < nPts; i++) {
            const j = (i + 1) % nPts;
            const prev = (i + nPts - 1) % nPts;
            const next = (j + 1) % nPts;

            const p0x = d[i * 2],
              p0y = d[i * 2 + 1];
            const p1x = d[j * 2],
              p1y = d[j * 2 + 1];
            const prevX = d[prev * 2],
              prevY = d[prev * 2 + 1];
            const nextX = d[next * 2],
              nextY = d[next * 2 + 1];

            // Edge direction and normal
            const ex = p1x - p0x,
              ey = p1y - p0y;
            const eLen = Math.sqrt(ex * ex + ey * ey) || 1e-6;
            const ddx = ex / eLen,
              ddy = ey / eLen;
            const nx = -ddy * hw,
              ny = ddx * hw;

            if (isDashed) {
              // Dashed stroke: emit individual dash segments as simple normal-offset quads
              const period = sDashLen + sGapLen;
              let along = 0;
              while (along < eLen) {
                const dashEnd = Math.min(along + sDashLen, eLen);
                const t0 = along / eLen,
                  t1 = dashEnd / eLen;
                const sx = p0x + ex * t0,
                  sy = p0y + ey * t0;
                const ex2 = p0x + ex * t1,
                  ey2 = p0y + ey * t1;

                // Ensure capacity for 6 more verts
                if (fv + 6 > this._fillCap) {
                  while (this._fillCap < fv + 6) this._fillCap *= 2;
                  this._fillBuf.destroy();
                  this._fillBuf = device.createBuffer({
                    size: this._fillCap * FILL_BPV,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                  });
                  const newBuf = new Float32Array(this._fillCap * FILL_FPV);
                  newBuf.set(fbuf.subarray(0, fv * FILL_FPV));
                  this._fillCpu = newBuf;
                  fbuf = newBuf;
                }

                // Simple normal offset quad (no miter for dash segments)
                const v0x = sx + nx,
                  v0y = sy + ny;
                const v1x = ex2 + nx,
                  v1y = ey2 + ny;
                const v2x = ex2 - nx,
                  v2y = ey2 - ny;
                const v3x = sx - nx,
                  v3y = sy - ny;

                let b = fv * FILL_FPV;
                // Triangle (v0, v1, v2)
                fbuf[b] = v0x;
                fbuf[b + 1] = v0y;
                fbuf[b + 2] = sc0;
                fbuf[b + 3] = sc1;
                fbuf[b + 4] = sc2;
                fbuf[b + 5] = sAlpha;
                fbuf[b + 6] = zStroke;
                b += FILL_FPV;
                fbuf[b] = v1x;
                fbuf[b + 1] = v1y;
                fbuf[b + 2] = sc0;
                fbuf[b + 3] = sc1;
                fbuf[b + 4] = sc2;
                fbuf[b + 5] = sAlpha;
                fbuf[b + 6] = zStroke;
                b += FILL_FPV;
                fbuf[b] = v2x;
                fbuf[b + 1] = v2y;
                fbuf[b + 2] = sc0;
                fbuf[b + 3] = sc1;
                fbuf[b + 4] = sc2;
                fbuf[b + 5] = sAlpha;
                fbuf[b + 6] = zStroke;
                b += FILL_FPV;
                // Triangle (v0, v2, v3)
                fbuf[b] = v0x;
                fbuf[b + 1] = v0y;
                fbuf[b + 2] = sc0;
                fbuf[b + 3] = sc1;
                fbuf[b + 4] = sc2;
                fbuf[b + 5] = sAlpha;
                fbuf[b + 6] = zStroke;
                b += FILL_FPV;
                fbuf[b] = v2x;
                fbuf[b + 1] = v2y;
                fbuf[b + 2] = sc0;
                fbuf[b + 3] = sc1;
                fbuf[b + 4] = sc2;
                fbuf[b + 5] = sAlpha;
                fbuf[b + 6] = zStroke;
                b += FILL_FPV;
                fbuf[b] = v3x;
                fbuf[b + 1] = v3y;
                fbuf[b + 2] = sc0;
                fbuf[b + 3] = sc1;
                fbuf[b + 4] = sc2;
                fbuf[b + 5] = sAlpha;
                fbuf[b + 6] = zStroke;
                fv += 6;

                along += period;
              }
            } else {
              // Solid stroke: full miter quad

              // Previous edge normal
              const pex = p0x - prevX,
                pey = p0y - prevY;
              const peLen = Math.sqrt(pex * pex + pey * pey) || 1e-6;
              const dpx = pex / peLen,
                dpy = pey / peLen;
              const npx = -dpy * hw,
                npy = dpx * hw;

              // Next edge normal
              const nex = nextX - p1x,
                ney = nextY - p1y;
              const neLen = Math.sqrt(nex * nex + ney * ney) || 1e-6;
              const dnx = nex / neLen,
                dny = ney / neLen;
              const nnx = -dny * hw,
                nny = dnx * hw;

              // Miter at p0
              const m0sx = npx + nx,
                m0sy = npy + ny;
              const m0sLen = Math.sqrt(m0sx * m0sx + m0sy * m0sy) || 1e-6;
              const m0hx = m0sx / m0sLen,
                m0hy = m0sy / m0sLen;
              const nLen = Math.sqrt(nx * nx + ny * ny);
              const dot0 = Math.abs(m0hx * nx + m0hy * ny) || 1e-6;
              const miter0Len = Math.min(nLen / dot0, hw * 2);
              const miter0x = m0hx * miter0Len,
                miter0y = m0hy * miter0Len;

              // Miter at p1
              const m1sx = nx + nnx,
                m1sy = ny + nny;
              const m1sLen = Math.sqrt(m1sx * m1sx + m1sy * m1sy) || 1e-6;
              const m1hx = m1sx / m1sLen,
                m1hy = m1sy / m1sLen;
              const dot1 = Math.abs(m1hx * nx + m1hy * ny) || 1e-6;
              const miter1Len = Math.min(nLen / dot1, hw * 2);
              const miter1x = m1hx * miter1Len,
                miter1y = m1hy * miter1Len;

              // Quad vertices
              const v0x = p0x + miter0x,
                v0y = p0y + miter0y;
              const v1x = p1x + miter1x,
                v1y = p1y + miter1y;
              const v2x = p1x - miter1x,
                v2y = p1y - miter1y;
              const v3x = p0x - miter0x,
                v3y = p0y - miter0y;

              let b = fv * FILL_FPV;
              // Triangle (v0, v1, v2)
              fbuf[b] = v0x;
              fbuf[b + 1] = v0y;
              fbuf[b + 2] = sc0;
              fbuf[b + 3] = sc1;
              fbuf[b + 4] = sc2;
              fbuf[b + 5] = sAlpha;
              fbuf[b + 6] = zStroke;
              b += FILL_FPV;
              fbuf[b] = v1x;
              fbuf[b + 1] = v1y;
              fbuf[b + 2] = sc0;
              fbuf[b + 3] = sc1;
              fbuf[b + 4] = sc2;
              fbuf[b + 5] = sAlpha;
              fbuf[b + 6] = zStroke;
              b += FILL_FPV;
              fbuf[b] = v2x;
              fbuf[b + 1] = v2y;
              fbuf[b + 2] = sc0;
              fbuf[b + 3] = sc1;
              fbuf[b + 4] = sc2;
              fbuf[b + 5] = sAlpha;
              fbuf[b + 6] = zStroke;
              b += FILL_FPV;
              // Triangle (v0, v2, v3)
              fbuf[b] = v0x;
              fbuf[b + 1] = v0y;
              fbuf[b + 2] = sc0;
              fbuf[b + 3] = sc1;
              fbuf[b + 4] = sc2;
              fbuf[b + 5] = sAlpha;
              fbuf[b + 6] = zStroke;
              b += FILL_FPV;
              fbuf[b] = v2x;
              fbuf[b + 1] = v2y;
              fbuf[b + 2] = sc0;
              fbuf[b + 3] = sc1;
              fbuf[b + 4] = sc2;
              fbuf[b + 5] = sAlpha;
              fbuf[b + 6] = zStroke;
              b += FILL_FPV;
              fbuf[b] = v3x;
              fbuf[b + 1] = v3y;
              fbuf[b + 2] = sc0;
              fbuf[b + 3] = sc1;
              fbuf[b + 4] = sc2;
              fbuf[b + 5] = sAlpha;
              fbuf[b + 6] = zStroke;
              fv += 6;
            }
          }
        }
      }

      faceIdx++;
    }

    return { fillVerts: fv };
  }

  /**
   * Hit-test a canvas pixel coordinate against rendered faces.
   * Returns the topmost face whose polygon contains the point, or null.
   * @param {number} canvasX - X coordinate in canvas pixels
   * @param {number} canvasY - Y coordinate in canvas pixels
   * @returns {import('../heerich.js').Face | null}
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

  /**
   * Release all GPU resources. The renderer cannot be used after this call.
   */
  destroy() {
    this._fillBuf.destroy();
    this._uniformBuffer.destroy();
    if (this._msaaTexture) this._msaaTexture.destroy();
    this._device.destroy();
  }
}

/**
 * Point-in-polygon test using ray casting on flat coordinate data.
 * @param {number} x
 * @param {number} y
 * @param {number[]} d - Flat [x0, y0, x1, y1, ...] coordinate array
 * @returns {boolean}
 */
function _pointInPolygon(x, y, d) {
  const n = d.length;
  let inside = false;
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
