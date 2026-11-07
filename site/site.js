import { Heerich } from "../src/heerich.js";
import { version } from "../package.json";
import { initHero } from "./hero.js";
import { draw } from "./draw.js";
import { toMatrix } from "../src/clip.js";
import { parse, render } from "sugar-high/core";
import * as javascript from "sugar-high/lang/javascript";

// data-highlight="2,5-7" lists one-based lines to emphasize
const parseLines = (spec = "") =>
  new Set(
    spec
      .split(",")
      .filter(Boolean)
      .flatMap((range) => {
        const [from, to = from] = range.split("-").map(Number);
        return Array.from({ length: to - from + 1 }, (_, i) => from + i);
      }),
  );

document.querySelectorAll("pre code").forEach((el) => {
  const lines = parseLines(el.dataset.highlight);
  el.innerHTML = render(parse(el.textContent, javascript), {
    markLine(line) {
      if (lines.has(line.index + 1)) line.className += " sh__line--highlighted";
    },
  });
});

document.querySelector("h1 .version").textContent = version;

// ─── Enhance all range inputs ────────
function enhanceRange(input) {
  const wrap = document.createElement("div");
  wrap.className = "range-wrap";

  const thumb = document.createElement("span");
  thumb.className = "range-thumb";

  const capL = document.createElement("span");
  capL.className = "range-cap-left";
  const capR = document.createElement("span");
  capR.className = "range-cap-right";

  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  wrap.appendChild(thumb);
  wrap.appendChild(capL);
  wrap.appendChild(capR);

  // Find the .value span — it's a sibling of the wrapper in the <label>
  const valueSpan = wrap
    .closest(".control-label")
    .querySelector(".control-value");

  function syncVal() {
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const val = parseFloat(input.value) || 0;
    wrap.style.setProperty("--val", (val - min) / (max - min));
    if (valueSpan) valueSpan.textContent = input.value;
  }

  input.addEventListener("input", syncVal);
  syncVal();
}

document.querySelectorAll('input[type="range"]').forEach(enhanceRange);

// ─── Show settings panel when Boxes section is reached ───
const panel = document.getElementById("settings-panel");

// Collapse settings by default on mobile
if (window.matchMedia("(max-width: 56rem)").matches) {
  panel.removeAttribute("open");
}
const boxesSection = document.getElementById("boxes");
let panelShown = false;
window.addEventListener(
  "scroll",
  () => {
    if (panelShown) return;
    if (boxesSection.getBoundingClientRect().top < window.innerHeight) {
      panel.classList.add("visible");
      panelShown = true;
    }
  },
  { passive: true },
);

// ─── Global camera state ─────────────
const camProj = document.getElementById("cam-proj");
const camAngle = document.getElementById("cam-angle");
const camDist = document.getElementById("cam-dist");
const camY = document.getElementById("cam-y");
const camAngleLabel = document.getElementById("cam-angle-label");
const camYLabel = document.getElementById("cam-y-label");
const camPerspectiveControl = document.getElementById(
  "cam-perspective-control",
);
const camGrid = document.getElementById("cam-grid");
const camGridAngleValue = document.getElementById("cam-grid-angle-value");
const camGridYValue = document.getElementById("cam-grid-y-value");
const camStroke = document.getElementById("cam-stroke");
const camStrokeColor = document.getElementById("cam-stroke-color");
const camFill = document.getElementById("cam-fill");
const camOutline = document.getElementById("cam-outline");
const camOutlineColor = document.getElementById("cam-outline-color");
const camFit = document.getElementById("cam-fit");
const camGap = document.getElementById("cam-gap");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value, min, step) {
  if (!step || step <= 0) return value;
  const rounded = min + Math.round((value - min) / step) * step;
  return Number(rounded.toFixed(4));
}

const num = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? fallback : n;
};

let _rerenderTimer = 0;
function debouncedRerenderAll(ms = 100) {
  clearTimeout(_rerenderTimer);
  _rerenderTimer = setTimeout(rerenderAll, ms);
}

function updatePerspectiveGrid() {
  const angleMin = num(camAngle.min, 0);
  const angleMax = num(camAngle.max, 360);
  const camYMin = num(camY.min, -10);
  const camYMax = num(camY.max, 20);
  const angleValue = num(camAngle.value, angleMin);
  const camYValue = num(camY.value, camYMin);
  const x = ((angleValue - angleMin) / (angleMax - angleMin)) * 100;
  const y = ((camYValue - camYMin) / (camYMax - camYMin)) * 100;
  const dx = x - 50;
  const dy = y - 50;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  camGrid.style.setProperty("--x", `${x}%`);
  camGrid.style.setProperty("--y", `${y}%`);
  camGrid.style.setProperty("--distance", `${distance}%`);
  camGrid.style.setProperty("--angle", `${angle}deg`);
  camGridAngleValue.textContent = camAngle.value;
  camGridYValue.textContent = camY.value;
}

function setPerspectiveFromGrid(clientX, clientY) {
  const rect = camGrid.getBoundingClientRect();
  const x = clamp((clientX - rect.left) / rect.width, 0, 1);
  const y = clamp((clientY - rect.top) / rect.height, 0, 1);
  const angleMin = num(camAngle.min, 0);
  const angleMax = num(camAngle.max, 360);
  const angleStep = num(camAngle.step, 1);
  const camYMin = num(camY.min, -10);
  const camYMax = num(camY.max, 20);
  const camYStep = num(camY.step, 1);

  const angleValue = roundToStep(
    angleMin + x * (angleMax - angleMin),
    angleMin,
    angleStep,
  );
  const camYValue = roundToStep(
    camYMin + y * (camYMax - camYMin),
    camYMin,
    camYStep,
  );

  camAngle.value = String(angleValue);
  camY.value = String(camYValue);
  updatePerspectiveGrid();
  rerenderAll();
}

function getCamera() {
  const proj = camProj.value;
  const angle = parseFloat(camAngle.value);
  const dist = parseFloat(camDist.value);
  if (proj === "oblique") {
    return { type: "oblique", angle, distance: dist };
  }
  if (proj === "orthographic") {
    return {
      type: "orthographic",
      angle: angle,
      pitch: parseFloat(camY.value) * 3,
    };
  }
  if (proj === "isometric") {
    return { type: "isometric", angle: angle, pitch: 35.264 };
  }
  const camX = 5 + ((angle - 180) / 180) * 12;
  return {
    type: "perspective",
    position: [camX, parseFloat(camY.value)],
    distance: dist / 2,
  };
}

// All demo render functions — called on camera change
const demos = [];

// Hero header
function getReservedZone() {
  const heroRect = document.getElementById("hero").getBoundingClientRect();
  const h1 = document.querySelector("article h1");
  if (!h1) return null;

  const h1Rect = h1.getBoundingClientRect();

  // Add padding around the title for breathing room
  const padding = 20;

  // Convert to coordinates relative to hero container
  return {
    x: Math.max(0, h1Rect.left - heroRect.left - padding),
    y: Math.max(0, h1Rect.top - heroRect.top - padding),
    width: h1Rect.width + padding * 2,
    height: h1Rect.height + padding * 2,
  };
}

const hero = initHero(
  document.getElementById("hero"),
  getCamera,
  getReservedZone,
  getSvgOpts,
  getGap,
);

// Repaint hero on resize to recalculate reserved zone
let resizeTimeout;
window.addEventListener(
  "resize",
  () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      hero.repaint();
    }, 150);
  },
  { passive: true },
);

function rerenderAll() {
  demos.forEach((fn) => fn());
  hero.updateCamera();
  scheduleFaviconUpdate();
}

function syncControlVisibility() {
  const perspective = camProj.value === "perspective";
  const orthographic = camProj.value === "orthographic";
  const isometric = camProj.value === "isometric";
  camAngleLabel.style.display = perspective ? "none" : "";
  camYLabel.style.display = orthographic ? "" : "none";
  camDist.closest(".control-label").style.display =
    orthographic || isometric ? "none" : "";
  camPerspectiveControl.hidden = !perspective;

  if (isometric) {
    camAngle.min = "45";
    camAngle.max = "315";
    camAngle.step = "90";
    const val = parseFloat(camAngle.value) || 45;
    camAngle.value = Math.max(
      45,
      Math.min(315, Math.round((val - 45) / 90) * 90 + 45),
    );
    const span = camAngle
      .closest(".control-label")
      .querySelector(".control-value");
    if (span) span.textContent = camAngle.value;
  } else {
    camAngle.min = "0";
    camAngle.max = "360";
    camAngle.step = "1";
  }

  updatePerspectiveGrid();
}
syncControlVisibility();

[camProj, camAngle, camY, camDist].forEach((el) => {
  const evt =
    el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input";
  el.addEventListener(evt, () => {
    const span = el.closest(".control-label").querySelector(".control-value");
    if (span && el.type !== "checkbox") span.textContent = el.value;
    if (el === camProj) syncControlVisibility();
    if (el === camAngle || el === camY) updatePerspectiveGrid();
    rerenderAll();
  });
});

camGrid.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  setPerspectiveFromGrid(event.clientX, event.clientY);

  const onPointerMove = (moveEvent) => {
    setPerspectiveFromGrid(moveEvent.clientX, moveEvent.clientY);
  };

  const onPointerUp = () => {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  };

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
});

document
  .getElementById("btn-randomize-settings")
  .addEventListener("click", () => {
    const projs = ["perspective", "oblique", "orthographic", "isometric"];
    camProj.value = projs[Math.floor(Math.random() * projs.length)];
    camAngle.value = Math.round(Math.random() * 360);
    camDist.value = (2 + Math.random() * 18).toFixed(1);
    camY.value = (1 + Math.random() * 9).toFixed(1);
    [camAngle, camDist, camY].forEach((el) => {
      const span = el.closest(".control-label").querySelector(".control-value");
      if (span) span.textContent = el.value;
    });
    syncControlVisibility();
    updatePerspectiveGrid();
    rerenderAll();
  });

document.getElementById("btn-randomize-style").addEventListener("click", () => {
  const h = Math.round(Math.random() * 360);
  const s = 20 + Math.round(Math.random() * 60);
  const l = 60 + Math.round(Math.random() * 30);
  // Convert HSL to hex
  const hslToHex = (h, s, l) => {
    const el = document.createElement("canvas").getContext("2d");
    el.fillStyle = `hsl(${h},${s}%,${l}%)`;
    return el.fillStyle;
  };
  camFill.value = hslToHex(h, s, l);
  camFill.dataset.transparent = "";
  camStrokeColor.value = hslToHex((h + 180) % 360, s, 100 - l);
  camOutlineColor.value = camStrokeColor.value;
  camStroke.value = (Math.random() * 2.5).toFixed(1);
  camStroke.dispatchEvent(new Event("input", { bubbles: true }));
  syncStyleVars();
  rerenderAll();
});

// ─── Helper: wire up a demo's controls and render loop ───
function getGap() {
  return parseFloat(camGap.value) || 0;
}

const baseStyle = {
  fill: "var(--fill)",
  stroke: "var(--stroke-c)",
  strokeWidth: "var(--stroke-w)",
};
// ─── Rotate: turn every example around its own middle ───
// A globe you drag, as in color-names-timeline: the dot's longitude spins
// the examples about the vertical axis, its latitude tilts them toward you.
// Each example's voxels go through the engine's whole-scene `transform`;
// "Clip to bounds" keeps them cut to the box they started in.
const orbit = { az: 0, el: 0 }; // degrees
const camClip = document.getElementById("cam-clip");

// The example's box (whole cells): what it is clipped to, and its frame.
// `bounds` gives the box when there are no stored voxels to measure (an
// example drawn with renderTest), and `clip: false` turns clipping off for
// one example (renderTest can't close a cut).
function orbitOpts(e, opts, { bounds, clip = true } = {}) {
  if (!e || (!bounds && !e.voxels.size) || (!orbit.az && !orbit.el))
    return opts;
  const min = bounds ? [...bounds[0]] : [Infinity, Infinity, Infinity],
    max = bounds ? [...bounds[1]] : [-Infinity, -Infinity, -Infinity];
  for (const v of bounds ? [] : e.voxels.values()) {
    if (v.x < min[0]) min[0] = v.x;
    if (v.y < min[1]) min[1] = v.y;
    if (v.z < min[2]) min[2] = v.z;
    if (v.x + 1 > max[0]) max[0] = v.x + 1;
    if (v.y + 1 > max[1]) max[1] = v.y + 1;
    if (v.z + 1 > max[2]) max[2] = v.z + 1;
  }
  const c = min.map((m, i) => (m + max[i]) / 2);
  // a turntable: spin about y, then tilt about x, around the middle
  opts.transform = {
    rotate: [orbit.el, orbit.az, 0],
    order: "yxz",
    center: c,
  };
  if (camClip.checked && clip) opts.clip = { min, max };
  // A frame that holds still: the box's corners, the same frame the
  // example has unturned, so turning or clipping never changes its size.
  // Unclipped, what turns out past it may spill over (see .demo-canvas svg).
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
  const pad = opts.padding ?? 20;
  opts.viewBox = [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2];
  delete opts.fit;
  return opts;
}

// A point as the Rotate control turns it (or as it is)
function turned(opts) {
  if (!opts.transform) return (p) => p;
  const m = toMatrix(opts.transform);
  return ([x, y, z]) => [
    m[0] * x + m[1] * y + m[2] * z + m[3],
    m[4] * x + m[5] * y + m[6] * z + m[7],
    m[8] * x + m[9] * y + m[10] * z + m[11],
  ];
}

function getSvgOpts(e, orbitHow) {
  const r = parseFloat(camOutline.value);
  const opts = {
    padding: r > 0 ? 30 + r * 2 : 30,
    faceAttributes: () => ({ "vector-effect": "non-scaling-stroke" }),
  };
  // Cover every turn the camera controls can make under the selected camera type,
  // at the current distance. getCamera() halves it for perspective.
  if (camFit.checked) {
    const dist = parseFloat(camDist.value);
    const distance = camProj.value === "perspective" ? dist / 2 : dist;
    opts.fit = {
      cameras: [camProj.value],
      pitch: [-30, 60],
      distance: [distance, distance],
      positions: [
        [-7, -10],
        [17, -10],
        [-7, 20],
        [17, 20],
      ],
    };
  }

  if (r > 0) {
    opts.outlineFilter = `<filter id="cel"><feMorphology in="SourceAlpha" operator="dilate" radius="${r}" result="thick"/><feFlood flood-color="${camOutlineColor.value}"/><feComposite in2="thick" operator="in" result="border"/><feMerge><feMergeNode in="border"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    opts.prepend = `<defs>${opts.outlineFilter}</defs><g filter="url(#cel)">`;
    opts.append = `</g>`;
  }

  return orbitOpts(e, opts, orbitHow);
}

// Style via CSS variables — no re-render needed
function syncStyleVars() {
  document.documentElement.style.setProperty("--stroke-w", camStroke.value);
  document.documentElement.style.setProperty(
    "--stroke-c",
    camStrokeColor.value,
  );
  document.documentElement.style.setProperty(
    "--fill",
    camFill.dataset.transparent === "1" ? "transparent" : camFill.value,
  );
  hero.repaint();
}
camStroke.addEventListener("input", () => {
  const span = camStroke
    .closest(".control-label")
    .querySelector(".control-value");
  if (span) span.textContent = camStroke.value;
  syncStyleVars();
});
camStrokeColor.addEventListener("input", () => syncStyleVars());
camFill.addEventListener("input", () => {
  camFill.dataset.transparent = "";
  syncStyleVars();
});
document.getElementById("cam-fill-clear").addEventListener("click", () => {
  camFill.dataset.transparent = "1";
  syncStyleVars();
});
camOutline.addEventListener("input", () => {
  const span = camOutline
    .closest(".control-label")
    .querySelector(".control-value");
  if (span) span.textContent = camOutline.value;
  debouncedRerenderAll();
});
camOutlineColor.addEventListener("input", () => debouncedRerenderAll());
camGap.addEventListener("input", () => debouncedRerenderAll());
camFit.addEventListener("change", () => rerenderAll());
camClip.addEventListener("change", () => rerenderAll());

// The globe: a tilted orthographic sphere with the meridian and parallel
// through the dot, front halves bright and back halves dim.
{
  const el = document.getElementById("orbit");
  const dot = document.getElementById("orbit-dot");
  const arcs = ["mf", "mb", "pf", "pb"].map((id) =>
    document.getElementById("arc-" + id),
  );
  const azOut = document.getElementById("orbit-az-value");
  const elOut = document.getElementById("orbit-el-value");
  const R = 44,
    C = 50,
    TILT = 0.34;
  const CB = Math.cos(TILT),
    SB = Math.sin(TILT);
  const EL_MAX = 85;
  // unit sphere point → [x, y] in the 100 × 100 box, and depth (> 0 faces you)
  const proj = (x, y, z) => [
    C + x * R,
    C - (y * CB - z * SB) * R,
    y * SB + z * CB,
  ];
  const ring = (fn, n) => {
    let front = "",
      back = "",
      inF = false,
      inB = false;
    for (let i = 0; i <= n; i++) {
      const [x, y, d] = proj(...fn(i / n));
      const pt = `${x.toFixed(1)} ${y.toFixed(1)} `;
      if (d >= 0) {
        front += (inF ? "L" : "M") + pt;
        inF = true;
        inB = false;
      } else {
        back += (inB ? "L" : "M") + pt;
        inB = true;
        inF = false;
      }
    }
    return [front, back];
  };
  function show() {
    const la = (orbit.az * Math.PI) / 180,
      fi = (orbit.el * Math.PI) / 180;
    const sl = Math.sin(la),
      cl = Math.cos(la),
      sf = Math.sin(fi),
      cf = Math.cos(fi);
    const [mf, mb] = ring((u) => {
      const t = (u - 0.5) * Math.PI;
      return [Math.cos(t) * sl, Math.sin(t), Math.cos(t) * cl];
    }, 32);
    const [pf, pb] = ring((u) => {
      const s = (u * 2 - 1) * Math.PI;
      return [cf * Math.sin(s), sf, cf * Math.cos(s)];
    }, 48);
    [mf, mb, pf, pb].forEach((d, i) => arcs[i].setAttribute("d", d));
    const [x, y] = proj(cf * sl, sf, cf * cl);
    dot.style.left = x + "%";
    dot.style.top = y + "%";
    azOut.textContent = Math.round(orbit.az);
    elOut.textContent = Math.round(orbit.el);
  }
  // Arcball: the pointer → a point on the (tilted) sphere → longitude and
  // latitude
  function from(e) {
    const r = el.getBoundingClientRect();
    let sx = (((e.clientX - r.left) / r.width) * 100 - C) / R;
    let sy = (C - ((e.clientY - r.top) / r.height) * 100) / R;
    const rr = Math.hypot(sx, sy);
    if (rr > 1) {
      sx /= rr;
      sy /= rr;
    }
    const d = Math.sqrt(Math.max(0, 1 - sx * sx - sy * sy));
    const y = sy * CB + d * SB,
      z = -sy * SB + d * CB;
    orbit.el = clamp(
      (Math.asin(clamp(y, -1, 1)) * 180) / Math.PI,
      -EL_MAX,
      EL_MAX,
    );
    orbit.az = (Math.atan2(sx, z) * 180) / Math.PI;
    show();
    // every example re-renders, so at most once a frame
    if (!queued) {
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        rerenderAll();
      });
    }
  }
  let queued = false;
  let dragging = false;
  el.addEventListener("pointerdown", (e) => {
    dragging = true;
    el.setPointerCapture(e.pointerId);
    from(e);
  });
  el.addEventListener("pointermove", (e) => dragging && from(e));
  el.addEventListener("pointerup", (e) => {
    dragging = false;
    el.releasePointerCapture(e.pointerId);
  });
  el.addEventListener("dblclick", () => {
    orbit.az = 0;
    orbit.el = 0;
    show();
    rerenderAll();
  });
  show();
}
syncStyleVars();

function setupDemo(id, buildFn) {
  const root = document.getElementById(id);
  const canvas = root.querySelector(".demo-canvas");
  const controls = {};

  root.querySelectorAll("[data-bind]").forEach((el) => {
    const key = el.dataset.bind;
    controls[key] = el;

    const update = () => {
      const label = el.closest(".control-label");
      const span = label && label.querySelector(".control-value");
      if (span) span.textContent = el.value;
      render();
    };

    if (el.tagName === "INPUT" && el.type === "range")
      el.addEventListener("input", update);
    else if (el.tagName === "INPUT" && el.type === "color")
      el.addEventListener("input", update);
    else if (el.tagName === "SELECT") el.addEventListener("change", update);
    else if (el.tagName === "BUTTON") el.addEventListener("click", update);
  });

  function render() {
    const vals = {};
    for (const [k, el] of Object.entries(controls)) {
      if (el.type === "range") vals[k] = parseFloat(el.value);
      else vals[k] = el.value;
    }
    const svg = buildFn(vals, canvas, controls);
    if (svg) canvas.innerHTML = svg;
  }

  render();
  demos.push(render);
  return render;
}

// ─── 2. Boxes ────────────────────────
setupDemo("demo-box", (v) => {
  const e = new Heerich({
    tile: 30,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  e.applyGeometry({ type: "box", position: [0, 0, 0], size: [v.w, v.h, v.d] });
  if (v.slopes === "on") e.autoSlope();
  return e.toSVG(getSvgOpts(e));
});

// ─── Alignment ───────────────────────
setupDemo("demo-align", (v) => {
  const e = new Heerich({
    tile: 26,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  const big = [6, 6, 6];
  const small = [2, 2, 2];
  const ox = big[0];

  e.applyGeometry({ type: "box", position: [0, 0, 0], size: big });

  // Y = front/back, Z = up/down — these are the two visible alignment axes
  // X is always flush beside with 1 voxel gap
  let y = 0,
    z = 0;
  if (v.align === "max") {
    y = big[1] - small[1];
    z = big[2] - small[2];
  } else if (v.align === "center") {
    y = (big[1] - small[1]) / 2;
    z = (big[2] - small[2]) / 2;
  }
  const pos = [ox, y, z];

  e.applyGeometry({
    type: "box",
    position: pos,
    size: small,
    style: { default: { fill: "#18191b", stroke: "var(--fill)" } },
  });

  return e.toSVG(getSvgOpts(e));
});

// ─── 4. Spheres ──────────────────────
setupDemo("demo-sphere", (v) => {
  const r = v.r;
  const e = new Heerich({
    tile: 28,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  e.applyGeometry({ type: "sphere", center: [r, r, r], radius: r });
  return e.toSVG(getSvgOpts(e));
});

// ─── 5. Lines ────────────────────────
setupDemo("demo-line", (v) => {
  const e = new Heerich({
    tile: 26,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  e.applyGeometry({
    type: "line",
    from: [0, 0, 0],
    to: [v.ex, 6, v.ez],
    radius: v.r,
    shape: v.shape,
  });
  if (v.slopes === "on") e.autoSlope();
  return e.toSVG(getSvgOpts(e));
});

// ─── Custom shapes ──────────────────
setupDemo("demo-custom-shape", (v) => {
  const s = v.size;
  const e = new Heerich({
    tile: 28,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  e.applyGeometry({
    type: "fill",
    bounds: [
      [0, 0, 0],
      [s, s, s],
    ],
    test: (x, y, z) => {
      const c = Math.ceil(s / 4);
      const nearEdge = [x, y, z].filter((v) => v < c || v >= s - c).length;
      return nearEdge < 3;
    },
  });
  if (v.slopes === "on") e.autoSlope();
  return e.toSVG(getSvgOpts(e));
});

// ─── 6. Boolean operations ──────────────
setupDemo("demo-boolean", (v) => {
  const e = new Heerich({
    tile: 26,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  e.applyGeometry({ type: "box", position: [0, 0, 0], size: [6, 6, 6] });
  e.applyGeometry({
    type: "sphere",
    center: [v.offset, 3, 3],
    radius: 3.5,
    mode: v.mode,
    style: { default: { fill: "#18191b", stroke: "var(--fill)" } },
  });
  if (v.slopes === "on") e.autoSlope();
  return e.toSVG(getSvgOpts(e));
});

// ─── 7. Rotation ────────────────────────
setupDemo("demo-rotation", (v) => {
  const e = new Heerich({
    tile: 26,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  e.applyGeometry({ type: "box", position: [0, 0, 0], size: [2, 6, 2] });
  e.applyGeometry({ type: "box", position: [0, 0, 0], size: [6, 2, 2] });
  if (v.turns > 0) {
    e.rotate({ axis: v.axis, turns: v.turns });
  }
  return e.toSVG(getSvgOpts(e));
});

// ─── 8. Grouped voxels ──────────────────
setupDemo("demo-group", (v) => {
  const e = new Heerich({
    tile: 26,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  const gs = v.gs;

  // Smooth solid — strokeWidth: 0 removes internal grid lines
  e.applyGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [gs, gs, gs],
    style: {
      default: { fill: camOutlineColor.value, stroke: camOutlineColor.value },
    },
  });

  // 1x1x1 voxels bordering all four sides, offset 1 back
  for (let i = 0; i < gs + 2; i++) {
    e.applyGeometry({ type: "box", position: [i - 1, -1, 1], size: [1, 1, 1] }); // top edge
    e.applyGeometry({ type: "box", position: [i - 1, gs, 1], size: [1, 1, 1] }); // bottom edge
    e.applyGeometry({ type: "box", position: [-1, i - 1, 1], size: [1, 1, 1] }); // left edge
    e.applyGeometry({ type: "box", position: [gs, i - 1, 1], size: [1, 1, 1] }); // right edge
  }

  return e.toSVG(getSvgOpts(e));
});

// ─── 9. Styles ───────────────────────
// Each face is coloured by the axis it faces, so opposite faces (top/bottom,
// front/back, left/right) share a colour. `a`/`b` are the two 3D endpoints of
// the gradient axis; `flat` faces (top/bottom) have no vertical extent, so
// their projected axis is pinned vertical to avoid reading as a diagonal.
const STYLE_FACES = {
  top: { axis: "y", a: [2.5, 0, 0], b: [2.5, 0, 5], flat: true },
  bottom: { axis: "y", a: [2.5, 5, 0], b: [2.5, 5, 5], flat: true },
  front: { axis: "z", a: [2.5, 0, 0], b: [2.5, 5, 0] },
  back: { axis: "z", a: [2.5, 0, 5], b: [2.5, 5, 5] },
  left: { axis: "x", a: [0, 0, 2.5], b: [0, 5, 2.5] },
  right: { axis: "x", a: [5, 0, 2.5], b: [5, 5, 2.5] },
};

// Stable pseudo-random angle (0..2π) hashed from a voxel's coords + face, so
// per-voxel gradient directions stay fixed as the camera moves (no flicker).
function hashAngle(x, y, z, face) {
  let k = 0;
  for (let i = 0; i < face.length; i++) k += face.charCodeAt(i) * (i + 1);
  const n =
    Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 0.137) * 43758.5453;
  return (n - Math.floor(n)) * Math.PI * 2;
}

setupDemo("demo-style", (v) => {
  const e = new Heerich({
    tile: 30,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });

  if (v.mode === "gradient") {
    // The box spans 0..5 on each axis; y increases downward (y=0 is the top).
    // For each face we project the two real 3D endpoints of its gradient axis
    // and aim a userSpaceOnUse gradient between them — project() handles the
    // perspective divide, so this stays correct across every camera.
    // Turned by the Rotate control, the endpoints turn with the box.
    const style = {};
    for (const face of Object.keys(STYLE_FACES))
      style[face] = { fill: `url(#style-grad-${face})` };
    e.applyGeometry({
      type: "box",
      position: [0, 0, 0],
      size: [5, 5, 5],
      style,
    });
    const opts = getSvgOpts(e);
    const turn = turned(opts);
    const defs = [];
    for (const [face, cfg] of Object.entries(STYLE_FACES)) {
      const color = v[cfg.axis];
      const a = e.project(turn(cfg.a));
      const b = e.project(turn(cfg.b));
      // unturned, a top/bottom gradient runs straight up the screen
      const x2 = cfg.flat && !opts.transform ? a.x : b.x;
      const id = `style-grad-${face}`;
      defs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
          `x1="${a.x}" y1="${a.y}" x2="${x2}" y2="${b.y}">` +
          `<stop offset="0" stop-color="${color}"/>` +
          `<stop offset="1" style="stop-color:color-mix(in oklab, ${color}, var(--bg) 60%)"/>` +
          `</linearGradient>`,
      );
    }
    // Concatenate onto any existing prepend (e.g. the cel-shading outline defs).
    opts.prepend = `<defs>${defs.join("")}</defs>` + (opts.prepend || "");
    return e.toSVG(opts);
  }

  if (v.mode === "voxel") {
    // Per-voxel gradients: every *visible* face gets its own gradient, coloured
    // by its axis (x/y/z) and pointed in a per-voxel random direction. These use
    // the default objectBoundingBox units, so each gradient maps to its own
    // polygon automatically — no projection needed. We render off getFaces() so
    // only on-screen faces get a def (no bloat from hidden interior voxels).
    e.applyGeometry({ type: "box", position: [0, 0, 0], size: [5, 5, 5] });
    const opts = getSvgOpts(e);
    const faces = e.getFaces(opts); // as drawn: turned and cut
    const defs = [];
    const fills = new Map();
    for (const f of faces) {
      const cfg = STYLE_FACES[f.type];
      if (!cfg) continue;
      const { x, y, z } = f.voxel;
      const color = v[cfg.axis];
      const ang = hashAngle(x, y, z, f.type);
      const dx = Math.cos(ang) * 0.5;
      const dy = Math.sin(ang) * 0.5;
      const id = `voxel-grad-${x}-${y}-${z}-${f.type}`;
      defs.push(
        `<linearGradient id="${id}" ` +
          `x1="${(0.5 - dx).toFixed(3)}" y1="${(0.5 - dy).toFixed(3)}" ` +
          `x2="${(0.5 + dx).toFixed(3)}" y2="${(0.5 + dy).toFixed(3)}">` +
          `<stop offset="0" stop-color="${color}"/>` +
          `<stop offset="1" style="stop-color:color-mix(in oklab, ${color}, var(--bg) 60%)"/>` +
          `</linearGradient>`,
      );
      fills.set(`${x},${y},${z},${f.type}`, `url(#${id})`);
    }

    const baseAttrs = opts.faceAttributes;
    opts.faces = faces;
    opts.faceAttributes = (f) => {
      const extra = baseAttrs ? baseAttrs(f) : null;
      const fill = fills.get(
        `${f.voxel.x},${f.voxel.y},${f.voxel.z},${f.type}`,
      );
      return fill ? { ...extra, fill } : extra;
    };
    opts.prepend = `<defs>${defs.join("")}</defs>` + (opts.prepend || "");
    return e.toSVG(opts);
  }

  if (v.mode === "plane") {
    // Float a solid plane off each face. We lift the face's 3D vertices along
    // its normal and project all four directly into a polygon — exact under any
    // perspective. (faceTransform()'s affine matrix is great for gradients and
    // patterns, but its parallelogram can't match a strongly foreshortened
    // trapezoid, so a solid quad uses the real projected corners instead.) The
    // base box is tinted so the lifted planes read clearly.
    e.applyGeometry({
      type: "box",
      position: [0, 0, 0],
      size: [5, 5, 5],
      style: {
        x: { fill: `color-mix(in oklab, ${v.x}, var(--bg) 78%)` },
        y: { fill: `color-mix(in oklab, ${v.y}, var(--bg) 78%)` },
        z: { fill: `color-mix(in oklab, ${v.z}, var(--bg) 78%)` },
      },
    });
    const opts = getSvgOpts(e);
    // as drawn: turned and cut, so vertices and normals are where they show
    const faces = e.getFaces(opts);
    const D = 0.2; // world units the plane floats off its face
    const planes = [];
    for (const f of faces) {
      const cfg = STYLE_FACES[f.type];
      if (!cfg || !f.vertices) continue;
      const n = f.n;
      const pts = f.vertices
        .map(([x, y, z]) => {
          const p = e.project([x + n[0] * D, y + n[1] * D, z + n[2] * D]);
          return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        })
        .join(" ");
      planes.push(
        `<polygon points="${pts}" fill="${v[cfg.axis]}" ` +
          `stroke="var(--bg)" stroke-width="1.5" stroke-linejoin="round" ` +
          `vector-effect="non-scaling-stroke"/>`,
      );
    }

    opts.faces = faces;
    opts.append = (opts.append || "") + `<g>${planes.join("")}</g>`;
    return e.toSVG(opts);
  }

  // Plain mode showcases the axis shorthand: x/y/z each paint both faces.
  e.applyGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [5, 5, 5],
    style: {
      x: { fill: v.x },
      y: { fill: v.y },
      z: { fill: v.z },
    },
  });
  return e.toSVG(getSvgOpts(e));
});

// ─── 9b. Decals ─────────────────────────
setupDemo("demo-decals", (v) => {
  const s = "var(--stroke-w)";
  const sc = "var(--stroke-c)";
  const e = new Heerich({
    tile: 80,
    camera: getCamera(),
    style: {
      fill: "var(--fill)",
      stroke: sc,
      strokeWidth: s,
    },
    gap: getGap(),
  });

  const ns = 'vector-effect="non-scaling-stroke"';
  e.defineDecal(
    "circle",
    `<path d="M0.5 0 A0.5 0.5 0 1 1 0.5 1 A0.5 0.5 0 1 1 0.5 0 Z" fill="none" stroke="${sc}" stroke-width="${s}" ${ns}/>`,
  );
  e.defineDecal(
    "triangle",
    `<path d="M0.5 0 L1 1 L0 1 Z" fill="none" stroke="${sc}" stroke-width="${s}" stroke-linejoin="round" ${ns}/>`,
  );
  e.defineDecal(
    "cross",
    `<path d="M0 0 L1 1 M1 0 L0 1" fill="none" stroke="${sc}" stroke-width="${s}" stroke-linecap="round" ${ns}/>`,
  );

  const names = ["circle", "triangle", "cross"];
  const pick = () => names[Math.floor(Math.random() * names.length)];

  const positions = [
    [0, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
    [1, 0, 0],
  ];

  for (const pos of positions) {
    e.addGeometry({
      type: "box",
      position: pos,
      size: [1, 1, 1],
      style: {
        top: { decal: pick() },
        bottom: { decal: pick() },
        front: { decal: pick() },
        right: { decal: pick() },
        left: { decal: pick() },
      },
    });
  }

  return e.toSVG({ ...getSvgOpts(e), padding: 50 });
});

// ─── 9c. Hatching ────────────────────
setupDemo("demo-hatching", (v) => {
  const e = new Heerich({
    tile: 30,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });

  const hatch = {
    angle: v.angle,
    period: v.period,
    strokeWidth: v.width,
    stroke: v.color,
  };

  e.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [5, 5, 5],
    style: {
      top: { hatch: { ...hatch, angle: v.angle } },
      front: {
        hatch: {
          ...hatch,
          angle: (v.angle + 90) % 180,
        },
      },
      right: { hatch: { ...hatch, angle: (v.angle - 30) % 180 } },
    },
  });

  return e.toSVG(getSvgOpts(e));
});

// ─── 10. SVG styles ───────────────────
setupDemo("demo-svg-styles", (v) => {
  const e = new Heerich({
    tile: 28,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  e.applyGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [4, 4, 4],
    style: {
      default: {
        opacity: v.opacity,
        strokeDasharray:
          v.dash > 0
            ? `${v.dash} ${Math.max(1, Math.floor(v.dash / 2))}`
            : "none",
      },
    },
  });
  e.applyGeometry({
    type: "box",
    position: [5, 0, 0],
    size: [4, 4, 4],
    style: { default: { opacity: 1 } },
  });
  return e.toSVG(getSvgOpts(e));
});

// ─── 11. Functional ───────────────────
const hueStart = Math.random() * 360;
setupDemo("demo-functional", (v) => {
  const s = v.s;
  const hueRange = v.hue;
  const e = new Heerich({
    tile: 28,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  e.applyGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [s, s, s],
    style: {
      default: (x, y, z) => {
        const L = 0.4 + (y / s) * 0.5;
        const C = 0.05 + (1 - z / s) * 0.2;
        const H = ((x / s) * hueRange + hueStart) % 360;
        return {
          fill: `oklch(${L} ${C} ${H})`,
        };
      },
    },
  });
  return e.toSVG(getSvgOpts(e));
});

// ─── 12. Voxel scaling ──────────────────
setupDemo("demo-scale", (v) => {
  const h = v.height;
  const e = new Heerich({
    tile: 30,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });

  // Spiral staircase around a 2x2 hole
  // Hole at (1,1)-(2,2), path goes clockwise
  const path = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [3, 1],
    [3, 2],
    [3, 3],
    [2, 3],
    [1, 3],
    [0, 3],
    [0, 2],
    [0, 1],
  ];
  const total = path.length;

  for (let i = 0; i < total; i++) {
    const [px, pz] = path[i];
    // Standing on floor
    e.applyGeometry({
      type: "box",
      position: [px, 1, pz],
      size: [1, 1, 1],
      scale: [1, ((i + 1) / total) * h, 1],
      scaleOrigin: [0.5, 1, 0.5],
    });
    // Hanging from ceiling, below the floor stairs (reversed height)
    e.applyGeometry({
      type: "box",
      position: [px, 2, pz],
      size: [1, 1, 1],
      scale: [1, ((total - i) / total) * h, 1],
      scaleOrigin: [0.5, 0, 0.5],
    });
  }

  return e.toSVG(getSvgOpts(e));
});

// ─── 13. Functional scale ───────────────
setupDemo("demo-functional-scale", (v) => {
  const s = v.size;
  const taper = v.taper;
  const e = new Heerich({
    tile: 28,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  e.applyGeometry({
    type: "box",
    position: [0, 0, 0],
    size: [s, s, s],
    scale: (x, y, z) => {
      const t = 1 - y / s;
      const f = 1 - t * taper;
      // Voxels further from center are shorter
      const cx = (x + 0.5) / s - 0.5;
      const cz = (z + 0.5) / s - 0.5;
      const dist = Math.sqrt(cx * cx + cz * cz) * 2;
      const yf = Math.max(0.05, 1 - dist * taper);
      return [f, yf, f];
    },
    scaleOrigin: (x, y, z) => [0.5, y % 2 === 0 ? 0 : 1, 0.5],
  });
  return e.toSVG(getSvgOpts(e));
});

// ─── Slopes ──────────────────────────
// A stepped pyramid. Each layer is one box whose rim is turned into ramps,
// outer corners at its four corners, and a tip on top when it narrows to one.
// Going down mirrors it with `ceiling:` pieces, hanging below the widest layer.
setupDemo("demo-slopes", (v) => {
  const n = v.height;
  const w = v.width;
  const e = new Heerich({
    tile: 26,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  // Only the bottom (ceiling) half gets dark slanted faces; the top half keeps
  // the regular fill.
  const dark = { slope: { fill: "#18191b", stroke: "var(--fill)" } };
  const fillFor = (prefix) => (prefix ? dark : undefined);
  // Transparent corners and tip: outlines only, like the transparent voxels
  // demo. Their neighbours see through them and draw the faces behind.
  const glass = v.glass === "transparent";
  const outline = {
    default: {
      fill: "none",
      stroke: "var(--text)",
      strokeWidth: "var(--stroke-w)",
    },
  };
  const halves = [];
  if (v.dir !== "down") halves.push({ prefix: "", y: (i) => n - 1 - i });
  if (v.dir !== "up") halves.push({ prefix: "ceiling:", y: (i) => n + i });
  for (const { prefix, y } of halves) {
    for (let i = 0; i < n; i++) {
      const lo = i; // layer i spans lo..hi, its rim one cell wide
      const hi = w + 2 * n - 1 - i;
      e.applyGeometry({
        type: "box",
        position: [lo, y(i), lo],
        size: [hi - lo + 1, 1, hi - lo + 1],
        style: fillFor(prefix),
        slope: (x, _, z) => {
          const ex = x === lo ? "+x" : x === hi ? "-x" : "";
          const ez = z === lo ? "+z" : z === hi ? "-z" : "";
          if (ex && ez) return prefix + "outer" + ex + ez;
          return ex || ez ? prefix + (ex || ez) : null;
        },
      });
      if (glass)
        for (const [cx, sx] of [
          [lo, "+x"],
          [hi, "-x"],
        ])
          for (const [cz, sz] of [
            [lo, "+z"],
            [hi, "-z"],
          ])
            e.applyGeometry({
              type: "box",
              position: [cx, y(i), cz],
              size: 1,
              slope: prefix + "outer" + sx + sz,
              opaque: false,
              style: outline,
            });
    }
    if (w === 1)
      e.applyGeometry({
        type: "box",
        position: [n, y(n), n],
        size: 1,
        style: glass ? outline : fillFor(prefix),
        slope: prefix + "tip",
        // A tip rises a full cell over half a cell; half its height gives
        // the same 45° as the ramps. Anchor on its flat face so it stays put.
        scale: [1, 0.5, 1],
        scaleOrigin: [0.5, prefix ? 0 : 1, 0.5],
      });
  }
  return e.toSVG(getSvgOpts(e));
});

// ─── Gentle slopes ───────────────────
// A roof whose sides climb `rise` layers, `run` cells per layer, up to a
// one-cell ridge. Each column's distance from the eaves picks its layer and
// where in that layer's slope it sits; a hip roof slopes on all four sides and
// puts outer corners, with the same heights, where two sides meet.
setupDemo("demo-gentle-slopes", (v) => {
  const { rise, run } = v;
  const hip = v.roof === "hip";
  const e = new Heerich({
    tile: 22,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  const len = rise * run; // cells per side
  const W = 2 * len + (hip ? 3 : 1);
  const D = hip ? 2 * len + 1 : 4;
  const floor = rise; // y of the bottom layer (y grows downward)
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) {
      const dx = Math.min(x, W - 1 - x);
      const dz = hip ? Math.min(z, D - 1 - z) : Infinity;
      const d = Math.min(dx, dz); // cells in from the eaves
      if (d >= len) {
        // the ridge: solid all the way up
        e.applyGeometry({
          type: "box",
          position: [x, floor - rise + 1, z],
          size: [1, rise, 1],
        });
        continue;
      }
      const layer = Math.floor(d / run);
      const k = d % run;
      if (layer > 0)
        e.applyGeometry({
          type: "box",
          position: [x, floor - layer + 1, z],
          size: [1, layer, 1],
        });
      const ex = dx === d ? (x === d ? "+x" : "-x") : "";
      const ez = dz === d ? (z === d ? "+z" : "-z") : "";
      e.applyGeometry({
        type: "box",
        position: [x, floor - layer, z],
        size: 1,
        slope: {
          side: ex && ez ? "outer" + ex + ez : ex || ez,
          from: k / run,
          to: (k + 1) / run,
        },
      });
    }
  return e.toSVG(getSvgOpts(e));
});

// ─── Content voxels ──────────────────
{
  const canvas = document
    .getElementById("demo-content")
    .querySelector(".demo-canvas");
  const word = "heerich";
  const s = 7;

  function render() {
    const e = new Heerich({
      tile: 22,
      camera: getCamera(),
      style: baseStyle,
      gap: getGap(),
    });

    let i = 0;
    for (let z = s - 1; z >= 0; z--) {
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const letter = word[i % word.length];

          e.applyGeometry({
            type: "box",
            position: [x, y, z],
            size: [1, 1, 1],
            opaque: false,
            content: `<text font-family="Aboreto" font-size="16" fill="var(--text)" text-anchor="middle" dominant-baseline="central">${letter.toUpperCase()}</text>`,
          });
          i++;
        }
      }
    }

    canvas.innerHTML = e.toSVG(getSvgOpts(e));
  }

  render();
  demos.push(render);
}

// ─── Transparent voxels ──────────────
{
  const canvas = document
    .getElementById("demo-opaque")
    .querySelector(".demo-canvas");
  function render() {
    const e = new Heerich({
      tile: 24,
      camera: getCamera(),
      style: baseStyle,
      gap: getGap(),
    });

    // Wireframe cage — fill none, opaque false
    e.applyGeometry({
      type: "box",
      position: [0, 0, 0],
      size: [5, 5, 5],
      opaque: false,
      style: {
        default: {
          fill: "none",
          stroke: "var(--text)",
          strokeWidth: "var(--stroke-w)",
        },
      },
    });

    // Solid core — added after so it overwrites the cage cells in the overlap
    e.applyGeometry({ type: "box", position: [1, 1, 1], size: [3, 3, 3] });

    canvas.innerHTML = e.toSVG(getSvgOpts(e));
  }
  render();
  demos.push(render);
}

// ─── 17. Queries ──────────────────────
setupDemo("demo-queries", (v) => {
  const e = new Heerich({
    tile: 24,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  e.applyGeometry({ type: "box", position: [0, 0, 0], size: [6, 6, 6] });
  e.removeGeometry({ type: "sphere", center: [3, 3, 6], radius: 2.5 });
  e.removeGeometry({ type: "box", position: [0, 0, 0], size: [2, 6, 3] });

  for (const voxel of e) {
    const pos = [voxel.x, voxel.y, voxel.z];
    const n = e.getNeighbors(pos);
    const open = Object.values(n).filter((v) => !v).length;

    let show = false;
    if (v.show === "exposure") show = true;
    else if (v.show === "edges") show = open >= 2;
    else if (v.show === "corners") show = open >= 3;

    if (show) {
      const t = open / 6;
      const L = Math.round(t * 100);
      e.applyStyle({
        type: "box",
        position: pos,
        size: [1, 1, 1],
        style: {
          default: {
            fill: `color-mix(in oklab, #000 ${100 - L}%, #fff)`,
          },
        },
      });
    }
  }

  return e.toSVG(getSvgOpts(e));
});

// ─── 18. findVoxels ──────────────────
setupDemo("demo-find-voxels", (v) => {
  const e = new Heerich({
    tile: 22,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });

  e.addGeometry({
    type: "box",
    position: [0, 4, 0],
    size: [7, 2, 7],
    meta: { id: "base" },
  });
  e.addGeometry({
    type: "box",
    position: [2, 1, 2],
    size: [3, 3, 3],
    meta: { id: "tower" },
  });
  for (const [px, pz] of [
    [0, 0],
    [6, 0],
    [0, 6],
    [6, 6],
  ]) {
    e.addGeometry({
      type: "box",
      position: [px, 2, pz],
      size: [1, 2, 1],
      meta: { id: "pillar" },
    });
  }

  if (v.group !== "all") {
    for (const voxel of e.findVoxels((vx) => vx.meta?.id === v.group)) {
      e.applyStyle({
        type: "box",
        position: [voxel.x, voxel.y, voxel.z],
        size: [1, 1, 1],
        style: { default: { fill: "var(--stroke-c)", stroke: "var(--fill)" } },
      });
    }
  }

  return e.toSVG(getSvgOpts(e));
});

// ─── 19. findByPosition / getVoxelInfo ───────────────
let _posQueryEngine = null;
let _posQueryOpts = {};

setupDemo("demo-find-by-pos", () => {
  _posQueryEngine = new Heerich({
    tile: 24,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  _posQueryEngine.addGeometry({
    type: "box",
    position: [0, 4, 0],
    size: [7, 2, 7],
  });
  _posQueryEngine.addGeometry({
    type: "box",
    position: [1, 2, 1],
    size: [5, 2, 5],
  });
  _posQueryEngine.addGeometry({
    type: "box",
    position: [2, 0, 2],
    size: [3, 2, 3],
  });
  // the mouse is looked up in the faces as drawn (turned and cut)
  _posQueryOpts = getSvgOpts(_posQueryEngine);
  return _posQueryEngine.toSVG(_posQueryOpts);
});

{
  const demoRoot = document.getElementById("demo-find-by-pos");
  const canvas = demoRoot.querySelector(".demo-canvas");
  const infoEl = demoRoot.querySelector(".demo-hit-info");

  canvas.addEventListener("mousemove", (e) => {
    if (!_posQueryEngine) return;
    const svg = canvas.querySelector("svg");
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const { x: svgX, y: svgY } = pt.matrixTransform(
      svg.getScreenCTM().inverse(),
    );

    const hit = _posQueryEngine.findByPosition([svgX, svgY], _posQueryOpts);

    let overlay = svg.querySelector("#heerich-hit-overlay");
    if (!overlay) {
      overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
      overlay.setAttribute("id", "heerich-hit-overlay");
      overlay.setAttribute("pointer-events", "none");
      svg.appendChild(overlay);
    }

    if (hit) {
      const { center2D, bounds2D, normalizedCenter2D } =
        _posQueryEngine.getVoxelInfo(hit.voxel, _posQueryOpts);
      const allFaces = _posQueryEngine.getFaces(_posQueryOpts);
      let svg_parts = "";
      for (const face of allFaces) {
        if (face.voxel !== hit.voxel || face === hit.face) continue;
        const fd = face.points.data;
        const pts = [];
        for (let i = 0; i < fd.length; i += 2)
          pts.push(`${fd[i]},${fd[i + 1]}`);
        svg_parts += `<polygon points="${pts.join(" ")}" fill="none" stroke="var(--stroke-c)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      }
      const d = hit.face.points.data;
      const hitPts = [];
      for (let i = 0; i < d.length; i += 2) hitPts.push(`${d[i]},${d[i + 1]}`);
      svg_parts += `<polygon points="${hitPts.join(" ")}" fill="var(--stroke-c)" stroke="var(--stroke-c)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      if (bounds2D) {
        svg_parts += `<rect x="${bounds2D.x}" y="${bounds2D.y}" width="${bounds2D.w}" height="${bounds2D.h}" fill="none" stroke="var(--stroke-c)" stroke-width="1" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>`;
      }
      svg_parts += `<line x1="${center2D.x - 3}" y1="${center2D.y - 3}" x2="${center2D.x + 3}" y2="${center2D.y + 3}" stroke="var(--fill)" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      svg_parts += `<line x1="${center2D.x + 3}" y1="${center2D.y - 3}" x2="${center2D.x - 3}" y2="${center2D.y + 3}" stroke="var(--fill)" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      svg_parts += `<line x1="${center2D.x - 2.5}" y1="${center2D.y - 2.5}" x2="${center2D.x + 2.5}" y2="${center2D.y + 2.5}" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      svg_parts += `<line x1="${center2D.x + 2.5}" y1="${center2D.y - 2.5}" x2="${center2D.x - 2.5}" y2="${center2D.y + 2.5}" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      overlay.innerHTML = svg_parts;

      if (infoEl) {
        const nc = normalizedCenter2D;
        infoEl.innerHTML =
          `<span class="hit-field"><span class="hit-label">voxel</span> [${hit.voxel.x}, ${hit.voxel.y}, ${hit.voxel.z}]</span>` +
          `<span class="hit-field"><span class="hit-label">face</span> ${hit.face.type}</span>` +
          (nc
            ? `<span class="hit-field"><span class="hit-label">pos</span> ${(nc.x * 100).toFixed(1)}%, ${(nc.y * 100).toFixed(1)}%</span>`
            : "");
      }
    } else {
      overlay.innerHTML = "";
      if (infoEl)
        infoEl.innerHTML =
          '<span class="hit-placeholder">hover over the scene</span>';
    }
  });

  canvas.addEventListener("mouseleave", () => {
    const overlay = canvas.querySelector("#heerich-hit-overlay");
    if (overlay) overlay.innerHTML = "";
    if (infoEl)
      infoEl.innerHTML =
        '<span class="hit-placeholder">hover over the scene</span>';
  });
}

// ─── Shared animation utilities ──────
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function animateHoles({ canvas, holes, drawHoles, duration, stagger, onDone }) {
  let id = (canvas._animId = (canvas._animId || 0) + 1);
  const startTime = performance.now();

  function step(now) {
    if (id !== canvas._animId) return;
    let allDone = true;

    const depths = holes.map((h, i) => {
      const elapsed = now - startTime - i * stagger;
      if (elapsed <= 0) {
        allDone = false;
        return 0;
      }
      if (elapsed >= duration) return h.targetDepth;
      allDone = false;
      return h.targetDepth * easeInOutCubic(elapsed / duration);
    });

    drawHoles(depths);
    if (!allDone) requestAnimationFrame(step);
    else if (onDone) onDone();
  }

  requestAnimationFrame(step);
}

// ─── 10. Animation ───────────────────
{
  const root = document.getElementById("demo-animate");
  const canvas = root.querySelector(".demo-canvas");
  const btnPlay = root.querySelector('[data-bind="play"]');
  const btnReset = root.querySelector('[data-bind="reset"]');
  const durInput = root.querySelector('[data-bind="dur"]');
  const staggerInput = root.querySelector('[data-bind="stagger"]');
  const modeInput = root.querySelector('[data-bind="mode"]');

  const holes = [
    { x: 1, y: 1, w: 3, h: 4, targetDepth: 6 },
    { x: 5, y: 0, w: 3, h: 3, targetDepth: 5 },
    { x: 2, y: 5, w: 4, h: 3, targetDepth: 4 },
  ];

  const holeAt = (x, y) =>
    holes.findIndex(
      (h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h,
    );

  // Stepped: round each hole to whole layers and carve stored voxels
  function drawStepped(depths) {
    const e = new Heerich({
      tile: 26,
      camera: getCamera(),
      style: baseStyle,
      gap: getGap(),
    });
    e.applyGeometry({ type: "box", position: [0, 0, 0], size: [10, 8, 7] });
    holes.forEach((h, i) => {
      const d = Math.round(depths[i]);
      if (d > 0)
        e.removeGeometry({
          type: "box",
          position: [h.x, h.y, 0],
          size: [h.w, h.h, d],
        });
    });
    draw(canvas, e, getSvgOpts(e));
  }

  // Smooth: keep the fractional depth and let nearZ place the floor there.
  // A gap needs whole voxels, so this mode ignores it.
  function drawSmooth(depths) {
    const e = new Heerich({ tile: 26, camera: getCamera(), style: baseStyle });
    // no stored voxels to measure, and renderTest can't close a cut
    const opts = getSvgOpts(e, {
      bounds: [
        [0, 0, 0],
        [10, 8, 7],
      ],
      clip: false,
    });
    opts.faces = e.renderTest({
      transform: opts.transform,
      bounds: [
        [0, 0, 0],
        [10, 8, 7],
      ],
      test: (x, y, z) => {
        if (x < 0 || x >= 10 || y < 0 || y >= 8 || z < 0 || z >= 7)
          return false;
        const i = holeAt(x, y);
        return i < 0 || z >= Math.ceil(depths[i]);
      },
      nearZ: (x, y, z) => {
        const i = holeAt(x, y);
        return i >= 0 && z === Math.ceil(depths[i]) ? depths[i] : z;
      },
    });
    draw(canvas, e, opts);
  }

  function drawHoles(depths) {
    if (modeInput.value === "smooth") drawSmooth(depths);
    else drawStepped(depths);
  }

  function drawStatic() {
    drawHoles(holes.map(() => 0));
  }

  function play() {
    animateHoles({
      canvas,
      holes,
      drawHoles,
      duration: parseFloat(durInput.value),
      stagger: parseFloat(staggerInput.value),
    });
  }

  btnPlay.addEventListener("click", play);
  modeInput.addEventListener("change", play);

  btnReset.addEventListener("click", () => {
    canvas._animId = (canvas._animId || 0) + 1;
    drawStatic();
  });

  [durInput, staggerInput].forEach((el) => {
    el.addEventListener("input", () => {
      const span = el.closest(".control-label").querySelector(".control-value");
      if (span) span.textContent = el.value;
    });
  });

  drawStatic();
  demos.push(drawStatic);
}

// ─── 11. Combined — full-width hero-like scene ─────
{
  const root = document.getElementById("demo-combined");
  const canvas = root.querySelector(".demo-canvas");
  let animId = 0;
  let scene = null;

  function rand(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function randomizeScene() {
    const availW = root.clientWidth;
    const availH = root.clientHeight;
    const gridSize = Math.round(availW * (rand(4, 7) / 100));
    const cols = Math.ceil(availW / gridSize);
    const rows = Math.ceil((availH * 0.6) / gridSize);

    const numHoles = rand(2, 4);
    const holes = [];
    for (let i = 0; i < numHoles; i++) {
      const w = Math.max(2, Math.floor(cols * (0.1 + Math.random() * 0.4)));
      const h = Math.max(2, Math.floor(rows * (0.1 + Math.random() * 0.4)));
      const x = Math.floor(Math.random() * Math.max(1, cols - w));
      const y = Math.floor(Math.random() * Math.max(1, rows - h));
      const targetDepth = rand(4, 15);
      holes.push({ x, y, w, h, targetDepth });
    }

    // Towers inside holes
    const towers = [];
    holes.forEach((h, holeIndex) => {
      const numTowers = rand(1, 3);
      for (let t = 0; t < numTowers; t++) {
        const tw = Math.max(1, rand(1, Math.floor(h.w * 0.3)));
        const th = Math.max(1, rand(1, Math.floor(h.h * 0.3)));
        const tx = h.x + rand(1, Math.max(1, h.w - tw - 1));
        const ty = h.y + rand(1, Math.max(1, h.h - th - 1));
        const targetHeight = rand(
          Math.floor(h.targetDepth * 0.3),
          h.targetDepth,
        );
        towers.push({
          x: tx,
          y: ty,
          w: tw,
          h: th,
          holeIndex,
          targetHeight,
          overflow: false,
        });
      }
    });

    // Pick 1-2 random towers across all holes to overflow by 1
    const overflowCount = Math.min(towers.length, rand(1, 2));
    const shuffled = [...towers].sort(() => Math.random() - 0.5);
    for (let i = 0; i < overflowCount; i++) {
      const t = shuffled[i];
      const hole = holes[t.holeIndex];
      t.targetHeight = hole.targetDepth + 1;
      t.overflow = true;
    }

    // Random color for walls
    const color = [Math.random(), Math.random(), Math.random()];
    const m = Math.max(...color);
    if (m > 0) color.forEach((_, i) => (color[i] /= m));

    // Carve-out spheres — positioned at edges/corners of holes, growing outward
    const carves = [];
    holes.forEach((h) => {
      const numCarves = rand(2, 5);
      for (let c = 0; c < numCarves; c++) {
        const cx = h.x + rand(0, h.w - 1) + 0.5;
        const cy = h.y + rand(0, h.h - 1) + 0.5;
        const cz = rand(1, Math.floor(h.targetDepth * 0.7)) + 0.5;
        const targetR = rand(
          2,
          Math.max(2, Math.floor(Math.min(h.w, h.h) * 0.6)),
        );
        carves.push({ cx, cy, cz, targetR });
      }
    });

    scene = { gridSize, cols, rows, holes, towers, color, carves };
  }

  function drawScene(depths, towerHeights, carveRadii) {
    const { gridSize, cols, rows, holes, towers, color, carves } = scene;
    const maxDepth = Math.max(...holes.map((h) => h.targetDepth), 1);

    const e = new Heerich({
      tile: gridSize,
      camera: getCamera(),
      style: baseStyle,
      gap: getGap(),
    });

    e.applyGeometry({
      type: "box",
      position: [0, 0, 0],
      size: [cols, rows, maxDepth],
    });

    // Carve holes — style paints the newly exposed neighbor faces
    const wallFill = { fill: "var(--stroke-c)", stroke: "var(--fill)" };
    holes.forEach((h, i) => {
      const d = depths[i];
      if (d <= 0.01) return;
      const full = Math.ceil(d);
      const frac = d - Math.floor(d);
      // Remove full + partial layer
      e.removeGeometry({
        type: "box",
        position: [h.x, h.y, 0],
        size: [h.w, h.h, full],
        style: { default: wallFill },
      });
      // Add back a shrinking floor slab for the fractional part
      if (frac > 0.01) {
        e.applyGeometry({
          type: "box",
          position: [h.x, h.y, full - 1],
          size: [h.w, h.h, 1],
          scale: [1, 1, 1 - frac],
          scaleOrigin: [0.5, 0.5, 1],
          style: { default: wallFill },
        });
      }
    });

    // Add towers — all faces use outline color
    if (towerHeights) {
      towers.forEach((tower, idx) => {
        const th = towerHeights[idx];
        if (th <= 0.01) return;
        const holeDepth = Math.round(depths[tower.holeIndex]);
        const fullH = Math.floor(th);
        const frac = th - fullH;
        const startZ = tower.overflow
          ? holeDepth - fullH
          : Math.max(0, holeDepth - fullH);
        const totalH = tower.overflow ? fullH : holeDepth - startZ;
        if (totalH > 0)
          e.applyGeometry({
            type: "box",
            position: [tower.x, tower.y, startZ],
            size: [tower.w, tower.h, totalH],
            style: { default: wallFill },
          });
        // Fractional layer growing on top (toward lower z)
        if (frac > 0.01) {
          const fracZ = startZ - 1;
          e.applyGeometry({
            type: "box",
            position: [tower.x, tower.y, fracZ],
            size: [tower.w, tower.h, 1],
            scale: [1, 1, frac],
            scaleOrigin: [0.5, 0.5, 1],
            style: { default: wallFill },
          });
        }
      });
    }

    // Carve-out spheres — boolean subtract from inside out
    if (carveRadii && carves) {
      carves.forEach((c, i) => {
        const r = carveRadii[i];
        if (r > 0.3) {
          e.removeGeometry({
            type: "sphere",
            center: [c.cx, c.cy, c.cz],
            radius: r,
          });
        }
      });
    }

    draw(canvas, e, getSvgOpts(e));
  }

  function animateIn() {
    const id = ++animId;
    const holeTargets = scene.holes.map((h) => h.targetDepth);
    const towerTargets = scene.towers.map((t) => t.targetHeight);
    const carveTargets = scene.carves.map((c) => c.targetR);
    const holeDur = 800,
      holeStagger = 200;
    const towerDur = 600,
      towerStagger = 80;
    const carveDur = 1000,
      carveStagger = 150;
    const startTime = performance.now();
    const holeEndTime = holeDur + (scene.holes.length - 1) * holeStagger;
    const towerStartDelay = holeEndTime + 200;
    const towerEndTime =
      towerStartDelay + towerDur + (scene.towers.length - 1) * towerStagger;
    const carveStartDelay = towerEndTime + 300;

    function ease(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function step(now) {
      if (id !== animId) return;
      let allDone = true;

      const depths = holeTargets.map((target, i) => {
        const elapsed = now - startTime - i * holeStagger;
        if (elapsed <= 0) {
          allDone = false;
          return 0;
        }
        if (elapsed >= holeDur) return target;
        allDone = false;
        return target * ease(elapsed / holeDur);
      });

      const towerHeights = towerTargets.map((target, i) => {
        const elapsed = now - startTime - towerStartDelay - i * towerStagger;
        if (elapsed <= 0) {
          allDone = false;
          return 0;
        }
        if (elapsed >= towerDur) return target;
        allDone = false;
        return target * ease(elapsed / towerDur);
      });

      const carveRadii = carveTargets.map((target, i) => {
        const elapsed = now - startTime - carveStartDelay - i * carveStagger;
        if (elapsed <= 0) {
          allDone = false;
          return 0;
        }
        if (elapsed >= carveDur) return target;
        allDone = false;
        return target * ease(elapsed / carveDur);
      });

      drawScene(depths, towerHeights, carveRadii);
      if (!allDone) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function init() {
    randomizeScene();
    animateIn();
  }

  root.addEventListener("click", init);
  init();
  demos.push(() => {
    randomizeScene();
    drawScene(
      scene.holes.map((h) => h.targetDepth),
      scene.towers.map((t) => t.targetHeight),
      scene.carves.map((c) => c.targetR),
    );
  });
}

// ─── 12. Heerich Gallery ─────────────

// Helper for gallery pieces — no controls, just render
function galleryDemo(id, buildFn) {
  const canvas = document.getElementById(id).querySelector(".demo-canvas");
  function render() {
    canvas.innerHTML = buildFn();
  }
  render();
  demos.push(render);
}

// 1. Kreuzplastik (Brass Cross) — interlocking cross with square holes
galleryDemo("demo-heerich-cross", () => {
  const e = new Heerich({
    tile: 22,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  const arm = 3,
    len = 11,
    d = 1;
  const o = (len - arm) / 2;
  const c = [(len - 1) / 2, (len - 1) / 2, (d - 1) / 2];

  // Build one arm with hole
  e.applyGeometry({ type: "box", position: [o, 0, 0], size: [arm, len, d] });
  e.applyGeometry({
    type: "box",
    position: [o + 1, 1, 0],
    size: [1, len - 2, d],
    mode: "subtract",
  });

  // Second arm — rotated 90° around Z
  e.applyGeometry({
    type: "box",
    position: [o, 0, 0],
    size: [arm, len, d],
    rotate: { axis: "z", turns: 1, center: c },
  });
  e.applyGeometry({
    type: "box",
    position: [o + 1, 1, 0],
    size: [1, len - 2, d],
    mode: "subtract",
    rotate: { axis: "z", turns: 1, center: c },
  });

  // Third arm — rotated 90° around Y
  e.applyGeometry({
    type: "box",
    position: [o, 0, 0],
    size: [arm, len, d],
    rotate: { axis: "x", turns: 1, center: c },
  });
  e.applyGeometry({
    type: "box",
    position: [o + 1, 1, 0],
    size: [1, len - 2, d],
    mode: "subtract",
    rotate: { axis: "x", turns: 1, center: c },
  });

  return e.toSVG(getSvgOpts(e));
});

// ─── Favicon from cross demo ─────────────
let faviconTimer = null;
const faviconLink = document.createElement("link");
faviconLink.rel = "icon";
faviconLink.type = "image/svg+xml";
document.head.appendChild(faviconLink);

function updateFavicon() {
  const crossCanvas = document
    .getElementById("demo-heerich-cross")
    ?.querySelector(".demo-canvas");
  const svg = crossCanvas?.querySelector("svg");
  if (!svg) return;
  const clone = svg.cloneNode(true);
  clone.removeAttribute("style");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // Bake in colors so the favicon works outside page context
  clone.querySelectorAll("[fill]").forEach((el) => {
    const computed = getComputedStyle(el).fill;
    if (computed) el.setAttribute("fill", computed);
  });
  clone.querySelectorAll("[stroke]").forEach((el) => {
    const computed = getComputedStyle(el).stroke;
    if (computed) el.setAttribute("stroke", computed);
  });
  faviconLink.href =
    "data:image/svg+xml," + encodeURIComponent(clone.outerHTML);
}

function scheduleFaviconUpdate() {
  clearTimeout(faviconTimer);
  faviconTimer = setTimeout(updateFavicon, 200);
}

// Initial favicon after first render
scheduleFaviconUpdate();

// 2. Schachbrett (Checkerboard) — 3x3 grid, alternating cubes removed
galleryDemo("demo-heerich-checker", () => {
  const e = new Heerich({
    tile: 26,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });
  const s = 3;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 3; z++) {
        if ((x + y + z) % 2 === 0) {
          e.applyGeometry({
            type: "box",
            position: [x * s, y * s, z * s],
            size: [s, s, s],
          });
        }
      }
    }
  }
  return e.toSVG(getSvgOpts(e));
});

// 3. Stepped Block
galleryDemo("demo-heerich-stepped", () => {
  const e = new Heerich({
    tile: 32,
    camera: getCamera(),
    style: baseStyle,
    gap: getGap(),
  });

  e.applyGeometry({ type: "box", position: [-4, -4, -4], size: [8, 8, 8] });
  // Carve steps into the Top-Right-Front corner (+X, -Y, -Z)
  e.removeGeometry({ type: "box", position: [2, -4, -2], size: [2, 2, 2] });
  e.removeGeometry({ type: "box", position: [0, -4, -4], size: [2, 2, 2] });
  e.removeGeometry({ type: "box", position: [2, -4, -4], size: [2, 4, 2] });

  return e.toSVG(getSvgOpts(e));
});

// ─── Footer heart ────────────────────
{
  const heartContainer = document.getElementById("footer-heart");

  function renderHeart() {
    const e = new Heerich({
      tile: 52,
      camera: getCamera(),
      style: baseStyle,
      gap: getGap(),
    });

    const s = 4;
    e.applyGeometry({
      type: "fill",
      bounds: [
        [-s, -s, -s],
        [s + 1, s + 1, s + 1],
      ],
      test: (x, y, z) => {
        const nx = x / s;
        const ny = -y / s;
        const nz = z / s;
        return (
          nx * nx + (1.3 * ny - Math.sqrt(Math.abs(nx))) ** 2 + nz * nz <= 1
        );
      },
    });

    heartContainer.innerHTML = e.toSVG(getSvgOpts(e));
  }

  renderHeart();
  demos.push(renderHeart);
}
