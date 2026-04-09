// Benchmark toSVG() — full face-gen → project → serialize pipeline,
// with and without occlusion clipping (the expensive path in real usage).
// Run directly: node tests/toSVG.bench.js

import { Heerich } from "../src/heerich.js";

const SIZES = [15, 25];
const PROJECTIONS = ["oblique", "perspective"];
const WARMUP = 3;
const ITERS = 15;

function buildScene(size) {
  const h = new Heerich();
  h.applyGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [size, size, size],
  });
  return h;
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
    for (const projection of PROJECTIONS) {
      const h = buildScene(size);
      h.renderOptions.projection = projection;
      const plain = bench(() => {
        h._invalidate();
        h.toSVG();
      });
      const occluded = bench(() => {
        h._invalidate();
        h.toSVG({ occlusion: true });
      });
      rows.push({
        size,
        voxels: size ** 3,
        projection,
        plain: plain.median,
        occluded: occluded.median,
        ratio: occluded.median / plain.median,
      });
    }
  }
  return { name: "toSVG", rows, meta: { warmup: WARMUP, iters: ITERS } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, meta } = run();
  console.log(`node ${process.version}   warmup=${meta.warmup} iters=${meta.iters}\n`);
  for (const r of rows) {
    console.log(
      `  ${r.size}³ ${r.projection.padEnd(12)} plain=${r.plain.toFixed(2).padStart(7)} ms  occ=${r.occluded.toFixed(2).padStart(7)} ms  (${r.ratio.toFixed(1)}×)`,
    );
  }
}
