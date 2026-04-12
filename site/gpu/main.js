import { THREE, OrbitControls } from "./three.js";
import { PARAMS, focusDistUniform } from "./params.js";
import { generate } from "./generate.js";
import { camera, sunLight, csm } from "./scene.js";
import { renderer } from "./renderer.js";
import { setupPostProcessing } from "./postprocessing.js";
import { setupPane } from "./pane.js";

console.clear();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;

async function init() {
  await renderer.init();

  const postProcessing = setupPostProcessing();

  generate();
  setupPane();

  renderer.setAnimationLoop(async () => {
    controls.update();

    if (PARAMS.sunLocked) {
      const offset = new THREE.Vector3(-50, 60, 20);
      offset.applyQuaternion(camera.quaternion);
      sunLight.position.copy(camera.position).add(offset);
      sunLight.lookAt(0, 0, 0);
    }

    if (csm.mainFrustum) csm.updateFrustums();

    if (PARAMS.dofAutoFocus) {
      focusDistUniform.value = camera.position.distanceTo(controls.target);
    }

    postProcessing.render();
  });
}

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  csm.updateFrustums();
});

init();
