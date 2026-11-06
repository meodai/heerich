// Slope voxels: wedge geometry, face hiding against neighbours, oblique culling,
// rotation and serialisation.
// Run directly: node tests/slopes.test.js

import { Heerich } from "../src/heerich.js";

let checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const types = (faces) => faces.map((f) => f.type).sort();
const raw = (h) => h.getFaces({ raw: true });
const facesAt = (h, x, y, z) =>
  raw(h).filter((f) => f.voxel.x === x && f.voxel.y === y && f.voxel.z === z);

// A lone wedge has floor, wall, slanted face and two triangles, for every direction.
const WALL = { "+x": "right", "-x": "left", "+z": "back", "-z": "front" };
for (const dir of ["+x", "-x", "+z", "-z"]) {
  const h = new Heerich();
  h.addGeometry({ type: "box", position: [0, 0, 0], size: 1, slope: dir });
  const f = raw(h);
  assert(f.length === 5, `${dir}: 5 faces, got ${f.length}`);
  assert(
    f.some((x) => x.type === "slope"),
    `${dir}: has slope face`,
  );
  assert(
    f.some((x) => x.type === "bottom"),
    `${dir}: has floor`,
  );
  assert(
    f.some((x) => x.type === WALL[dir]),
    `${dir}: wall faces ${dir}`,
  );
  assert(!f.some((x) => x.type === "top"), `${dir}: no top face`);
  for (const face of f) {
    assert(face.vertices.length === 4, `${dir}: faces stay quads`);
    // every vertex lies on the plane through the face's center along its normal
    for (const v of face.vertices) {
      const d =
        (v[0] - face.c[0]) * face.n[0] +
        (v[1] - face.c[1]) * face.n[1] +
        (v[2] - face.c[2]) * face.n[2];
      assert(Math.abs(d) < 1e-9, `${dir} ${face.type}: vertex off its plane`);
    }
  }
  // the slanted face points up (−y) and away from the wall
  const s = f.find((x) => x.type === "slope");
  assert(s.n[1] < 0, `${dir}: slope normal points up`);
}

// A cube beside a wedge's triangle or open side must keep its face; beside the
// wall or under the floor it is hidden.
{
  const h = new Heerich();
  h.addGeometry({ type: "box", position: [1, 0, 0], size: 1, slope: "+x" });
  h.addGeometry({ type: "box", position: [2, 0, 0], size: 1 }); // at the wall
  h.addGeometry({ type: "box", position: [0, 0, 0], size: 1 }); // at the open side
  h.addGeometry({ type: "box", position: [1, 0, 1], size: 1 }); // at a triangle
  h.addGeometry({ type: "box", position: [1, 1, 0], size: 1 }); // under the floor
  h.addGeometry({ type: "box", position: [1, -1, 0], size: 1 }); // above
  assert(
    !types(facesAt(h, 2, 0, 0)).includes("left"),
    "cube at wall hides its face",
  );
  assert(
    types(facesAt(h, 0, 0, 0)).includes("right"),
    "cube at open side keeps its face",
  );
  assert(
    types(facesAt(h, 1, 0, 1)).includes("front"),
    "cube at triangle keeps its face",
  );
  assert(
    !types(facesAt(h, 1, 1, 0)).includes("top"),
    "cube under floor hides top",
  );
  assert(
    types(facesAt(h, 1, -1, 0)).includes("bottom"),
    "cube above keeps bottom",
  );
  const w = types(facesAt(h, 1, 0, 0));
  assert(!w.includes("right"), "wedge wall hidden by cube");
  assert(!w.includes("bottom"), "wedge floor hidden by cube");
  assert(!w.includes("back"), "wedge triangle hidden by full cube");
  assert(w.includes("front"), "wedge open triangle kept");
  // the front side is open, so the slanted face shows through its empty half
  assert(w.includes("slope"), "slope face kept while a side is open");
  h.addGeometry({ type: "box", position: [1, 0, -1], size: 1 });
  assert(
    !types(facesAt(h, 1, 0, 0)).includes("slope"),
    "slope face hidden once every open side is backed",
  );
}

// A row of wedges with the same direction hides the triangles between them.
{
  const h = new Heerich();
  h.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [1, 1, 3],
    slope: "+x",
  });
  const mid = types(facesAt(h, 0, 0, 1));
  assert(
    !mid.includes("front") && !mid.includes("back"),
    "inner triangles hidden",
  );
  // ...but not between wedges facing different ways
  const h2 = new Heerich();
  h2.addGeometry({ type: "box", position: [0, 0, 0], size: 1, slope: "+x" });
  h2.addGeometry({ type: "box", position: [0, 0, 1], size: 1, slope: "-x" });
  assert(
    types(facesAt(h2, 0, 0, 0)).includes("back"),
    "mismatched triangles kept",
  );
}

// Every camera sees the slanted face of a ramp rising away from it, and none
// sees it from behind.
{
  const cams = [
    { type: "oblique", angle: 315, distance: 5 }, // at 15 the shear is > 1 tile per z, so a back-tilted face really does show
    { type: "isometric", angle: 0 },
    { type: "orthographic", angle: 0, pitch: 30 },
    { type: "perspective", position: [0, -5], distance: 10 },
  ];
  for (const camera of cams) {
    const toward = new Heerich({ camera });
    toward.addGeometry({
      type: "box",
      position: [0, 0, 0],
      size: 1,
      slope: "+z",
    });
    assert(
      toward.getFaces().some((f) => f.type === "slope"),
      `${camera.type}: ramp rising away shows its slope`,
    );
    const away = new Heerich({ camera });
    away.addGeometry({
      type: "box",
      position: [0, 0, 0],
      size: 1,
      slope: "-z",
    });
    assert(
      !away.getFaces().some((f) => f.type === "slope"),
      `${camera.type}: ramp rising toward camera hides its slope`,
    );
  }
}

// Styles: slope key, falling back to top.
{
  const h = new Heerich();
  h.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: 1,
    slope: "+x",
    style: { top: { fill: "green" } },
  });
  h.addGeometry({
    type: "box",
    position: [3, 0, 0],
    size: 1,
    slope: "+x",
    style: { top: { fill: "green" }, slope: { fill: "red" } },
  });
  const s = raw(h).filter((f) => f.type === "slope");
  assert(
    s.find((f) => f.voxel.x === 0).style.fill === "green",
    "falls back to top",
  );
  assert(
    s.find((f) => f.voxel.x === 3).style.fill === "red",
    "slope style wins",
  );
}

// Per-voxel slope function, null for a plain cube; bad directions throw.
{
  const h = new Heerich();
  h.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [2, 1, 1],
    slope: (x) => (x === 0 ? "-z" : null),
  });
  assert(h.getVoxel([0, 0, 0]).slope === "-z", "function sets slope");
  assert(!h.getVoxel([1, 0, 0]).slope, "null leaves a cube");
  let threw = false;
  try {
    h.addGeometry({ type: "box", position: [0, 0, 0], size: 1, slope: "up" });
  } catch {
    threw = true;
  }
  assert(threw, "unknown direction throws");
}

// rotate() around y turns the slope with the voxels; JSON round-trips it.
{
  const h = new Heerich();
  h.addGeometry({ type: "box", position: [0, 0, 0], size: 1, slope: "+x" });
  h.rotate({ axis: "y", turns: 1, center: [0, 0, 0] });
  assert(h.getVoxel([0, 0, 0]).slope === "+z", "+x turns to +z");
  h.rotate({ axis: "y", turns: 3, center: [0, 0, 0] });
  assert(h.getVoxel([0, 0, 0]).slope === "+x", "three more turns back to +x");
  const back = Heerich.fromJSON(JSON.parse(JSON.stringify(h.toJSON())));
  assert(back.getVoxel([0, 0, 0]).slope === "+x", "JSON keeps slope");
  assert(back.toSVG() === h.toSVG(), "JSON round-trip renders the same");
}

// Occlusion: triangles repeat a vertex; the clipper must not duplicate faces.
{
  const h = new Heerich({ camera: { type: "isometric", angle: 30 } });
  h.addGeometry({ type: "box", position: [0, 1, 0], size: [4, 1, 4] });
  h.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [2, 1, 2],
    slope: "+x",
  });
  h.addGeometry({
    type: "box",
    position: [2, 0, 1],
    size: [1, 1, 2],
    slope: "-z",
  });
  const plain = h.toSVG();
  const occluded = h.toSVG({ occlusion: true });
  const count = (s) => (s.match(/<(polygon|path)\b/g) || []).length;
  assert(
    count(occluded) <= count(plain),
    `occlusion doesn't add faces (${count(occluded)} > ${count(plain)})`,
  );
}

// Corners and tips.
const ALL = [
  "+x",
  "-x",
  "+z",
  "-z",
  "tip",
  ...["outer", "inner"].flatMap((k) =>
    ["+x+z", "-x+z", "-x-z", "+x-z"].map((d) => k + d),
  ),
];
ALL.push(...ALL.map((k) => "ceiling:" + k));
const FACE_COUNT = { ramp: 5, outer: 5, inner: 7, tip: 5 };
for (const key of ALL) {
  const ceiling = key.startsWith("ceiling:");
  const base = key.replace("ceiling:", "");
  const h = new Heerich();
  h.addGeometry({ type: "box", position: [0, 0, 0], size: 1, slope: key });
  const f = raw(h);
  const kind =
    base === "tip"
      ? "tip"
      : base.slice(0, 5) in { outer: 1, inner: 1 }
        ? base.slice(0, 5)
        : "ramp";
  assert(
    f.length === FACE_COUNT[kind],
    `${key}: ${FACE_COUNT[kind]} faces, got ${f.length}`,
  );
  // closed solid: every edge is shared by exactly two faces
  const edges = new Map();
  for (const face of f) {
    const vs = face.vertices.filter(
      (v, i, a) => i === 0 || v.join() !== a[i - 1].join(),
    );
    if (vs[0].join() === vs[vs.length - 1].join()) vs.pop();
    for (let i = 0; i < vs.length; i++) {
      const e = [vs[i].join(), vs[(i + 1) % vs.length].join()].sort().join("|");
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }
  assert(
    [...edges.values()].every((c) => c === 2),
    `${key}: closed solid`,
  );
  // normals point out of the solid: away from the centre of its flat face
  const flat = ceiling ? "top" : "bottom";
  const fy = ceiling ? 0.1 : 0.9;
  assert(
    f.some((x) => x.type === flat),
    `${key}: full ${flat}`,
  );
  for (const face of f) {
    const out =
      (face.c[0] - 0.5) * face.n[0] +
      (face.c[1] - fy) * face.n[1] +
      (face.c[2] - 0.5) * face.n[2];
    assert(
      out > 0 || face.type === flat,
      `${key} ${face.type}: normal points out`,
    );
  }
}
{
  const h = new Heerich();
  h.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: 1,
    slope: "outer+z-x",
  });
  assert(h.getVoxel([0, 0, 0]).slope === "outer-x+z", "corner axes normalised");
  h.rotate({ axis: "y", turns: 1, center: [0, 0, 0] });
  assert(h.getVoxel([0, 0, 0]).slope === "outer-x-z", "-x+z turns to -x-z");
  h.rotate({ axis: "y", turns: 1, center: [0, 0, 0] });
  assert(h.getVoxel([0, 0, 0]).slope === "outer+x-z", "-x-z turns to +x-z");
}
// A hip roof: ramps on four sides, outer corners, a ridge of cubes. Every
// triangle between neighbouring pieces must be hidden.
{
  const h = new Heerich();
  h.addGeometry({ type: "box", position: [1, 0, 1], size: [2, 1, 1] });
  h.addGeometry({ type: "box", position: [0, 0, 1], size: 1, slope: "+x" });
  h.addGeometry({ type: "box", position: [3, 0, 1], size: 1, slope: "-x" });
  h.addGeometry({
    type: "box",
    position: [1, 0, 0],
    size: [2, 1, 1],
    slope: "+z",
  });
  h.addGeometry({
    type: "box",
    position: [1, 0, 2],
    size: [2, 1, 1],
    slope: "-z",
  });
  h.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: 1,
    slope: "outer+x+z",
  });
  h.addGeometry({
    type: "box",
    position: [3, 0, 0],
    size: 1,
    slope: "outer-x+z",
  });
  h.addGeometry({
    type: "box",
    position: [0, 0, 2],
    size: 1,
    slope: "outer+x-z",
  });
  h.addGeometry({
    type: "box",
    position: [3, 0, 2],
    size: 1,
    slope: "outer-x-z",
  });
  const sides = raw(h).filter(
    (f) => f.type !== "slope" && f.type !== "bottom" && f.type !== "top",
  );
  assert(sides.length === 0, `hip roof has no visible walls (${sides.length})`);
}
// An L-shaped valley: an inner corner joins two ramps without gaps.
{
  const h = new Heerich();
  h.addGeometry({
    type: "box",
    position: [1, 0, 0],
    size: [2, 1, 1],
    slope: "-z",
  });
  h.addGeometry({
    type: "box",
    position: [0, 0, 1],
    size: [1, 1, 2],
    slope: "-x",
  });
  h.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: 1,
    slope: "inner-x-z",
  });
  const inner = types(facesAt(h, 0, 0, 0));
  assert(
    !inner.includes("right") && !inner.includes("back"),
    "inner corner triangles hidden by the ramps",
  );
}

// Rotating a piece must turn its geometry: for every shape and every turn
// that keeps it horizontal, the faces of the rotated voxel equal the original
// faces rotated in 3D (compared up to translation).
{
  const rot = ([x, y, z], axis, turns) => {
    for (let i = 0; i < turns; i++) {
      if (axis === "y") [x, z] = [-z, x];
      else if (axis === "x") [y, z] = [-z, y];
      else [x, y] = [-y, x];
    }
    return [x, y, z];
  };
  const shapeOf = (polys) => {
    const all = polys.flat();
    const min = [0, 1, 2].map((i) => Math.min(...all.map((v) => v[i])));
    return polys
      .map((p) =>
        [
          ...new Set(
            p.map((v) => v.map((c, i) => +(c - min[i]).toFixed(6)).join()),
          ),
        ]
          .sort()
          .join(" "),
      )
      .sort()
      .join(" | ");
  };
  const turnsFor = { y: [1, 2, 3], x: [2], z: [2] };
  for (const key of ALL) {
    for (const axis of ["x", "y", "z"]) {
      for (const turns of turnsFor[axis]) {
        const h = new Heerich();
        h.addGeometry({
          type: "box",
          position: [0, 0, 0],
          size: 1,
          slope: key,
        });
        const before = raw(h).map((f) =>
          f.vertices.map((v) => rot(v, axis, turns)),
        );
        h.rotate({ axis, turns, center: [0, 0, 0] });
        const after = raw(h).map((f) => f.vertices);
        assert(
          shapeOf(before) === shapeOf(after),
          `${key} turned ${turns}x around ${axis} -> ${[...h][0].slope}`,
        );
      }
    }
  }
  const h = new Heerich();
  h.addGeometry({ type: "box", position: [0, 0, 0], size: 1, slope: "+x" });
  h.rotate({ axis: "x", turns: 1, center: [0, 0, 0] });
  assert(![...h][0].slope, "a quarter turn onto its side leaves a cube");
}
// Ceiling pieces: a ramp hung under a cube hides the cube's bottom, and its
// slanted face falls back to the bottom style.
{
  const h = new Heerich();
  h.addGeometry({ type: "box", position: [0, 0, 0], size: 1 });
  h.addGeometry({
    type: "box",
    position: [0, 1, 0],
    size: 1,
    slope: "ceiling:+x",
    style: { bottom: { fill: "blue" }, top: { fill: "green" } },
  });
  assert(!types(facesAt(h, 0, 0, 0)).includes("bottom"), "cube bottom hidden");
  assert(!types(facesAt(h, 0, 1, 0)).includes("top"), "ceiling top hidden");
  const s = raw(h).find((f) => f.type === "slope");
  assert(s.n[1] > 0, "ceiling slope faces down");
  assert(s.style.fill === "blue", "ceiling slope falls back to bottom style");
  assert(
    _key("ceiling:outer+z-x") === "ceiling:outer-x+z",
    "ceiling corners normalised",
  );
}
// Scale squashes a piece; slanted normals must tilt with it, or cameras cull
// faces that are really visible.
{
  for (const key of ALL) {
    for (const scale of [
      [1, 0.25, 1],
      [0.5, 1, 0.3],
      [1, 0, 1],
    ]) {
      const h = new Heerich();
      h.addGeometry({
        type: "box",
        position: [0, 0, 0],
        size: 1,
        slope: key,
        scale,
        scaleOrigin: [0.5, 1, 0.5],
      });
      for (const f of raw(h)) {
        assert(f.n.every(Number.isFinite), `${key} ${scale}: finite normal`);
        const [v0, v1, v2] = f.vertices;
        for (const v of [v1, v2]) {
          const d =
            (v[0] - v0[0]) * f.n[0] +
            (v[1] - v0[1]) * f.n[1] +
            (v[2] - v0[2]) * f.n[2];
          assert(
            Math.abs(d) < 1e-9,
            `${key} ${scale} ${f.type}: normal fits face`,
          );
        }
      }
    }
  }
  // a ramp squashed to a quarter height is seen from above on every side
  for (const angle of [0, 90, 180, 270]) {
    const h = new Heerich({
      camera: { type: "orthographic", angle, pitch: 30 },
    });
    h.addGeometry({
      type: "box",
      position: [0, 0, 0],
      size: 1,
      slope: "+x",
      scale: [1, 0.25, 1],
      scaleOrigin: [0.5, 1, 0.5],
    });
    assert(
      h.getFaces().some((f) => f.type === "slope"),
      `shallow ramp visible from angle ${angle}`,
    );
  }
}
// Functional scale and scaleOrigin combine with a slope function: every
// shape, a different scale per voxel, null for full size.
{
  const h = new Heerich();
  h.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [4, 1, ALL.length],
    slope: (x, y, z) => ALL[z],
    scale: (x) => (x === 0 ? null : [1 - x * 0.2, 1 - x * 0.2, 1]),
    scaleOrigin: (x, y, z) =>
      ALL[z].startsWith("ceiling:") ? [0.5, 0, 0.5] : [0.5, 1, 0.5],
  });
  for (const f of raw(h)) {
    const v = f.voxel;
    assert(v.slope === ALL[v.z], "slope function applied");
    assert(!(v.x === 0 && v.scale), "null scale leaves full size");
    const [a, b, c] = f.vertices;
    for (const p of [b, c]) {
      const d =
        (p[0] - a[0]) * f.n[0] +
        (p[1] - a[1]) * f.n[1] +
        (p[2] - a[2]) * f.n[2];
      assert(Math.abs(d) < 1e-9, `${v.slope} at x=${v.x}: normal fits face`);
    }
    // each piece stays anchored on its flat face
    if (
      v.scale &&
      f.type === (v.slope.startsWith("ceiling:") ? "top" : "bottom")
    )
      assert(
        f.vertices.every((p) => p[1] === (f.type === "top" ? v.y : v.y + 1)),
        `${v.slope}: flat face stays on the anchor`,
      );
  }
}

// Transparent pieces: they draw their own faces, but neighbours treat them as
// empty space, just like transparent cubes.
for (const key of ALL) {
  const isOwn = (f) => f.voxel.x === 0 && f.voxel.y === 0 && f.voxel.z === 0;
  // boxed in by solid cubes: the cubes draw their 6 inner faces (plus the
  // block's 54 outer ones); the piece's sides are hidden by the cubes
  const h = new Heerich();
  h.addGeometry({ type: "box", position: [-1, -1, -1], size: 3 });
  h.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: 1,
    slope: key,
    opaque: false,
  });
  const f = raw(h);
  assert(
    f.filter((x) => !isOwn(x)).length === 60,
    `${key}: cubes see through it`,
  );
  assert(
    f.filter(isOwn).every((x) => x.type === "slope"),
    `${key}: transparent piece's sides hidden by solid neighbours`,
  );
  // in the open it draws the same faces as an opaque piece
  const count = (opaque, size) => {
    const e = new Heerich();
    e.addGeometry({
      type: "box",
      position: [0, 0, 0],
      size,
      slope: key,
      opaque,
    });
    return raw(e).length;
  };
  assert(count(false, 1) === count(true, 1), `${key}: same faces in the open`);
  // two transparent pieces side by side don't hide each other
  assert(
    count(false, [1, 1, 2]) === 2 * count(false, 1),
    `${key}: pair keeps shared faces`,
  );
}

// Content voxels ignore slope, with one warning per call.
{
  const warn = console.warn;
  const warnings = [];
  console.warn = (m) => warnings.push(m);
  try {
    const h = new Heerich();
    h.addGeometry({
      type: "box",
      position: [0, 0, 0],
      size: [3, 1, 1],
      content: "<circle r='5'/>",
      slope: "+x",
    });
    assert(warnings.length === 1, "one warning for the whole call");
    assert(/content/.test(warnings[0]), "warning names content voxels");
    assert(
      [...h].every((v) => !v.slope),
      "slope ignored on content voxels",
    );
    // and a neighbour still treats the content voxel as solid
    h.addGeometry({ type: "box", position: [0, 1, 0], size: 1 });
    assert(
      !types(facesAt(h, 0, 1, 0)).includes("top"),
      "content voxel still hides the face below it",
    );
    // fromJSON drops a slope stored on a content voxel
    const data = h.toJSON();
    data.voxels[0].slope = "+x";
    const back = Heerich.fromJSON(data);
    assert(!back.getVoxel([0, 0, 0]).slope, "fromJSON ignores it too");
    // no warning without content
    warnings.length = 0;
    h.addGeometry({ type: "box", position: [5, 0, 0], size: 1, slope: "+x" });
    assert(warnings.length === 0, "no warning for plain slopes");
  } finally {
    console.warn = warn;
  }
}

// Position queries: clicking the middle of any drawn face finds its voxel,
// under every camera; clicks through a ramp's empty half reach what's behind.
{
  const cams = [
    { type: "oblique", angle: 315, distance: 6 },
    { type: "oblique", angle: 45, distance: 6 },
    { type: "perspective", position: [0, -3], distance: 8 },
    { type: "isometric", angle: 30 },
    { type: "orthographic", angle: 200, pitch: -30 },
  ];
  const middle = (p) => {
    const d = p.data;
    const pts = new Map();
    for (let i = 0; i < d.length; i += 2)
      pts.set(d[i] + "," + d[i + 1], [d[i], d[i + 1]]);
    const u = [...pts.values()];
    return u.reduce(
      (a, q) => [a[0] + q[0] / u.length, a[1] + q[1] / u.length],
      [0, 0],
    );
  };
  for (const camera of cams)
    for (const key of ALL) {
      const h = new Heerich({ camera });
      h.addGeometry({ type: "box", position: [0, 0, 0], size: 1, slope: key });
      for (const f of h.getFaces()) {
        const hit = h.findByPosition(middle(f.points));
        assert(
          hit && hit.voxel === f.voxel,
          `${camera.type} ${key} ${f.type}: hit`,
        );
      }
      const info = h.getVoxelInfo([0, 0, 0]);
      assert(
        info.bounds2D && info.center2D,
        `${camera.type} ${key}: voxel info`,
      );
    }
  const g = new Heerich({
    camera: { type: "oblique", angle: 315, distance: 6 },
  });
  g.addGeometry({ type: "box", position: [0, 0, 1], size: 1 });
  g.addGeometry({ type: "box", position: [0, 0, 0], size: 1, slope: "-x" });
  const at = (x, y, z) => {
    const p = g._projectPoint(x, y, z);
    const r = g.findByPosition([p.x, p.y]);
    return r && `${r.voxel.z} ${r.face.type}`;
  };
  assert(at(0.15, 0.85, 0) === "0 front", "solid half hits the ramp");
  assert(
    at(0.85, 0.15, 0) === "0 slope",
    "line of sight meets the slanted face",
  );
  assert(
    at(0.95, 0.05, 0) === "1 front",
    "clean through the empty half to the wall",
  );
}

// autoSlope picks pieces from neighbours.
{
  const at = (h, x, y, z) => h.getVoxel([x, y, z])?.slope;
  // a 4x2x3 box: chamfered rim top and bottom, outer corners, flat middle
  const h = new Heerich();
  h.addGeometry({ type: "box", position: [0, 0, 0], size: [4, 2, 3] });
  h.autoSlope();
  assert(at(h, 0, 0, 1) === "+x", "left rim ramps up toward the middle");
  assert(at(h, 3, 0, 1) === "-x", "right rim");
  assert(at(h, 1, 0, 0) === "+z", "front rim");
  assert(at(h, 0, 0, 0) === "outer+x+z", "top corner");
  assert(at(h, 3, 1, 2) === "ceiling:outer-x-z", "bottom corner");
  assert(!at(h, 1, 0, 1), "flat top stays a cube");
  // idempotent, and it replaces slopes it no longer wants
  const before = h.toSVG();
  h.autoSlope();
  assert(h.toSVG() === before, "running twice changes nothing");
  h.autoSlope({ bottom: false });
  assert(!at(h, 3, 1, 2), "bottom: false clears undersides");
  assert(at(h, 0, 0, 0) === "outer+x+z", "...and keeps tops");
  h.autoSlope({ filter: (v) => v.x < 2 });
  assert(
    at(h, 0, 1, 0) === "ceiling:outer+x+z",
    "filter reshapes passing voxels",
  );
  assert(!at(h, 3, 1, 2), "...and leaves the rest alone");

  // a 45° staircase becomes one continuous ramp: every step the same piece
  const st = new Heerich();
  for (let i = 0; i < 4; i++)
    st.addGeometry({ type: "box", position: [i, i, 0], size: [1, 4 - i, 3] });
  st.autoSlope({ bottom: false });
  // the top step is open behind and in front: a one-wide ridge, so a cube
  assert(!at(st, 0, 0, 1), "top step stays a cube");
  for (let i = 1; i < 4; i++)
    assert(at(st, i, i, 1) === "-x", `step ${i} ramps down toward +x`);
  // the ramps meet into one 45° plane: every ramp vertex lies on y = x
  const ramps = raw(st).filter((f) => f.type === "slope" && f.voxel.x > 0);
  assert(ramps.length === 9, "nine ramp faces, three rows deep");
  assert(
    ramps.every((f) => f.vertices.every((v) => v[1] === v[0])),
    "ramps form one continuous slope",
  );

  // concave corner of an L gets an inner corner
  const l = new Heerich();
  l.addGeometry({ type: "box", position: [0, 0, 0], size: [4, 2, 4] });
  l.removeGeometry({ type: "box", position: [2, 0, 2], size: [2, 1, 2] });
  l.autoSlope({ bottom: false });
  assert(at(l, 1, 0, 1) === "inner-x-z", "inside corner of the L");

  // scaled, content and transparent voxels are left alone
  const k = new Heerich();
  k.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: 1,
    scale: [1, 0.5, 1],
  });
  k.addGeometry({ type: "box", position: [2, 0, 0], size: 1, opaque: false });
  k.autoSlope();
  assert(!at(k, 0, 0, 0) && !at(k, 2, 0, 0), "special voxels untouched");
}
// Ramps between two heights.
{
  const closed = (f) => {
    const edges = new Map();
    for (const face of f) {
      const vs = face.vertices.filter(
        (v, i, a) => i === 0 || v.join() !== a[i - 1].join(),
      );
      if (vs[0].join() === vs[vs.length - 1].join()) vs.pop();
      for (let i = 0; i < vs.length; i++) {
        const e = [vs[i].join(), vs[(i + 1) % vs.length].join()]
          .sort()
          .join("|");
        edges.set(e, (edges.get(e) || 0) + 1);
      }
    }
    return [...edges.values()].every((c) => c === 2);
  };
  const HEIGHTS = [
    [0, 0.5],
    [0.5, 1],
    [0.25, 0.75],
    [1, 0.5],
    [0.5, 0],
    [0.5, 0.5],
  ];
  for (const ceiling of [false, true])
    for (const dir of ["+x", "-x", "+z", "-z"])
      for (const [from, to] of HEIGHTS) {
        const side = (ceiling ? "ceiling:" : "") + dir;
        const name = `${side} ${from}→${to}`;
        const h = new Heerich();
        h.addGeometry({
          type: "box",
          position: [0, 0, 0],
          size: 1,
          slope: { side, from, to },
        });
        const f = raw(h);
        // floor, slanted top, two sides, plus a wall at each end above 0
        const want = 4 + (from > 0) + (to > 0);
        assert(f.length === want, `${name}: ${want} faces, got ${f.length}`);
        assert(closed(f), `${name}: closed solid`);
        const fy = ceiling ? 0.05 : 0.95;
        const flat = ceiling ? "top" : "bottom";
        for (const face of f) {
          assert(face.vertices.length === 4, `${name}: faces stay quads`);
          const out =
            (face.c[0] - 0.5) * face.n[0] +
            (face.c[1] - fy) * face.n[1] +
            (face.c[2] - 0.5) * face.n[2];
          assert(
            out > 0 || face.type === flat,
            `${name} ${face.type}: normal points out`,
          );
        }
        // the wall at the high end is full only at height 1
        const wall = _slopeSides(h)[WALL[dir]];
        if (to === 1) assert(wall?.full, `${name}: full wall`);
        else assert(!wall?.full, `${name}: partial wall`);
      }

  // { side, from: 0, to: 1 } is the plain ramp
  assert(_key({ side: "+x" }) === "+x", "default heights are the plain ramp");
  assert(
    _key({ side: "-z", from: 0, to: 1 }) === "-z",
    "0→1 is the plain ramp",
  );
  assert(
    _key({ side: "+x", from: 1 / 3, to: 2 / 3 }) === "+x:0.333333:0.666667",
    "heights rounded into the key",
  );
  // corners and tips take heights too
  for (const ceiling of [false, true])
    for (const base of [
      "tip",
      ...["outer", "inner"].flatMap((k) =>
        ["+x+z", "-x+z", "-x-z", "+x-z"].map((d) => k + d),
      ),
    ])
      for (const [from, to] of [
        [0, 0.5],
        [0.5, 1],
        [0.25, 0.75],
        [1, 0.5],
      ]) {
        const side = (ceiling ? "ceiling:" : "") + base;
        const name = `${side} ${from}→${to}`;
        const h = new Heerich();
        h.addGeometry({
          type: "box",
          position: [0, 0, 0],
          size: 1,
          slope: { side, from, to },
        });
        const f = raw(h);
        assert(closed(f), `${name}: closed solid`);
        for (const face of f) {
          assert(face.vertices.length === 4, `${name}: faces stay quads`);
          if (face.type === "slope")
            assert(
              ceiling ? face.n[1] > 0 : face.n[1] < 0,
              `${name}: slanted faces point ${ceiling ? "down" : "up"}`,
            );
          else {
            // upright and flat faces point toward the side they're named for
            const want = {
              left: [-1, 0, 0],
              right: [1, 0, 0],
              top: [0, -1, 0],
              bottom: [0, 1, 0],
              front: [0, 0, -1],
              back: [0, 0, 1],
            }[face.type];
            assert(
              want.every((k, i) => k === face.n[i]),
              `${name} ${face.type}: normal points out`,
            );
          }
        }
      }
  assert(
    _key({ side: "outer+z-x", from: 0, to: 1 }) === "outer-x+z",
    "corner 0→1 is the plain corner, axes sorted",
  );
  assert(
    _key({ side: "ceiling:inner+z+x", from: 0.5, to: 1 }) ===
      "ceiling:inner+x+z:0.5:1",
    "corner keys sorted with heights",
  );
  // A 1:2 hip roof on a 4×4 footprint: an outer ring 0→½, an inner 2×2 of
  // outer corners ½→1. Only the slanted faces, the floor and the walls around
  // the outside may show.
  {
    const h = new Heerich();
    const ring = (x, z, lo, hi) => {
      const ex = x === lo ? "+x" : x === hi ? "-x" : "";
      const ez = z === lo ? "+z" : z === hi ? "-z" : "";
      return ex && ez ? "outer" + ex + ez : ex || ez;
    };
    h.addGeometry({
      type: "box",
      position: [0, 0, 0],
      size: [4, 1, 4],
      slope: (x, _, z) => {
        const outer = x === 0 || x === 3 || z === 0 || z === 3;
        return outer
          ? { side: ring(x, z, 0, 3), from: 0, to: 0.5 }
          : { side: ring(x, z, 1, 2), from: 0.5, to: 1 };
      },
    });
    const f = raw(h);
    const inside = f.filter(
      (x) =>
        !(
          x.type === "slope" ||
          x.type === "bottom" ||
          (x.type === "left" && x.voxel.x === 0) ||
          (x.type === "right" && x.voxel.x === 3) ||
          (x.type === "front" && x.voxel.z === 0) ||
          (x.type === "back" && x.voxel.z === 3)
        ),
    );
    assert(
      inside.length === 0,
      `hip roof: no faces between cells, got ${inside.map((x) => `${x.voxel.x},${x.voxel.z} ${x.type}`).join(" ")}`,
    );
  }

  // The same hip roof under every camera: seen from above, only faces that
  // point up or out show, no floors, slanted faces on all four sides of the
  // roof show from straight-ish above, and every point projects to a number.
  // Hung as a ceiling roof and seen from below, the same upside down.
  {
    const roof = (cam, ceiling) => {
      const h = new Heerich({ camera: cam });
      const ring = (x, z, lo, hi) => {
        const ex = x === lo ? "+x" : x === hi ? "-x" : "";
        const ez = z === lo ? "+z" : z === hi ? "-z" : "";
        return ex && ez ? "outer" + ex + ez : ex || ez;
      };
      const pre = ceiling ? "ceiling:" : "";
      h.addGeometry({
        type: "box",
        position: [0, 0, 0],
        size: [6, 1, 6],
        slope: (x, _, z) => {
          const d = Math.min(x, z, 5 - x, 5 - z);
          return {
            side: pre + ring(x, z, d, 5 - d),
            from: d / 3,
            to: (d + 1) / 3,
          };
        },
      });
      return h;
    };
    const CAMS = [
      ["oblique", { type: "oblique", angle: 315, distance: 10 }, false],
      ["oblique below", { type: "oblique", angle: 45, distance: 10 }, true],
      [
        "perspective",
        { type: "perspective", position: [3, -8], distance: 12 },
        false,
      ],
      [
        "perspective below",
        { type: "perspective", position: [3, 10], distance: 12 },
        true,
      ],
      ...[0, 45, 90, 135, 180, 225, 270, 315].map((a) => [
        `orthographic ${a}`,
        { type: "orthographic", angle: a, pitch: 60 },
        false,
      ]),
      [
        "orthographic below",
        { type: "orthographic", angle: 30, pitch: -60 },
        true,
      ],
      ["isometric", { type: "isometric", angle: 135 }, false],
    ];
    for (const [name, cam, ceiling] of CAMS) {
      const f = roof(cam, ceiling).getFaces();
      const hidden = ceiling ? "top" : "bottom";
      assert(f.length > 0, `${name}: draws faces`);
      assert(!f.some((x) => x.type === hidden), `${name}: no ${hidden} faces`);
      for (const s of f.filter((x) => x.type === "slope"))
        assert(
          ceiling ? s.n[1] > 0 : s.n[1] < 0,
          `${name}: slanted face points toward the camera side`,
        );
      assert(
        f.every((x) => x.points.data.every((k) => Number.isFinite(k))),
        `${name}: all points finite`,
      );
      if (/orthographic \d/.test(name)) {
        // pitch 60 looks down steeply enough to see all four roof sides
        const sides = new Set(
          f
            .filter((x) => x.type === "slope")
            .map(
              (x) =>
                `${Math.sign(Math.round(x.n[0] * 1e6))},${Math.sign(Math.round(x.n[2] * 1e6))}`,
            ),
        );
        for (const s of ["1,0", "-1,0", "0,1", "0,-1"])
          assert(sides.has(s), `${name}: roof side ${s} visible`);
      }
    }
  }

  for (const bad of [
    { side: "+y" },
    { side: "tip", from: 0.5, to: 0.5 },
    { side: "outer+x+z", from: 1, to: 1 },
    { side: "+x", from: 0, to: 0 },
    { side: "+x", to: 2 },
    { side: "+x", from: -0.5 },
    "+x:0:3",
  ]) {
    let threw = false;
    try {
      _key(bad);
    } catch {
      threw = true;
    }
    assert(threw, `rejects ${JSON.stringify(bad)}`);
  }

  // A 1:3 slope, one cell at a time: one continuous slanted plane, every
  // inner wall hidden.
  const h = new Heerich();
  for (let i = 0; i < 3; i++)
    h.addGeometry({
      type: "box",
      position: [i, 0, 0],
      size: [1, 1, 2],
      slope: { side: "+x", from: i / 3, to: (i + 1) / 3 },
    });
  const f = raw(h);
  const slopes = f.filter((x) => x.type === "slope");
  assert(slopes.length === 6, `1:3 slope: 6 slanted faces`);
  assert(
    slopes.every((s) =>
      s.n.every((k, i) => Math.abs(k - slopes[0].n[i]) < 1e-5),
    ),
    "1:3 slope: one plane",
  );
  assert(
    !f.some((x) => x.type === "left" || (x.type === "right" && x.voxel.x < 2)),
    "1:3 slope: walls between cells hidden",
  );
  assert(
    !f.some(
      (x) =>
        (x.type === "front" && x.voxel.z === 1) ||
        (x.type === "back" && x.voxel.z === 0),
    ),
    "1:3 slope: sides between rows hidden",
  );
  assert(
    f.some((x) => x.type === "right" && x.voxel.x === 2),
    "1:3 slope: end wall shown",
  );
  // a cube behind the top of the slope hides its wall, a cube at the low
  // end of a raised piece doesn't hide its partial wall
  const c = new Heerich();
  c.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: 1,
    slope: { side: "+x", from: 0.5, to: 1 },
  });
  c.addGeometry({ type: "box", position: [1, 0, 0], size: 1 });
  c.addGeometry({ type: "box", position: [-1, 0, 0], size: 1 });
  const cf = raw(c);
  assert(
    !cf.some((x) => x.voxel.x === 1 && x.type === "left"),
    "cube at full wall hidden",
  );
  assert(
    cf.some((x) => x.voxel.x === -1 && x.type === "right"),
    "cube at partial wall kept",
  );
  assert(
    !cf.some((x) => x.voxel.x === 0 && x.type === "left"),
    "partial wall against cube hidden",
  );

  // rotation and JSON keep the heights
  const r = new Heerich();
  r.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: 1,
    slope: { side: "+x", from: 0.25, to: 0.75 },
  });
  r.rotate({ axis: "y", turns: 1, center: [0, 0, 0] });
  assert(r.getVoxel([0, 0, 0]).slope === "+z:0.25:0.75", "turns around y");
  r.rotate({ axis: "z", turns: 2, center: [0, 0, 0] });
  assert(
    r.getVoxel([0, 0, 0]).slope === "ceiling:+z:0.25:0.75",
    "half turn flips to ceiling",
  );
  const back = Heerich.fromJSON(r.toJSON());
  assert(
    back.getVoxel([0, 0, 0]).slope === "ceiling:+z:0.25:0.75",
    "JSON round trip",
  );
}

// Pieces from four corner heights.
{
  const closed = (f) => {
    const edges = new Map();
    for (const face of f) {
      const vs = face.vertices.filter(
        (v, i, a) => i === 0 || v.join() !== a[i - 1].join(),
      );
      if (vs[0].join() === vs[vs.length - 1].join()) vs.pop();
      for (let i = 0; i < vs.length; i++) {
        const e = [vs[i].join(), vs[(i + 1) % vs.length].join()]
          .sort()
          .join("|");
        edges.set(e, (edges.get(e) || 0) + 1);
      }
    }
    return [...edges.values()].every((c) => c === 2);
  };
  const piece = (slope) => {
    const h = new Heerich();
    h.addGeometry({ type: "box", position: [0, 0, 0], size: 1, slope });
    return h;
  };
  // geometry as a comparable string: every face's type and rounded vertices
  const shapeOf = (h) =>
    raw(h)
      .map(
        (f) =>
          f.type +
          ":" +
          f.vertices
            .map((v) => v.map((k) => Math.round(k * 1e6) / 1e6).join(","))
            .filter((v, i, a) => a.indexOf(v) === i)
            .sort()
            .join(";"),
      )
      .sort()
      .join("|");

  // every combination of quarter heights, floor and ceiling
  const Q = [0, 0.25, 0.5, 0.75, 1];
  let shapes = 0;
  for (const ceiling of [false, true])
    for (const a of Q)
      for (const b of Q)
        for (const c of Q)
          for (const d of Q) {
            if (a + b + c + d === 0) continue;
            const corners = [a, b, c, d];
            const name = `${ceiling ? "ceiling " : ""}[${corners}]`;
            const f = raw(piece({ corners, ceiling }));
            shapes++;
            assert(closed(f), `${name}: closed solid`);
            for (const face of f) {
              assert(face.vertices.length === 4, `${name}: faces stay quads`);
              if (face.type === "slope")
                assert(
                  ceiling ? face.n[1] > 0 : face.n[1] < 0,
                  `${name}: slanted faces point ${ceiling ? "down" : "up"}`,
                );
              else {
                const want = {
                  left: [-1, 0, 0],
                  right: [1, 0, 0],
                  top: [0, -1, 0],
                  bottom: [0, 1, 0],
                  front: [0, 0, -1],
                  back: [0, 0, 1],
                }[face.type];
                assert(
                  want.every((k, i) => k === face.n[i]),
                  `${name} ${face.type}: normal points out`,
                );
              }
            }
            // a top on one plane is one face, a folded one two
            const tops = f.filter(
              (x) =>
                x.type === "slope" || x.type === (ceiling ? "bottom" : "top"),
            ).length;
            assert(
              tops === (a + d === b + c ? 1 : 2),
              `${name}: ${a + d === b + c ? "one" : "two"} top faces`,
            );
          }
  assert(shapes === 2 * 624, "all corner combinations built");

  // the same shapes as the named pieces
  for (const [corners, slope] of [
    [[0, 1, 0, 1], "+x"],
    [[0.25, 0.75, 0.25, 0.75], { side: "+x", from: 0.25, to: 0.75 }],
    [[0, 0, 1, 1], "+z"],
    [[0.5, 0.5, 0, 0], { side: "-z", from: 0, to: 0.5 }],
    [[0, 0, 0, 1], "outer+x+z"],
    [[0.5, 0.5, 0.5, 1], { side: "outer+x+z", from: 0.5, to: 1 }],
    [[0, 1, 1, 1], "inner+x+z"],
    [[1, 0, 1, 1], "inner-x+z"],
    [[1, 1, 0, 1], "inner+x-z"],
  ])
    assert(
      shapeOf(piece({ corners })) === shapeOf(piece(slope)),
      `corners [${corners}] match ${JSON.stringify(slope)}`,
    );
  assert(
    shapeOf(piece({ corners: [0, 1, 0, 1], ceiling: true })) ===
      shapeOf(piece("ceiling:+x")),
    "ceiling corners match ceiling:+x",
  );

  // keys, rotation, JSON
  assert(_key({ corners: [0, 0.5, 0.25, 1] }) === "c:0:0.5:0.25:1", "key");
  assert(
    _key({ corners: [1 / 3, 0, 0, 0], ceiling: true }) ===
      "ceiling:c:0.333333:0:0:0",
    "ceiling key, rounded",
  );
  {
    // a quarter turn around y: corners [f,t,f,t] (rises to +x) → rises to +z
    const h = piece({ corners: [0, 0.5, 0, 0.5] });
    h.rotate({ axis: "y", turns: 1, center: [0, 0, 0] });
    const v = [...h][0];
    assert(v.slope === "c:0:0:0.5:0.5", `turns to +z, got ${v.slope}`);
    assert(
      shapeOf(h).replaceAll(/-?\d+(\.\d+)?/g, "#") ===
        shapeOf(piece({ side: "+z", from: 0, to: 0.5 })).replaceAll(
          /-?\d+(\.\d+)?/g,
          "#",
        ),
      "turned piece has the +z shape",
    );
    // four quarter turns and two half turns come back
    for (const [axis, turns, times] of [
      ["y", 1, 4],
      ["x", 2, 2],
      ["z", 2, 2],
    ]) {
      const r = piece({ corners: [0, 0.25, 0.5, 1] });
      const before = [...r][0].slope;
      for (let i = 0; i < times; i++)
        r.rotate({ axis, turns, center: [0, 0, 0] });
      assert([...r][0].slope === before, `${axis} turns come back`);
    }
    const x = piece({ corners: [0, 0.25, 0.5, 1] });
    x.rotate({ axis: "x", turns: 2, center: [0, 0, 0] });
    assert([...x][0].slope === "ceiling:c:0.5:1:0:0.25", "half turn x");
    x.rotate({ axis: "x", turns: 1, center: [0, 0, 0] });
    assert(![...x][0].slope, "quarter turn x stands it on its side: a cube");
    const j = Heerich.fromJSON(piece({ corners: [0, 0.25, 0.5, 1] }).toJSON());
    assert([...j][0].slope === "c:0:0.25:0.5:1", "JSON round trip");
  }
  for (const bad of [
    { corners: [0, 0, 0, 0] },
    { corners: [0, 0, 1] },
    { corners: [0, 0, 0, 2] },
    { corners: [0, 0, -0.5, 1] },
    "c:0:0:0:3",
  ]) {
    let threw = false;
    try {
      _key(bad);
    } catch {
      threw = true;
    }
    assert(threw, `rejects ${JSON.stringify(bad)}`);
  }

  // A terrain from a random corner grid: whole levels of cubes and one corner
  // piece on top of each column, its corners where the grid says. Neighbours
  // share corners, so every wall between two columns must be hidden.
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let trial = 0; trial < 20; trial++) {
    const N = 6;
    const g = [];
    for (let i = 0; i <= N; i++)
      for (let k = 0; k <= N; k++)
        g[i * (N + 1) + k] = Math.round(rand() * 12) / 4 + 1; // 1..4, in quarters
    const at = (i, k) => g[i * (N + 1) + k];
    // lower corners until every cell fits in one voxel above its whole level
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < N; i++)
        for (let k = 0; k < N; k++) {
          const ids = [
            i * (N + 1) + k,
            (i + 1) * (N + 1) + k,
            i * (N + 1) + k + 1,
            (i + 1) * (N + 1) + k + 1,
          ];
          // the cell's piece sits on whole level floor(lo) and is one level tall
          const top = Math.floor(Math.min(...ids.map((id) => g[id]))) + 1;
          for (const id of ids)
            if (g[id] > top) {
              g[id] = top;
              changed = true;
            }
        }
    }
    const h = new Heerich();
    const FLOOR = 10;
    for (let i = 0; i < N; i++)
      for (let k = 0; k < N; k++) {
        const c = [at(i, k), at(i + 1, k), at(i, k + 1), at(i + 1, k + 1)];
        const L = Math.floor(Math.min(...c)); // whole levels of cubes
        const rel = c.map((v) => v - L);
        // a column of L cubes from the floor up: y from FLOOR - L + 1 to FLOOR
        h.addGeometry({
          type: "box",
          position: [i, FLOOR - L + 1, k],
          size: [1, L, 1],
        });
        if (rel.some((v) => v > 0))
          h.addGeometry({
            type: "box",
            position: [i, FLOOR - L, k],
            size: 1,
            slope: { corners: rel },
          });
      }
    const inner = raw(h).filter(
      (x) =>
        !(
          x.type === "slope" ||
          x.type === "top" ||
          x.type === "bottom" ||
          (x.type === "left" && x.voxel.x === 0) ||
          (x.type === "right" && x.voxel.x === N - 1) ||
          (x.type === "front" && x.voxel.z === 0) ||
          (x.type === "back" && x.voxel.z === N - 1)
        ),
    );
    assert(
      inner.length === 0,
      `corner terrain ${trial}: no walls between columns, got ${inner
        .slice(0, 3)
        .map((x) => `${x.voxel.x},${x.voxel.y},${x.voxel.z} ${x.type}`)
        .join(" ")}`,
    );
  }
}
// Pieces with heights combined with the rest of the engine: scale, gap,
// occlusion, perspective cameras near and inside the geometry, and the
// capped shape cache.
{
  const closed = (f) => {
    const edges = new Map();
    for (const face of f) {
      const vs = face.vertices.filter(
        (v, i, a) => i === 0 || v.join() !== a[i - 1].join(),
      );
      if (vs[0].join() === vs[vs.length - 1].join()) vs.pop();
      for (let i = 0; i < vs.length; i++) {
        const e = [vs[i].join(), vs[(i + 1) % vs.length].join()]
          .sort()
          .join("|");
        edges.set(e, (edges.get(e) || 0) + 1);
      }
    }
    return [...edges.values()].every((c) => c === 2);
  };
  const planar = (f) =>
    f.every((face) =>
      face.vertices.every(
        (v) =>
          Math.abs(
            (v[0] - face.c[0]) * face.n[0] +
              (v[1] - face.c[1]) * face.n[1] +
              (v[2] - face.c[2]) * face.n[2],
          ) < 1e-9,
      ),
    );
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const quarter = () => Math.round(rand() * 4) / 4;
  const someCorners = () => {
    let c;
    do c = [quarter(), quarter(), quarter(), quarter()];
    while (c.every((v) => v === 0));
    return c;
  };
  const SLOPES = [
    () => ({ corners: someCorners() }),
    () => ({ corners: someCorners(), ceiling: true }),
    () => ({ side: "+z", from: quarter(), to: 1 }),
    () => ({ side: "outer-x+z", from: 0, to: 0.5 }),
    () => ({ side: "ceiling:inner+x-z", from: 0.25, to: 0.75 }),
    () => ({ side: "tip", from: 0, to: 0.5 }),
  ];

  // scale: the piece stays inside the scaled box, every face stays flat, it
  // stays a closed solid, and slanted faces still point up (or down)
  for (const [scale, origin] of [
    [
      [1, 0.5, 1],
      [0.5, 1, 0.5],
    ],
    [
      [0.6, 1, 0.6],
      [0.5, 0.5, 0.5],
    ],
    [
      [1, 0.3, 0.7],
      [0, 0, 1],
    ],
  ])
    for (let t = 0; t < 40; t++) {
      const slope = SLOPES[t % SLOPES.length]();
      const name = `scale ${scale} ${JSON.stringify(slope)}`;
      const h = new Heerich();
      h.addGeometry({
        type: "box",
        position: [0, 0, 0],
        size: 1,
        slope,
        scale,
        scaleOrigin: origin,
      });
      const f = raw(h);
      const lo = origin.map((o, i) => o - o * scale[i]),
        hi = origin.map((o, i) => o + (1 - o) * scale[i]);
      assert(
        f.every((face) =>
          face.vertices.every((v) =>
            v.every((k, i) => k >= lo[i] - 1e-9 && k <= hi[i] + 1e-9),
          ),
        ),
        `${name}: inside the scaled box`,
      );
      assert(planar(f), `${name}: faces flat`);
      assert(closed(f), `${name}: closed solid`);
      const down = slope.ceiling || String(slope.side).startsWith("ceiling:");
      for (const face of f.filter((x) => x.type === "slope"))
        assert(
          down ? face.n[1] > 0 : face.n[1] < 0,
          `${name}: slanted faces point ${down ? "down" : "up"}`,
        );
    }

  // gap: inside the shrunk cell, flat, closed, and neighbours stop hiding
  // each other's walls (a gap between them means both walls show)
  for (let t = 0; t < 30; t++) {
    const slope = SLOPES[t % SLOPES.length]();
    const name = `gap ${JSON.stringify(slope)}`;
    const h = new Heerich();
    h.addGeometry({
      type: "box",
      position: [0, 0, 0],
      size: 1,
      slope,
      gap: 0.1,
    });
    const f = raw(h);
    assert(
      f.every((face) =>
        face.vertices.every((v) =>
          v.every((k) => k >= 0.1 - 1e-9 && k <= 0.9 + 1e-9),
        ),
      ),
      `${name}: inside the gap`,
    );
    assert(planar(f), `${name}: faces flat`);
    assert(closed(f), `${name}: closed solid`);
  }
  {
    // two ramps that join (0→½ then ½→1): without a gap the shared walls
    // hide, with a gap both show
    const pair = (gap) => {
      const h = new Heerich();
      h.addGeometry({
        type: "box",
        position: [0, 0, 0],
        size: 1,
        gap,
        slope: { side: "+x", from: 0, to: 0.5 },
      });
      h.addGeometry({
        type: "box",
        position: [1, 0, 0],
        size: 1,
        gap,
        slope: { side: "+x", from: 0.5, to: 1 },
      });
      const f = raw(h);
      return {
        right: f.some((x) => x.voxel.x === 0 && x.type === "right"),
        left: f.some((x) => x.voxel.x === 1 && x.type === "left"),
      };
    };
    const tight = pair(0),
      apart = pair(0.1);
    assert(!tight.right && !tight.left, "joined ramps hide their shared walls");
    assert(apart.right && apart.left, "with a gap both walls show");
  }

  // A corner-height terrain, as the terrain demo builds it, for the camera
  // checks below.
  const terrain = (camera, N = 8) => {
    const g = [];
    for (let i = 0; i <= N; i++)
      for (let k = 0; k <= N; k++)
        g[i * (N + 1) + k] = Math.round(rand() * 12) / 4 + 1;
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < N; i++)
        for (let k = 0; k < N; k++) {
          const ids = [
            i * (N + 1) + k,
            (i + 1) * (N + 1) + k,
            i * (N + 1) + k + 1,
            (i + 1) * (N + 1) + k + 1,
          ];
          const top = Math.floor(Math.min(...ids.map((id) => g[id]))) + 1;
          for (const id of ids)
            if (g[id] > top) {
              g[id] = top;
              changed = true;
            }
        }
    }
    const h = new Heerich({ camera });
    const FLOOR = 6;
    for (let i = 0; i < N; i++)
      for (let k = 0; k < N; k++) {
        const c = [
          g[i * (N + 1) + k],
          g[(i + 1) * (N + 1) + k],
          g[i * (N + 1) + k + 1],
          g[(i + 1) * (N + 1) + k + 1],
        ];
        const L = Math.floor(Math.min(...c));
        const rel = c.map((v) => v - L);
        // a shell: the hanging piece below, the top piece above
        if (rel.some((v) => v < 1))
          h.addGeometry({
            type: "box",
            position: [i, FLOOR - L + 1, k],
            size: 1,
            slope: { corners: rel.map((v) => 1 - v), ceiling: true },
          });
        if (rel.some((v) => v > 0))
          h.addGeometry({
            type: "box",
            position: [i, FLOOR - L, k],
            size: 1,
            slope: { corners: rel },
          });
      }
    return h;
  };
  const finite = (svg) => !/NaN|Infinity/.test(svg);
  const count = (s) => (s.match(/<(polygon|path)\b/g) || []).length;

  // occlusion: works on folded corner tops under every camera, never adds
  // faces, never produces NaN
  for (const camera of [
    { type: "oblique", angle: 315, distance: 10 },
    { type: "isometric", angle: 135 },
    { type: "orthographic", angle: 30, pitch: -40 },
    { type: "perspective", position: [4, -6], distance: 10 },
  ])
    for (let t = 0; t < 3; t++) {
      const h = terrain(camera);
      const plain = h.toSVG(),
        occluded = h.toSVG({ occlusion: true });
      assert(finite(occluded), `occlusion ${camera.type}: no NaN`);
      assert(count(occluded) > 0, `occlusion ${camera.type}: draws`);
      assert(
        count(occluded) <= count(plain),
        `occlusion ${camera.type}: no extra faces (${count(occluded)} > ${count(plain)})`,
      );
    }

  // perspective with the eye just above, inside and below the terrain:
  // nothing throws, every point is a number
  for (const position of [
    [4, 2.5],
    [4, 4],
    [4, 5.2],
    [-2, 3],
    [12, 9],
  ])
    for (const distance of [0.5, 2, 12]) {
      const name = `perspective ${position} ${distance}`;
      let svg = "";
      try {
        svg = terrain({ type: "perspective", position, distance }).toSVG();
      } catch (e) {
        assert(false, `${name}: threw ${e.message}`);
      }
      assert(finite(svg), `${name}: no NaN`);
    }

  // the shape cache is capped; a piece pushed out of it is rebuilt the same
  {
    const shapeOf = (slope) => {
      const h = new Heerich();
      h.addGeometry({ type: "box", position: [0, 0, 0], size: 1, slope });
      return raw(h)
        .map(
          (f) =>
            f.type +
            f.vertices
              .flat()
              .map((k) => k.toFixed(6))
              .join(),
        )
        .sort()
        .join("|");
    };
    const first = { corners: [0.123457, 0.5, 0.25, 0.75] };
    const before = shapeOf(first);
    // more distinct heights than the cache holds
    for (let i = 1; i <= 5000; i++)
      shapeOf({ side: "+x", from: 0, to: i / 5001 });
    assert(shapeOf(first) === before, "an evicted shape is rebuilt the same");
  }
}
function _slopeSides(h) {
  // Which of a lone piece's sides are full, read from its faces: a side face
  // is full when it covers the cell side (area 1).
  const out = {};
  for (const f of raw(h)) {
    if (f.type === "slope") continue;
    const axis = f.n.findIndex((k) => k !== 0);
    const pts = f.vertices.map((v) => v.filter((_, i) => i !== axis));
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [a, b] = [pts[i], pts[(i + 1) % pts.length]];
      area += a[0] * b[1] - b[0] * a[1];
    }
    out[f.type] = { full: Math.abs(Math.abs(area / 2) - 1) < 1e-9 };
  }
  return out;
}
function _key(v) {
  const h = new Heerich();
  h.addGeometry({ type: "box", position: [0, 0, 0], size: 1, slope: v });
  return [...h][0].slope;
}

console.log(`${checks} slope checks`);
console.log("ok");
