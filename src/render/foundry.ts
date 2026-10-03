// Presentation-only coverage of the authored room. Simulation never imports it.
import * as THREE from 'three';
import type { GameMap } from '../sim/types';
import { cloneOwnedModel } from './modernAssets';
import { applyRadialFogDeep } from './radialFog';

export function foundryCell(map: Pick<GameMap, 'seed' | 'grid' | 'w'>, x: number, z: number): boolean {
  return map.seed === 'campaign:01-foundry' && x >= 6 && x < 52 && z >= 39 && z < 48 && map.grid[z * map.w + x] === 1;
}

export function addFoundryEnvironment(parent: THREE.Group, source: THREE.Group): void {
  const model = cloneOwnedModel(source);
  model.name = 'authored-foundry';
  // Static self-shadowing is in the lightmap. Moving actors and doors receive
  // the renderer's stationary practical lighting independently of this bake.
  model.traverse(node => {
    if (node instanceof THREE.Mesh) { node.castShadow = false; node.receiveShadow = true; }
  });
  applyRadialFogDeep(model);
  parent.add(model);
  // The saved bake cannot light moving doors/actors. This small practical
  // sits below the airlock ceiling fixture and keeps the slab readable.
  const doorLight = new THREE.PointLight(0xe6c498, 22, 8, 2);
  doorLight.name = 'foundry-door-practical';
  doorLight.position.set(33.2, 3.8, 87);
  parent.add(doorLight);
  // A few soft, transparent shafts suggest dust in the skylight paths. They
  // are lighting effects, never opaque cover or a change to visibility tests.
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color(0x8db5c4) } },
    vertexShader: `varying vec2 beamUv; varying float distanceToCamera;
      void main() { beamUv = uv; vec4 view = modelViewMatrix * vec4(position, 1.0);
        distanceToCamera = length(view.xyz); gl_Position = projectionMatrix * view; }`,
    fragmentShader: `uniform vec3 tint; varying vec2 beamUv; varying float distanceToCamera;
      void main() { float sides = smoothstep(0.0, 0.22, beamUv.x) * smoothstep(0.0, 0.22, 1.0-beamUv.x);
        float ends = sin(beamUv.y * 3.14159); float fade = 1.0-smoothstep(30.0, 85.0, distanceToCamera);
        gl_FragColor = vec4(tint, sides * ends * fade * 0.04);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  for (const [x, top, z, endX, endZ] of [[19, 10.8, 81.6, 20, 87], [41, 15.8, 80.8, 43, 88], [71, 15.8, 80.8, 73, 88], [100, 15.8, 80.8, 102, 88]]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      x - 0.6, top, z, x + 0.6, top, z, endX + 2.1, 0.15, endZ,
      x - 0.6, top, z, endX + 2.1, 0.15, endZ, endX - 2.1, 0.15, endZ,
    ], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
    const shaft = new THREE.Mesh(geometry, material);
    shaft.name = 'foundry-skylight-haze';
    shaft.renderOrder = 2;
    parent.add(shaft);
  }
}

/** Keep all hardware parented to the original slab so door travel is unchanged. */
export function addFoundryDoorHardware(slab: THREE.Mesh, source: THREE.Group): void {
  const hardware = cloneOwnedModel(source);
  hardware.name = 'foundry-door-hardware';
  applyRadialFogDeep(hardware);
  slab.add(hardware);
}
