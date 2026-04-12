import { Pane } from "https://esm.sh/tweakpane";
import { PARAMS, focusDistUniform, focalRangeUniform, bokehUniform } from "./params.js";
import { camera, sunLight, backgroundSphere } from "./scene.js";
import { renderer, canvas } from "./renderer.js";
import { bloomPass } from "./postprocessing.js";
import { generate, emissiveMat } from "./generate.js";

export function setupPane() {
  const pane = new Pane({ title: "Voxel CFDG — TSL", expanded: false });

  pane
    .addBinding(PARAMS, "seed", { min: 0, max: 9999, step: 1, label: "seed" })
    .on("change", generate);

  const heerich = pane.addFolder({ title: "Context free system", expanded: false });
  heerich.addBinding(PARAMS, "maxDepth",    { min: 2,   max: 30,   step: 1,    label: "max depth"  });
  heerich.addBinding(PARAMS, "rootSize",    { min: 2,   max: 20,   step: 1,    label: "root size"  });
  heerich.addBinding(PARAMS, "trunkChance", { min: 0,   max: 1,    step: 0.01, label: "trunk prob" });
  heerich.addBinding(PARAMS, "sideChance",  { min: 0,   max: 0.8,  step: 0.01, label: "side prob"  });
  heerich.addBinding(PARAMS, "scaleDecay",  { min: 0.3, max: 0.95, step: 0.01, label: "scale decay"});
  heerich.addBinding(PARAMS, "spread",      { min: 0.9, max: 2.0,  step: 0.01, label: "spread"     });
  heerich.addBinding(PARAMS, "upBias",      { min: -1,  max: 1,    step: 0.05, label: "up bias"    });
  heerich.addBinding(PARAMS, "hueStart",    { min: 0,   max: 360,  step: 1,    label: "hue start"  });
  heerich.addBinding(PARAMS, "hueRange",    { min: 0,   max: 360,  step: 1,    label: "hue range"  });
  heerich.addBinding(PARAMS, "sat",         { min: 0,   max: 1,    step: 0.01, label: "Saturation" });
  heerich
    .addBinding(PARAMS, "bgColor", { label: "background" })
    .on("change", ({ value }) => {
      backgroundSphere.material.color.set(value);
    });

  const presets = pane.addFolder({ title: "Presets", expanded: false });
  presets.addButton({ title: "Sparse tree" }).on("click", () => {
    Object.assign(PARAMS, { trunkChance: 0.9, sideChance: 0.15 });
    pane.refresh();
    generate();
  });
  presets.addButton({ title: "Dense coral" }).on("click", () => {
    Object.assign(PARAMS, { trunkChance: 0.6, sideChance: 0.5 });
    pane.refresh();
    generate();
  });
  presets.addButton({ title: "Fun tree" }).on("click", () => {
    Object.assign(PARAMS, {
      seed: 2608, maxDepth: 9, rootSize: 12, trunkChance: 0.82,
      sideChance: 0.26, scaleDecay: 0.7, spread: 1.06, upBias: 0.65,
      hueStart: 28, hueRange: 190,
    });
    pane.refresh();
    generate();
  });
  presets.addButton({ title: "City tree" }).on("click", () => {
    Object.assign(PARAMS, {
      seed: 0, maxDepth: 24, rootSize: 12, trunkChance: 1, sideChance: 0.15,
      scaleDecay: 0.85, spread: 1, upBias: 0.65, hueStart: 28, hueRange: 190,
    });
    pane.refresh();
    generate();
  });
  presets.addButton({ title: "Stress test" }).on("click", () => {
    Object.assign(PARAMS, {
      seed: 0, maxDepth: 20, rootSize: 12, trunkChance: 0.22, sideChance: 0.26,
      scaleDecay: 0.9, spread: 2, upBias: 0.65, hueStart: 28, hueRange: 190,
    });
    pane.refresh();
    generate();
  });
  heerich.addButton({ title: "Randomize" }).on("click", () => {
    PARAMS.seed        = Math.floor(Math.random() * 10000);
    PARAMS.maxDepth    = Math.floor(Math.random() * 9) + 2;
    PARAMS.rootSize    = Math.floor(Math.random() * 11) + 2;
    PARAMS.trunkChance = Math.round((Math.random() * 0.9 + 0.1) * 100) / 100;
    PARAMS.sideChance  = Math.round(Math.random() * 0.8 * 100) / 100;
    PARAMS.scaleDecay  = Math.round((Math.random() * 0.65 + 0.3) * 100) / 100;
    PARAMS.spread      = Math.round((Math.random() * 1.1 + 0.9) * 100) / 100;
    PARAMS.upBias      = Math.round((Math.random() * 2 - 1) * 20) / 20;
    PARAMS.hueStart    = Math.floor(Math.random() * 361);
    PARAMS.hueRange    = Math.floor(Math.random() * 361);
    pane.refresh();
    generate();
  });
  heerich.addButton({ title: "Generate" }).on("click", generate);

  const camFolder = pane.addFolder({ title: "Camera", expanded: false });
  camFolder
    .addBinding(PARAMS, "fov", { min: 10, max: 100, step: 1, label: "FOV" })
    .on("change", ({ value }) => {
      camera.fov = value;
      camera.updateProjectionMatrix();
    });
  camFolder
    .addBinding(PARAMS, "exposure", { min: 0.1, max: 4, step: 0.05, label: "Exposure" })
    .on("change", ({ value }) => {
      renderer.toneMappingExposure = value;
    });
  camFolder.addBinding(PARAMS, "dofAutoFocus", { label: "Auto focus" });
  camFolder
    .addBinding(PARAMS, "dofFocusDist", {
      min: 1, max: 500, step: 1, label: "Focus dist",
      disabled: PARAMS.dofAutoFocus,
    })
    .on("change", ({ value }) => {
      if (!PARAMS.dofAutoFocus) focusDistUniform.value = value;
    });
  camFolder
    .addBinding(PARAMS, "dofFocalRange", { min: 1, max: 200, step: 1, label: "Focal range" })
    .on("change", ({ value }) => { focalRangeUniform.value = value; });
  camFolder
    .addBinding(PARAMS, "dofBokeh", { min: 0, max: 10, step: 0.1, label: "Bokeh scale" })
    .on("change", ({ value }) => { bokehUniform.value = value; });

  const ptFolder = pane.addFolder({ title: "Renderer", expanded: false });
  ptFolder
    .addBinding(PARAMS, "sunIntensity", { min: 0, max: 20, step: 0.5, label: "Sun intensity" })
    .on("change", ({ value }) => { sunLight.intensity = value; });
  ptFolder.addBinding(PARAMS, "sunLocked", { label: "Lock Sun to Cam" });
  ptFolder
    .addBinding(PARAMS, "bloomStrength", { min: 0, max: 3, step: 0.05, label: "Bloom strength" })
    .on("change", ({ value }) => {
      if (bloomPass) bloomPass.strength.value = value;
    });

  const emFolder = pane.addFolder({ title: "Emissive", expanded: false });
  emFolder
    .addBinding(PARAMS, "emissiveChance", { min: 0, max: 0.5, step: 0.01, label: "Chance" })
    .on("change", generate);
  emFolder
    .addBinding(PARAMS, "emissiveColor", { label: "Color" })
    .on("change", generate);
  emFolder
    .addBinding(PARAMS, "emissiveIntensity", { min: 0, max: 50, step: 0.5, label: "Intensity" })
    .on("change", ({ value }) => {
      if (emissiveMat) emissiveMat.emissiveIntensity = value;
    });

  pane.addButton({ title: "Download PNG" }).on("click", () => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `voxel-tsl-${PARAMS.seed}.png`;
    a.click();
  });
}
