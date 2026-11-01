// updateSVG() must show the same thing as toSVG(), and do it by reusing elements
// and skipping unchanged attributes. Runs on a small fake DOM, so no browser needed.
// Run directly: node tests/update.test.js

import { Heerich } from "../src/heerich.js";

let creates = 0;
let writes = 0;

class FakeElement {
  constructor(doc, tagName) {
    this.ownerDocument = doc;
    this.tagName = tagName;
    this.attrs = new Map();
    this.children = [];
    this.html = "";
  }
  setAttribute(name, value) {
    writes++;
    this.attrs.set(name, String(value));
  }
  removeAttribute(name) {
    writes++;
    this.attrs.delete(name);
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    child.parentNode = null;
    this.children.splice(this.children.indexOf(child), 1);
    return child;
  }
  replaceChild(next, prev) {
    next.parentNode = this;
    prev.parentNode = null;
    this.children[this.children.indexOf(prev)] = next;
    return prev;
  }
  set innerHTML(html) {
    writes++;
    this.html = html;
  }
}

const doc = {
  createElementNS(_ns, tagName) {
    creates++;
    return new FakeElement(doc, tagName);
  },
};

const failures = [];
function check(name, ok, detail = "") {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

const sortedAttrs = (entries) =>
  [...entries]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join(" ");

/** Parse `toSVG()` markup into polygons (attributes unordered) and everything else. */
function parseMarkup(markup) {
  const polygons = [];
  const rest = markup.replace(/<polygon ([^>]*?) ?\/>/g, (_, attrs) => {
    polygons.push(
      sortedAttrs(
        [...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
      ),
    );
    return "";
  });
  return { polygons, rest };
}

/** Same shape as parseMarkup, read from the DOM that update() built. */
function parseDOM(group) {
  const polygons = [];
  let rest = "";
  for (const child of group.children) {
    if (child.tagName === "polygon") {
      polygons.push(sortedAttrs(child.attrs));
    } else {
      const parsed = parseMarkup(child.html);
      polygons.push(...parsed.polygons);
      rest += parsed.rest;
    }
  }
  return { polygons, rest };
}

function expectSame(name, h, target, options = {}) {
  h.updateSVG(target, options);
  const inner = h
    .toSVG(options)
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "")
    .replace(/^<g [^>]*>/, "")
    .replace(/<\/g>$/, "");
  const want = parseMarkup(inner);
  const got = parseDOM(target.children[0]);
  check(
    `${name}: polygons`,
    want.polygons.length === got.polygons.length &&
      want.polygons.every((p, i) => p === got.polygons[i]),
    `want ${want.polygons.length}, got ${got.polygons.length}`,
  );
  check(`${name}: other markup`, want.rest === got.rest);
}

const newTarget = () => new FakeElement(doc, "svg");
const box = (x = 0, size = 3) => ({
  type: "box",
  position: [x, 0, 0],
  size,
});

// Matches toSVG() on every camera, including the viewBox
for (const camera of [
  { type: "oblique", angle: 45, distance: 15 },
  { type: "perspective", position: [2, 2], distance: 10 },
  { type: "isometric", angle: 30 },
]) {
  const h = new Heerich({ camera });
  h.applyGeometry({ ...box(), style: { top: { fill: "#f00" } } });
  const target = newTarget();
  const name = camera.type;
  expectSame(name, h, target);
  check(
    `${name}: viewBox`,
    h.toSVG().includes(`viewBox="${target.attrs.get("viewBox")}"`),
  );
  expectSame(`${name} offset`, h, target, { offset: [7, 9] });
  check(
    `${name}: offset`,
    target.children[0].attrs.get("transform") === "translate(7, 9)",
  );
  expectSame(`${name} attributes`, h, target, {
    faceAttributes: (f) => ({
      fill: f.type === "top" ? "#0f0" : null,
      strokeWidth: 2,
      "vector-effect": "non-scaling-stroke",
    }),
  });
  expectSame(`${name} occlusion`, h, newTarget(), { occlusion: true });
}

// padding: 0 means no padding, and leaving it out means the default of 20
{
  const h = new Heerich();
  h.applyGeometry(box());
  const { x, y, w, h: height } = h.getBounds(0);
  const boxFor = (pad) =>
    `${x - pad} ${y - pad} ${w + pad * 2} ${height + pad * 2}`;
  for (const [options, pad] of [
    [{ padding: 0 }, 0],
    [{}, 20],
    [{ padding: 5 }, 5],
  ]) {
    const name = `padding ${JSON.stringify(options)}`;
    check(
      `${name}: toSVG`,
      h.toSVG(options).includes(`viewBox="${boxFor(pad)}"`),
      h.toSVG(options).slice(0, 90),
    );
    const target = newTarget();
    h.updateSVG(target, options);
    check(
      `${name}: updateSVG`,
      target.attrs.get("viewBox") === boxFor(pad),
      target.attrs.get("viewBox"),
    );
  }
}

// A repeat with nothing changed touches nothing
{
  const h = new Heerich({ camera: { type: "perspective", position: [2, 2] } });
  h.applyGeometry(box());
  const target = newTarget();
  h.updateSVG(target);
  const elementCount = creates;
  writes = 0;
  h.updateSVG(target);
  check("idle repeat: no writes", writes === 0, `${writes} writes`);
  check("idle repeat: no new elements", creates === elementCount);
}

// Changing one attribute only rewrites that attribute
{
  const h = new Heerich();
  h.applyGeometry(box());
  const target = newTarget();
  h.updateSVG(target, { faceAttributes: () => ({ fill: "#123" }) });
  writes = 0;
  h.updateSVG(target, { faceAttributes: () => ({ fill: "#456" }) });
  const faceCount = target.children[0].children.length;
  check(
    "restyle: one write per face",
    writes === faceCount,
    `${writes} writes for ${faceCount} faces`,
  );
}

// Shrinking and growing reuses elements and keeps face order
{
  const h = new Heerich();
  const target = newTarget();
  h.applyGeometry(box(0, 4));
  expectSame("before shrink", h, target);
  const large = target.children[0].children.length;
  h.clear();
  h.applyGeometry(box(0, 1));
  expectSame("shrunk", h, target);
  check("shrunk: detached", target.children[0].children.length < large);
  const elementCount = creates;
  h.clear();
  h.applyGeometry(box(0, 4));
  expectSame("regrown", h, target);
  check("regrown: reused elements", creates === elementCount);
}

// Attributes the previous face had, and the next one doesn't, are removed
{
  const h = new Heerich();
  const target = newTarget();
  h.applyGeometry({
    ...box(),
    meta: { kind: "a" },
    style: { default: { opacity: 0.5 } },
  });
  expectSame("with meta", h, target);
  h.clear();
  h.applyGeometry(box());
  expectSame("without meta", h, target);
  const leftover = target.children[0].children.some(
    (c) => c.attrs.has("data-kind") || c.attrs.has("opacity"),
  );
  check("stale attributes removed", !leftover);
}

// Faces that aren't a single polygon, swapping kinds on the same elements
{
  const h = new Heerich();
  const target = newTarget();
  h.defineDecal("mark", {
    content: '<path d="M0 0L1 1" stroke="#000"/>',
  });
  h.applyGeometry({
    ...box(),
    style: { top: { decal: "mark" }, front: { hatch: { period: 3 } } },
  });
  h.applyGeometry({ ...box(5), content: "<circle r='3'/>" });
  expectSame("decal, hatch, content", h, target);
  const wrapped = target.children[0].children.filter((c) => c.tagName === "g");
  check("wrapped faces exist", wrapped.length > 0);
  h.clear();
  h.applyGeometry(box());
  expectSame("back to polygons", h, target);
  h.clear();
  h.applyGeometry({ ...box(), style: { default: { decal: "mark" } } });
  expectSame("polygons to decals", h, target);
  writes = 0;
  h.updateSVG(target);
  check("wrapped idle repeat: no writes", writes === 0, `${writes} writes`);
}

// A new engine every frame still reuses the target's elements
{
  const target = newTarget();
  const draw = () => {
    const h = new Heerich();
    h.applyGeometry(box());
    h.updateSVG(target);
  };
  draw();
  const elementCount = creates;
  writes = 0;
  draw();
  check("new engine: one group", target.children.length === 1);
  check("new engine: no new elements", creates === elementCount);
  check("new engine: no writes", writes === 0, `${writes} writes`);

  // Clearing the target starts over instead of writing into a detached group
  target.children[0].parentNode = null;
  target.children.length = 0;
  draw();
  check("cleared target: redrawn", target.children[0]?.children.length > 0);
}

// Rendering into a caller's <g> leaves its viewBox and siblings alone
{
  const h = new Heerich();
  h.applyGeometry(box());
  const g = new FakeElement(doc, "g");
  const sibling = new FakeElement(doc, "rect");
  g.appendChild(sibling);
  h.updateSVG(g);
  check("<g> target: no viewBox", !g.attrs.has("viewBox"));
  check("<g> target: sibling kept", g.children[0] === sibling);
  check("<g> target: returns", h.updateSVG(g) === g);
  check("<g> target: one group", g.children.length === 2);
}

// fit sets the same viewBox as toSVG, on an <svg> target only
{
  const h = new Heerich({ camera: { type: "isometric", angle: 20 } });
  h.applyGeometry(box());
  const frame = h.getFitFrame();
  const svg = new FakeElement(doc, "svg");
  h.updateSVG(svg, { fit: frame });
  check("fit: same viewBox as toSVG", h.toSVG({ fit: frame }).includes(`viewBox="${svg.attrs.get("viewBox")}"`));
  const size = () => svg.attrs.get("viewBox").split(" ").slice(2).join();
  const before = size();
  h.setCamera({ type: "isometric", angle: 77 });
  h.updateSVG(svg, { fit: frame });
  check("fit: same size after turning", size() === before);
  const g = new FakeElement(doc, "g");
  h.updateSVG(g, { fit: frame });
  check("fit: <g> target gets no viewBox", !g.attrs.has("viewBox"));
  let measured = 0;
  const realGetFitFrame = h.getFitFrame;
  h.getFitFrame = function (options) {
    measured++;
    return realGetFitFrame.call(this, options);
  };
  h.updateSVG(new FakeElement(doc, "g"), { fit: true });
  check("fit: <g> target measures nothing", measured === 0);
  h.getFitFrame = realGetFitFrame;
}

if (failures.length) {
  console.error(`${failures.length} failures, first 8:`);
  for (const f of failures.slice(0, 8)) console.error(`  ${f}`);
  process.exit(1);
}
console.log("update ok");
