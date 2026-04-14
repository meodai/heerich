import { THREE } from "./three.js";
import { Heerich, GPURenderer } from "../../src/heerich.js";
import { PARAMS } from "./params.js";
import { scene } from "./scene.js";

//  PRNG
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FACES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

//  Helpers
export function hsl(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

//  Voxel CFDG expansion
export function expand(rng) {
  const MAX_VOXELS = 10000;
  const voxels = [];
  const queue = [
    { x: 0, y: 0, z: 0, size: PARAMS.rootSize, depth: 0, fromDir: null },
  ];

  while (queue.length > 0 && voxels.length < MAX_VOXELS) {
    const { x, y, z, size, depth, fromDir } = queue.shift();
    const iSize = Math.max(1, Math.round(size));
    voxels.push({
      x: Math.round(x),
      y: Math.round(y),
      z: Math.round(z),
      size: iSize,
      depth,
    });

    const childSize = size * PARAMS.scaleDecay;
    if (depth >= PARAMS.maxDepth || childSize < 0.5) continue;

    const iChildSize = Math.max(1, Math.round(childSize));
    const step = (iSize * 0.5 + iChildSize * 0.5) * PARAMS.spread;

    for (const face of FACES) {
      let prob;
      if (!fromDir) {
        prob = 0.5 + -face[1] * PARAMS.upBias * 0.4;
      } else {
        const d = dot3(face, fromDir);
        if (d < 0) continue;
        prob = d > 0 ? PARAMS.trunkChance : PARAMS.sideChance;
      }
      if (rng() <= prob) {
        queue.push({
          x: x + face[0] * step,
          y: y + face[1] * step,
          z: z + face[2] * step,
          size: childSize,
          depth: depth + 1,
          fromDir: face,
        });
      }
    }
  }
  return voxels;
}

//  Mesh builder
export function buildMesh(faces) {
  const { position, normal, uv, index, color } = new GPURenderer().render(
    faces,
    { color: true },
  );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(color, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  const m = new THREE.Mesh(geo);
  m.rotation.x = -Math.PI / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

//  Mutable mesh state (live bindings — importers always see current value)
export let mesh = null;
export let mat = null;
export let emissiveMesh = null;
export let emissiveMat = null;

//  Generate
export function generate() {
  const rng = mulberry32(PARAMS.seed);
  const emRng = mulberry32(PARAMS.seed ^ 0x9e3779b9);
  const voxels = expand(rng);

  const heerichOpts = {
    tile: 10,
    camera: { type: "orthographic", angle: 45, pitch: 35 },
  };
  const engine = new Heerich(heerichOpts);
  const emissiveEngine = new Heerich(heerichOpts);

  for (const { x, y, z, size, depth } of voxels) {
    const t = depth / Math.max(PARAMS.maxDepth, 1);
    const hue = (PARAMS.hueStart + t * PARAMS.hueRange) % 360;
    const lit = 56 - t * 32;
    const jitter = [
      rng() * 0.01 - 0.005,
      rng() * 0.01 - 0.005,
      rng() * 0.01 - 0.005,
    ];
    const geomArgs = {
      type: "box",
      center: [x + jitter[0], y + jitter[1], z + jitter[2]],
      scale: [size, size, size],
      scaleOrigin: [0.5, 0.5, 0.5],
      size: 1,
      mode: "union",
      style: {
        default: { fill: hsl(hue, 52 * PARAMS.sat, lit) },
        top: { fill: hsl(hue, 52 * PARAMS.sat, Math.min(lit + 14, 90)) },
        bottom: { fill: hsl(hue, 52 * PARAMS.sat, Math.max(lit - 14, 10)) },
      },
    };
    const isEmissive = size === 1 && emRng() < PARAMS.emissiveChance;
    (isEmissive ? emissiveEngine : engine).addGeometry(geomArgs);
  }

  if (mesh) {
    mesh.geometry.dispose();
    mat.dispose();
    scene.remove(mesh);
  }
  if (emissiveMesh) {
    emissiveMesh.geometry.dispose();
    emissiveMat.dispose();
    scene.remove(emissiveMesh);
  }

  mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: PARAMS.roughness,
    metalness: 0,
    depthWrite: true,
  });
  mesh = buildMesh(engine.getFaces({ raw: true }));
  mesh.material = mat;
  scene.add(mesh);

  emissiveMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    emissive: new THREE.Color(PARAMS.emissiveColor),
    emissiveIntensity: PARAMS.emissiveIntensity,
    roughness: 0.0,
    metalness: 0.0,
  });
  emissiveMesh = buildMesh(emissiveEngine.getFaces({ raw: true }));
  emissiveMesh.material = emissiveMat;
  scene.add(emissiveMesh);
}
