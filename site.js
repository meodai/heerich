import { Heerich } from "./src/heerich.js";
import { version } from "./package.json";
import { initHero } from "./hero.js";
import { highlightAll } from "https://unpkg.com/@speed-highlight/core/dist/index.js";
highlightAll();

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
  const valueSpan = wrap.parentElement.querySelector(".value");

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

// ─── Show camera panel when Boxes section is reached ───
const panel = document.getElementById("camera-panel");

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value, min, step) {
  if (!step || step <= 0) return value;
  const rounded = min + Math.round((value - min) / step) * step;
  return Number(rounded.toFixed(4));
}

function updatePerspectiveGrid() {
  const angleMin = parseFloat(camAngle.min) || 0;
  const angleMax = parseFloat(camAngle.max) || 360;
  const camYMin = parseFloat(camY.min) || -10;
  const camYMax = parseFloat(camY.max) || 20;
  const angleValue = parseFloat(camAngle.value) || angleMin;
  const camYValue = parseFloat(camY.value) || camYMin;
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
  const angleMin = parseFloat(camAngle.min) || 0;
  const angleMax = parseFloat(camAngle.max) || 360;
  const angleStep = parseFloat(camAngle.step) || 1;
  const camYMin = parseFloat(camY.min) || -10;
  const camYMax = parseFloat(camY.max) || 20;
  const camYStep = parseFloat(camY.step) || 1;

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

function syncCameraControlVisibility() {
  const perspective = camProj.value === "perspective";
  camAngleLabel.style.display = perspective ? "none" : "";
  camYLabel.style.display = "none";
  camPerspectiveControl.hidden = !perspective;
  updatePerspectiveGrid();
}
syncCameraControlVisibility();

[camProj, camAngle, camY, camDist].forEach((el) => {
  const evt = el.tagName === "SELECT" ? "change" : "input";
  el.addEventListener(evt, () => {
    const span = el.parentElement.querySelector(".value");
    if (span) span.textContent = el.value;
    if (el === camProj) syncCameraControlVisibility();
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

// ─── Helper: wire up a demo's controls and render loop ───
const baseStyle = {
  fill: "var(--fill)",
  stroke: "var(--stroke-c)",
  strokeWidth: "var(--stroke-w)",
};
const svgOpts = {
  padding: 30,
  faceAttributes: () => ({ "vector-effect": "non-scaling-stroke" }),
};

// Style via CSS variables — no re-render needed
function syncStyleVars() {
  document.documentElement.style.setProperty("--stroke-w", camStroke.value);
  document.documentElement.style.setProperty(
    "--stroke-c",
    camStrokeColor.value,
  );
  document.documentElement.style.setProperty("--fill", camFill.value);
  hero.repaint();
}
camStroke.addEventListener("input", () => {
  const span = camStroke.parentElement.querySelector(".value");
  if (span) span.textContent = camStroke.value;
  syncStyleVars();
});
camStrokeColor.addEventListener("input", () => syncStyleVars());
camFill.addEventListener("input", () => syncStyleVars());
syncStyleVars();

function setupDemo(id, buildFn) {
  const root = document.getElementById(id);
  const canvas = root.querySelector(".demo-canvas");
  const controls = {};

  root.querySelectorAll("[data-bind]").forEach((el) => {
    const key = el.dataset.bind;
    controls[key] = el;

    const update = () => {
      const span = el.parentElement.querySelector(".value");
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
    tile: [30, 30],
    camera: getCamera(),
    style: baseStyle,
  });
  e.addBox({ position: [0, 0, 0], size: [v.w, v.h, v.d] });
  return e.toSVG(svgOpts);
});

// ─── Alignment ───────────────────────
setupDemo("demo-align", (v) => {
  const e = new Heerich({
    tile: [26, 26],
    camera: getCamera(),
    style: baseStyle,
  });
  const big = [6, 6, 6];
  const small = [2, 2, 2];
  const ox = big[0];

  e.addBox({ position: [0, 0, 0], size: big });

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

  e.addBox({
    position: pos,
    size: small,
    style: { default: { fill: "#18191b", stroke: "var(--fill)" } },
  });

  return e.toSVG(svgOpts);
});

// ─── Boolean operations ──────────────
setupDemo("demo-boolean", (v) => {
  const e = new Heerich({
    tile: [26, 26],
    camera: getCamera(),
    style: baseStyle,
  });
  e.addBox({ position: [0, 0, 0], size: [6, 6, 6] });
  e.addSphere({
    center: [v.offset, 3, 3],
    radius: 3.5,
    mode: v.mode,
    style: { default: { fill: "#18191b", stroke: "var(--fill)" } },
  });
  return e.toSVG(svgOpts);
});

// ─── Rotation ────────────────────────
setupDemo("demo-rotation", (v) => {
  const e = new Heerich({
    tile: [26, 26],
    camera: getCamera(),
    style: baseStyle,
  });
  e.addBox({ position: [0, 0, 0], size: [2, 6, 2] });
  e.addBox({ position: [0, 0, 0], size: [6, 2, 2] });
  if (v.turns > 0) {
    e.rotate({ axis: v.axis, turns: v.turns });
  }
  return e.toSVG(svgOpts);
});

// ─── Grouped voxels ──────────────────
setupDemo("demo-group", (v) => {
  const e = new Heerich({
    tile: [26, 26],
    camera: getCamera(),
    style: baseStyle,
  });
  const gs = v.gs;

  // Smooth solid — strokeWidth: 0 removes internal grid lines
  e.addBox({
    position: [0, 0, 0],
    size: [gs, gs, gs],
    style: { default: { fill: "#0e0e0e", stroke: "#0e0e0e" } },
  });

  // 1x1x1 voxels bordering all four sides, offset 1 back
  for (let i = 0; i < gs + 2; i++) {
    e.addBox({ position: [i - 1, -1, 1], size: [1, 1, 1] }); // top edge
    e.addBox({ position: [i - 1, gs, 1], size: [1, 1, 1] }); // bottom edge
    e.addBox({ position: [-1, i - 1, 1], size: [1, 1, 1] }); // left edge
    e.addBox({ position: [gs, i - 1, 1], size: [1, 1, 1] }); // right edge
  }

  return e.toSVG(svgOpts);
});

// ─── 4. Styles ───────────────────────
setupDemo("demo-style", (v) => {
  const e = new Heerich({
    tile: [30, 30],
    camera: getCamera(),
    style: {
      fill: "var(--fill)",
      stroke: "#333",
      strokeWidth: "var(--stroke-w)",
    },
  });
  e.addBox({
    position: [0, 0, 0],
    size: [5, 5, 5],
    style: {
      top: { fill: v.top },
      front: { fill: v.front },
      right: { fill: v.right },
    },
  });
  return e.toSVG(svgOpts);
});

// ─── 5. SVG styles ───────────────────
setupDemo("demo-svg-styles", (v) => {
  const e = new Heerich({
    tile: [28, 28],
    camera: getCamera(),
    style: baseStyle,
  });
  e.addBox({
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
  e.addBox({
    position: [5, 0, 0],
    size: [4, 4, 4],
    style: { default: { opacity: 1 } },
  });
  return e.toSVG(svgOpts);
});

// ─── 6. Spheres ──────────────────────
setupDemo("demo-sphere", (v) => {
  const r = v.r;
  const e = new Heerich({
    tile: [28, 28],
    camera: getCamera(),
    style: baseStyle,
  });
  e.addSphere({ center: [r, r, r], radius: r });
  return e.toSVG(svgOpts);
});

// ─── 6. Lines ────────────────────────
setupDemo("demo-line", (v) => {
  const e = new Heerich({
    tile: [26, 26],
    camera: getCamera(),
    style: {
      fill: "var(--fill)",
      stroke: "var(--stroke-c)",
      strokeWidth: "var(--stroke-w)",
    },
  });
  e.addLine({
    from: [0, 0, 0],
    to: [v.ex, 6, v.ez],
    radius: v.r,
    shape: v.shape,
  });
  return e.toSVG(svgOpts);
});

// ─── 7. Functional ───────────────────
setupDemo("demo-functional", (v) => {
  const s = v.s;
  const hueRange = v.hue;
  const e = new Heerich({
    tile: [28, 28],
    camera: getCamera(),
    style: {
      fill: "var(--fill)",
      stroke: "var(--stroke-c)",
      strokeWidth: "var(--stroke-w)",
    },
  });
  e.addBox({
    position: [0, 0, 0],
    size: [s, s, s],
    style: {
      default: (x, y, z) => {
        const L = 0.4 + (y / s) * 0.5;
        const C = 0.05 + (z / s) * 0.2;
        const H = (x / s) * hueRange;
        return {
          fill: `oklch(${L} ${C} ${H})`,
          stroke: `oklch(${L - 0.12} ${C} ${H})`,
          strokeWidth: "var(--stroke-w)",
        };
      },
    },
  });
  return e.toSVG(svgOpts);
});

// ─── 9. Queries ──────────────────────
setupDemo("demo-queries", (v) => {
  const e = new Heerich({
    tile: [24, 24],
    camera: getCamera(),
    style: baseStyle,
  });
  e.addBox({ position: [0, 0, 0], size: [6, 6, 6] });
  e.removeSphere({ center: [3, 3, 6], radius: 2.5 });
  e.removeBox({ position: [0, 0, 0], size: [2, 6, 3] });

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
      e.styleBox({
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

  return e.toSVG(svgOpts);
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
      tile: [22, 22],
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

          e.addBox({
            position: [x, y, z],
            size: [1, 1, 1],
            opaque: false,
            content: `<text font-family="Aboreto" font-size="16" fill="var(--text)" text-anchor="middle" dominant-baseline="central">${letter.toUpperCase()}</text>`,
          });
          i++;
        }
      }
    }

    canvas.innerHTML = e.toSVG(svgOpts);
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
      tile: [24, 24],
      camera: getCamera(),
      style: baseStyle,
    });

    // Wireframe cage — fill none, opaque false
    e.addBox({
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
    e.addBox({ position: [1, 1, 1], size: [3, 3, 3] });

    canvas.innerHTML = e.toSVG(svgOpts);
  }
  render();
  demos.push(render);
}

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
      tile: [26, 26],
      camera: getCamera(),
      style: baseStyle,
    });
    e.addBox({ position: [0, 0, 0], size: [10, 8, 6] });
    holes.forEach((h, i) => {
      const d = Math.round(depths[i]);
      if (d > 0) e.removeBox({ position: [h.x, h.y, 0], size: [h.w, h.h, d] });
    });
    return e.toSVG(svgOpts);
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
      const span = el.parentElement.querySelector(".value");
      if (span) span.textContent = el.value;
    });
  });

  drawStatic();
  demos.push(drawStatic);
}

// ─── 11. Combined ────────────────────
{
  const root = document.getElementById("demo-combined");
  const canvas = root.querySelector(".demo-canvas");
  const btnPlay = root.querySelector('[data-bind="play"]');
  const btnReset = root.querySelector('[data-bind="reset"]');

  const holes = [
    { x: 1, y: 1, w: 3, h: 3, targetDepth: 5 },
    { x: 6, y: 0, w: 3, h: 4, targetDepth: 6 },
    { x: 2, y: 5, w: 5, h: 3, targetDepth: 4 },
    { x: 0, y: 3, w: 2, h: 4, targetDepth: 3 },
  ];

  function buildScene(depths) {
    const e = new Heerich({
      tile: [22, 22],
      camera: getCamera(),
      style: {
        fill: "var(--fill)",
        stroke: "var(--stroke-c)",
        strokeWidth: "var(--stroke-w)",
      },
    });

    e.addBox({ position: [0, 0, 0], size: [12, 10, 7] });

    holes.forEach((h, i) => {
      const d = Math.round(depths[i]);
      if (d > 0) e.removeBox({ position: [h.x, h.y, 0], size: [h.w, h.h, d] });
    });

    e.addSphere({
      center: [14.5, 5, 3.5],
      radius: 3.5,
      style: {
        default: (x, y, z) => {
          const ny = (y - 1.5) / 7;
          const L = 0.55 + ny * 0.35;
          return {
            fill: `oklch(${L} 0.12 250)`,
            stroke: `oklch(${L - 0.15} 0.12 250)`,
            strokeWidth: "var(--stroke-w)",
          };
        },
      },
    });

    e.addLine({
      from: [12, 8, 0],
      to: [12, 8, 10],
      radius: 0.8,
      shape: "rounded",
      style: {
        default: { fill: "var(--fill)", stroke: "var(--stroke-c)" },
      },
    });

    e.addBox({
      position: [13, 0, 0],
      size: [3, 3, 4],
      style: {
        default: (x, y, z) => {
          const H = 20 + ((x - 13) / 3) * 40;
          const L = 0.6 + (z / 4) * 0.25;
          return {
            fill: `oklch(${L} 0.18 ${H})`,
            stroke: `oklch(${L - 0.15} 0.18 ${H})`,
            strokeWidth: "var(--stroke-w)",
          };
        },
      },
    });

    if (depths[0] > 1) {
      e.styleBox({
        position: [1, 1, 0],
        size: [3, 3, Math.min(Math.round(depths[0]), 5)],
        style: {
          front: { fill: "#c8b0ff" },
          left: { fill: "#b098e8" },
          right: { fill: "#b098e8" },
        },
      });
    }

    return e.toSVG(svgOpts);
  }

  function drawStatic() {
    canvas.innerHTML = buildScene(holes.map(() => 0));
  }

  btnPlay.addEventListener("click", () => {
    animateHoles({
      canvas,
      holes,
      buildScene,
      duration: 1000,
      stagger: 180,
    });
  });

  btnReset.addEventListener("click", () => {
    canvas._animId = (canvas._animId || 0) + 1;
    drawStatic();
  });

  drawStatic();
  demos.push(drawStatic);
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
    tile: [22, 22],
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
  e.addBox({ position: [o, 0, 0], size: [arm, len, d] });
  e.addBox({
    position: [o + 1, 1, 0],
    size: [1, len - 2, d],
    mode: "subtract",
  });

  // Second arm — rotated 90° around Z
  e.addBox({
    position: [o, 0, 0],
    size: [arm, len, d],
    rotate: { axis: "z", turns: 1, center: c },
  });
  e.addBox({
    position: [o + 1, 1, 0],
    size: [1, len - 2, d],
    mode: "subtract",
    rotate: { axis: "z", turns: 1, center: c },
  });

  // Third arm — rotated 90° around Y
  e.addBox({
    position: [o, 0, 0],
    size: [arm, len, d],
    rotate: { axis: "x", turns: 1, center: c },
  });
  e.addBox({
    position: [o + 1, 1, 0],
    size: [1, len - 2, d],
    mode: "subtract",
    rotate: { axis: "x", turns: 1, center: c },
  });

  return e.toSVG(svgOpts);
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
    tile: [26, 26],
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
          e.addBox({ position: [x * s, y * s, z * s], size: [s, s, s] });
        }
      }
    }
  }
  return e.toSVG(svgOpts);
});

// ─── Footer heart ────────────────────
{
  const heartContainer = document.getElementById("footer-heart");

  function renderHeart() {
    const e = new Heerich({
      tile: [52, 52],
      camera: getCamera(),
      style: {
        fill: "var(--fill)",
        stroke: "var(--stroke-c)",
        strokeWidth: "var(--stroke-w)",
      },
    });

    const s = 4;
    e.addWhere({
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

    heartContainer.innerHTML = e.toSVG(svgOpts);
  }

  renderHeart();
  demos.push(renderHeart);
}
