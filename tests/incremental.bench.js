// Benchmark the incremental update path: mutate one voxel on a large scene,
// then call getFaces(). Exercises _dirtyKeys + _faceCache3D.
// Run directly: node tests/incremental.bench.js

import { Heerich } from "../src/heerich.js";

const SIZE = 40;
const WARMUP = 5;
const ITERS = 100;

function buildScene() {
  const h = new Heerich();
  h.applyGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [SIZE, SIZE, SIZE],
  });
  return h;
}

function bench(fn) {
  for (let i = 0; i < WARMUP; i++) fn(i);
  const samples = [];
  for (let i = 0; i < ITERS; i++) {
    const t = performance.now();
    fn(i + WARMUP);
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

  {
    const h = buildScene();
    const r = bench(() => {
      h._invalidate();
      h.getFaces();
    });
    rows.push({ label: "cold rebuild (baseline)", time: r.median });
  }

  {
    const h = buildScene();
    h.getFaces();
    const r = bench((i) => {
      const x = i % SIZE;
      const mode = i & 1 ? "subtract" : "union";
      h.applyGeometry({
        type: "box",
        mode,
        position: [x, 0, 0],
        size: [1, 1, 1],
      });
      h.getFaces();
    });
    rows.push({ label: "single-voxel mutation", time: r.median });
  }

  return {
    name: "incremental",
    rows,
    meta: { warmup: WARMUP, iters: ITERS, size: SIZE, voxels: SIZE ** 3 },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, meta } = run();
  console.log(
    `node ${process.version}   ${meta.size}³ = ${meta.voxels.toLocaleString()} voxels   warmup=${meta.warmup} iters=${meta.iters}\n`,
  );
  for (const r of rows) {
    console.log(`  ${r.label.padEnd(30)} ${r.time.toFixed(3).padStart(8)} ms`);
  }
}
