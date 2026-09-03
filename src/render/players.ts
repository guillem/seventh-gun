import * as THREE from 'three';
import { PLAYER_HEIGHT } from '../sim/types';
import { hasVisualLineOfSight, type SolidState } from '../sim/physics';

export const PLAYER_PALETTES = [
  0xc45c48, 0x4aa8c4, 0xc4a848, 0x6cc46c, 0xb06cc4,
  0xc47a4a, 0x4ac4b0, 0xc46c8c, 0x8c8c4a, 0x6c8cc4,
];

export interface RemotePlayerPose {
  id: number;
  name: string;
  colorIndex: number;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  alive: boolean;
}

interface Rig {
  id: number;
  group: THREE.Group;
  body: THREE.Mesh;
  nameSprite: THREE.Sprite;
}

export class PlayerRenderer {
  private rigs = new Map<number, Rig>();
  constructor(private scene: THREE.Scene) {}

  update(
    dt: number,
    others: RemotePlayerPose[],
    camera: THREE.PerspectiveCamera,
    solid: SolidState,
  ): void {
    const seen = new Set<number>();
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const cam = camera.position;

    for (const p of others) {
      seen.add(p.id);
      let rig = this.rigs.get(p.id);
      if (!rig) {
        rig = this.makeRig(p);
        this.rigs.set(p.id, rig);
        this.scene.add(rig.group);
      }
      rig.group.position.set(p.x, 0, p.z);
      rig.group.rotation.y = p.yaw;
      if (!p.alive) rig.group.rotation.z = Math.min(1.2, rig.group.rotation.z + dt * 2);
      else rig.group.rotation.z = 0;

      const dist = Math.hypot(p.x - cam.x, p.z - cam.z);
      const inRange = dist < 60 && frustum.containsPoint(rig.group.position);
      const los = inRange && hasVisualLineOfSight(solid, cam.x, cam.z, p.x, p.z);
      rig.group.visible = !!los;
      this.setName(rig, p);
    }

    for (const [id, rig] of this.rigs) {
      if (seen.has(id)) continue;
      this.scene.remove(rig.group);
      this.rigs.delete(id);
    }
  }

  dispose(): void {
    for (const rig of this.rigs.values()) this.scene.remove(rig.group);
    this.rigs.clear();
  }

  private makeRig(p: RemotePlayerPose): Rig {
    const color = PLAYER_PALETTES[p.colorIndex % PLAYER_PALETTES.length]!;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.45, PLAYER_HEIGHT - 0.9, 4, 8),
      new THREE.MeshLambertMaterial({ color }),
    );
    body.position.y = PLAYER_HEIGHT * 0.5;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xe8d8c8 }),
    );
    head.position.y = PLAYER_HEIGHT - 0.15;
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.1, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x111111 }),
    );
    visor.position.set(0, PLAYER_HEIGHT - 0.12, -0.22);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.55),
      new THREE.MeshLambertMaterial({ color: 0x333333 }),
    );
    gun.position.set(0.35, 1.1, -0.35);
    group.add(body, head, visor, gun);
    const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: true }));
    nameSprite.position.y = PLAYER_HEIGHT + 0.45;
    nameSprite.scale.set(1.6, 0.4, 1);
    group.add(nameSprite);
    return { id: p.id, group, body, nameSprite };
  }

  private setName(rig: Rig, p: RemotePlayerPose): void {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#e8e4c8';
    g.font = '20px monospace';
    g.textAlign = 'center';
    g.fillText(p.name.slice(0, 16), 128, 28);
    g.fillStyle = '#3a3a3a';
    g.fillRect(20, 40, 216, 10);
    g.fillStyle = '#c22a2a';
    g.fillRect(20, 40, 216 * Math.max(0, Math.min(1, p.hp / 100)), 10);
    const tex = new THREE.CanvasTexture(c);
    (rig.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
    (rig.nameSprite.material as THREE.SpriteMaterial).map = tex;
    (rig.nameSprite.material as THREE.SpriteMaterial).needsUpdate = true;
  }
}
