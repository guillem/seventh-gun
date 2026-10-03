import * as THREE from 'three';

/** Render the retained objects once before play. compile() alone does not
 * upload vertex/texture data, and misses the composer's linear-output and
 * contact-occlusion shader variants. The caller supplies the real draw path. */
export function prepareGpuResources(renderer: THREE.WebGLRenderer, roots: THREE.Object3D[], draw: () => void): void {
  const target = renderer.getRenderTarget();
  const clearColor = renderer.getClearColor(new THREE.Color()).clone();
  const clearAlpha = renderer.getClearAlpha();
  const autoClear = renderer.autoClear;
  const scenes = roots.filter((root): root is THREE.Scene => root instanceof THREE.Scene)
    .map(scene => ({ scene, overrideMaterial: scene.overrideMaterial }));
  const states: { object: THREE.Object3D; visible: boolean; frustumCulled: boolean }[] = [];
  const textures = new Set<THREE.Texture>();
  for (const root of roots) root.traverse(object => {
    states.push({ object, visible: object.visible, frustumCulled: object.frustumCulled });
    // Preserve the configured light layout, including map-specific lights.
    if (!(object instanceof THREE.Light)) object.visible = true;
    object.frustumCulled = false;
    const material = (object as THREE.Mesh).material;
    for (const mat of Array.isArray(material) ? material : material ? [material] : []) {
      for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
      if (mat instanceof THREE.ShaderMaterial) {
        for (const uniform of Object.values(mat.uniforms)) if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
      }
    }
  });
  try {
    for (const texture of textures) renderer.initTexture(texture);
    draw();
  } finally {
    // SSAO temporarily changes these too; its internal renderOverride has no
    // finally if a driver/render error interrupts preparation.
    renderer.setRenderTarget(target);
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.autoClear = autoClear;
    scenes.forEach(({ scene, overrideMaterial }) => { scene.overrideMaterial = overrideMaterial; });
    for (const { object, visible, frustumCulled } of states) {
      object.visible = visible;
      object.frustumCulled = frustumCulled;
    }
  }
}
