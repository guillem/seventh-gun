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
import { CAMPAIGN_ENVIRONMENT_PALETTES } from './campaignEnvironment';
import { hasVisualLineOfSight } from '../sim/physics';
import { applyRadialFogDeep, installRadialFog } from './radialFog';
import { disposeOwnedObject } from './dispose';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getModernAssets } from './modernAssets';
import { planRoomVolumes, type RoomVolumes } from './roomVolumes';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ContactOcclusionPass } from './contactOcclusion';
import { placeFoundryActorLights } from './foundryLighting';
import { MODERN_PRACTICAL_LIGHT_LIMIT, selectModernPracticalLights } from './modernLighting';
import { prepareGpuResources } from './prepareGpu';

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
  private viewmodels = new Map<number, ViewModel>();
  private vmHolder = new THREE.Group();
  private currentGun = 0;
  private viewBob = 0;
  private presentationTime = 0;
  private torch: THREE.PointLight;
  private hemisphere: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  private artId?: CampaignArtId;
  private volumes?: RoomVolumes;
  private muzzleSprite: THREE.Sprite | null = null;
  private muzzleLife = 0;
  private baseFov = 75;
  private renderFrames = 0;
  private practicalLights: THREE.PointLight[] = [];
  private foundryActorLights: THREE.SpotLight[] = [];
  private vmAmbient: THREE.AmbientLight;
  private vmKey: THREE.DirectionalLight;
  private composer: EffectComposer | null = null;
  private environmentMap: THREE.WebGLRenderTarget | null = null;

  constructor(canvas: HTMLCanvasElement, e2e = false) {
    installRadialFog();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !e2e, powerPreference: 'high-performance', preserveDrawingBuffer: e2e });
    // Door slabs are clipped at the corridor ceiling (DOOR_CEILING_CLIP).
    this.renderer.localClippingEnabled = true;
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
      this.environmentMap = environmentMap;
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
    this.ambient = new THREE.AmbientLight(modern ? 0xa4b7c2 : 0x77706d, modern ? 0.2 : 1.35);
    this.scene.add(this.ambient);
    const hemi = new THREE.HemisphereLight(modern ? 0xc2d9e1 : 0x5a4850, modern ? 0x333028 : 0x2a2226, modern ? 0.55 : 0.7);
    this.hemisphere = hemi;
    this.scene.add(hemi);
    this.torch = new THREE.PointLight(0xffd9a0, 26, 14, 1.8);
    this.scene.add(this.torch);
    if (modern) {
      this.torch.color.set(0xdbe7ee);
      this.torch.intensity = 5;
      for (let i = 0; i < MODERN_PRACTICAL_LIGHT_LIMIT; i++) {
        const light = new THREE.PointLight(0xffd3a1, 0, 20, 1.6);
        this.practicalLights.push(light);
        this.scene.add(light);
      }
      for (let i = 0; i < 7; i++) {
        const light = new THREE.SpotLight(i < 4 ? 0xffce99 : 0xd4e5ff,
          i < 4 ? 180 : [70, 52.5, 42.5][i - 4], i < 4 ? 19 : 27, i < 4 ? .82 : .42, .7, 1.6);
        light.userData.baseIntensity = light.intensity;
        light.visible = false;
        this.foundryActorLights.push(light);
        this.scene.add(light, light.target);
      }
      placeFoundryActorLights(this.foundryActorLights);
    }

    // viewmodel pass lights
    this.vmAmbient = new THREE.AmbientLight(modern ? 0xb6c9d5 : 0x777168, modern ? 0.7 : 1.1);
    this.vmScene.add(this.vmAmbient);
    const vmKey = new THREE.DirectionalLight(0xfff1d8, modern ? 2.0 : 1.3);
    this.vmKey = vmKey;
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
      this.composer.addPass(new ContactOcclusionPass(this.scene, this.camera));
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

  /** `maze` marks a seeded solo maze, which uses the room vertical grammar. */
  setRun(sim: WorldView, artId?: CampaignArtId, maze = false): void {
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
    this.artId = artId;
    if (getModernAssets()) this.hemisphere.color.set(artId ? CAMPAIGN_ENVIRONMENT_PALETTES[artId].sky : 0xc2d9e1);
    this.volumes = planRoomVolumes(sim.map, resolved, maze);
    this.world = buildWorld(sim.map, resolved, this.volumes);
    this.scene.add(this.world.group);
    this.scene.fog = getModernAssets()
      ? sim.map.seed === 'campaign:01-foundry' ? new THREE.Fog(0x15282f, 24, 110) : new THREE.Fog(resolved ? CAMPAIGN_ENVIRONMENT_PALETTES[resolved].fog : 0x273942, 14, 78)
      : resolved
      ? new THREE.Fog(CAMPAIGN_FOG[resolved], 8, 52)
      : new THREE.Fog(MAZE_FOG, MAZE_FOG_NEAR, MAZE_FOG_FAR);
    applyRadialFogDeep(this.scene);
    this.setGun(1);
    this.viewModel?.reset?.();
    this.muzzleLife = 0;
    if (this.muzzleSprite) this.muzzleSprite.material.opacity = 0;
    this.configureModernLights(sim);
    this.poseCamera(sim.player.x, 1.7, sim.player.z, sim.player.yaw, -sim.player.pitch);
    this.prefetchDynamicMeshes();
    // Replace the preparation image before the menu is removed, with normal
    // visibility and only the equipped weapon attached.
    this.update(0, sim, false);
    this.render();
  }

  /** Submit the actual retained resources through both gameplay render paths
   * while the menu still covers the canvas. No deferred first-shot/reveal work. */
  private prefetchDynamicMeshes(): void {
    const effects = this.fx.prepareForWarmup();
    effects.group.position.copy(this.camera.position).add(new THREE.Vector3(0, 0, -2));
    this.scene.add(effects.group);
    let weapons: { release: () => void } | undefined;
    try {
      weapons = this.prepareViewmodelsForWarmup();
      prepareGpuResources(this.renderer, [this.scene, this.vmScene], () => this.render());
    } finally {
      effects.release();
      weapons?.release();
    }
  }

  setGun(id: number): void {
    if (id === this.currentGun && this.viewModel) return;
    this.currentGun = id;
    this.viewModel?.group.removeFromParent();
    let model = this.viewmodels.get(id);
    if (!model) {
      model = buildViewModel(id);
      this.viewmodels.set(id, model);
    }
    this.viewModel = model;
    model.reset?.();
    this.vmHolder.add(this.viewModel.group);
    this.viewModel.muzzle.add(this.ensureMuzzleSprite());
    this.muzzleSprite!.material.opacity = 0;
    this.muzzleLife = 0;
    // switch dip animation
    this.vmHolder.position.y = getModernAssets() ? 0 : -0.35;
  }

  private ensureMuzzleSprite(): THREE.Sprite {
    if (!this.muzzleSprite) {
      this.muzzleSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getModernAssets()?.flash ?? getTextures().flash,
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false,
        opacity: 0,
      }));
    }
    return this.muzzleSprite;
  }

  /** Retain every warmed model/material owner across weapon and map changes. */
  prepareViewmodelsForWarmup(): { release: () => void } {
    const parents = new Map<THREE.Group, THREE.Object3D | null>();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      for (const [group, parent] of parents) {
        group.removeFromParent();
        parent?.add(group);
      }
    };
    try {
      for (let id = 1; id <= 7; id++) {
        let model = this.viewmodels.get(id);
        if (!model) {
          model = buildViewModel(id);
          this.viewmodels.set(id, model);
        }
        parents.set(model.group, model.group.parent);
        this.vmHolder.add(model.group);
      }
      const sprite = this.ensureMuzzleSprite();
      (this.viewModel ?? this.viewmodels.get(1)!).muzzle.add(sprite);
      return { release };
    } catch (error) {
      release();
      throw error;
    }
  }

  disposeViewmodels(): void {
    if (this.muzzleSprite) disposeOwnedObject(this.muzzleSprite);
    this.muzzleSprite = null;
    this.muzzleLife = 0;
    for (const model of this.viewmodels.values()) {
      model.dispose?.();
      disposeOwnedObject(model.group);
    }
    this.viewmodels.clear();
    this.viewModel = null;
    this.currentGun = 0;
  }

  private updateMuzzleSprite(color: number, size: number): void {
    if (!this.viewModel) return;
    const s = this.ensureMuzzleSprite();
    s.material.color.set(color);
    s.material.opacity = 1;
    s.material.rotation = 0;
    s.scale.setScalar(getModernAssets() ? size * 0.52 : size);
    this.viewModel.muzzle.add(s);
    this.muzzleLife = getModernAssets() ? 0.06 : 0.085;
  }

  private updateMuzzleLifetime(dt: number): void {
    if (this.muzzleLife <= 0) return;
    this.muzzleLife = Math.max(0, this.muzzleLife - dt);
    if (this.muzzleSprite) {
      this.muzzleSprite.material.opacity = this.muzzleLife / 0.085;
      this.muzzleSprite.material.rotation += dt * 30;
    }
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
    // Flash sizes by gun id; the renderer owns these (WeaponDef has no hint).
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

    // gun switch visual
    this.setGun(p.gun);
    this.vmHolder.position.y = Math.min(0, this.vmHolder.position.y + dt * 2.4);

    // viewmodel state
    if (inputMoving) this.viewBob += dt;
    this.presentationTime += dt;
    if (this.viewModel) {
      this.viewModel.update(dt, {
        moving: inputMoving ? 1 : 0,
        firing: p.fireCd > 0.04,
        fireCooldown: p.fireCd,
        recoil: Math.max(0, Math.min(1, p.fireCd / 0.25)),
        time: getModernAssets() ? this.presentationTime : this.viewBob,
      });
    }
    this.updateMuzzleLifetime(dt);

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

  /** Lighting belongs to fixtures in the map, never to the player's room.
   * Configure once so crossing a doorway changes neither exposure nor shader
   * light counts. A tiny neutral camera fill only keeps nearby actors legible. */
  private configureModernLights(view: WorldView): void {
    if (!getModernAssets()) return;
    const foundry = view.map.seed === 'campaign:01-foundry';
    this.ambient.intensity = foundry ? .08 : .2;
    this.hemisphere.intensity = foundry ? .22 : .55;
    this.scene.environmentIntensity = foundry ? .08 : .3;
    this.vmAmbient.intensity = foundry ? .4 : .7;
    this.vmKey.intensity = foundry ? 1.3 : 2;
    this.vmScene.environmentIntensity = foundry ? .4 : .65;
    this.torch.intensity = .35;
    this.foundryActorLights.forEach(light => {
      light.visible = foundry;
      light.intensity = foundry ? light.userData.baseIntensity : 0;
    });
    const sources = selectModernPracticalLights(view.map, this.artId ?? this.volumes?.primaryArt, undefined, this.volumes);
    this.practicalLights.forEach((light, i) => {
      const source = sources[i];
      // Intensity zero still participates in Three's fixed shader layout.
      light.visible = true;
      light.intensity = source?.intensity ?? 0;
      if (!source) return;
      light.position.set(source.x, source.y, source.z);
      light.color.setRGB(...source.color);
      light.distance = source.distance;
      light.decay = source.decay;
    });
  }

  get enemyRigInfo(): ReturnType<EnemyRenderer['rigInfo']> {
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

  }

  dispose(): void {
    this.world?.dispose();
    this.world = null;
    this.enemies.dispose();
    this.others.dispose();
    this.pickups.dispose();
    this.fx.dispose();
    this.disposeViewmodels();
    this.composer?.passes.forEach(pass => pass.dispose());
    this.composer?.dispose();
    this.composer = null;
    this.environmentMap?.dispose();
    this.environmentMap = null;
    this.renderer.dispose();
  }
}
