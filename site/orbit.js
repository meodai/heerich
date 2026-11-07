// The docs page's Rotate control and Fixed frame, as plain functions (no
// page state), so they can be tested in Node: tests/site-orbit.test.js.
import { Heerich } from "../src/heerich.js";

/**
 * An example's box, in whole cells: from its voxels, or `bounds` when given.
 * @param {Heerich} e
 * @param {[number[], number[]]} [bounds]
 * @returns {{min: number[], max: number[]}|null}
 */
export function boxOf(e, bounds) {
  if (bounds) return { min: [...bounds[0]], max: [...bounds[1]] };
  if (!e.voxels.size) return null;
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const v of e.voxels.values()) {
    if (v.x < min[0]) min[0] = v.x;
    if (v.y < min[1]) min[1] = v.y;
    if (v.z < min[2]) min[2] = v.z;
    if (v.x + 1 > max[0]) max[0] = v.x + 1;
    if (v.y + 1 > max[1]) max[1] = v.y + 1;
    if (v.z + 1 > max[2]) max[2] = v.z + 1;
  }
  return { min, max };
}

/**
 * Turn an example and give it a frame that holds still, by adding to its
 * render options:
 *
 * - `transform`: the globe's turn (a turntable: spin about y, then tilt
 *   about x) around the middle of its box
 * - `clip`: its box, if `clip`
 * - `viewBox`: with `opts.fit` (Fixed frame), the fit frame of its box, so
 *   it keeps one size as the camera moves; otherwise its box under this
 *   camera, the frame it has unturned. Either way turning or clipping it
 *   never changes its size.
 *
 * Unturned, it only steps in when `bounds` are given and Fixed frame is on:
 * then the frame is the bounds', which suits an example whose voxels change
 * as it animates (its own voxels would give a frame that changes too).
 *
 * @param {Heerich} e - The example's engine
 * @param {Object} opts - Its render options (changed and returned)
 * @param {Object} how
 * @param {{az: number, el: number}} how.orbit - The globe, in degrees
 * @param {boolean} how.clip - Clip to bounds
 * @param {Object} how.camera - The camera the example is drawn with
 * @param {[number[], number[]]} [how.bounds] - Its box, when its voxels
 *   don't give it (renderTest has none; an animation's change)
 * @returns {Object} opts
 */
export function orbitOpts(e, opts, { orbit, clip, camera, bounds }) {
  if (!e) return opts;
  const turned = !!(orbit.az || orbit.el);
  if (!turned && !(bounds && opts.fit)) return opts;
  const box = boxOf(e, bounds);
  if (!box) return opts;
  const { min, max } = box;
  if (turned) {
    const c = min.map((m, i) => (m + max[i]) / 2);
    opts.transform = {
      rotate: [orbit.el, orbit.az, 0],
      order: "yxz",
      center: c,
    };
    if (clip) opts.clip = { min, max };
  }
  const pad = opts.padding ?? 20;
  opts.viewBox = opts.fit
    ? fixedBoxFrame(e, min, max, opts.fit, pad, camera)
    : boxFrame(e, min, max, pad);
  delete opts.fit;
  return opts;
}

// The box's corners under the engine's camera (lines stay straight, so they
// bound everything inside it)
function boxFrame(e, min, max, pad) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) {
        const p = e.project([x, y, z]);
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
  return [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2];
}

// The fit frame (getFitFrame()) of a box. A box's extremes are its corners,
// so its 8 corner cells stand in for it. Kept per box and camera, since the
// globe re-renders every example on each move.
const boxFrames = new Map();
function fixedBoxFrame(e, min, max, fit, pad, camera) {
  const ro = e.renderOptions;
  const key = JSON.stringify([
    min,
    max,
    camera,
    fit,
    ro.tileW,
    ro.tileH,
    ro.tileZ,
  ]);
  let entry = boxFrames.get(key);
  if (!entry) {
    const box = new Heerich({ tile: [ro.tileW, ro.tileH, ro.tileZ], camera });
    for (const x of [min[0], max[0] - 1])
      for (const y of [min[1], max[1] - 1])
        for (const z of [min[2], max[2] - 1])
          box.addGeometry({ type: "box", position: [x, y, z], size: 1 });
    entry = { box, frame: box.getFitFrame(fit) };
    if (boxFrames.size > 200) boxFrames.clear();
    boxFrames.set(key, entry);
  }
  return entry.box.getFitViewBox(entry.frame, { padding: pad });
}
