// Diagnostic: is the incremental cache actually being hit?
// Instruments _faceCache3D via a Proxy to count hits/misses on getFaces().

import { Heerich } from "../src/heerich.js";

function instrument(h) {
  const real = h._faceCache3D;
  let gets = 0,
    hits = 0,
    sets = 0,
    deletes = 0;
  h._faceCache3D = new Proxy(real, {
    get(target, prop) {
      if (prop === "get") {
        return (k) => {
          gets++;
          const v = target.get(k);
          if (v !== undefined) hits++;
          return v;
        };
      }
      if (prop === "set") {
        return (k, v) => {
          sets++;
          return target.set(k, v);
        };
      }
      if (prop === "delete") {
        return (k) => {
          deletes++;
          return target.delete(k);
        };
      }
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return () => ({
    gets,
    hits,
    sets,
    deletes,
    size: real.size,
    reset() {
      gets = hits = sets = deletes = 0;
    },
  });
}

function scene(size) {
  const h = new Heerich();
  h.applyGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [size, size, size],
  });
  return h;
}

// Dense 40³
{
  const h = scene(40);
  const stats = instrument(h);
  h.getFaces(); // prime
  console.log("── dense 40³ cube ──");
  console.log(`  after prime: cache size=${stats().size}`);
  stats().reset();

  h.applyGeometry({
    type: "box",
    mode: "subtract",
    position: [0, 0, 0],
    size: [1, 1, 1],
  });
  console.log(`  dirty keys after 1-voxel subtract: ${h._dirtyKeys.size}`);
  h.getFaces();
  const s = stats();
  console.log(
    `  after incremental getFaces: gets=${s.gets} hits=${s.hits} sets=${s.sets} deletes=${s.deletes}  (${s.hits}/${s.gets} = ${((s.hits / s.gets) * 100).toFixed(1)}% hit)`,
  );
  console.log(`  total voxels: ${h.voxels.size}`);
}

// Sparse: hollow sphere shell at 40³
{
  const h = new Heerich();
  h.applyGeometry({
    type: "sphere",
    center: [20, 20, 20],
    radius: 20,
  });
  h.applyGeometry({
    type: "sphere",
    mode: "subtract",
    center: [20, 20, 20],
    radius: 18,
  });
  console.log(`\n── sparse hollow sphere shell ──`);
  console.log(`  total voxels: ${h.voxels.size}`);

  const stats = instrument(h);
  h.getFaces();
  console.log(`  after prime: cache size=${stats().size}`);
  stats().reset();

  // Time a cold rebuild
  const coldT = (() => {
    const t = performance.now();
    for (let i = 0; i < 20; i++) {
      h._invalidate();
      h.getFaces();
    }
    return (performance.now() - t) / 20;
  })();

  // Time incremental mutation
  const incrT = (() => {
    const t = performance.now();
    for (let i = 0; i < 20; i++) {
      h.applyGeometry({
        type: "box",
        mode: i & 1 ? "subtract" : "union",
        position: [i % 10, 0, 0],
        size: [1, 1, 1],
      });
      h.getFaces();
    }
    return (performance.now() - t) / 20;
  })();

  console.log(`  cold rebuild median: ${coldT.toFixed(3)} ms`);
  console.log(`  incremental median : ${incrT.toFixed(3)} ms`);
  console.log(`  speedup: ${(coldT / incrT).toFixed(2)}×`);
}
