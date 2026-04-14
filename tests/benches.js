// Run all benches and print a consolidated Markdown report.
// Run: node tests/benches.js

import { run as runGetFaces } from "./getFaces.bench.js";
import { run as runGetRawFaces } from "./getRawFaces.bench.js";
import { run as runToSVG } from "./toSVG.bench.js";
import { run as runIncremental } from "./incremental.bench.js";
import { run as runGPURenderer } from "./gpuRenderer.bench.js";

const ms = (n) => `${n.toFixed(2)} ms`;

function reportGetFaces({ rows }) {
  let out = `## getFaces()\n\nDense filled cube, cold = \`_invalidate()\` between calls, warm = cache hit.\n\n`;
  out += `| Scene | Projection | cold | warm |\n`;
  out += `|---|---|---|---|\n`;
  for (const r of rows) {
    out += `| ${r.size}³ (${r.voxels.toLocaleString()}) | ${r.projection} | ${ms(r.cold)} | ${ms(r.warm)} |\n`;
  }
  return out;
}

function reportToSVG({ rows }) {
  let out = `\n## toSVG()\n\nFull render pipeline, with and without occlusion clipping.\n\n`;
  out += `| Scene | Projection | plain | occlusion | ratio |\n`;
  out += `|---|---|---|---|---|\n`;
  for (const r of rows) {
    out += `| ${r.size}³ (${r.voxels.toLocaleString()}) | ${r.projection} | ${ms(r.plain)} | ${ms(r.occluded)} | ${r.ratio.toFixed(1)}× |\n`;
  }
  return out;
}

function reportIncremental({ rows, meta }) {
  let out = `\n## Incremental updates\n\n${meta.size}³ = ${meta.voxels.toLocaleString()} voxels. Single-voxel mutation should be much faster than a cold rebuild — if it isn't, the per-voxel cache isn't paying its way.\n\n`;
  out += `| | median |\n|---|---|\n`;
  for (const r of rows) out += `| ${r.label} | ${r.time.toFixed(3)} ms |\n`;
  const [cold, incr] = rows;
  const speedup = cold.time / incr.time;
  out += `\n**Speedup: ${speedup.toFixed(2)}×** ${speedup < 2 ? "— suspiciously low, cache may not be helping" : ""}\n`;
  return out;
}

const startedAt = new Date().toISOString();
const t0 = performance.now();

console.log(`# Heerich benchmark report\n`);
console.log(`_${startedAt}  ·  node ${process.version}  ·  ${process.platform} ${process.arch}_\n`);

function reportGetRawFaces({ rows }) {
  let out = `\n## getFaces({ raw: true })\n\nDense filled cube, cold = \`_invalidate()\` between calls, warm = cache hit. No projection or camera culling.\n\n`;
  out += `| Scene | cold | warm |\n`;
  out += `|---|---|---|\n`;
  for (const r of rows) {
    out += `| ${r.size}³ (${r.voxels.toLocaleString()}) | ${ms(r.cold)} | ${ms(r.warm)} |\n`;
  }
  return out;
}

function reportGPURenderer({ rows }) {
  let out = `\n## GPURenderer.render()\n\nTyped-array packing from pre-built raw faces. \`plain\` = positions+normals+uvs+indices, \`+color\` = with CSS colour parsing, \`yUp\` = with Y/Z axis flip.\n\n`;
  out += `| Scene | faces | plain | +color | yUp |\n`;
  out += `|---|---|---|---|---|\n`;
  for (const r of rows) {
    out += `| ${r.size}³ (${r.voxels.toLocaleString()}) | ${r.faceCount.toLocaleString()} | ${ms(r.plain)} | ${ms(r.withColor)} | ${ms(r.yUp)} |\n`;
  }
  return out;
}

process.stdout.write(reportGetFaces(runGetFaces()));
process.stdout.write(reportGetRawFaces(runGetRawFaces()));
process.stdout.write(reportToSVG(runToSVG()));
process.stdout.write(reportIncremental(runIncremental()));
process.stdout.write(reportGPURenderer(runGPURenderer()));

const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
console.log(`\n_total: ${elapsed}s_`);
