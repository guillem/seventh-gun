import * as THREE from 'three';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

/** Half-resolution contact shading for desktop. Transparent effects and labels
 * must not write opaque rectangles into the normal/depth prepass. */
export class ContactOcclusionPass extends SSAOPass {
  private hidden = new Map<THREE.Object3D, boolean>();

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    super(scene, camera, 1, 1, 16);
    this.kernelRadius = 0.72;
    this.minDistance = 0.00004;
    this.maxDistance = 0.004;
    // Limit the effect to contact definition; avoid blackened room interiors.
    this.ssaoMaterial.fragmentShader = this.ssaoMaterial.fragmentShader.replace(
      '1.0 - occlusion', '1.0 - occlusion * 0.58',
    );
  }

  override setSize(width: number, height: number): void {
    super.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
  }

  overrideVisibility(): void {
    this.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    this.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
    this.scene.traverse(node => {
      const material = (node as THREE.Mesh).material;
      const materials = Array.isArray(material) ? material : material ? [material] : [];
      if (node instanceof THREE.Sprite || node instanceof THREE.Points || node instanceof THREE.Line ||
          materials.some(value => value.transparent || value.depthWrite === false)) {
        this.hidden.set(node, node.visible);
        node.visible = false;
      }
    });
  }

  restoreVisibility(): void {
    this.hidden.forEach((visible, node) => { node.visible = visible; });
    this.hidden.clear();
  }
}
