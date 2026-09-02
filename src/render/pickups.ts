// Pickup meshes: medikit, ammo crates (labelled per type), guns on pedestals,
// the bone key. Bobbing, spinning, glow, ground shadow.
import * as THREE from 'three';
import { getTextures } from './textures';
import { buildWorldGun } from './viewmodels';
import type { PickupEnt } from '../sim/sim';
import { AMMO_LABEL } from '../sim/weapons';
import { applyRadialFogDeep } from './radialFog';

const AMMO_COLOR: Record<string, number> = {
  bullets: 0xd8b23a, shells: 0xc4452a, nails: 0x9aa6ad,
  grenades: 0x59a53a, cores: 0xffd23a, void: 0x9a3bff,
};

function labelSprite(text: string, color: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,10,12,0.85)';
  g.fillRect(0, 0, 128, 32);
  g.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.lineWidth = 3;
  g.strokeRect(2, 2, 124, 28);
  g.fillStyle = g.strokeStyle;
  g.font = 'bold 18px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text.slice(0, 8), 64, 17);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.9, 0.22, 1);
  return s;
}

export class PickupRenderer {
  private scene: THREE.Scene;
  private meshes = new Map<number, THREE.Group>();
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private build(p: PickupEnt): THREE.Group {
    const tex = getTextures();
    const g = new THREE.Group();
    // ground shadow
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial({ map: tex.shadow, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    g.add(shadow);

    if (p.kind === 'medikit') {
      const kit = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.3, 0.45),
        new THREE.MeshLambertMaterial({ color: 0xd8d5c8 }),
      );
      kit.position.y = 0.32;
      g.add(kit);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.02), new THREE.MeshBasicMaterial({ color: 0xd22a2a }));
      crossH.position.set(0, 0.34, 0.235);
      g.add(crossH);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.24, 0.02), new THREE.MeshBasicMaterial({ color: 0xd22a2a }));
      crossV.position.set(0, 0.34, 0.235);
      g.add(crossV);
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.02), new THREE.MeshLambertMaterial({ color: 0x777770 }));
      latch.position.set(0, 0.48, 0.23);
      g.add(latch);
    } else if (p.kind === 'ammo') {
      const color = AMMO_COLOR[p.ammoType ?? 'bullets'];
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.42, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x4a4438 }),
      );
      crate.position.y = 0.26;
      g.add(crate);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, 0.54), new THREE.MeshLambertMaterial({ color: 0x3a352c }));
      lid.position.y = 0.5;
      g.add(lid);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.52), new THREE.MeshBasicMaterial({ color }));
      band.position.y = 0.4;
      g.add(band);
      const label = labelSprite(AMMO_LABEL[p.ammoType ?? 'bullets'], color);
      label.position.set(0, 0.78, 0);
      g.add(label);
    } else if (p.kind === 'gun') {
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.42, 0.55, 10),
        new THREE.MeshLambertMaterial({ color: 0x3a3f4a }),
      );
      pedestal.position.y = 0.27;
      g.add(pedestal);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.04, 6, 14), new THREE.MeshBasicMaterial({ color: 0x37e6ff }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.56;
      g.add(rim);
      const gun = buildWorldGun(p.gun ?? 1);
      gun.position.y = 0.95;
      g.add(gun);
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x37e6ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glow.position.y = 0.95;
      g.add(glow);
      g.userData.spin = gun;
    } else if (p.kind === 'key') {
      const key = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 8, 16), new THREE.MeshLambertMaterial({ color: 0xd8c07a, emissive: 0x40320a }));
      key.add(ring);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), new THREE.MeshLambertMaterial({ color: 0xd8c07a, emissive: 0x40320a }));
      shaft.position.y = -0.24;
      key.add(shaft);
      const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), new THREE.MeshLambertMaterial({ color: 0xd8c07a }));
      tooth1.position.set(0.06, -0.34, 0);
      key.add(tooth1);
      const tooth2 = tooth1.clone();
      tooth2.position.y = -0.24;
      key.add(tooth2);
      // skull on the bow
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshLambertMaterial({ color: 0xe8dfc8 }));
      skull.position.y = 0.02;
      key.add(skull);
      key.position.y = 0.9;
      g.add(key);
      const glow = new THREE.PointLight(0xffd23a, 1.4, 5, 2);
      glow.position.y = 0.9;
      g.add(glow);
      g.userData.spin = key;
    }
    applyRadialFogDeep(g);
    return g;
  }

  syncStart(pickups: PickupEnt[]): void {
    for (const p of pickups) {
      if (p.taken) continue;
      if (!this.meshes.has(p.id)) {
        const mesh = this.build(p);
        mesh.position.set(p.x, 0, p.z);
        this.scene.add(mesh);
        this.meshes.set(p.id, mesh);
      }
    }
  }

  update(dt: number, pickups: PickupEnt[]): void {
    this.time += dt;
    for (const p of pickups) {
      const mesh = this.meshes.get(p.id);
      if (!mesh) continue;
      if (p.taken) {
        this.scene.remove(mesh);
        this.meshes.delete(p.id);
        continue;
      }
      const spin = mesh.userData.spin as THREE.Object3D | undefined;
      if (spin) {
        spin.rotation.y += dt * (p.kind === 'gun' ? 1.4 : 2.2);
        spin.position.y = (p.kind === 'gun' ? 0.95 : 0.9) + Math.sin(this.time * 2.4 + p.id) * 0.08;
      }
      const crate = mesh.children.find(c => c instanceof THREE.Mesh && (c.material as THREE.MeshLambertMaterial)?.color?.r === 0.29) as THREE.Mesh | undefined;
      if (crate && p.kind === 'ammo') crate.rotation.y = Math.sin(this.time * 0.8 + p.id) * 0.2;
    }
  }

  dispose(): void {
    for (const [, m] of this.meshes) this.scene.remove(m);
    this.meshes.clear();
  }

  setAllVisible(v: boolean): void {
    for (const [, m] of this.meshes) m.visible = v;
  }
}
