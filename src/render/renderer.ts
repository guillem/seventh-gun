// Scene manager: builds and updates all render layers from sim state.
// Renders the world, then clears depth and renders the viewmodel pass so
// guns never clip into walls.
import * as THREE from 'three';
import { CELL, WALL_H } from '../sim/types';
import type { Sim } from '../sim/sim';
import { enemyVolumeY } from '../sim/enemyTypes';
import { buildWorld } from './world';
import { EnemyRenderer } from './enemies';
import { PickupRenderer } from './pickups';
import { FxRenderer } from './fx';
import { buildViewModel, type ViewModel } from './viewmodels';
import { getTextures } from './textures';
import { campaignArtIdFromSeed, type CampaignArtId } from './campaignTextures';
import { CAMPAIGN_FOG } from './campaignDecor';
import { hasVisualLineOfSight } from '../sim/physics';

const MAZE_FOG = 0x0b0709;
const MAZE_FOG_NEAR = 10;
const MAZE_FOG_FAR = 58;

export class GameRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  vmScene = new THREE.Scene();
  vmCamera: THREE.PerspectiveCamera;
  private world: ReturnType<typeof buildWorld> | null = null;
  private enemies: EnemyRenderer;
  showAllEnemies = false;
  private pickups: PickupRenderer;
  fx: FxRenderer;
  private viewModel: ViewModel | null = null;
  private vmHolder = new THREE.Group();
  private currentGun = 0;
  private viewBob = 0;
  private torch: THREE.PointLight;
  private muzzleSprite: THREE.Sprite | null = null;
  private muzzleLife = 0;
  private baseFov = 75;

  constructor(canvas: HTMLCanvasElement, e2e = false) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !e2e, powerPreference: 'high-performance', preserveDrawingBuffer: e2e });
    this.renderer.setPixelRatio(e2e ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.autoClear = false;

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.rotation.order = 'YXZ';
    this.vmCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.02, 10);

    this.scene.fog = new THREE.Fog(MAZE_FOG, MAZE_FOG_NEAR, MAZE_FOG_FAR);

    // lighting for dynamic meshes (enemies/pickups/doors)
    this.scene.add(new THREE.AmbientLight(0x77706d, 1.35));
    const hemi = new THREE.HemisphereLight(0x5a4850, 0x2a2226, 0.7);
    this.scene.add(hemi);
    this.torch = new THREE.PointLight(0xffd9a0, 26, 14, 1.8);
    this.scene.add(this.torch);

    // viewmodel pass lights
    this.vmScene.add(new THREE.AmbientLight(0x777168, 1.1));
    const vmKey = new THREE.DirectionalLight(0xfff1d8, 1.3);
    vmKey.position.set(-0.6, 1, 0.4);
    this.vmScene.add(vmKey);
    this.vmScene.add(this.vmHolder);

    this.enemies = new EnemyRenderer(this.scene);
    this.pickups = new PickupRenderer(this.scene);
    this.fx = new FxRenderer(this.scene);
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // portrait: hold horizontal FOV so it's not a slit; landscape keeps base
    const targetH = THREE.MathUtils.degToRad(this.baseFov);
    if (aspect < 1) {
      const targetHFov = THREE.MathUtils.degToRad(88);
      const vFov = 2 * Math.atan(Math.tan(targetHFov / 2) / aspect);
      this.camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vFov), 75, 110);
    } else {
      this.camera.fov = this.baseFov;
    }
    void targetH;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = aspect;
    this.vmCamera.updateProjectionMatrix();
  }

  setRun(sim: Sim, artId?: CampaignArtId): void {
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }
    this.fx.clearTransient();
    // enemy ids restart at 0 for every generated map, so syncStart's id diff
    // alone would reuse the previous run's rigs — complete with death poses
    // (fallen over, sunk, faded shadows). A new run gets fresh rigs.
    this.enemies.dispose();
    this.enemies.syncStart(sim.enemies);
    this.pickups.dispose();
    this.pickups.syncStart(sim.pickups);
    const resolved = artId ?? campaignArtIdFromSeed(sim.map.seed);
    this.world = buildWorld(sim.map, resolved);
    this.scene.add(this.world.group);
    this.scene.fog = resolved
      ? new THREE.Fog(CAMPAIGN_FOG[resolved], 8, 52)
      : new THREE.Fog(MAZE_FOG, MAZE_FOG_NEAR, MAZE_FOG_FAR);
    this.setGun(1);
    this.prefetchDynamicMeshes();
  }

  /** Warm GPU programs so the first door reveal does not hitch / pop. */
  private prefetchDynamicMeshes(): void {
    this.enemies.setAllVisible(true);
    this.pickups.setAllVisible(true);
    try {
      this.renderer.compile(this.scene, this.camera);
      this.renderer.compile(this.vmScene, this.vmCamera);
    } catch {
      /* compile is best-effort — first frame still draws */
    }
  }

  setGun(id: number): void {
    if (id === this.currentGun && this.viewModel) return;
    this.currentGun = id;
    if (this.viewModel) this.vmHolder.remove(this.viewModel.group);
    this.viewModel = buildViewModel(id);
    this.vmHolder.add(this.viewModel.group);
    // switch dip animation
    this.vmHolder.position.y = -0.35;
  }

  private updateMuzzleSprite(color: number, size: number): void {
    if (!this.viewModel) return;
    if (this.muzzleSprite) {
      this.muzzleSprite.removeFromParent();
      this.muzzleSprite = null;
    }
    const mat = new THREE.SpriteMaterial({
      map: getTextures().flash, color, blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, depthTest: false,
    });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size);
    this.viewModel.muzzle.add(s);
    this.muzzleSprite = s;
    this.muzzleLife = 0.085;
  }

  get muzzleState(): { alive: boolean; attached: boolean; opacity: number; gunVisible: boolean } {
    const s = this.muzzleSprite;
    return {
      alive: this.muzzleLife > 0,
      attached: !!s && !!s.parent,
      opacity: s ? (s.material as THREE.SpriteMaterial).opacity : -1,
      gunVisible: !!this.viewModel && this.viewModel.group.parent === this.vmHolder,
    };
  }

  fireVisual(gunId: number, yaw: number, pitch: number, px: number, pz: number): void {
    const sizes = [0.5, 1.6, 0.8, 0.7, 1.1, 0.9, 1.8];
    const colors = [0xffe2a0, 0xffc23a, 0xffd28a, 0xb8ff7a, 0x9aff5a, 0x9ff4ff, 0xb44dff];
    // make sure the flash attaches to the gun actually firing (switch this frame?)
    this.setGun(gunId);
    this.updateMuzzleSprite(colors[gunId - 1], sizes[gunId - 1]);
    // world light at the muzzle, pointing away from camera
    const dx = -Math.sin(yaw) * Math.cos(pitch);
    const dz = -Math.cos(yaw) * Math.cos(pitch);
    this.fx.muzzleFlashWorld(px + dx * 1.4, 1.6, pz + dz * 1.4, sizes[gunId - 1] * 0.8, colors[gunId - 1]);
  }

  update(dt: number, sim: Sim, inputMoving: boolean): void {
    const p = sim.player;
    // camera
    this.camera.position.set(p.x, 1.7, p.z);
    this.camera.rotation.y = p.yaw;
    this.camera.rotation.x = p.pitch;
    if (sim.phase === 'dying') {
      const t = Math.min(1, sim.phaseTimer / 0.8);
      this.camera.position.y = 1.7 - t * 1.2;
      this.camera.rotation.z = t * 0.5;
    } else if (sim.phase === 'dead') {
      this.camera.position.y = 0.5;
      this.camera.rotation.z = 0.5;
    } else {
      this.camera.rotation.z = 0;
    }
    this.torch.position.copy(this.camera.position);

    // gun switch visual
    this.setGun(p.gun);
    this.vmHolder.position.y = Math.min(0, this.vmHolder.position.y + dt * 2.4);

    // viewmodel state
    if (inputMoving) this.viewBob += dt;
    if (this.viewModel) {
      this.viewModel.update(dt, {
        moving: inputMoving ? 1 : 0,
        firing: p.fireCd > 0.04,
        recoil: Math.max(0, Math.min(1, p.fireCd / 0.25)),
        time: this.viewBob,
      });
    }
    // muzzle sprite lifetime
    if (this.muzzleLife > 0) {
      this.muzzleLife -= dt;
      if (this.muzzleSprite) {
        (this.muzzleSprite.material as THREE.SpriteMaterial).opacity = Math.max(0, this.muzzleLife / 0.085);
        this.muzzleSprite.material.rotation = (this.muzzleSprite.material.rotation ?? 0) + dt * 30;
      }
      if (this.muzzleLife <= 0 && this.muzzleSprite) {
        this.viewModel?.muzzle.remove(this.muzzleSprite);
        this.muzzleSprite = null;
      }
    }

    // world layers
    if (this.world) {
      for (const d of sim.doors) {
        const mesh = this.world.doorMeshes.get(d.id);
        if (mesh) mesh.position.y = (WALL_H * 0.72) / 2 + d.offset * (WALL_H * 0.72 + 0.25);
      }
      this.world.sealMesh.visible = sim.sealIntact;
      if (sim.sealIntact) {
        this.world.sealMesh.children[0].rotation.y += dt * 0.4;
        const mat = (this.world.sealMesh.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.45 + Math.sin(performance.now() / 300) * 0.12;
      }
    }

    this.enemies.syncStart(sim.enemies);
    this.enemies.update(dt, sim.enemies, this.camera, sim.time);
    this.pickups.syncStart(sim.pickups);
    this.pickups.update(dt, sim.pickups);
    this.fx.syncProjectiles(sim.projectiles);
    this.fx.update(dt);

    // enemy visibility: frustum + visual LOS (opening doors do not occlude)
    // + distance. Collision LOS still uses offset < 0.65 in physics.
    this.camera.updateMatrixWorld();
    const frustum = new THREE.Frustum();
    const projScreen = new THREE.Matrix4();
    projScreen.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreen);
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    for (const e of sim.enemies) {
      const rig = this.enemies.rigs.get(e.id);
      if (!rig) continue;
      center.set(e.x, enemyVolumeY(e.def).yCenter, e.z);
      size.set(e.def.radius * 2.5, e.def.height * 1.2, e.def.radius * 2.5);
      box.setFromCenterAndSize(center, size);
      const visible =
        this.showAllEnemies ||
        (sim.phase === 'playing' &&
          Math.hypot(e.x - p.x, e.z - p.z) < 55 &&
          hasVisualLineOfSight(sim, p.x, p.z, e.x, e.z) &&
          frustum.intersectsBox(box));
      rig.group.visible = visible;
    }

    this.render();
  }

  get enemyRigInfo(): { id: number; visible: boolean; x: number; z: number; scale: number; rotX: number }[] {
    return this.enemies.rigInfo();
  }

  get enemyUpdateCount(): number {
    return this.enemies.updateCount;
  }

  render(): void {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.vmScene, this.vmCamera);
  }

  // camera helper for screenshots/debug posing
  poseCamera(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(pitch, yaw, 0);
  }
}
