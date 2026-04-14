import { THREE, CSMShadowNode } from "./three.js";
import { PARAMS } from "./params.js";

export const scene = new THREE.Scene();

const bgGeo = new THREE.SphereGeometry(400, 32, 16);
const bgMat = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(PARAMS.bgColor),
  side: THREE.BackSide,
  depthWrite: true,
});
export const backgroundSphere = new THREE.Mesh(bgGeo, bgMat);
scene.add(backgroundSphere);

export const camera = new THREE.PerspectiveCamera(
  PARAMS.fov,
  innerWidth / innerHeight,
  1,
  8000,
);
camera.position.set(-20, 40, 50);

export const sunLight = new THREE.DirectionalLight(
  0xfff4e0,
  PARAMS.sunIntensity,
);
sunLight.position.set(60, 120, 80);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.lookAt(0, 0, 0);

export const csm = new CSMShadowNode(sunLight, {
  camera,
  fade: true,
  lightIntensity: PARAMS.sunIntensity,
  cascades: 8,
  maxFar: 500,
  mode: "logarithmic",
  lightMargin: 200,
});
sunLight.shadow.shadowNode = csm;

scene.add(sunLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
