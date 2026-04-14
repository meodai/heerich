import { uniform } from "./three.js";

export const PARAMS = {
  // voxels
  seed: 0,
  maxDepth: 10,
  rootSize: 8,
  trunkChance: 0.8,
  sideChance: 0.18,
  scaleDecay: 0.8,
  spread: 1,
  upBias: 0.5,
  hueStart: 28,
  hueRange: 190,
  sat: 1,
  bgColor: "#111122",
  // camera
  fov: 50,
  exposure: 1.0,
  // depth of field
  dofFocusDist: 50,
  dofFocalRange: 40,
  dofBokeh: 2,
  dofAutoFocus: true,
  // lighting
  roughness: 0.85,
  sunIntensity: 4.0,
  sunLocked: true,
  aoRadius: 4,
  // bloom
  bloomStrength: 0.8,
  bloomRadius: 0.5,
  bloomThreshold: 0.2,
  // emissive
  emissiveChance: 0.05,
  emissiveIntensity: 12,
  emissiveColor: "#ffcc44",
};

// TSL uniforms — kept here so pane.js and postprocessing.js share the same instances
export const focusDistUniform = uniform(PARAMS.dofFocusDist);
export const focalRangeUniform = uniform(PARAMS.dofFocalRange);
export const bokehUniform = uniform(PARAMS.dofBokeh);
