import {
  THREE,
  pass,
  mrt,
  output,
  normalView,
  materialEmissive,
  vec4,
  ao,
  bloom,
  dof,
} from "./three.js";
import {
  PARAMS,
  focusDistUniform,
  focalRangeUniform,
  bokehUniform,
} from "./params.js";
import { scene, camera } from "./scene.js";
import { renderer } from "./renderer.js";

// Exported as live bindings — populated after setupPostProcessing() runs
export let gtaoPass = null;
export let bloomPass = null;

export function setupPostProcessing() {
  const postProcessing = new THREE.RenderPipeline(renderer);

  const scenePass = pass(scene, camera);
  scenePass.setMRT(
    mrt({
      output,
      normal: normalView,
      emissive: vec4(materialEmissive, 1.0),
    }),
  );

  const sceneColor = scenePass.getTextureNode("output");
  const sceneNormal = scenePass.getTextureNode("normal");
  const sceneDepth = scenePass.getTextureNode("depth");
  const emissiveBuffer = scenePass.getTextureNode("emissive");

  gtaoPass = ao(sceneDepth, sceneNormal, camera);
  gtaoPass.radius = PARAMS.aoRadius;
  gtaoPass.distanceExponent.value = 8;
  gtaoPass.thickness.value = 16;
  window.gtaoPass = gtaoPass;

  const aoComposited = gtaoPass.getTextureNode().x.mul(sceneColor);

  const dofNode = dof(
    aoComposited,
    scenePass.getViewZNode(),
    focusDistUniform,
    focalRangeUniform,
    bokehUniform,
  );

  bloomPass = bloom(
    emissiveBuffer,
    PARAMS.bloomStrength,
    PARAMS.bloomRadius,
    PARAMS.bloomThreshold,
  );

  postProcessing.outputNode = dofNode.add(bloomPass);
  return postProcessing;
}
