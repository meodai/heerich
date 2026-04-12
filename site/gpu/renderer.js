import { THREE } from "./three.js";
import { PARAMS } from "./params.js";

export const canvas = document.getElementById("canvas");

export const renderer = new THREE.WebGPURenderer({
  canvas,
  antialias: false,
  preserveDrawingBuffer: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(2);
renderer.toneMappingExposure = PARAMS.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
