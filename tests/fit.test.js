// getFitFrame() must give one frame size across a camera sweep, keep the pivot dead
// centre and never crop. Views are picked off the sampling grid on purpose, because
// a view between two samples is where the frame could come up short.
// Run directly: node tests/fit.test.js

import { Heerich } from "../src/heerich.js";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) {
    failures++;
    console.error(`FAIL ${name} ${detail}`);
  }
};

// a repeatable sequence, so a failure can be reproduced
let seed = 7;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + random() * (b - a);

const scenes = {
  cube(h) {
    h.addGeometry({ type: "box", position: [0, 0, 0], size: 6 });
  },
  "far from the origin"(h) {
    h.addGeometry({ type: "box", position: [40, 25, 30], size: [5, 3, 8] });
  },
  "long bar"(h) {
    h.addGeometry({ type: "box", position: [0, 0, 0], size: [20, 1, 1] });
  },
  "negative coordinates"(h) {
    h.addGeometry({ type: "box", position: [-9, -4, 2], size: [6, 6, 3] });
  },
  "stray voxels"(h) {
    h.addGeometry({ type: "box", position: [0, 0, 0], size: 5 });
    h.addGeometry({ type: "box", position: [12, 0, 2], size: 1 });
    h.addGeometry({ type: "box", position: [1, -8, 3], size: 1 });
  },
  "with a hole"(h) {
    h.addGeometry({ type: "box", position: [0, 0, 0], size: 8 });
    h.removeGeometry({ type: "sphere", center: [4, 4, 4], radius: 3 });
  },
};

const views = {
  oblique: () => ({
    type: "oblique",
    angle: between(0, 360),
    distance: between(1, 40),
  }),
  orthographic: () => ({
    type: "orthographic",
    angle: between(0, 360),
    pitch: between(0, 89),
  }),
  isometric: () => ({ type: "isometric", angle: between(0, 360) }),
  perspective: () => ({
    type: "perspective",
    position: [3, 3],
    distance: between(1, 40),
  }),
};

for (const [name, build] of Object.entries(scenes)) {
  for (const tile of [10, [20, 12, 16]]) {
    const h = new Heerich({ tile, camera: { type: "perspective", position: [3, 3], distance: 20 } });
    build(h);
    const frame = h.getFitFrame();
    const sizes = new Set();
    for (const [type, view] of Object.entries(views)) {
      for (let i = 0; i < 60; i++) {
        h.setCamera(view());
        const box = h.getFitViewBox(frame);
        const [x, y, w, height] = box;
        sizes.add(`${w.toFixed(3)},${height.toFixed(3)}`);

        const p = h.project(type === "oblique" ? [frame.pivot[0], frame.pivot[1], frame.frontZ] : frame.pivot);
        check(`${name} ${type}: pivot centred`, Math.abs(x + w / 2 - p.x) < 1e-6 && Math.abs(y + height / 2 - p.y) < 1e-6);

        const b = h.getBounds();
        check(
          `${name} ${type}: nothing cropped`,
          b.x >= x && b.y >= y && b.x + b.w <= x + w && b.y + b.h <= y + height,
        );
      }
    }
    check(`${name}: one frame size`, sizes.size === 1, `(${sizes.size} sizes: ${[...sizes].slice(0, 3).join(" | ")})`);
  }
}

// A shape's widest view can fall between the angles the frame samples: this box peaks
// around 23°. Fine steps must still fit, or the frame would twitch as the camera turns.
for (const [type, extra] of [
  ["isometric", {}],
  ["orthographic", { pitch: 41.3 }],
  ["oblique", { distance: 40 }],
]) {
  const h = new Heerich({ tile: 10, camera: { type } });
  h.addGeometry({ type: "box", position: [0, 0, 0], size: [7, 1, 3] });
  const frame = h.getFitFrame({
    cameras: [type],
    pitch: [41.3, 41.3],
    distance: [40, 40],
  });
  const sizes = new Set();
  for (let angle = 0; angle < 360; angle += 0.25) {
    h.setCamera({ type, angle, ...extra });
    const box = h.getFitViewBox(frame);
    sizes.add(`${box[2].toFixed(3)},${box[3].toFixed(3)}`);
  }
  check(`${type}: no size change between samples`, sizes.size === 1, `(${sizes.size} sizes)`);
}

// An oblique camera holds the shape's front still as its distance and angle change
{
  const h = new Heerich({ tile: 10, camera: { type: "oblique" } });
  h.addGeometry({ type: "box", position: [0, 0, 0], size: [6, 6, 8] });
  const frame = h.getFitFrame({ cameras: ["oblique"], distance: [1, 80] });
  const spots = new Set();
  for (const [angle, distance] of [[315, 1], [315, 20], [315, 80], [90, 40], [200, 9]]) {
    h.setCamera({ type: "oblique", angle, distance });
    const [x, y, w, height] = h.getFitViewBox(frame);
    const p = h.project([3, 3, 0]);
    spots.add(`${(p.x - x - w / 2).toFixed(2)},${(p.y - y - height / 2).toFixed(2)}`);
  }
  check("oblique front stays still", spots.size === 1, `(${[...spots].join(" | ")})`);
}

// A perspective camera that moves is covered by passing the corners of its range
{
  const h = new Heerich({ tile: 10, camera: { type: "perspective", position: [0, 0], distance: 10 } });
  h.addGeometry({ type: "box", position: [0, 0, 0], size: [8, 2, 6] });
  const corners = [[-10, -10], [20, -10], [-10, 20], [20, 20]];
  const frame = h.getFitFrame({ cameras: ["perspective"], positions: corners });
  const sizes = new Set();
  for (let i = 0; i < 200; i++) {
    h.setCamera({ type: "perspective", position: [between(-10, 20), between(-10, 20)], distance: between(1, 40) });
    const box = h.getFitViewBox(frame);
    sizes.add(`${box[2].toFixed(3)},${box[3].toFixed(3)}`);
  }
  check("perspective positions covered", sizes.size === 1, `(${sizes.size} sizes)`);
}

// Narrower ranges give a tighter frame
{
  const h = new Heerich({ tile: 10 });
  scenes["long bar"](h);
  const all = h.getFitFrame();
  const one = h.getFitFrame({ cameras: ["isometric"], angle: [0, 10] });
  check("narrow range is tighter", one.width < all.width && one.height < all.height);
}

// A view past the range grows the frame instead of cropping it
{
  const h = new Heerich({ tile: 10, camera: { type: "isometric" } });
  scenes.cube(h);
  const frame = h.getFitFrame({ cameras: ["isometric"], angle: [0, 5] });
  h.setCamera({ type: "isometric", angle: 45 });
  const [x, y, w, height] = h.getFitViewBox(frame);
  const b = h.getBounds();
  check("view past the range doesn't crop", b.x >= x && b.y >= y && b.x + b.w <= x + w && b.y + b.h <= y + height);
}

// The pivot can be chosen
{
  const h = new Heerich({ tile: 10 });
  scenes.cube(h);
  const frame = h.getFitFrame({ pivot: [0, 0, 0] });
  check("custom pivot", frame.pivot.join() === "0,0,0" && frame.width > h.getFitFrame().width);
}

// An empty scene doesn't break
{
  const h = new Heerich({ tile: 10 });
  const frame = h.getFitFrame();
  check("empty scene", frame.width === 0 && frame.height === 0);
  check("empty scene renders", h.toSVG({ fit: frame }).startsWith("<svg"));
}

// With no stored voxels, fit: true is the normal fit around the faces it's given
{
  const h = new Heerich({ tile: 10, camera: { type: "isometric" } });
  const faces = h.renderTest({ bounds: [[0, 0, 0], [3, 3, 3]], test: () => true });
  const b = h.getBounds(20, faces);
  check("renderTest falls back", h.toSVG({ faces, fit: true }).includes(`viewBox="${b.x} ${b.y} ${b.w} ${b.h}"`));
}

// Measuring leaves the camera and the render alone
{
  const h = new Heerich({ tile: 10, camera: { type: "oblique", angle: 30, distance: 12 } });
  scenes.cube(h);
  const before = h.toSVG();
  const options = JSON.stringify(h.renderOptions);
  h.getFitFrame();
  check("camera untouched", JSON.stringify(h.renderOptions) === options);
  check("render untouched", h.toSVG() === before);
}

// toSVG: `fit` sets the viewBox, an explicit viewBox wins, and no `fit` changes nothing
{
  const h = new Heerich({ tile: 10, camera: { type: "isometric", angle: 20 } });
  scenes.cube(h);
  const frame = h.getFitFrame();
  const box = h.getFitViewBox(frame, { padding: 30 });
  check("toSVG uses fit", h.toSVG({ fit: frame, padding: 30 }).includes(`viewBox="${box.join(" ")}"`));
  check("viewBox wins over fit", h.toSVG({ fit: frame, viewBox: [1, 2, 3, 4] }).includes('viewBox="1 2 3 4"'));
  const measured = h.getFitViewBox(h.getFitFrame({ cameras: ["isometric"] }));
  check("fit: true measures", h.toSVG({ fit: true }).includes(`viewBox="${h.getFitViewBox(frame).join(" ")}"`));
  check("fit: options measure", h.toSVG({ fit: { cameras: ["isometric"] } }).includes(`viewBox="${measured.join(" ")}"`));
  const b = h.getBounds(20);
  check("no fit is unchanged", h.toSVG().includes(`viewBox="${b.x} ${b.y} ${b.w} ${b.h}"`));
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("fit tests passed");
