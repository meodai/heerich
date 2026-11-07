// The docs site's draw() helper (site/draw.js) must draw what the options
// ask for: turned and cut by `transform`/`clip` (the Rotate control), in
// the given `viewBox`. Runs on a small fake DOM, so no browser needed.
// Run directly: node tests/site-draw.test.js

import { Heerich } from "../src/heerich.js";

class El {
  constructor(tagName) {
    this.tagName = tagName;
    this.attrs = new Map();
    this.children = [];
    this.style = {};
    this.parentNode = null;
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k) {
    return this.attrs.get(k);
  }
  removeAttribute(k) {
    this.attrs.delete(k);
  }
  appendChild(c) {
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  append(...cs) {
    for (const c of cs) this.appendChild(c);
  }
  removeChild(c) {
    this.children.splice(this.children.indexOf(c), 1);
    c.parentNode = null;
    return c;
  }
  replaceChild(n, o) {
    this.children[this.children.indexOf(o)] = n;
    n.parentNode = this;
    return o;
  }
  replaceChildren(...cs) {
    this.children = [];
    this.append(...cs);
  }
  set innerHTML(v) {}
  get ownerDocument() {
    return globalThis.document;
  }
}
globalThis.document = { createElementNS: (_ns, tag) => new El(tag) };

const { draw } = await import("../site/draw.js");

const failures = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
};

// every polygon draw() wrote, as points strings
function drawn(container) {
  const out = [];
  const walk = (el) => {
    if (el.tagName === "polygon") out.push(el.getAttribute("points"));
    for (const c of el.children) walk(c);
  };
  walk(container);
  return out;
}
const pointsOf = (faces) =>
  faces.map((f) => {
    const d = f.points.data;
    const p = [];
    for (let i = 0; i < d.length; i += 2) p.push(`${d[i]},${d[i + 1]}`);
    return p.join(" ");
  });

for (const camera of [
  { type: "oblique", angle: 315, distance: 10 },
  { type: "isometric", angle: 30 },
  { type: "perspective", position: [3, -4], distance: 9 },
]) {
  const e = new Heerich({ tile: 20, camera });
  e.addGeometry({ type: "box", position: [0, 0, 0], size: [5, 4, 3] });
  const name = JSON.stringify(camera);
  const opts = {
    transform: { rotate: [20, 35, 0], origin: [2.5, 2, 1.5] },
    clip: { min: [0, 0, 0], max: [5, 4, 3] },
    viewBox: [-50, -60, 300, 280],
    dataAttributes: false,
  };

  const c = new El("div");
  draw(c, e, opts);
  const want = pointsOf(e.getFaces({ transform: opts.transform, clip: opts.clip }));
  const plain = pointsOf(e.getFaces());
  const got = drawn(c);
  check(`draws the turned, cut faces ${name}`, got.join("|") === want.join("|"), `${got.length} vs ${want.length}`);
  check(`not the plain ones ${name}`, got.join("|") !== plain.join("|"));
  check(`given viewBox ${name}`, c.children[0].getAttribute("viewBox") === "-50 -60 300 280");

  // faces given directly are drawn as they are
  const c2 = new El("div");
  const faces = e.getFaces();
  draw(c2, e, { faces, dataAttributes: false });
  check(`faces passed through ${name}`, drawn(c2).join("|") === pointsOf(faces).join("|"));
}

if (failures.length) {
  console.error(`${failures.length} failure(s):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("site draw ok");
