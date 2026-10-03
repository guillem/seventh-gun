// Scene manager: builds and updates all render layers from sim state.
// Renders the world, then clears depth and renders the viewmodel pass so
// guns never clip into walls.
import * as THREE from 'three';
import { WALL_H } from '../sim/types';
import type { WorldView } from '../sim/view';
import { PlayerRenderer, type RemotePlayerPose } from './players';
import { enemyVolumeY } from '../sim/enemyTypes';
import { buildWorld } from './world';
import { EnemyRenderer } from './enemies';
import { PickupRenderer } from './pickups';
import { FxRenderer } from './fx';
import { buildViewModel, type ViewModel } from './viewmodels';
import { GUN_FLASH } from './gunArt';
import { getTextures } from './textures';
import { type CampaignArtId } from './campaignTextures';
import { CAMPAIGN_FOG } from './campaignDecor';
import { hasVisualLineOfSight } from '../sim/physics';
import { applyRadialFogDeep, installRadialFog } from './radialFog';
import { disposeOwnedObject } from './dispose';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getModernAssets } from './modernAssets';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
  private others: PlayerRenderer;
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
  private renderFrames = 0;
  private modernKey: THREE.SpotLight | null = null;
  private practicalLights: THREE.PointLight[] = [];
  private lightTimer = 0;
  private lightDirection = new THREE.Vector3();
  private composer: EffectComposer | null = null;

  constructor(canvas: HTMLCanvasElement, e2e = false) {
    installRadialFog();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !e2e, powerPreference: 'high-performance', preserveDrawingBuffer: e2e });
    this.renderer.setPixelRatio(e2e ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.autoClear = false;
    const modern = !!getModernAssets();
    if (modern) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.94;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const environment = new RoomEnvironment();
      const environmentMap = pmrem.fromScene(environment, 0.04);
      this.scene.environment = environmentMap.texture;
      this.vmScene.environment = environmentMap.texture;
      this.scene.environmentIntensity = 0.3;
      this.vmScene.environmentIntensity = 0.65;
      environment.dispose();
      pmrem.dispose();
    }

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.rotation.order = 'YXZ';
    this.vmCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.02, 10);

    this.scene.fog = new THREE.Fog(MAZE_FOG, MAZE_FOG_NEAR, MAZE_FOG_FAR);

    // lighting for dynamic meshes (enemies/pickups/doors)
    this.scene.add(new THREE.AmbientLight(modern ? 0xa4b7c2 : 0x77706d, modern ? 0.2 : 1.35));
    const hemi = new THREE.HemisphereLight(modern ? 0xc2d9e1 : 0x5a4850, modern ? 0x333028 : 0x2a2226, modern ? 0.55 : 0.7);
    this.scene.add(hemi);
    this.torch = new THREE.PointLight(0xffd9a0, 26, 14, 1.8);
    this.scene.add(this.torch);
    if (modern) {
      this.torch.color.set(0xdbe7ee);
      this.torch.intensity = 5;
      this.modernKey = new THREE.SpotLight(0xe3edf2, 24, 32, 0.82, 0.75, 1.5);
      this.modernKey.castShadow = true;
      this.modernKey.shadow.mapSize.setScalar(window.innerWidth < 650 ? 512 : 1024);
      this.modernKey.shadow.bias = -0.0004;
      this.modernKey.shadow.normalBias = 0.035;
      this.modernKey.shadow.camera.near = 0.3;
      this.scene.add(this.modernKey, this.modernKey.target);
      for (let i = 0; i < 4; i++) {
        const light = new THREE.PointLight(0xffd3a1, 0, 20, 1.6);
        this.practicalLights.push(light);
        this.scene.add(light);
      }
    }

    // viewmodel pass lights
    this.vmScene.add(new THREE.AmbientLight(modern ? 0xb6c9d5 : 0x777168, modern ? 0.7 : 1.1));
    const vmKey = new THREE.DirectionalLight(0xfff1d8, modern ? 2.0 : 1.3);
    vmKey.position.set(-0.6, 1, 0.4);
    this.vmScene.add(vmKey);
    this.vmScene.add(this.vmHolder);

    this.enemies = new EnemyRenderer(this.scene);
    this.others = new PlayerRenderer(this.scene);
    this.pickups = new PickupRenderer(this.scene);
    this.fx = new FxRenderer(this.scene);
    // Keep the full-resolution weapon/HUD sharp. The world alone gets a very
    // restrained highlight bloom; touch devices use the cheaper direct path.
    if (modern && !window.matchMedia('(pointer: coarse)').matches) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.18, 0.35, 1.1));
      this.composer.addPass(new OutputPass());
    }
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
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
    // Keep the authored pistol and hands in frame as the portrait viewport
    // narrows. This translates only the weapon pass, never the aim camera.
    this.vmHolder.position.x = getModernAssets() ? -0.38 * Math.max(0, 1 - aspect) : 0;
  }

  setRun(sim: WorldView, artId?: CampaignArtId): void {
    if (this.world) {
      this.world.dispose();
    }
    this.fx.clearTransient();
    // enemy ids restart at 0 for every generated map, so syncStart's id diff
    // alone would reuse the previous run's rigs — complete with death poses
    // (fallen over, sunk, faded shadows). A new run gets fresh rigs.
    this.enemies.dispose();
    this.others.dispose();
    this.enemies.syncStart(sim.enemies);
    this.pickups.dispose();
    this.pickups.syncStart(sim.pickups);
    const resolved = artId;
    this.world = buildWorld(sim.map, resolved);
    this.scene.add(this.world.group);
    this.scene.fog = getModernAssets()
      ? sim.map.seed === 'campaign:01-foundry' ? new THREE.Fog(0x15282f, 24, 110) : new THREE.Fog(0x273942, 14, 72)
      : resolved
      ? new THREE.Fog(CAMPAIGN_FOG[resolved], 8, 52)
      : new THREE.Fog(MAZE_FOG, MAZE_FOG_NEAR, MAZE_FOG_FAR);
    applyRadialFogDeep(this.scene);
    this.setGun(1);
    this.lightTimer = 0;
    this.updateModernLights(sim, 0);
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
    if (this.viewModel) {
      // A flash belongs to its current gun. Disposing the whole old model
      // also disposes that sprite, so clear the live reference before a later
      // frame can try to retire the same material again.
      this.muzzleSprite = null;
      this.muzzleLife = 0;
      disposeOwnedObject(this.viewModel.group);
    }
    this.viewModel = buildViewModel(id);
    this.vmHolder.add(this.viewModel.group);
    // switch dip animation
    this.vmHolder.position.y = -0.35;
  }

  private updateMuzzleSprite(color: number, size: number): void {
    if (!this.viewModel) return;
    if (this.muzzleSprite) {
      disposeOwnedObject(this.muzzleSprite);
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
    const colors = GUN_FLASH;
    // make sure the flash attaches to the gun actually firing (switch this frame?)
    this.setGun(gunId);
    this.updateMuzzleSprite(colors[gunId - 1], sizes[gunId - 1]);
    // world light at the muzzle, pointing away from camera
    const dx = -Math.sin(yaw) * Math.cos(pitch);
    const dz = -Math.cos(yaw) * Math.cos(pitch);
    this.fx.muzzleFlashWorld(px + dx * 1.4, 1.6, pz + dz * 1.4, sizes[gunId - 1] * 0.8, colors[gunId - 1]);
  }

  update(dt: number, sim: WorldView, inputMoving: boolean): void {
    const p = sim.player;
    // camera
    this.camera.position.set(p.x, 1.7, p.z);
    // Look lives on the camera (mouse / touch). Do not slam rotation from
    // player — a real click must fire along this orientation, not a stale
    // yaw-only player.pitch. Game.pullAimFromCamera copies it into the sim.
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
    if (this.world?.sky) this.world.sky.position.copy(this.camera.position);
    this.torch.position.copy(this.camera.position);
    this.updateModernLights(sim, dt);

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
        disposeOwnedObject(this.muzzleSprite);
        this.muzzleSprite = null;
      }
    }

    // world layers
    if (this.world) {
      for (const d of sim.doors) {
        const mesh = this.world.doorMeshes.get(d.id);
        if (mesh) mesh.position.y = (WALL_H * 0.72) / 2 + d.offset * (WALL_H * 0.72 + 0.25);
      }
      for (const s of sim.secrets) {
        const mesh = this.world.plateMeshes.get(s.id);
        if (mesh) mesh.position.y = (WALL_H * 0.72) / 2 + s.offset * (WALL_H * 0.72 + 0.25);
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

  }

  updateArena(dt: number, view: WorldView, remotes: RemotePlayerPose[], moving: boolean): void {
    this.update(dt, view, moving);
    this.others.update(dt, remotes, this.camera, view);
  }

  private updateModernLights(view: WorldView, dt: number): void {
    if (!this.modernKey) return;
    const authored = view.map.seed === 'campaign:01-foundry' && view.player.x >= 12 && view.player.x < 104 && view.player.z >= 78 && view.player.z < 96;
    this.torch.intensity = authored ? 1.2 : 5;
    this.modernKey.intensity = authored ? 8 : 24;
    if (authored) this.practicalLights.forEach(light => { light.visible = false; });
    this.camera.getWorldDirection(this.lightDirection);
    this.modernKey.position.copy(this.camera.position).add(new THREE.Vector3(-0.16, 0.16, 0));
    this.modernKey.target.position.copy(this.camera.position).addScaledVector(this.lightDirection, 14);
    this.lightTimer -= dt;
    if (this.lightTimer > 0) return;
    this.lightTimer = 0.25;
    if (authored) return;
    const { x, z } = view.player;
    const nearest = [...view.map.lights].sort((a, b) =>
      (a.x - x) ** 2 + (a.z - z) ** 2 - (b.x - x) ** 2 - (b.z - z) ** 2,
    ).slice(0, this.practicalLights.length);
    this.practicalLights.forEach((light, i) => {
      const source = nearest[i];
      light.visible = !!source;
      if (!source) return;
      light.position.set(source.x, Math.min(source.y, 3.8), source.z);
      light.color.setRGB(...source.color).lerp(new THREE.Color(0xf0d6b4), 0.65);
      light.intensity = 24 * source.intensity;
      light.distance = Math.min(24, source.radius * 1.2);
    });
  }

  get enemyRigInfo(): { id: number; visible: boolean; x: number; z: number; scale: number; rotX: number }[] {
    return this.enemies.rigInfo();
  }

  get enemyUpdateCount(): number {
    return this.enemies.updateCount;
  }

  /** E2E-only callers read this through Game's debug API. */
  get debugStats(): { frames: number; geometries: number; textures: number } {
    return {
      frames: this.renderFrames,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }

  render(): void {
    this.renderFrames++;
    this.renderer.clear();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.vmScene, this.vmCamera);
  }

  // camera helper for screenshots/debug posing
  poseCamera(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(pitch, yaw, 0);
    if (this.world?.sky) this.world.sky.position.copy(this.camera.position);
    if (this.modernKey) {
      this.camera.getWorldDirection(this.lightDirection);
      this.modernKey.position.copy(this.camera.position);
      this.modernKey.target.position.copy(this.camera.position).addScaledVector(this.lightDirection, 14);
    }
  }
}
