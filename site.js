import { Heerich } from "./src/heerich.js";
import { version } from "./package.json";
import { initHero } from "./hero.js";
import { highlight } from "https://esm.sh/sugar-high";
document.querySelectorAll("pre code").forEach((el) => {
  el.innerHTML = highlight(el.textContent);
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
  const valueSpan = wrap.parentElement.querySelector(".control-value");

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
  camAngleLabel.style.display = perspective ? "none" : "";
  camYLabel.style.display = "none";
  camPerspectiveControl.hidden = !perspective;
  updatePerspectiveGrid();
}
syncControlVisibility();

[camProj, camAngle, camY, camDist].forEach((el) => {
  const evt = el.tagName === "SELECT" ? "change" : "input";
  el.addEventListener(evt, () => {
    const span = el.parentElement.querySelector(".control-value");
    if (span) span.textContent = el.value;
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
    camProj.value = Math.random() > 0.5 ? "perspective" : "oblique";
    camAngle.value = Math.round(Math.random() * 360);
    camDist.value = (2 + Math.random() * 18).toFixed(1);
    camY.value = (1 + Math.random() * 9).toFixed(1);
    [camAngle, camDist, camY].forEach((el) => {
      const span = el.parentElement.querySelector(".control-value");
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
const baseStyle = {
  fill: "var(--fill)",
  stroke: "var(--stroke-c)",
  strokeWidth: "var(--stroke-w)",
};
function getSvgOpts() {
  const r = parseFloat(camOutline.value);
  if (r > 0) {
    return {
      padding: 30 + r * 2,
      prepend: `<defs><filter id="cel"><feMorphology in="SourceAlpha" operator="dilate" radius="${r}" result="thick"/><feFlood flood-color="${camOutlineColor.value}"/><feComposite in2="thick" operator="in" result="border"/><feMerge><feMergeNode in="border"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#cel)">`,
      append: `</g>`,
      faceAttributes: () => ({ "vector-effect": "non-scaling-stroke" }),
    };
  }
  return {
    padding: 30,
    faceAttributes: () => ({ "vector-effect": "non-scaling-stroke" }),
  };
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
  const span = camStroke.parentElement.querySelector(".control-value");
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
  const span = camOutline.parentElement.querySelector(".control-value");
  if (span) span.textContent = camOutline.value;
  debouncedRerenderAll();
});
camOutlineColor.addEventListener("input", () => debouncedRerenderAll());
syncStyleVars();

function setupDemo(id, buildFn) {
  const root = document.getElementById(id);
  const canvas = root.querySelector(".demo-canvas");
  const controls = {};

  root.querySelectorAll("[data-bind]").forEach((el) => {
    const key = el.dataset.bind;
    controls[key] = el;

    const update = () => {
      const span = el.parentElement.querySelector(".control-value");
      if (span) span.textContent = el.value;
      render();
    };

    if (el.tagName === "INPUT" && el.type === "range")
      el.addEventListener("input", update);
    else if (el.tagName === "INPUT" && el.type === "color")
      el.addEventListener("input", update);
    else if (el.tagName === "SELECT") el.addEventListener("change", update);
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
  });
  e.applyGeometry({ type: 'box', position: [0, 0, 0], size: [v.w, v.h, v.d] });
  return e.toSVG(getSvgOpts());
});

// ─── Alignment ───────────────────────
setupDemo("demo-align", (v) => {
  const e = new Heerich({
    tile: 26,
    camera: getCamera(),
    style: baseStyle,
  });
  const big = [6, 6, 6];
  const small = [2, 2, 2];
  const ox = big[0];

  e.applyGeometry({ type: 'box', position: [0, 0, 0], size: big });

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
    type: 'box',
    position: pos,
    size: small,
    style: { default: { fill: "#18191b", stroke: "var(--fill)" } },
  });

  return e.toSVG(getSvgOpts());
});

// ─── 4. Spheres ──────────────────────
setupDemo("demo-sphere", (v) => {
  const r = v.r;
  const e = new Heerich({
    tile: 28,
    camera: getCamera(),
    style: baseStyle,
  });
  e.applyGeometry({ type: 'sphere', center: [r, r, r], radius: r });
  return e.toSVG(getSvgOpts());
});

// ─── 5. Lines ────────────────────────
setupDemo("demo-line", (v) => {
  const e = new Heerich({
    tile: 26,
    camera: getCamera(),
    style: {
      fill: "var(--fill)",
      stroke: "var(--stroke-c)",
      strokeWidth: "var(--stroke-w)",
    },
  });
  e.applyGeometry({
    type: 'line',
    from: [0, 0, 0],
    to: [v.ex, 6, v.ez],
    radius: v.r,
    shape: v.shape,
  });
  return e.toSVG(getSvgOpts());
});

// ─── Custom shapes ──────────────────
setupDemo("demo-custom-shape", (v) => {
  const s = v.size;
  const e = new Heerich({
    tile: 28,
    camera: getCamera(),
    style: baseStyle,
  });
  e.applyGeometry({
    type: 'fill',
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
  return e.toSVG(getSvgOpts());
});

// ─── 6. Boolean operations ──────────────
setupDemo("demo-boolean", (v) => {
  const e = new Heerich({
    tile: 26,
    camera: getCamera(),
    style: baseStyle,
  });
  e.applyGeometry({ type: 'box', position: [0, 0, 0], size: [6, 6, 6] });
  e.applyGeometry({
    type: 'sphere',
    center: [v.offset, 3, 3],
    radius: 3.5,
    mode: v.mode,
    style: { default: { fill: "#18191b", stroke: "var(--fill)" } },
  });
  return e.toSVG(getSvgOpts());
});

// ─── 7. Rotation ────────────────────────
setupDemo("demo-rotation", (v) => {
  const e = new Heerich({
    tile: 26,
    camera: getCamera(),
    style: baseStyle,
  });
  e.applyGeometry({ type: 'box', position: [0, 0, 0], size: [2, 6, 2] });
  e.applyGeometry({ type: 'box', position: [0, 0, 0], size: [6, 2, 2] });
  if (v.turns > 0) {
    e.rotate({ axis: v.axis, turns: v.turns });
  }
  return e.toSVG(getSvgOpts());
});

// ─── 8. Grouped voxels ──────────────────
setupDemo("demo-group", (v) => {
  const e = new Heerich({
    tile: 26,
    camera: getCamera(),
    style: baseStyle,
  });
  const gs = v.gs;

  // Smooth solid — strokeWidth: 0 removes internal grid lines
  e.applyGeometry({
    type: 'box',
    position: [0, 0, 0],
    size: [gs, gs, gs],
    style: {
      default: { fill: camOutlineColor.value, stroke: camOutlineColor.value },
    },
  });

  // 1x1x1 voxels bordering all four sides, offset 1 back
  for (let i = 0; i < gs + 2; i++) {
    e.applyGeometry({ type: 'box', position: [i - 1, -1, 1], size: [1, 1, 1] }); // top edge
    e.applyGeometry({ type: 'box', position: [i - 1, gs, 1], size: [1, 1, 1] }); // bottom edge
    e.applyGeometry({ type: 'box', position: [-1, i - 1, 1], size: [1, 1, 1] }); // left edge
    e.applyGeometry({ type: 'box', position: [gs, i - 1, 1], size: [1, 1, 1] }); // right edge
  }

  return e.toSVG(getSvgOpts());
});

// ─── 9. Styles ───────────────────────
setupDemo("demo-style", (v) => {
  const e = new Heerich({
    tile: 30,
    camera: getCamera(),
    style: {
      fill: "var(--fill)",
      stroke: "#333",
      strokeWidth: "var(--stroke-w)",
    },
  });
  e.applyGeometry({
    type: 'box',
    position: [0, 0, 0],
    size: [5, 5, 5],
    style: {
      top: { fill: v.top },
      front: { fill: v.front },
      right: { fill: v.right },
    },
  });
  return e.toSVG(getSvgOpts());
});

// ─── 10. SVG styles ───────────────────
setupDemo("demo-svg-styles", (v) => {
  const e = new Heerich({
    tile: 28,
    camera: getCamera(),
    style: baseStyle,
  });
  e.applyGeometry({
    type: 'box',
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
    type: 'box',
    position: [5, 0, 0],
    size: [4, 4, 4],
    style: { default: { opacity: 1 } },
  });
  return e.toSVG(getSvgOpts());
});

// ─── 11. Functional ───────────────────
const hueStart = Math.random() * 360;
setupDemo("demo-functional", (v) => {
  const s = v.s;
  const hueRange = v.hue;
  const e = new Heerich({
    tile: 28,
    camera: getCamera(),
    style: {
      fill: "var(--fill)",
      stroke: "var(--stroke-c)",
      strokeWidth: "var(--stroke-w)",
    },
  });
  e.applyGeometry({
    type: 'box',
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
  return e.toSVG(getSvgOpts());
});

// ─── 12. Voxel scaling ──────────────────
setupDemo("demo-scale", (v) => {
  const h = v.height;
  const e = new Heerich({
    tile: 30,
    camera: getCamera(),
    style: baseStyle,
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
      type: 'box',
      position: [px, 1, pz],
      size: [1, 1, 1],
      scale: [1, ((i + 1) / total) * h, 1],
      scaleOrigin: [0.5, 1, 0.5],
    });
    // Hanging from ceiling, below the floor stairs (reversed height)
    e.applyGeometry({
      type: 'box',
      position: [px, 2, pz],
      size: [1, 1, 1],
      scale: [1, ((total - i) / total) * h, 1],
      scaleOrigin: [0.5, 0, 0.5],
    });
  }

  return e.toSVG(getSvgOpts());
});

// ─── 13. Functional scale ───────────────
setupDemo("demo-functional-scale", (v) => {
  const s = v.size;
  const taper = v.taper;
  const e = new Heerich({
    tile: 28,
    camera: getCamera(),
    style: baseStyle,
  });
  e.applyGeometry({
    type: 'box',
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
  return e.toSVG(getSvgOpts());
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
      style: {
        fill: "var(--fill)",
        stroke: "var(--stroke-c)",
        strokeWidth: "var(--stroke-w)",
      },
    });

    let i = 0;
    for (let z = s - 1; z >= 0; z--) {
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const letter = word[i % word.length];

          e.applyGeometry({
            type: 'box',
            position: [x, y, z],
            size: [1, 1, 1],
            opaque: false,
            content: `<text font-family="Aboreto" font-size="16" fill="var(--text)" text-anchor="middle" dominant-baseline="central">${letter.toUpperCase()}</text>`,
          });
          i++;
        }
      }
    }

    canvas.innerHTML = e.toSVG(getSvgOpts());
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
    });

    // Wireframe cage — fill none, opaque false
    e.applyGeometry({
      type: 'box',
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
    e.applyGeometry({ type: 'box', position: [1, 1, 1], size: [3, 3, 3] });

    canvas.innerHTML = e.toSVG(getSvgOpts());
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
  });
  e.applyGeometry({ type: 'box', position: [0, 0, 0], size: [6, 6, 6] });
  e.removeGeometry({ type: 'sphere', center: [3, 3, 6], radius: 2.5 });
  e.removeGeometry({ type: 'box', position: [0, 0, 0], size: [2, 6, 3] });

  e.forEach((voxel, pos) => {
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
        type: 'box',
        position: pos,
        size: [1, 1, 1],
        style: {
          default: {
            fill: `color-mix(in oklab, #000 ${100 - L}%, #fff)`,
          },
        },
      });
    }
  });

  return e.toSVG(getSvgOpts());
});

// ─── Shared animation utilities ──────
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function animateHoles({
  canvas,
  holes,
  buildScene,
  duration,
  stagger,
  onDone,
}) {
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

    canvas.innerHTML = buildScene(depths);
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

  const holes = [
    { x: 1, y: 1, w: 3, h: 4, targetDepth: 6 },
    { x: 5, y: 0, w: 3, h: 3, targetDepth: 5 },
    { x: 2, y: 5, w: 4, h: 3, targetDepth: 4 },
  ];

  function buildScene(depths) {
    const e = new Heerich({
      tile: 26,
      camera: getCamera(),
      style: baseStyle,
    });
    e.applyGeometry({ type: 'box', position: [0, 0, 0], size: [10, 8, 6] });
    holes.forEach((h, i) => {
      const d = Math.round(depths[i]);
      if (d > 0) e.removeGeometry({ type: 'box', position: [h.x, h.y, 0], size: [h.w, h.h, d] });
    });
    return e.toSVG(getSvgOpts());
  }

  function drawStatic() {
    canvas.innerHTML = buildScene(holes.map(() => 0));
  }

  btnPlay.addEventListener("click", () => {
    animateHoles({
      canvas,
      holes,
      buildScene,
      duration: parseFloat(durInput.value),
      stagger: parseFloat(staggerInput.value),
    });
  });

  btnReset.addEventListener("click", () => {
    canvas._animId = (canvas._animId || 0) + 1;
    drawStatic();
  });

  [durInput, staggerInput].forEach((el) => {
    el.addEventListener("input", () => {
      const span = el.parentElement.querySelector(".control-value");
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

  function buildScene(depths, towerHeights, carveRadii) {
    const { gridSize, cols, rows, holes, towers, color, carves } = scene;
    const maxDepth = Math.max(...holes.map((h) => h.targetDepth), 1);

    const e = new Heerich({
      tile: gridSize,
      camera: getCamera(),
      style: {
        fill: "var(--fill)",
        stroke: "var(--stroke-c)",
        strokeWidth: "var(--stroke-w)",
      },
    });

    e.applyGeometry({ type: 'box', position: [0, 0, 0], size: [cols, rows, maxDepth] });

    // Carve holes — style paints the newly exposed neighbor faces
    const wallFill = { fill: "var(--stroke-c)", stroke: "var(--fill)" };
    holes.forEach((h, i) => {
      const d = depths[i];
      if (d <= 0.01) return;
      const full = Math.ceil(d);
      const frac = d - Math.floor(d);
      // Remove full + partial layer
      e.removeGeometry({
        type: 'box',
        position: [h.x, h.y, 0],
        size: [h.w, h.h, full],
        style: { default: wallFill },
      });
      // Add back a shrinking floor slab for the fractional part
      if (frac > 0.01) {
        e.applyGeometry({
          type: 'box',
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
            type: 'box',
            position: [tower.x, tower.y, startZ],
            size: [tower.w, tower.h, totalH],
            style: { default: wallFill },
          });
        // Fractional layer growing on top (toward lower z)
        if (frac > 0.01) {
          const fracZ = startZ - 1;
          e.applyGeometry({
            type: 'box',
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
          e.removeGeometry({ type: 'sphere', center: [c.cx, c.cy, c.cz], radius: r });
        }
      });
    }

    return e.toSVG(getSvgOpts());
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

      canvas.innerHTML = buildScene(depths, towerHeights, carveRadii);
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
    canvas.innerHTML = buildScene(
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
    style: {
      fill: "var(--fill)",
      stroke: "var(--stroke-c)",
      strokeWidth: "var(--stroke-w)",
    },
  });
  const arm = 3,
    len = 11,
    d = 1;
  const o = (len - arm) / 2;
  const c = [(len - 1) / 2, (len - 1) / 2, (d - 1) / 2];

  // Build one arm with hole
  e.applyGeometry({ type: 'box', position: [o, 0, 0], size: [arm, len, d] });
  e.applyGeometry({
    type: 'box',
    position: [o + 1, 1, 0],
    size: [1, len - 2, d],
    mode: "subtract",
  });

  // Second arm — rotated 90° around Z
  e.applyGeometry({
    type: 'box',
    position: [o, 0, 0],
    size: [arm, len, d],
    rotate: { axis: "z", turns: 1, center: c },
  });
  e.applyGeometry({
    type: 'box',
    position: [o + 1, 1, 0],
    size: [1, len - 2, d],
    mode: "subtract",
    rotate: { axis: "z", turns: 1, center: c },
  });

  // Third arm — rotated 90° around Y
  e.applyGeometry({
    type: 'box',
    position: [o, 0, 0],
    size: [arm, len, d],
    rotate: { axis: "x", turns: 1, center: c },
  });
  e.applyGeometry({
    type: 'box',
    position: [o + 1, 1, 0],
    size: [1, len - 2, d],
    mode: "subtract",
    rotate: { axis: "x", turns: 1, center: c },
  });

  return e.toSVG(getSvgOpts());
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
    style: {
      fill: "var(--fill)",
      stroke: "var(--stroke-c)",
      strokeWidth: "var(--stroke-w)",
    },
  });
  const s = 3;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 3; z++) {
        if ((x + y + z) % 2 === 0) {
          e.applyGeometry({ type: 'box', position: [x * s, y * s, z * s], size: [s, s, s] });
        }
      }
    }
  }
  return e.toSVG(getSvgOpts());
});

// 3. Stepped Block
galleryDemo("demo-heerich-stepped", () => {
  const e = new Heerich({
    tile: 32,
    camera: getCamera(),
    style: {
      fill: "var(--fill)",
      stroke: "var(--stroke-c)",
      strokeWidth: "var(--stroke-w)",
    },
  });

  e.applyGeometry({ type: 'box', position: [-4, -4, -4], size: [8, 8, 8] });
  // Carve steps into the Top-Right-Front corner (+X, -Y, -Z)
  e.removeGeometry({ type: 'box', position: [2, -4, -2], size: [2, 2, 2] });
  e.removeGeometry({ type: 'box', position: [0, -4, -4], size: [2, 2, 2] });
  e.removeGeometry({ type: 'box', position: [2, -4, -4], size: [2, 4, 2] });

  return e.toSVG(getSvgOpts());
});

// ─── Footer heart ────────────────────
{
  const heartContainer = document.getElementById("footer-heart");

  function renderHeart() {
    const e = new Heerich({
      tile: 52,
      camera: getCamera(),
      style: {
        fill: "var(--fill)",
        stroke: "var(--stroke-c)",
        strokeWidth: "var(--stroke-w)",
      },
    });

    const s = 4;
    e.applyGeometry({
      type: 'fill',
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

    heartContainer.innerHTML = e.toSVG(getSvgOpts());
  }

  renderHeart();
  demos.push(renderHeart);
}
