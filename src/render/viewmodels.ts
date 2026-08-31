// First-person viewmodels: seven distinct guns held low-right, barrels
// receding toward the crosshair, hands visible. Rendered in a separate
// cleared-depth pass so they never clip walls.
import * as THREE from 'three';
import { getTextures } from './textures';

export interface ViewModel {
  group: THREE.Group;
  muzzle: THREE.Object3D;      // world-of-viewmodel muzzle tip
  update: (dt: number, s: VMState) => void;
}

export interface VMState {
  moving: number;      // 0..1
  firing: boolean;
  recoil: number;      // 0..1, decays
  time: number;
}

const metalMat = () => new THREE.MeshLambertMaterial({ color: 0x33373d });
const darkMat = () => new THREE.MeshLambertMaterial({ color: 0x1d1f24 });
const accent = (c: number) => new THREE.MeshBasicMaterial({ color: c });
const skinMat = () => new THREE.MeshLambertMaterial({ color: 0xb98d6f });
const woodMat = () => new THREE.MeshLambertMaterial({ color: 0x5c4126 });

function box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
}
function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 10): THREE.Mesh {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  g.rotation.x = Math.PI / 2; // along Z
  return g;
}

/** A right hand wrapping a grip at the given local position. */
function addHand(group: THREE.Group, x: number, y: number, z: number, squeeze = 1): void {
  const hand = new THREE.Group();
  const palm = box(0.075 * squeeze, 0.085, 0.075, skinMat());
  hand.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = box(0.018, 0.05, 0.02, skinMat());
    f.position.set(-0.028 + i * 0.019, 0.005, -0.045 - (i % 2) * 0.008);
    f.rotation.x = 0.5;
    hand.add(f);
  }
  const thumb = box(0.02, 0.045, 0.022, skinMat());
  thumb.position.set(0.045, 0.01, -0.02);
  thumb.rotation.z = -0.5;
  hand.add(thumb);
  // forearm going down-right off screen
  const arm = box(0.07, 0.07, 0.3, skinMat());
  arm.position.set(0.05, -0.02, 0.17);
  arm.rotation.x = -0.35;
  arm.rotation.y = -0.2;
  hand.add(arm);
  hand.position.set(x, y, z);
  group.add(hand);
}

function baseGroup(): { group: THREE.Group; holder: THREE.Group } {
  const group = new THREE.Group();
  const holder = new THREE.Group();
  // held low-right, angled toward the crosshair
  holder.position.set(0.26, -0.26, -0.62);
  holder.rotation.set(0.06, 0.12, 0.02);
  group.add(holder);
  return { group, holder };
}

function stdUpdate(holder: THREE.Group, extra?: (dt: number, s: VMState) => void) {
  return (dt: number, s: VMState) => {
    const bob = s.moving * Math.sin(s.time * 9.2) * 0.012;
    const bobY = s.moving * Math.abs(Math.cos(s.time * 9.2)) * 0.014;
    const kick = s.recoil * s.recoil;
    holder.position.set(
      0.26 + bob,
      -0.26 + bobY + kick * 0.03,
      -0.62 + kick * 0.09,
    );
    holder.rotation.set(0.06 + kick * 0.16, 0.12 - bob * 0.6, 0.02);
    if (extra) extra(dt, s);
  };
}

// ------------------------------------------------------------------ guns

function buildPistol(): ViewModel {
  const { group, holder } = baseGroup();
  const m = metalMat(), d = darkMat();
  const slide = box(0.055, 0.06, 0.26, m);
  slide.position.set(0, 0.02, -0.1);
  holder.add(slide);
  const frame = box(0.05, 0.04, 0.2, d);
  frame.position.set(0, -0.02, -0.06);
  holder.add(frame);
  const barrel = cyl(0.014, 0.014, 0.06, d, 8);
  barrel.position.set(0, 0.028, -0.24);
  holder.add(barrel);
  const grip = box(0.048, 0.13, 0.06, d);
  grip.position.set(0, -0.09, 0.03);
  grip.rotation.x = 0.25;
  holder.add(grip);
  const sight = box(0.012, 0.015, 0.02, m);
  sight.position.set(0, 0.058, -0.2);
  holder.add(sight);
  addHand(holder, 0.005, -0.1, 0.045);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.028, -0.28);
  holder.add(muzzle);
  const slideRef = slide;
  return { group, muzzle, update: stdUpdate(holder, (_dt, s) => {
    slideRef.position.z = -0.1 + s.recoil * 0.05;
  }) };
}

function buildShotgun(): ViewModel {
  const { group, holder } = baseGroup();
  const m = metalMat(), w = woodMat(), d = darkMat();
  // double barrel
  for (const s of [-1, 1]) {
    const barrel = cyl(0.026, 0.028, 0.52, m, 12);
    barrel.position.set(0.028 * s, 0.045, -0.24);
    holder.add(barrel);
    const rim = cyl(0.03, 0.03, 0.02, d, 12);
    rim.position.set(0.028 * s, 0.045, -0.5);
    holder.add(rim);
  }
  const breech = box(0.1, 0.09, 0.16, d);
  breech.position.set(0, 0.02, 0.04);
  holder.add(breech);
  const stock = box(0.06, 0.08, 0.22, w);
  stock.position.set(0, -0.03, 0.2);
  stock.rotation.x = 0.12;
  holder.add(stock);
  const pump = box(0.08, 0.05, 0.12, w);
  pump.position.set(0, 0.0, -0.18);
  holder.add(pump);
  addHand(holder, 0.0, -0.05, 0.12); // trigger hand
  addHand(holder, -0.01, -0.02, -0.18); // pump hand
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.045, -0.53);
  holder.add(muzzle);
  const pumpRef = pump;
  return { group, muzzle, update: stdUpdate(holder, (_dt, s) => {
    pumpRef.position.z = -0.18 + s.recoil * 0.12;
  }) };
}

function buildChaingun(): ViewModel {
  const { group, holder } = baseGroup();
  const m = metalMat(), d = darkMat();
  const body = box(0.11, 0.1, 0.22, d);
  body.position.set(0, 0, -0.05);
  holder.add(body);
  const barrelCluster = new THREE.Group();
  barrelCluster.position.set(0, 0.02, -0.16);
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 / 6) * i;
    const b = cyl(0.014, 0.014, 0.4, m, 8);
    b.position.set(Math.cos(a) * 0.032, Math.sin(a) * 0.032, -0.14);
    barrelCluster.add(b);
  }
  const shroud = cyl(0.055, 0.055, 0.1, d, 12);
  shroud.position.set(0, 0.02, 0.04);
  holder.add(shroud);
  holder.add(barrelCluster);
  const ammoBox = box(0.09, 0.09, 0.1, m);
  ammoBox.position.set(-0.09, -0.04, -0.02);
  holder.add(ammoBox);
  const feed = box(0.03, 0.02, 0.16, d);
  feed.position.set(-0.05, 0.02, -0.06);
  holder.add(feed);
  addHand(holder, 0.0, -0.09, 0.08, 1.15);
  addHand(holder, -0.08, -0.05, -0.04, 0.9);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.44);
  holder.add(muzzle);
  let spin = 0;
  const clusterRef = barrelCluster;
  return { group, muzzle, update: stdUpdate(holder, (dt, s) => {
    spin += (s.firing ? 26 : Math.max(0, spin * 0.9)) * dt + (s.firing ? 0 : 0);
    if (!s.firing) spin *= 0.92;
    clusterRef.rotation.z = spin;
  }) };
}

function buildSpiker(): ViewModel {
  const { group, holder } = baseGroup();
  const m = metalMat(), d = darkMat();
  const body = box(0.09, 0.09, 0.3, m);
  body.position.set(0, 0.01, -0.1);
  holder.add(body);
  const magazine = box(0.05, 0.16, 0.07, d);
  magazine.position.set(0, -0.1, -0.02);
  magazine.rotation.x = -0.12;
  holder.add(magazine);
  // nails visible in the top rail
  for (let i = 0; i < 4; i++) {
    const nail = box(0.008, 0.008, 0.09, accent(0xb8c4cc));
    nail.position.set(-0.02 + i * 0.013, 0.065, -0.02);
    holder.add(nail);
  }
  const muzzleBlock = box(0.06, 0.06, 0.08, d);
  muzzleBlock.position.set(0, 0.01, -0.28);
  holder.add(muzzleBlock);
  const spike = cyl(0.012, 0.02, 0.1, m, 6);
  spike.position.set(0, 0.01, -0.36);
  holder.add(spike);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12), accent(0x7bff4d));
  coil.position.set(0, 0.01, -0.24);
  holder.add(coil);
  addHand(holder, 0.0, -0.1, 0.06);
  addHand(holder, -0.0, -0.05, -0.2, 0.85);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, -0.42);
  holder.add(muzzle);
  return { group, muzzle, update: stdUpdate(holder) };
}

function buildBile(): ViewModel {
  const { group, holder } = baseGroup();
  const m = metalMat(), d = darkMat();
  // stubby wide tube
  const tube = cyl(0.075, 0.08, 0.42, m, 14);
  tube.position.set(0, 0.03, -0.16);
  holder.add(tube);
  const mouth = cyl(0.085, 0.075, 0.05, d, 14);
  mouth.position.set(0, 0.03, -0.38);
  holder.add(mouth);
  const drum = cyl(0.09, 0.09, 0.09, d, 12);
  drum.rotation.x = 0;
  drum.position.set(0, -0.03, -0.1);
  holder.add(drum);
  const grip = box(0.05, 0.12, 0.06, d);
  grip.position.set(0, -0.11, 0.05);
  grip.rotation.x = 0.3;
  holder.add(grip);
  // green goo glow in the feed
  const goo = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 12), accent(0x59ff3a));
  goo.rotation.y = Math.PI / 2;
  goo.position.set(0, 0.06, -0.16);
  holder.add(goo);
  addHand(holder, 0.005, -0.12, 0.07);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, -0.42);
  holder.add(muzzle);
  const drumRef = drum;
  return { group, muzzle, update: stdUpdate(holder, (_dt, s) => {
    drumRef.rotation.z = s.recoil * 1.2;
  }) };
}

function buildSunlance(): ViewModel {
  const { group, holder } = baseGroup();
  const m = metalMat(), d = darkMat();
  // long sleek rail body
  const body = box(0.07, 0.08, 0.5, m);
  body.position.set(0, 0.02, -0.18);
  holder.add(body);
  const shroud = box(0.09, 0.05, 0.3, d);
  shroud.position.set(0, 0.065, -0.16);
  holder.add(shroud);
  // glowing accelerator rings
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14), accent(0xffd23a));
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0, 0.02, -0.3 - i * 0.09);
    holder.add(ring);
    rings.push(ring);
  }
  const scope = cyl(0.02, 0.02, 0.14, d, 8);
  scope.position.set(0, 0.1, -0.1);
  holder.add(scope);
  const grip = box(0.045, 0.12, 0.06, d);
  grip.position.set(0, -0.1, 0.08);
  grip.rotation.x = 0.28;
  holder.add(grip);
  const cell = box(0.05, 0.06, 0.1, accent(0x8a5cff));
  cell.position.set(0, -0.04, -0.02);
  holder.add(cell);
  addHand(holder, 0.005, -0.12, 0.1);
  addHand(holder, 0, -0.04, -0.22, 0.85);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.5);
  holder.add(muzzle);
  return { group, muzzle, update: stdUpdate(holder, (_dt, s) => {
    rings.forEach((r, i) => {
      const k = 0.7 + 0.3 * Math.sin(s.time * 6 - i) + s.recoil;
      (r.material as THREE.MeshBasicMaterial).color.setRGB(Math.min(1, k), 0.82 * k, 0.23 * k);
    });
  }) };
}

function buildSeventh(): ViewModel {
  const { group, holder } = baseGroup();
  const m = metalMat(), d = darkMat();
  // chunky cannon
  const body = box(0.14, 0.12, 0.34, m);
  body.position.set(0, 0.02, -0.12);
  holder.add(body);
  const barrel = cyl(0.06, 0.075, 0.3, d, 12);
  barrel.position.set(0, 0.03, -0.4);
  holder.add(barrel);
  const crown = cyl(0.085, 0.06, 0.06, m, 12);
  crown.position.set(0, 0.03, -0.56);
  holder.add(crown);
  // void core: pulsing black-purple sphere in a cage
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshBasicMaterial({ color: 0x1a0330 }));
  core.position.set(0, 0.06, -0.05);
  holder.add(core);
  const coreGlow = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), new THREE.MeshBasicMaterial({ color: 0x9a3bff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }));
  coreGlow.position.copy(core.position);
  holder.add(coreGlow);
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 16), d);
  cage.rotation.y = Math.PI / 2;
  cage.position.copy(core.position);
  holder.add(cage);
  // spine fins
  for (const s of [-1, 1]) {
    const fin = box(0.02, 0.09, 0.16, m);
    fin.position.set(0.075 * s, 0.05, -0.2);
    fin.rotation.z = 0.25 * s;
    holder.add(fin);
  }
  const grip = box(0.05, 0.13, 0.06, d);
  grip.position.set(0, -0.12, 0.1);
  grip.rotation.x = 0.3;
  holder.add(grip);
  addHand(holder, 0.005, -0.14, 0.12, 1.1);
  addHand(holder, 0, -0.03, -0.3, 0.9);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, -0.6);
  holder.add(muzzle);
  const coreRef = core, glowRef = coreGlow;
  return { group, muzzle, update: stdUpdate(holder, (_dt, s) => {
    const p = 0.9 + Math.sin(s.time * 7) * 0.12 + s.recoil * 1.4;
    coreRef.scale.setScalar(p);
    (glowRef.material as THREE.MeshBasicMaterial).opacity = 0.25 + (p - 0.9) * 0.5;
  }) };
}

const builders = [buildPistol, buildShotgun, buildChaingun, buildSpiker, buildBile, buildSunlance, buildSeventh];

export function buildViewModel(gunId: number): ViewModel {
  return builders[gunId - 1]();
}

/** Small world-scale version used for pedestal pickups and HUD icons. */
export function buildWorldGun(gunId: number): THREE.Group {
  const vm = builders[gunId - 1]();
  const g = vm.group;
  g.scale.setScalar(1.35);
  g.rotation.y = Math.PI / 2 + 0.4;
  return g;
}

export { addHand };
