// First-person viewmodels: seven distinct guns held low-right, barrels
// receding toward the crosshair, hands visible. Rendered in a separate
// cleared-depth pass so they never clip walls. The same builders, minus the
// hands, produce the pedestal pickups (buildWorldGun).
//
// ------------------------------------------------------- the shared language
//
// A viewmodel is on screen every frame, centred, close, at one fixed angle.
// Silhouette matters less than it does for an enemy; what matters is that
// the player knows which gun they hold from the corner of their eye, and
// that the thing is not tiring to look at for an hour. So: fewer parts than
// you think, one warm material, one hot dot, and the SAME hands every time.
//
// HANDS. Armoured, not bare. The player is the arena marine (players.ts /
// playerArt.ts): dark ribbed under-suit on the limbs, a pale steel gauntlet
// block on the forearm, a dark hand. The first-person hand is that hand:
// a `glove` (marine suit skin) palm, four curled finger bars and a thumb,
// and a `gauntlet` (marine plate skin, marine steel tint) cuff on the wrist
// with the suit forearm running off screen behind it. Two placements only,
// built by gripHand() and forendHand(), and every gun uses them unchanged:
//   - gripHand: right hand on a vertical grip. Hand-local grip axis is +y
//     with the grip's top at the origin; palm on +x, fingers wrap round -z,
//     thumb lies along the near (-x) side pointing forward.
//   - forendHand: left hand (mirrored) under a horizontal forend, palm up,
//     thumb along the near side pointing forward, fingertips curling up the
//     far side. Origin is the underside of the forend.
// The forearm always leaves toward +z (the player's body), down, and out to
// its own side. Never bare skin; never a differently built hand.
//
// MATERIALS. Six, defined once in gunArt.ts gunPalette() and never added to
// inside a builder: steel (pale body metal), iron (near-black shadow metal),
// grip (the one warm material, where hands touch), glove, gauntlet, and
// hot(c) — an unlit accent used for at most ONE small element per gun, in
// that gun's muzzle-flash colour. Different guns are told apart by mass,
// width, part count and where the warm material sits, not by inventing a
// new grey.
//
// TEXTURES. Yes: 64px canvas skins, nearest-filtered, in gunArt.ts, with
// the canvas helpers copied in rather than imported (textures.ts /
// campaignTextures.ts / playerArt.ts convention: art files never shift each
// other). Iron is map-less: a black material cannot show a map, and a
// map-less dark against a mapped pale is what makes the parts read.
//
// FRAMING. The holder sits at HOLD_POS / HOLD_ROT: low-right, yawed a
// little toward the crosshair so a long barrel converges on it. Inside the
// holder every gun obeys the same local conventions so the seven feel like
// one hand switching weapons:
//   - the bore runs along -z at x = 0, at height y = BORE_Y (0.055) for a
//     one-handed gun; heavier guns may sit higher but never lower.
//   - the trigger hand's grip top is at the origin, leaning back GRIP_LEAN.
//   - the muzzle Object3D sits ON the bore axis at the barrel tip. fx and the
//     renderer attach the flash sprite there and read its world transform,
//     so it must be the real tip, not "somewhere in front".
//   - support-hand guns put the forend around z = -0.25 .. -0.3.
//   - recoil moves ONE part (slide, pump, drum) plus the whole holder via
//     stdUpdate; nothing else animates at rest except a hot element.
// The vm scene has its own lights and NO fog (renderer.ts vmScene); nothing
// here calls applyRadialFog. pickups.ts fogs the world copy itself.
import * as THREE from 'three';
import { GUN_FLASH, gunPalette, type GunPalette } from './gunArt';

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

const HOLD_POS = new THREE.Vector3(0.25, -0.22, -0.6);
const HOLD_ROT = new THREE.Euler(0.06, 0.12, 0.02);
const BORE_Y = 0.055;
const GRIP_LEAN = -0.25;   // rotation.x on a grip frame: bottom swings back toward the player

function box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
}
/** Cylinder along local Z (barrels, tubes). */
function tube(rt: number, rb: number, h: number, m: THREE.Material, seg = 8): THREE.Mesh {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  g.rotation.x = Math.PI / 2;
  return g;
}
/** Cone pointing along local -Z (teeth, spikes). */
function spike(r: number, h: number, m: THREE.Material, seg = 5): THREE.Mesh {
  const g = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
  g.rotation.x = -Math.PI / 2;
  return g;
}
/** Flat black disc so a barrel end reads as a hole rather than a plug. */
function bore(r: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.004, 8), m);
  g.rotation.x = Math.PI / 2;
  return g;
}

// ------------------------------------------------------------------ hands

// One hand, built in its own frame (see header). `side` = 1 right, -1 left.
function buildHand(p: GunPalette, side: 1 | -1): THREE.Group {
  const hand = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.x = side;
  hand.add(inner);
  // palm: the meat of the hand on the back side of the grip
  const palm = box(0.04, 0.095, 0.075, p.glove);
  palm.position.set(0.04, -0.03, -0.004);
  inner.add(palm);
  // fingers: four bars across the front, each with a curled tip on the far side
  for (let i = 0; i < 4; i++) {
    const y = 0.012 - i * 0.022;
    const f = box(0.078, 0.019, 0.024, p.glove);
    f.position.set(0.004, y, -0.046 + i * 0.002);
    inner.add(f);
    const tip = box(0.022, 0.019, 0.034, p.glove);
    tip.position.set(-0.04, y, -0.024 + i * 0.002);
    inner.add(tip);
  }
  // thumb along the near side, pointing forward and a little down
  const thumb = box(0.022, 0.062, 0.024, p.glove);
  thumb.position.set(-0.034, 0.024, -0.014);
  thumb.rotation.x = -1.25;
  inner.add(thumb);
  // wrist: gauntlet cuff, then the suit forearm running off toward the body
  const wrist = new THREE.Group();
  wrist.position.set(0.04, -0.075, 0.05);
  wrist.rotation.set(0.6, 0.25, 0);
  const cuff = box(0.085, 0.09, 0.11, p.gauntlet);
  cuff.position.set(0, 0, 0.05);
  wrist.add(cuff);
  const arm = tube(0.04, 0.045, 0.3, p.glove, 6);
  arm.position.set(0, 0, 0.24);
  wrist.add(arm);
  inner.add(wrist);
  return hand;
}

/** Right hand on a vertical grip; place at the grip top, inside the leaning grip frame. */
function gripHand(p: GunPalette): THREE.Group {
  return buildHand(p, 1);
}

/** Left hand under a horizontal forend; place at the forend's underside. */
function forendHand(p: GunPalette): THREE.Group {
  const h = buildHand(p, -1);
  // palm normal (+x after the mirror) -> up, grip axis -> forward, fingers -> far side
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(-1, 0, 0),
  );
  h.quaternion.setFromRotationMatrix(m);
  return h;
}

/** A pistol grip with its two warm panels, leaning back, top at the origin. Returns the leaning frame. */
function gripFrame(p: GunPalette, w: number, h: number, d: number): THREE.Group {
  const frame = new THREE.Group();
  frame.rotation.x = GRIP_LEAN;
  const core = box(w, h, d, p.iron);
  core.position.set(0, -h / 2 + 0.005, 0);
  frame.add(core);
  for (const s of [-1, 1]) {
    const panel = box(0.006, h * 0.72, d * 0.8, p.grip);
    panel.position.set(s * (w / 2 + 0.002), -h / 2 - 0.006, 0.002);
    frame.add(panel);
  }
  return frame;
}

/** Trigger guard: a thin iron loop hanging under the frame ahead of the grip. */
function triggerGuard(p: GunPalette, zFront: number, zBack: number, yTop: number): THREE.Group {
  const g = new THREE.Group();
  const len = zBack - zFront;
  const bar = box(0.012, 0.008, len, p.iron);
  bar.position.set(0, yTop - 0.04, (zFront + zBack) / 2);
  g.add(bar);
  const front = box(0.012, 0.044, 0.008, p.iron);
  front.position.set(0, yTop - 0.02, zFront);
  g.add(front);
  const trigger = box(0.008, 0.026, 0.007, p.iron);
  trigger.position.set(0, yTop - 0.02, zBack - 0.02);
  trigger.rotation.x = 0.35;
  g.add(trigger);
  return g;
}

// ---------------------------------------------------------------- plumbing

interface GunParts {
  gun: THREE.Group;                       // the weapon alone, hands excluded
  muzzle: THREE.Object3D;                 // on the bore axis at the tip
  animate?: (dt: number, s: VMState) => void;
}

type Builder = (p: GunPalette, hands: boolean) => GunParts;

function baseGroup(): { group: THREE.Group; holder: THREE.Group } {
  const group = new THREE.Group();
  const holder = new THREE.Group();
  holder.position.copy(HOLD_POS);
  holder.rotation.copy(HOLD_ROT);
  group.add(holder);
  return { group, holder };
}

function stdUpdate(holder: THREE.Group, extra?: (dt: number, s: VMState) => void) {
  return (dt: number, s: VMState) => {
    const bob = s.moving * Math.sin(s.time * 9.2) * 0.012;
    const bobY = s.moving * Math.abs(Math.cos(s.time * 9.2)) * 0.014;
    const kick = s.recoil * s.recoil;
    holder.position.set(
      HOLD_POS.x + bob,
      HOLD_POS.y + bobY + kick * 0.03,
      HOLD_POS.z + kick * 0.09,
    );
    holder.rotation.set(HOLD_ROT.x + kick * 0.16, HOLD_ROT.y - bob * 0.6, HOLD_ROT.z);
    if (extra) extra(dt, s);
  };
}

// ------------------------------------------------------------------ guns

// VIPER PISTOL — the baseline every other gun is read against. Light,
// precise, unremarkable in a good way: a slim steel slide with a rounded
// crown over a black frame, a short exposed barrel, a small grip with two
// warm panels, one hand. Nothing hangs off it. The only hot element is the
// front-sight bead in the pistol's own pale-brass flash colour. Recoil is
// the slide alone snapping back over a fixed barrel.
function buildPistol(p: GunPalette, hands: boolean): GunParts {
  const gun = new THREE.Group();
  const grip = gripFrame(p, 0.04, 0.13, 0.055);
  gun.add(grip);
  // frame: the black underbody the slide rides on
  const frame = box(0.046, 0.04, 0.2, p.iron);
  frame.position.set(0, 0.012, -0.075);
  gun.add(frame);
  gun.add(triggerGuard(p, -0.105, -0.02, 0.0));
  // slide group: everything that moves on recoil
  const slide = new THREE.Group();
  const body = box(0.05, 0.046, 0.26, p.steel);
  body.position.set(0, BORE_Y, -0.1);
  slide.add(body);
  const crown = tube(0.025, 0.025, 0.24, p.steel, 8);
  crown.scale.y = 0.55;
  crown.position.set(0, BORE_Y + 0.022, -0.09);
  slide.add(crown);
  const rearSight = box(0.03, 0.012, 0.014, p.iron);
  rearSight.position.set(0, BORE_Y + 0.04, 0.02);
  slide.add(rearSight);
  const frontSight = box(0.012, 0.014, 0.012, p.iron);
  frontSight.position.set(0, BORE_Y + 0.04, -0.215);
  slide.add(frontSight);
  const bead = box(0.006, 0.006, 0.004, p.hot(GUN_FLASH[0]!));
  bead.position.set(0, BORE_Y + 0.042, -0.208);
  slide.add(bead);
  gun.add(slide);
  // barrel stays put; the slide recoils over it
  const barrel = tube(0.015, 0.015, 0.06, p.iron, 8);
  barrel.position.set(0, BORE_Y, -0.245);
  gun.add(barrel);
  const hole = bore(0.011, p.hot(0x050506));
  hole.position.set(0, BORE_Y, -0.276);
  gun.add(hole);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, BORE_Y, -0.28);
  gun.add(muzzle);
  if (hands) grip.add(gripHand(p));
  return { gun, muzzle, animate: (_dt, s) => { slide.position.z = s.recoil * 0.05; } };
}

// RIPJAW SHOTGUN — the pistol's opposite in every dimension that reads at a
// glance: two hands instead of one, twice the width, a long twin-barrel
// mass that ends in a JAW — a pale steel muzzle block with five black fangs
// pointing at whatever is in front of it. Warm material where both hands
// sit (forend and grip) and along the stock, so the whole gun reads as a
// held thing. The one hot element is the brass heads of the three shells in
// the side saddle on the near side, in the shotgun's amber flash colour.
// Recoil is the pump (with the support hand on it) racking back.
function buildShotgun(p: GunPalette, hands: boolean): GunParts {
  const gun = new THREE.Group();
  const boreY = BORE_Y + 0.02;
  const grip = gripFrame(p, 0.044, 0.12, 0.06);
  gun.add(grip);
  // receiver: a wide black block with a pale steel top strap
  const receiver = box(0.12, 0.085, 0.22, p.iron);
  receiver.position.set(0, 0.035, -0.01);
  gun.add(receiver);
  const strap = box(0.124, 0.018, 0.22, p.steel);
  strap.position.set(0, 0.085, -0.01);
  gun.add(strap);
  gun.add(triggerGuard(p, -0.1, -0.03, 0.0));
  // stock: warm, short, dropping toward the shoulder
  const stock = box(0.06, 0.07, 0.22, p.grip);
  stock.position.set(0, 0.02, 0.2);
  stock.rotation.x = 0.16;
  gun.add(stock);
  // twin barrels, side by side, with a sighting rib between them
  for (const s of [-1, 1]) {
    const barrel = tube(0.026, 0.028, 0.5, p.steel, 8);
    barrel.position.set(0.031 * s, boreY, -0.36);
    gun.add(barrel);
  }
  const rib = box(0.018, 0.02, 0.46, p.iron);
  rib.position.set(0, boreY + 0.022, -0.34);
  gun.add(rib);
  // the jaw: a pale steel block wrapping both bores, black fangs out front
  const jaw = box(0.13, 0.085, 0.06, p.steel);
  jaw.position.set(0, boreY, -0.6);
  gun.add(jaw);
  for (const s of [-1, 1]) {
    const hole = bore(0.02, p.hot(0x050506));
    hole.position.set(0.031 * s, boreY, -0.632);
    gun.add(hole);
  }
  for (const [x, y] of [[-0.05, 0.036], [0, 0.04], [0.05, 0.036], [-0.035, -0.036], [0.035, -0.036]]) {
    const tooth = spike(0.012, 0.055, p.iron, 5);
    tooth.position.set(x, boreY + y, -0.645);
    gun.add(tooth);
  }
  // pump: warm forend under the barrels; the support hand rides on it
  const pump = new THREE.Group();
  const forend = box(0.1, 0.06, 0.17, p.grip);
  forend.position.set(0, boreY - 0.055, -0.3);
  pump.add(forend);
  gun.add(pump);
  // side saddle on the near side: steel plate, three shells, brass heads
  const saddle = box(0.008, 0.05, 0.14, p.steel);
  saddle.position.set(-0.064, 0.035, -0.02);
  gun.add(saddle);
  for (let i = 0; i < 3; i++) {
    const hull = tube(0.011, 0.011, 0.05, p.grip, 6);
    hull.position.set(-0.076, 0.035, -0.06 + i * 0.04);
    gun.add(hull);
    const head = tube(0.012, 0.012, 0.012, p.hot(GUN_FLASH[1]!), 6);
    head.position.set(-0.076, 0.035, -0.06 + i * 0.04 + 0.03);
    gun.add(head);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, boreY, -0.66);
  gun.add(muzzle);
  if (hands) {
    grip.add(gripHand(p));
    const support = forendHand(p);
    support.position.set(0, boreY - 0.085, -0.3);
    pump.add(support);
  }
  return { gun, muzzle, animate: (_dt, s) => { pump.position.z = s.recoil * 0.1; } };
}

// The five below keep their previous geometry; they have only been moved
// onto the shared palette and hands so the set is coherent while they wait
// for their own passes.

function buildChaingun(p: GunPalette, hands: boolean): GunParts {
  const gun = new THREE.Group();
  const body = box(0.11, 0.1, 0.22, p.iron);
  body.position.set(0, 0, -0.05);
  gun.add(body);
  const barrelCluster = new THREE.Group();
  barrelCluster.position.set(0, 0.02, -0.16);
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 / 6) * i;
    const b = tube(0.014, 0.014, 0.4, p.steel, 8);
    b.position.set(Math.cos(a) * 0.032, Math.sin(a) * 0.032, -0.14);
    barrelCluster.add(b);
  }
  const shroud = tube(0.055, 0.055, 0.1, p.iron, 12);
  shroud.position.set(0, 0.02, 0.04);
  gun.add(shroud);
  gun.add(barrelCluster);
  const ammoBox = box(0.09, 0.09, 0.1, p.steel);
  ammoBox.position.set(-0.09, -0.04, -0.02);
  gun.add(ammoBox);
  const feed = box(0.03, 0.02, 0.16, p.iron);
  feed.position.set(-0.05, 0.02, -0.06);
  gun.add(feed);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.44);
  gun.add(muzzle);
  if (hands) {
    const h = gripHand(p); h.position.set(0, -0.06, 0.08); gun.add(h);
    const f = forendHand(p); f.position.set(-0.08, -0.06, -0.04); gun.add(f);
  }
  // Angle and angular velocity are separate on purpose: decaying the ANGLE
  // spins the cluster backwards to zero when you stop firing. Spin up to
  // speed, coast down, never rewind.
  let spin = 0;
  let spinVel = 0;
  return { gun, muzzle, animate: (dt, s) => {
    const target = s.firing ? 26 : 0;
    spinVel += (target - spinVel) * Math.min(1, dt * (s.firing ? 6 : 2.2));
    spin += spinVel * dt;
    barrelCluster.rotation.z = spin;
  } };
}

function buildSpiker(p: GunPalette, hands: boolean): GunParts {
  const gun = new THREE.Group();
  const body = box(0.09, 0.09, 0.3, p.steel);
  body.position.set(0, 0.01, -0.1);
  gun.add(body);
  const magazine = box(0.05, 0.16, 0.07, p.iron);
  magazine.position.set(0, -0.1, -0.02);
  magazine.rotation.x = -0.12;
  gun.add(magazine);
  for (let i = 0; i < 4; i++) {
    const nail = box(0.008, 0.008, 0.09, p.steel);
    nail.position.set(-0.02 + i * 0.013, 0.065, -0.02);
    gun.add(nail);
  }
  const muzzleBlock = box(0.06, 0.06, 0.08, p.iron);
  muzzleBlock.position.set(0, 0.01, -0.28);
  gun.add(muzzleBlock);
  const tip = tube(0.012, 0.02, 0.1, p.steel, 6);
  tip.position.set(0, 0.01, -0.36);
  gun.add(tip);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12), p.hot(GUN_FLASH[3]!));
  coil.position.set(0, 0.01, -0.24);
  gun.add(coil);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, -0.42);
  gun.add(muzzle);
  if (hands) {
    const h = gripHand(p); h.position.set(0, -0.06, 0.06); gun.add(h);
    const f = forendHand(p); f.position.set(0, -0.05, -0.2); gun.add(f);
  }
  return { gun, muzzle };
}

function buildBile(p: GunPalette, hands: boolean): GunParts {
  const gun = new THREE.Group();
  const body = tube(0.075, 0.08, 0.42, p.steel, 14);
  body.position.set(0, 0.03, -0.16);
  gun.add(body);
  const mouth = tube(0.085, 0.075, 0.05, p.iron, 14);
  mouth.position.set(0, 0.03, -0.38);
  gun.add(mouth);
  const drum = tube(0.09, 0.09, 0.09, p.iron, 12);
  drum.rotation.x = 0;
  drum.position.set(0, -0.03, -0.1);
  gun.add(drum);
  const grip = box(0.05, 0.12, 0.06, p.iron);
  grip.position.set(0, -0.11, 0.05);
  grip.rotation.x = 0.3;
  gun.add(grip);
  const goo = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 12), p.hot(GUN_FLASH[4]!));
  goo.rotation.y = Math.PI / 2;
  goo.position.set(0, 0.06, -0.16);
  gun.add(goo);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, -0.42);
  gun.add(muzzle);
  if (hands) {
    const h = gripHand(p); h.position.set(0, -0.08, 0.07); gun.add(h);
  }
  return { gun, muzzle, animate: (_dt, s) => { drum.rotation.z = s.recoil * 1.2; } };
}

function buildSunlance(p: GunPalette, hands: boolean): GunParts {
  // The three pulsing rings ARE this gun's tell, so they have to sit on an
  // exposed slim barrel forward of the receiver. They were previously r=0.05
  // toruses at z=-0.3/-0.39 threaded through a 0.5-deep body box, i.e. buried
  // inside it with ~0.015 showing — the signature was invisible in play.
  const gun = new THREE.Group();
  const body = box(0.075, 0.085, 0.28, p.steel);
  body.position.set(0, BORE_Y, -0.07);
  gun.add(body);
  const shroud = box(0.095, 0.045, 0.2, p.iron);
  shroud.position.set(0, BORE_Y + 0.055, -0.06);
  gun.add(shroud);
  // slim emitter barrel the rings ride on
  const barrel = tube(0.022, 0.026, 0.36, p.iron, 10);
  barrel.position.set(0, BORE_Y, -0.38);
  gun.add(barrel);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 14), p.hot(GUN_FLASH[5]!));
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0, BORE_Y, -0.28 - i * 0.11);
    gun.add(ring);
    rings.push(ring);
  }
  const scope = tube(0.02, 0.02, 0.14, p.iron, 8);
  scope.position.set(0, BORE_Y + 0.09, -0.06);
  gun.add(scope);
  const grip = box(0.045, 0.12, 0.06, p.iron);
  grip.position.set(0, -0.06, 0.08);
  grip.rotation.x = 0.28;
  gun.add(grip);
  const cell = box(0.05, 0.06, 0.1, p.iron);
  cell.position.set(0, BORE_Y - 0.07, 0.0);
  gun.add(cell);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, BORE_Y, -0.56);
  gun.add(muzzle);
  if (hands) {
    const h = gripHand(p); h.position.set(0, -0.02, 0.1); gun.add(h);
    const f = forendHand(p); f.position.set(0, BORE_Y - 0.045, -0.2); gun.add(f);
  }
  return { gun, muzzle, animate: (_dt, s) => {
    rings.forEach((r, i) => {
      const k = 0.7 + 0.3 * Math.sin(s.time * 6 - i) + s.recoil;
      // channel ratios of 0x9ff4ff so the pulse stays on the flash hue
      (r.material as THREE.MeshBasicMaterial).color.setRGB(0.62 * k, 0.96 * k, Math.min(1, k));
    });
  } };
}

function buildSeventh(p: GunPalette, hands: boolean): GunParts {
  const gun = new THREE.Group();
  const body = box(0.14, 0.12, 0.34, p.steel);
  body.position.set(0, 0.02, -0.12);
  gun.add(body);
  const barrel = tube(0.06, 0.075, 0.3, p.iron, 12);
  barrel.position.set(0, 0.03, -0.4);
  gun.add(barrel);
  const crown = tube(0.085, 0.06, 0.06, p.steel, 12);
  crown.position.set(0, 0.03, -0.56);
  gun.add(crown);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), p.hot(0x1a0330));
  core.position.set(0, 0.06, -0.05);
  gun.add(core);
  const coreGlow = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), new THREE.MeshBasicMaterial({ color: 0x9a3bff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }));
  coreGlow.position.copy(core.position);
  gun.add(coreGlow);
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 16), p.iron);
  cage.rotation.y = Math.PI / 2;
  cage.position.copy(core.position);
  gun.add(cage);
  for (const s of [-1, 1]) {
    const fin = box(0.02, 0.09, 0.16, p.steel);
    fin.position.set(0.075 * s, 0.05, -0.2);
    fin.rotation.z = 0.25 * s;
    gun.add(fin);
  }
  const grip = box(0.05, 0.13, 0.06, p.iron);
  grip.position.set(0, -0.12, 0.1);
  grip.rotation.x = 0.3;
  gun.add(grip);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, -0.6);
  gun.add(muzzle);
  if (hands) {
    const h = gripHand(p); h.position.set(0, -0.1, 0.12); gun.add(h);
    const f = forendHand(p); f.position.set(0, -0.03, -0.3); gun.add(f);
  }
  return { gun, muzzle, animate: (_dt, s) => {
    const k = 0.9 + Math.sin(s.time * 7) * 0.12 + s.recoil * 1.4;
    core.scale.setScalar(k);
    (coreGlow.material as THREE.MeshBasicMaterial).opacity = 0.25 + (k - 0.9) * 0.5;
  } };
}

const builders: Builder[] = [buildPistol, buildShotgun, buildChaingun, buildSpiker, buildBile, buildSunlance, buildSeventh];

export function buildViewModel(gunId: number): ViewModel {
  const { group, holder } = baseGroup();
  const parts = builders[gunId - 1](gunPalette(), true);
  holder.add(parts.gun);
  return { group, muzzle: parts.muzzle, update: stdUpdate(holder, parts.animate) };
}

/** World-scale version used for pedestal pickups: the weapon alone (no hands,
 *  no holder offset), recentred on its own bounds so it sits on the pedestal
 *  and spins about its own middle. */
export function buildWorldGun(gunId: number): THREE.Group {
  const parts = builders[gunId - 1](gunPalette(), false);
  const gun = parts.gun;
  const bounds = new THREE.Box3().setFromObject(gun);
  const centre = bounds.getCenter(new THREE.Vector3());
  gun.position.sub(centre);
  const g = new THREE.Group();
  g.add(gun);
  g.scale.setScalar(1.35);
  g.rotation.y = Math.PI / 2 + 0.4;
  return g;
}
