import { Heerich } from "./src/heerich.js";

export function initHero(container, getCamera) {
  let animationId = 0;
  let holes = [];
  let scene = null; // { engine, holes with targetDepth }

  function rand(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function buildScene(depths) {
    const cam = getCamera();
    const availW = container.clientWidth;
    const availH = container.clientHeight;
    const gridPct = scene.gridPct;
    const gridSize = Math.round((availW * gridPct) / 100);
    const cols = Math.ceil(availW / gridSize);
    const rows = Math.ceil(availH / gridSize);

    const e = new Heerich({
      tile: [gridSize, gridSize],
      camera: cam,
      style: {
        fill: "var(--fill)",
        stroke: "var(--stroke-c)",
        strokeWidth: "var(--stroke-w)",
      },
    });

    // Solid slab — deep enough for all holes
    const maxDepth = Math.max(...depths.map((d) => Math.round(d)), 1);
    e.addBox({ position: [0, 0, 0], size: [cols, rows, maxDepth] });

    // Carve holes
    scene.holes.forEach((h, i) => {
      const d = Math.round(depths[i]);
      if (d > 0) {
        e.removeBox({ position: [h.x, h.y, 0], size: [h.w, h.h, d] });
      }
    });

    // Style colored walls (depth gradient from surface to random color)
    if (scene.colorWalls) {
      const maxD = Math.max(...depths, 1);
      scene.holes.forEach((h, i) => {
        const d = Math.round(depths[i]);
        if (d <= 0) return;
        for (let z = 0; z < d; z++) {
          const t = z / maxD;
          const r = Math.round(scene.color[0] * t * 255);
          const g = Math.round(scene.color[1] * t * 255);
          const b = Math.round(scene.color[2] * t * 255);
          e.styleBox({
            position: [h.x, h.y, z],
            size: [h.w, h.h, 1],
            style: {
              left: { fill: `rgb(${r},${g},${b})` },
              right: { fill: `rgb(${r},${g},${b})` },
              top: { fill: `rgb(${r},${g},${b})` },
              bottom: { fill: `rgb(${r},${g},${b})` },
              back: { fill: `rgb(${r},${g},${b})` },
            },
          });
        }
      });
    }

    return e.toSVG({
      padding: 30,
      faceAttributes: () => ({ "vector-effect": "non-scaling-stroke" }),
    });
  }

  function randomizeScene() {
    const gridPct = rand(5, 10);
    const availW = container.clientWidth;
    const availH = container.clientHeight;
    const gridSize = Math.round((availW * gridPct) / 100);
    const cols = Math.ceil(availW / gridSize);
    const rows = Math.ceil(availH / gridSize);

    const numHoles = rand(1, 3);
    const numSmallHoles = rand(0, 2);
    const holes = [];

    for (let i = 0; i < numHoles; i++) {
      const minPct = numHoles === 1 ? 0.4 : 0.1;
      const maxPct = numHoles === 1 ? 0.7 : 0.6;
      const w = Math.max(
        2,
        Math.floor(cols * (minPct + Math.random() * (maxPct - minPct))),
      );
      const h = Math.max(
        2,
        Math.floor(rows * (minPct + Math.random() * (maxPct - minPct))),
      );
      const x = Math.floor(Math.random() * Math.max(1, cols - w));
      const y = Math.floor(Math.random() * Math.max(1, rows - h));
      const targetDepth = rand(6, 20);
      holes.push({ x, y, w, h, targetDepth });
    }

    for (let i = 0; i < numSmallHoles; i++) {
      const w = Math.max(1, Math.floor(cols * (0.05 + Math.random() * 0.15)));
      const h = Math.max(1, Math.floor(rows * (0.05 + Math.random() * 0.15)));
      const x = Math.floor(Math.random() * Math.max(1, cols - w));
      const y = Math.floor(Math.random() * Math.max(1, rows - h));
      const targetDepth = rand(4, 14);
      holes.push({ x, y, w, h, targetDepth });
    }

    const color = [Math.random(), Math.random(), Math.random()];
    const m = Math.max(...color);
    if (m > 0) color.forEach((_, i) => (color[i] /= m));

    scene = {
      gridPct,
      holes,
      colorWalls: Math.random() < 0.5,
      color,
    };
  }

  function animateIn() {
    const id = ++animationId;
    const targets = scene.holes.map((h) => h.targetDepth);
    const duration = 800;
    const stagger = 200;
    const startTime = performance.now();

    function ease(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function step(now) {
      if (id !== animationId) return;
      let allDone = true;

      const depths = targets.map((target, i) => {
        const elapsed = now - startTime - i * stagger;
        if (elapsed <= 0) {
          allDone = false;
          return 0;
        }
        if (elapsed >= duration) return target;
        allDone = false;
        return target * ease(elapsed / duration);
      });

      container.innerHTML = buildScene(depths);
      if (!allDone) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function init() {
    randomizeScene();
    animateIn();
  }

  function updateCamera() {
    if (!scene) return;
    const depths = scene.holes.map((h) => h.targetDepth);
    container.innerHTML = buildScene(depths);
  }

  function repaint() {
    updateCamera();
  }

  container.addEventListener("click", () => init());
  init();

  return { updateCamera, repaint, init };
}
