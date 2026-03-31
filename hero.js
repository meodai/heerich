import { Heerich } from "./src/heerich.js";

export function initHero(
  container,
  getCamera,
  getReservedZone = null,
  getSvgOpts = null,
  renderScene = null,
  resolveStyleVars = null,
) {
  let animationId = 0;
  let scene = null;
  let cachedBase = null; // { engine, cols, rows, maxDepth, reservedZone }

  function rand(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function getGridLayout() {
    const availW = container.clientWidth;
    const availH = container.clientHeight;
    const gridSize = Math.round((availW * scene.gridPct) / 100);
    const cols = Math.ceil(availW / gridSize);
    const rows = Math.ceil(availH / gridSize);

    let reservedZone = null;
    if (getReservedZone) {
      const zone = getReservedZone();
      if (zone) {
        reservedZone = {
          x: Math.floor(zone.x / gridSize),
          y: Math.floor(zone.y / gridSize),
          w: Math.ceil(zone.width / gridSize),
          h: Math.ceil(zone.height / gridSize),
        };
      }
    }

    return { availW, availH, gridSize, cols, rows, reservedZone };
  }

  function buildBaseEngine(layout, maxDepth) {
    const { gridSize, cols, rows, reservedZone } = layout;
    const cam = getCamera();

    const e = new Heerich({
      tile: gridSize,
      camera: cam,
      style: {
        fill: "var(--fill)",
        stroke: "var(--stroke-c)",
        strokeWidth: "var(--stroke-w)",
      },
    });

    e.applyGeometry({
      type: "fill",
      bounds: [
        [0, 0, 0],
        [cols, rows, maxDepth],
      ],
      test: (x, y, z) => {
        if (
          reservedZone &&
          x >= reservedZone.x &&
          x < reservedZone.x + reservedZone.w &&
          y >= reservedZone.y
        ) {
          return false;
        }
        return true;
      },
    });

    cachedBase = { engine: e, cols, rows, maxDepth, reservedZone };
    return e;
  }

  function buildScene(depths, towerHeights = null) {
    const layout = getGridLayout();
    const maxDepth = Math.max(...depths.map((d) => Math.round(d)), 1);

    // Rebuild base if layout or depth changed
    if (
      !cachedBase ||
      cachedBase.cols !== layout.cols ||
      cachedBase.rows !== layout.rows ||
      cachedBase.maxDepth !== maxDepth
    ) {
      buildBaseEngine(layout, maxDepth);
    } else {
      // Update camera on cached engine
      cachedBase.engine.setCamera(getCamera());
    }

    // Clone from cached base
    const base = cachedBase.engine;
    const e = Heerich.fromJSON(base.toJSON());
    e.setCamera(getCamera());
    e.renderOptions.tileW = layout.gridSize;
    e.renderOptions.tileH = layout.gridSize;

    // Carve holes
    scene.holes.forEach((h, i) => {
      const d = Math.round(depths[i]);
      if (d > 0) {
        e.removeGeometry({
          type: "box",
          position: [h.x, h.y, 0],
          size: [h.w, h.h, d],
        });
      }
    });

    // Style colored walls
    if (scene.colorWalls) {
      const maxD = Math.max(...depths, 1);
      scene.holes.forEach((h, i) => {
        const d = Math.round(depths[i]);
        if (d <= 0) return;
        const color = scene.color;
        e.applyStyle({
          type: "box",
          position: [h.x, h.y, 0],
          size: [h.w, h.h, d],
          style: {
            left: (x, y, z) => {
              const t = z / maxD;
              return {
                fill: `rgb(${Math.round(color[0] * t * 255)},${Math.round(color[1] * t * 255)},${Math.round(color[2] * t * 255)})`,
              };
            },
            right: (x, y, z) => {
              const t = z / maxD;
              return {
                fill: `rgb(${Math.round(color[0] * t * 255)},${Math.round(color[1] * t * 255)},${Math.round(color[2] * t * 255)})`,
              };
            },
            top: (x, y, z) => {
              const t = z / maxD;
              return {
                fill: `rgb(${Math.round(color[0] * t * 255)},${Math.round(color[1] * t * 255)},${Math.round(color[2] * t * 255)})`,
              };
            },
            bottom: (x, y, z) => {
              const t = z / maxD;
              return {
                fill: `rgb(${Math.round(color[0] * t * 255)},${Math.round(color[1] * t * 255)},${Math.round(color[2] * t * 255)})`,
              };
            },
            back: (x, y, z) => {
              const t = z / maxD;
              return {
                fill: `rgb(${Math.round(color[0] * t * 255)},${Math.round(color[1] * t * 255)},${Math.round(color[2] * t * 255)})`,
              };
            },
          },
        });
      });
    }

    // Add towers
    if (towerHeights && scene.towers) {
      const reservedZone = cachedBase.reservedZone;
      scene.towers.forEach((tower, idx) => {
        const currentHeight = Math.round(towerHeights[idx]);
        if (currentHeight <= 0) return;

        if (
          reservedZone &&
          tower.x >= reservedZone.x &&
          tower.x + tower.w <= reservedZone.x + reservedZone.w &&
          tower.y >= reservedZone.y
        ) {
          return;
        }

        const holeDepth = Math.round(depths[tower.holeIndex]);
        // Clamp so towers don't poke above the surface
        const clampedHeight = Math.min(currentHeight, holeDepth);
        const towerStartZ = holeDepth - clampedHeight;
        e.applyGeometry({
          type: "box",
          position: [tower.x, tower.y, towerStartZ],
          size: [tower.w, tower.h, clampedHeight],
        });
      });
    }

    if (renderScene) {
      if (resolveStyleVars) resolveStyleVars(e);
      return renderScene(e);
    }
    return e.toSVG(
      getSvgOpts
        ? getSvgOpts()
        : {
            padding: 30,
            faceAttributes: () => ({ "vector-effect": "non-scaling-stroke" }),
          },
    );
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

    // Generate towers — sized relative to hole
    const towers = [];
    holes.forEach((h, holeIndex) => {
      const numTowers = rand(2, 3);
      const towerPositions = new Set();
      const tallTowerIndex = rand(0, numTowers - 1);

      for (let t = 0; t < numTowers; t++) {
        const tw = Math.max(1, rand(1, Math.floor(h.w * 0.25)));
        const th = Math.max(1, rand(1, Math.floor(h.h * 0.25)));
        const margin = Math.max(1, Math.floor(Math.min(h.w, h.h) * 0.1));
        const tx = h.x + rand(margin, Math.max(margin, h.w - margin - tw));
        const ty = h.y + rand(margin, Math.max(margin, h.h - margin - th));
        const key = `${tx},${ty}`;

        if (towerPositions.has(key)) continue;
        towerPositions.add(key);

        const isTall = t === tallTowerIndex;
        const maxHeight = isTall
          ? h.targetDepth
          : Math.floor(h.targetDepth * 0.8);
        const targetHeight = rand(Math.floor(h.targetDepth * 0.3), maxHeight);
        towers.push({ x: tx, y: ty, w: tw, h: th, holeIndex, targetHeight });
      }
    });

    cachedBase = null;
    scene = {
      gridPct,
      holes,
      colorWalls: Math.random() < 0.5,
      color,
      towers,
    };
  }

  function animateIn() {
    const id = ++animationId;
    const holeTargets = scene.holes.map((h) => h.targetDepth);
    const towerTargets = scene.towers.map((t) => t.targetHeight);
    const holeDuration = 800;
    const holeStagger = 200;
    const towerDuration = 600;
    const towerStagger = 80;
    const startTime = performance.now();

    const holeEndTime = holeDuration + (scene.holes.length - 1) * holeStagger;
    const towerStartDelay = holeEndTime + 200;

    function ease(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function step(now) {
      if (id !== animationId) return;
      let allDone = true;

      const depths = holeTargets.map((target, i) => {
        const elapsed = now - startTime - i * holeStagger;
        if (elapsed <= 0) {
          allDone = false;
          return 0;
        }
        if (elapsed >= holeDuration) return target;
        allDone = false;
        return target * ease(elapsed / holeDuration);
      });

      const towerHeights = towerTargets.map((target, i) => {
        const elapsed = now - startTime - towerStartDelay - i * towerStagger;
        if (elapsed <= 0) {
          allDone = false;
          return 0;
        }
        if (elapsed >= towerDuration) return target;
        allDone = false;
        return target * ease(elapsed / towerDuration);
      });

      container.innerHTML = buildScene(depths, towerHeights);
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
    cachedBase = null; // camera changed, need to rebuild base
    const depths = scene.holes.map((h) => h.targetDepth);
    const towerHeights = scene.towers.map((t) => t.targetHeight);
    container.innerHTML = buildScene(depths, towerHeights);
  }

  function repaint() {
    if (!scene) return;
    cachedBase = null; // style vars changed, need fresh render
    const depths = scene.holes.map((h) => h.targetDepth);
    const towerHeights = scene.towers.map((t) => t.targetHeight);
    container.innerHTML = buildScene(depths, towerHeights);
  }

  container.addEventListener("click", () => init());
  init();

  return { updateCamera, repaint, init };
}
