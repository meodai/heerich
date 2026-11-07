// The docs page's Rotate control and Fixed frame (site/orbit.js): an
// example keeps its size however it is turned, clipped or animated, and
// with Fixed frame however the camera turns. No DOM needed.
// Run directly: node tests/site-orbit.test.js

import { Heerich } from "../src/heerich.js";
import { orbitOpts } from "../site/orbit.js";

const failures = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
};
const size = (vb) => `${vb[2].toFixed(3)}x${vb[3].toFixed(3)}`;

// The docs' camera controls: a type, plus the angle the slider turns
const CAMERAS = {
  oblique: (angle) => ({ type: "oblique", angle, distance: 10 }),
  isometric: (angle) => ({ type: "isometric", angle }),
  orthographic: (angle) => ({ type: "orthographic", angle, pitch: 15 }),
  perspective: (angle) => ({
    type: "perspective",
    position: [5 + ((angle - 180) / 180) * 12, 5],
    distance: 5,
  }),
};
// What "Fixed frame" asks getFitFrame() for (as site.js does)
const FIT = {
  oblique: { cameras: ["oblique"], pitch: [-30, 60], distance: [10, 10] },
  isometric: { cameras: ["isometric"], pitch: [-30, 60], distance: [10, 10] },
  orthographic: { cameras: ["orthographic"], pitch: [-30, 60], distance: [10, 10] },
  perspective: {
    cameras: ["perspective"],
    pitch: [-30, 60],
    distance: [5, 5],
    positions: [
      [-7, -10],
      [17, -10],
      [-7, 20],
      [17, 20],
    ],
  },
};

const SHAPES = {
  box: (e) => e.addGeometry({ type: "box", position: [0, 0, 0], size: [5, 3, 4] }),
  sphere: (e) => e.addGeometry({ type: "sphere", center: [3, 3, 3], radius: 3 }),
  cross: (e) =>
    e.applyGeometry({
      type: "fill",
      bounds: [
        [0, 0, 0],
        [6, 6, 6],
      ],
      test: (x, y, z) => [x, y, z].filter((v) => v < 2 || v >= 4).length < 3,
    }),
  line: (e) => e.addGeometry({ type: "line", from: [0, 0, 0], to: [7, 5, 3], radius: 1 }),
};

const ANGLES = [0, 45, 130, 200, 290, 315];
const ORBITS = [
  { az: 0, el: 0 },
  { az: 35, el: 20 },
  { az: -120, el: 60 },
];

for (const [type, cam] of Object.entries(CAMERAS)) {
  for (const [shape, add] of Object.entries(SHAPES)) {
    const name = `${shape} ${type}`;
    const make = (angle) => {
      const e = new Heerich({ tile: 20, camera: cam(angle) });
      add(e);
      return e;
    };

    // 1. Turned, clipping doesn't change the frame (and it is the box's)
    for (const orbit of ORBITS.slice(1)) {
      const e = make(315);
      const a = orbitOpts(e, { padding: 20 }, { orbit, clip: true, camera: cam(315) });
      const b = orbitOpts(e, { padding: 20 }, { orbit, clip: false, camera: cam(315) });
      check(`clip keeps the frame ${name} ${orbit.az}/${orbit.el}`, size(a.viewBox) === size(b.viewBox));
      check(`turned and clipped ${name}`, !!a.transform && !!a.clip && !b.clip);
    }

    // 2. Fixed frame: one size across camera angles, turned or not
    for (const orbit of ORBITS) {
      for (const clip of [true, false]) {
        const sizes = new Set();
        for (const angle of ANGLES) {
          const e = make(angle);
          const opts = orbitOpts(
            e,
            { padding: 20, fit: FIT[type] },
            { orbit, clip, camera: cam(angle) },
          );
          // unturned and no bounds, it is left to the engine's own fit
          const vb = opts.viewBox || e.getFitViewBox(opts.fit, { padding: 20 });
          sizes.add(size(vb));
        }
        check(
          `fixed frame holds ${name} turned ${orbit.az}/${orbit.el} clip ${clip}`,
          sizes.size === 1,
          [...sizes].join(" , "),
        );
      }
    }

    // 4. Turned and clipped: everything drawn is inside the frame
    for (const orbit of ORBITS.slice(1)) {
      const e = make(130);
      const opts = orbitOpts(e, { padding: 0 }, { orbit, clip: true, camera: cam(130) });
      const [x, y, w, h] = opts.viewBox;
      let out = 0;
      for (const f of e.getFaces(opts)) {
        const d = f.points.data;
        for (let i = 0; i < d.length; i += 2)
          if (d[i] < x - 1e-6 || d[i] > x + w + 1e-6 || d[i + 1] < y - 1e-6 || d[i + 1] > y + h + 1e-6) out++;
      }
      check(`drawn inside the frame ${name} ${orbit.az}/${orbit.el}`, out === 0, `${out} points outside`);
    }
  }

  // 3. Bounds: the frame doesn't follow voxels that change (an animation)
  const bounds = [
    [0, 0, -1],
    [8, 5, 4],
  ];
  for (const orbit of ORBITS) {
    const sizes = new Set();
    for (let step = 0; step < 4; step++) {
      for (const angle of [45, 200]) {
        const e = new Heerich({ tile: 20, camera: cam(angle) });
        e.addGeometry({ type: "box", position: [0, 0, 0], size: [8, 5, 4] });
        e.removeGeometry({ type: "box", position: [1 + step, 1, 0], size: [2, 2, step + 1] });
        if (step) e.addGeometry({ type: "box", position: [5, 2, -1], size: [1, 1, 1 + step] });
        const opts = orbitOpts(e, { padding: 20, fit: FIT[type] }, { orbit, clip: true, bounds, camera: cam(angle) });
        sizes.add(size(opts.viewBox));
      }
    }
    check(`bounds hold the frame while it plays ${type} ${orbit.az}/${orbit.el}`, sizes.size === 1, [...sizes].join(" , "));
  }
}

// 5. At rest with no bounds, the options are left alone
{
  const e = new Heerich({ tile: 20 });
  SHAPES.box(e);
  const opts = { padding: 20, fit: FIT.oblique };
  const out = orbitOpts(e, opts, { orbit: { az: 0, el: 0 }, clip: true, camera: CAMERAS.oblique(315) });
  check("at rest: untouched", out === opts && out.fit === FIT.oblique && !out.viewBox && !out.transform);
}

if (failures.length) {
  console.error(`${failures.length} failure(s):`);
  for (const f of failures.slice(0, 30)) console.error("  " + f);
  process.exit(1);
}
console.log("site orbit ok");
