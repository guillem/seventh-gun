// Visual effects: muzzle flashes, tracers, rail beam, projectile meshes,
// explosions, blood, gibs. Fed by sim events + projectile state.
import * as THREE from 'three';
import { getTextures } from './textures';
import type { ProjectileEnt } from '../sim/sim';

interface TimedEffect {
  obj: THREE.Object3D;
  life: number;
  maxLife: number;
  tick?: (t: number, k: number) => void;
  light?: THREE.PointLight;
}

interface Particle {
  sprite: THREE.Sprite;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  gravity: number;
  size: number;
}

export class FxRenderer {
  private scene: THREE.Scene;
  private effects: TimedEffect[] = [];
  private particles: Particle[] = [];
  private projectileMeshes = new Map<number, THREE.Object3D>();
  private tex = getTextures();
  time = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private addEffect(obj: THREE.Object3D, maxLife: number, tick?: (t: number, k: number) => void, light?: THREE.PointLight): void {
    this.scene.add(obj);
    if (light) { obj.add(light); }
    this.effects.push({ obj, life: 0, maxLife, tick, light });
  }

  // ------------------------------------------------------------- weapons
  muzzleFlashWorld(x: number, y: number, z: number, size: number, color = 0xffc23a): void {
    const light = new THREE.PointLight(color, 40 * size, 16 * size, 1.8);
    const holder = new THREE.Object3D();
    holder.position.set(x, y, z);
    this.addEffect(holder, 0.07, undefined, light);
  }

  tracer(x0: number, y0: number, z0: number, x1: number, z1: number, kind: 'bullets' | 'rail'): void {
    if (kind === 'rail') {
      // bright movie-laser beam: hot core + additive jacket
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const group = new THREE.Group();
      group.position.set(x0, y0, z0);
      group.lookAt(x1, y0, z1);
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, len, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, fog: false }),
      );
      core.rotation.x = Math.PI / 2;
      core.position.z = -len / 2;
      group.add(core);
      const jacket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, len, 6),
        new THREE.MeshBasicMaterial({ color: 0x37e6ff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.7, fog: false }),
      );
      jacket.rotation.x = Math.PI / 2;
      jacket.position.z = -len / 2;
      group.add(jacket);
      const light = new THREE.PointLight(0x37e6ff, 80, 26, 1.8);
      this.addEffect(group, 0.16, (_t, k) => {
        (core.material as THREE.MeshBasicMaterial).opacity = k;
        (jacket.material as THREE.MeshBasicMaterial).opacity = 0.7 * k;
        if (light) light.intensity = 80 * k;
      }, light);
      // impact flare
      this.spawnParticles(x1, y0, z1, 10, 0x9ff4ff, 5, 0.5, 0.16);
      return;
    }
    // bullet tracer: short glowing streak along the ray
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 2) return;
    const start = Math.max(0, len * 0.3);
    const segLen = Math.min(len - start, 6);
    const dirX = dx / len, dirZ = dz / len;
    const geo = new THREE.BoxGeometry(0.03, 0.03, segLen);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, blending: THREE.AdditiveBlending, transparent: true, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x0 + dirX * (start + segLen / 2), y0, z0 + dirZ * (start + segLen / 2));
    m.lookAt(x1, y0, z1);
    this.addEffect(m, 0.05, (_t, k) => { mat.opacity = k; });
  }

  explosion(x: number, y: number, z: number, radius: number): void {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.45, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffd28a, blending: THREE.AdditiveBlending, transparent: true, fog: false }),
    );
    group.add(ball);
    const shock = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.7, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.6, fog: false, wireframe: true }),
    );
    group.add(shock);
    const light = new THREE.PointLight(0xff9a3a, 90, radius * 6, 1.8);
    this.addEffect(group, 0.5, (t, k) => {
      ball.scale.setScalar(0.6 + t * 1.6);
      (ball.material as THREE.MeshBasicMaterial).opacity = k;
      shock.scale.setScalar(0.5 + t * 2.2);
      (shock.material as THREE.MeshBasicMaterial).opacity = 0.6 * k;
      if (light) light.intensity = 90 * k;
    }, light);
    this.spawnParticles(x, y, z, Math.round(10 + radius * 4), 0xffa03a, 7, 0.4, 0.3);
    this.spawnParticles(x, y, z, Math.round(6 + radius * 2), 0x554d45, 3, 0.9, 0.8);
  }

  blood(x: number, y: number, z: number, big = false): void {
    this.spawnParticles(x, y, z, big ? 22 : 9, 0x8a1220, big ? 6 : 4, 0.5, 0.22);
  }

  gibs(x: number, y: number, z: number, color = 0x6a2430): void {
    this.spawnParticles(x, y, z, 16, color, 7, 1.4, 0.3);
    this.spawnParticles(x, y, z, 8, 0x3a0d16, 5, 1.6, 0.28);
  }

  sealBreakFx(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 2, z);
    for (let i = 0; i < 40; i++) {
      const s = this.makeParticle(0xc44dff, 0.8);
      s.position.set(x + (Math.random() - 0.5) * 3, 0.5 + Math.random() * 3.5, z + (Math.random() - 0.5) * 0.8);
      this.scene.add(s);
      this.particles.push({
        sprite: s,
        vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 6,
        life: 0, maxLife: 1.2, gravity: 6, size: 0.5 + Math.random() * 0.5,
      });
    }
    this.explosion(x, 2.2, z, 4);
  }

  private makeParticle(color: number, size: number): THREE.Sprite {
    const mat = new THREE.SpriteMaterial({ map: this.tex.particle, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size);
    return s;
  }

  spawnParticles(x: number, y: number, z: number, count: number, color: number, speed: number, life: number, size: number): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 240) return;
      const s = this.makeParticle(color, size * (0.6 + Math.random() * 0.8));
      s.position.set(x, y, z);
      this.scene.add(s);
      this.particles.push({
        sprite: s,
        vx: (Math.random() - 0.5) * speed * 2,
        vy: Math.random() * speed,
        vz: (Math.random() - 0.5) * speed * 2,
        life: 0, maxLife: life * (0.7 + Math.random() * 0.6),
        gravity: 9, size: s.scale.x,
      });
    }
  }

  // ------------------------------------------------------------- projectiles
  private buildProjectileMesh(kind: string): THREE.Object3D {
    const g = new THREE.Group();
    switch (kind) {
      case 'nail': {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), new THREE.MeshLambertMaterial({ color: 0x9aa6ad }));
        g.add(m);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 5), new THREE.MeshLambertMaterial({ color: 0xc9d4da }));
        tip.rotation.x = -Math.PI / 2;
        tip.position.z = -0.24;
        g.add(tip);
        break;
      }
      case 'grenade': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshLambertMaterial({ color: 0x39503a }));
        g.add(m);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 5, 10), new THREE.MeshBasicMaterial({ color: 0x7dff4a }));
        band.rotation.x = Math.PI / 2;
        g.add(band);
        break;
      }
      case 'voidorb': {
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshBasicMaterial({ color: 0x12021f }));
        g.add(core);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 10), new THREE.MeshBasicMaterial({ color: 0x9a3bff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending }));
        g.add(glow);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 18), new THREE.MeshBasicMaterial({ color: 0xd7a5ff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8 }));
        g.add(halo);
        g.add(new THREE.PointLight(0x9a3bff, 30, 13, 1.8));
        break;
      }
      case 'plasma': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0x4dff6a }));
        g.add(m);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), new THREE.MeshBasicMaterial({ color: 0x4dff6a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }));
        g.add(glow);
        break;
      }
      case 'spit': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 7), new THREE.MeshBasicMaterial({ color: 0xc8ff3a }));
        m.scale.z = 1.5;
        g.add(m);
        break;
      }
      case 'fireball': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 8), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
        g.add(m);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.45, 9, 8), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending }));
        g.add(glow);
        g.add(new THREE.PointLight(0xff7a2a, 22, 10, 1.8));
        break;
      }
      case 'bolt': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 7), new THREE.MeshBasicMaterial({ color: 0x53e0ff }));
        m.scale.z = 2.2;
        g.add(m);
        break;
      }
      case 'orb': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 9, 8), new THREE.MeshBasicMaterial({ color: 0xc44dff }));
        g.add(m);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 9, 8), new THREE.MeshBasicMaterial({ color: 0xc44dff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending }));
        g.add(glow);
        break;
      }
    }
    return g;
  }

  syncProjectiles(projectiles: ProjectileEnt[]): void {
    const ids = new Set(projectiles.map(p => p.id));
    for (const [id, mesh] of this.projectileMeshes) {
      if (!ids.has(id)) {
        this.scene.remove(mesh);
        this.projectileMeshes.delete(id);
      }
    }
    for (const p of projectiles) {
      let mesh = this.projectileMeshes.get(p.id);
      if (!mesh) {
        mesh = this.buildProjectileMesh(p.kind);
        this.projectileMeshes.set(p.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(p.x, p.y, p.z);
      const hv = Math.hypot(p.vx, p.vz);
      if (hv > 0.01) {
        mesh.rotation.set(Math.atan2(p.vy, hv) * (p.kind === 'nail' ? 1 : 0), Math.atan2(p.vx, p.vz), 0, 'YXZ');
        if (p.kind === 'nail') mesh.rotation.x = -Math.atan2(p.vy, hv);
      }
      if (p.kind === 'grenade') mesh.rotation.x += 0.3;
      if (p.kind === 'voidorb') mesh.rotation.y += 0.2;
    }
  }

  // ------------------------------------------------------------- frame
  update(dt: number): void {
    this.time += dt;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life += dt;
      const k = 1 - e.life / e.maxLife;
      if (e.life >= e.maxLife) {
        this.scene.remove(e.obj);
        this.effects.splice(i, 1);
        continue;
      }
      if (e.tick) e.tick(e.life / e.maxLife, k);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.sprite);
        (p.sprite.material as THREE.SpriteMaterial).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      if (p.sprite.position.y < 0.05) { p.vy = Math.abs(p.vy) * 0.3; p.sprite.position.y = 0.05; }
      const k = 1 - p.life / p.maxLife;
      (p.sprite.material as THREE.SpriteMaterial).opacity = k;
      p.sprite.scale.setScalar(p.size * (0.4 + 0.6 * k));
    }
  }

  clearTransient(): void {
    for (const e of this.effects) this.scene.remove(e.obj);
    this.effects.length = 0;
    for (const p of this.particles) this.scene.remove(p.sprite);
    this.particles.length = 0;
    for (const [, m] of this.projectileMeshes) this.scene.remove(m);
    this.projectileMeshes.clear();
  }
}
