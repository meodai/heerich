// Benchmark GPURenderer.render() — typed-array packing from raw faces.
// Measures just the GPURenderer step, not face generation (that's getRawFaces.bench.js).
// Run directly: node tests/gpuRenderer.bench.js

import { Heerich } from "../src/heerich.js";
import { GPURenderer } from "../src/gpu-renderer.js";

const SIZES = [10, 25, 40];
const WARMUP = 5;
const ITERS = 30;

function buildRawFaces(size) {
  const h = new Heerich();
  h.batch(() => {
    h.applyGeometry({
      type: "box",
      position: [0, 0, 0],
      size: [size, size, size],
    });
  });
  return h.getFaces({ raw: true });
}

function bench(fn) {
  for (let i = 0; i < WARMUP; i++) fn();
  const samples = [];
  for (let i = 0; i < ITERS; i++) {
    const t = performance.now();
    fn();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  return {
    median: samples[Math.floor(samples.length / 2)],
    min: samples[0],
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

export function run() {
  const rows = [];
  for (const size of SIZES) {
    const faces = buildRawFaces(size);
    const renderer = new GPURenderer();

    const plain = bench(() => renderer.render(faces));
    const withColor = bench(() => renderer.render(faces, { color: true }));
    const yUp = bench(() => renderer.render(faces, { yUp: true }));

    rows.push({
      size,
      voxels: size ** 3,
      faceCount: renderer.render(faces).faceCount,
      plain: plain.median,
      withColor: withColor.median,
      yUp: yUp.median,
    });
  }
  return { name: "gpuRenderer", rows, meta: { warmup: WARMUP, iters: ITERS } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, meta } = run();
  console.log(`node ${process.version}   warmup=${meta.warmup} iters=${meta.iters}\n`);
  for (const r of rows) {
    console.log(
      `  ${r.size}³ (${r.voxels.toLocaleString().padStart(9)})  ${r.faceCount.toLocaleString().padStart(7)} faces  plain=${r.plain.toFixed(2).padStart(7)} ms  +color=${r.withColor.toFixed(2).padStart(7)} ms  yUp=${r.yUp.toFixed(2).padStart(7)} ms`,
    );
  }
}
