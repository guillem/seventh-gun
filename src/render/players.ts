// Remote-player avatar (arena multiplayer): an armoured marine. The one
// thing in the roster that must read as "one of us" at a glance — every enemy
// is monstrous, so this is upright, symmetrical, hard-edged and human.
//
//   silhouette, front (player's own right = viewer's left):
//
//              ___
//             /o_o\        <- team-colour helmet, dark visor slit, top fin
//           __|___|__
//          (__)   (__)     <- big team-colour pauldron domes
//          |  |###|  |     <- team-colour cuirass (lathe), dark suit beneath
//          [] |===| []     <- steel gauntlets; belt line + buckle
//         /   |   |
//        /==  | | |        <- rifle in the right hand, slung across the chest
//             |_| |_|      <- steel shin guards
//             [_] [_]      <- heavy dark boots
//
// Team colour is carried on the three biggest surfaces visible from every
// angle: helmet, both pauldrons, cuirass. Everything else is dark suit, mid
// grey steel or gun-black so the colour pops against a value ladder rather
// than against more colour. Materials are Lambert/Basic, no lights, no
// shadow maps (see docs/DECISIONS.md): the plate map is near-white so a
// Lambert tint can carry the palette value without darkening it.
//
// Local -z is forward (camera convention: yaw applied on `group`, forward is
// (-sin yaw, -cos yaw)). Positive rotation.x on a hip/shoulder swings the
// limb forward. Pose asymmetry lives in child groups so the walk cycle
// never overwrites it.
import * as THREE from 'three';
import { PLAYER_HEIGHT } from '../sim/types';
import { hasVisualLineOfSight, type SolidState } from '../sim/physics';
import { applyRadialFog, applyRadialFogDeep } from './radialFog';
import { getPlayerArt } from './playerArt';

// Ten hues spread round the wheel, all bright enough to survive the ~0.85
// value of the plate map and the dim arena ambient. Slot order is unchanged
// from the original palette (red, blue, yellow, green, purple, orange, teal,
// pink, khaki, white) so existing colorIndex assignments keep meaning.
export const PLAYER_PALETTES = [
  0xd8483a, 0x3a8ce0, 0xe8c83c, 0x48c850, 0xa050e0,
  0xe8842a, 0x38d0b8, 0xe868b0, 0x88a038, 0xd8dcd8,
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
  group: THREE.Group;       // at the feet; yaw applied here. Name sprite lives here.
  body: THREE.Group;        // the marine; topples on death
  torso: THREE.Group;       // pelvis up: bob / breathe / twist
  head: THREE.Group;        // pivot at the neck
  legs: THREE.Group[];      // hip pivots  [right, left]
  knees: THREE.Group[];
  arms: THREE.Group[];      // shoulder pivots [right (gun), left]
  elbows: THREE.Group[];
  shadow: THREE.Mesh;
  nameSprite: THREE.Sprite;
  labelKey: string;
  // motion derived from position deltas (update() receives no velocity)
  px: number;
  pz: number;
  hasPrev: boolean;
  distAcc: number;
  timeAcc: number;
  speedTarget: number;
  speed: number;
  phase: number;
  time: number;
  deathT: number;           // seconds since death; -1 while alive
}

const RUN_SPEED = 6.5;      // sim/client move speed; walk cycle saturates here
const STRIDE = 3.6;         // stride phase radians per unit travelled
const SPEED_WINDOW = 0.1;   // seconds of travel averaged per speed sample
const TELEPORT = 2.5;       // a single-frame jump above this is a respawn, not a run

function box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
}
function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 7): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
}
function sph(r: number, m: THREE.Material, seg = 8): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), m);
}
function lambert(color: number, map?: THREE.Texture): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial(map ? { map, color } : { color });
  applyRadialFog(m);
  return m;
}

export class PlayerRenderer {
  private rigs = new Map<number, Rig>();
  private readonly sphere = new THREE.Sphere();
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
      this.trackSpeed(rig, p, dt);

      const dist = Math.hypot(p.x - cam.x, p.z - cam.z);
      // cull on a sphere round the body, not the foot point: a point test
      // pops a 1.9u figure whose feet are just below the frame bottom
      this.sphere.center.set(p.x, PLAYER_HEIGHT * 0.5, p.z);
      this.sphere.radius = PLAYER_HEIGHT * 0.65;
      const inRange = dist < 60 && frustum.intersectsSphere(this.sphere);
      const los = inRange && hasVisualLineOfSight(solid, cam.x, cam.z, p.x, p.z);
      rig.group.visible = !!los;
      if (los) {
        if (p.alive) this.animateAlive(rig, dt);
        else this.animateDeath(rig, dt);
      } else if (!p.alive && rig.deathT < 0) {
        rig.deathT = 0;   // died out of view: lands already fallen when next seen
      }
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

  // Speed from position deltas. Interpolated snapshots stall and catch up,
  // so per-frame deltas alone would strobe the legs: distance is summed over
  // a 100 ms window, that sample is clamped, then eased into `speed`, and the
  // stride phase advances with the eased value so the legs slow to a stop
  // instead of snapping.
  private trackSpeed(rig: Rig, p: RemotePlayerPose, dt: number): void {
    if (!rig.hasPrev) {
      rig.px = p.x; rig.pz = p.z; rig.hasPrev = true;
    }
    const d = Math.hypot(p.x - rig.px, p.z - rig.pz);
    rig.px = p.x; rig.pz = p.z;
    if (d < TELEPORT) rig.distAcc += d;
    rig.timeAcc += dt;
    if (rig.timeAcc >= SPEED_WINDOW) {
      rig.speedTarget = Math.min(RUN_SPEED * 1.25, rig.distAcc / rig.timeAcc);
      rig.distAcc = 0;
      rig.timeAcc = 0;
    }
    rig.speed += (rig.speedTarget - rig.speed) * Math.min(1, dt * 10);
    if (rig.speed < 0.05) rig.speed = 0;
    rig.phase += dt * rig.speed * STRIDE;
    rig.time += dt;
  }

  private animateAlive(rig: Rig, dt: number): void {
    void dt;
    if (rig.deathT >= 0) {
      // respawned: stand the body back up
      rig.deathT = -1;
      rig.body.rotation.set(0, 0, 0);
      rig.body.position.y = 0;
      rig.head.rotation.set(0, 0, 0);
      (rig.shadow.material as THREE.MeshBasicMaterial).opacity = 0.85;
    }
    const amp = Math.min(1, rig.speed / RUN_SPEED);
    const idle = 1 - amp;
    const ph = rig.phase;
    const t = rig.time;

    // legs: hip swing, knee folds while the leg comes forward
    for (let i = 0; i < 2; i++) {
      const lp = ph + i * Math.PI;
      rig.legs[i]!.rotation.x = Math.sin(lp) * 0.62 * amp;
      rig.knees[i]!.rotation.x = -Math.max(0, Math.cos(lp)) * 0.75 * amp - 0.05;
    }
    // arms counter-swing the legs. The gun arm swings less (it is holding
    // the rifle) and the free arm pumps.
    const swing = [0.22, 0.55];
    const rest = [0.35, 0.1];
    for (let i = 0; i < 2; i++) {
      rig.arms[i]!.rotation.x = rest[i]! + Math.sin(ph + i * Math.PI + Math.PI) * swing[i]! * amp
        + Math.sin(t * 1.3 + i) * 0.02 * idle;
    }
    rig.elbows[0]!.rotation.x = 1.25 + Math.sin(t * 1.3) * 0.03 * idle;
    rig.elbows[1]!.rotation.x = 0.55 + Math.max(0, -Math.sin(ph)) * 0.5 * amp;

    // torso: bounce twice per stride, lean into the run, twist against the
    // hips; at rest it breathes
    rig.torso.position.y = Math.abs(Math.sin(ph)) * 0.05 * amp + Math.sin(t * 1.6) * 0.008 * idle;
    rig.torso.rotation.x = -0.12 * amp;
    rig.torso.rotation.y = Math.sin(ph) * 0.09 * amp;
    rig.torso.rotation.z = Math.sin(ph) * 0.03 * amp;
    rig.head.rotation.x = 0.06 * amp + Math.sin(t * 0.7) * 0.03 * idle;
    rig.head.rotation.y = Math.sin(t * 0.45) * 0.08 * idle - rig.torso.rotation.y;
  }

  // Death: knees buckle and the body drops, then it topples forward from
  // the feet with a gravity ease and the arms flop out. The body group
  // pivots, not the root, so the name sprite and shadow stay put.
  private animateDeath(rig: Rig, dt: number): void {
    if (rig.deathT < 0) rig.deathT = 0;
    rig.deathT += dt;
    const t = rig.deathT;
    const buckle = Math.min(1, t / 0.28);
    const fallT = Math.max(0, Math.min(1, (t - 0.18) / 0.55));
    const fall = fallT * fallT;
    for (let i = 0; i < 2; i++) {
      rig.legs[i]!.rotation.x = 0.5 * buckle + (i === 0 ? 0.25 : -0.15) * fall;
      rig.knees[i]!.rotation.x = -1.3 * buckle;
      rig.arms[i]!.rotation.x = 0.4 + 1.0 * fall;
      rig.arms[i]!.rotation.z = (i === 0 ? 0.12 : -0.12) + (i === 0 ? 0.55 : -0.45) * fall;
      rig.elbows[i]!.rotation.x = (i === 0 ? 1.25 : 0.55) * (1 - fall) + 0.2 * fall;
    }
    rig.torso.position.y = -0.34 * buckle;
    rig.torso.rotation.x = -0.35 * buckle;
    rig.torso.rotation.y = 0;
    rig.torso.rotation.z = 0.12 * fall;
    rig.head.rotation.x = -0.5 * buckle + 0.9 * fall;
    rig.body.rotation.x = -(Math.PI / 2 - 0.12) * fall;
    rig.body.position.y = 0.12 * fall;
    (rig.shadow.material as THREE.MeshBasicMaterial).opacity = 0.85 - 0.35 * fall;
  }

  private makeRig(p: RemotePlayerPose): Rig {
    const color = PLAYER_PALETTES[p.colorIndex % PLAYER_PALETTES.length]!;
    const art = getPlayerArt();
    const armour = lambert(color, art.plate);        // team colour
    const steel = lambert(0x848c84, art.plate);      // gauntlets, greaves, pack — mid grey, not bone
    const suit = lambert(0xffffff, art.suit);        // dark ribbed under-armour
    const black = lambert(0x1c1e22);                 // boots, belt, rifle
    // visor: unlit, team colour lifted toward white. The one bright point on
    // the figure that survives fog and a dark arena — the player-side answer
    // to the enemies' hot eyes, and a second team-colour read from the front.
    const visorM = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45) });
    applyRadialFog(visorM);

    const group = new THREE.Group();
    const body = new THREE.Group();
    const torso = new THREE.Group();
    group.add(body);
    body.add(torso);

    // pelvis + belt line with a steel buckle on the front
    const pelvis = box(0.34, 0.18, 0.24, suit);
    pelvis.position.y = 0.94;
    torso.add(pelvis);
    const belt = box(0.37, 0.07, 0.27, black);
    belt.position.y = 1.03;
    torso.add(belt);
    const buckle = box(0.1, 0.06, 0.03, steel);
    buckle.position.set(0, 1.03, -0.14);
    torso.add(buckle);

    // cuirass: a lathe from the waist out to a broad shoulder line, squashed
    // front-to-back so the cross-section is a chunky oval
    const profile = [
      [0.17, 0.0], [0.21, 0.12], [0.27, 0.3], [0.29, 0.42], [0.25, 0.5], [0.1, 0.55],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const cuirass = new THREE.Mesh(new THREE.LatheGeometry(profile, 8), armour);
    cuirass.scale.z = 0.7;
    cuirass.position.y = 1.0;
    torso.add(cuirass);
    const pack = box(0.26, 0.3, 0.12, steel);
    pack.position.set(0, 1.3, 0.22);
    torso.add(pack);

    // neck and helmet. Pivot at the neck so the head can nod.
    const neck = cyl(0.07, 0.08, 0.12, suit, 6);
    neck.position.y = 1.58;
    torso.add(neck);
    const head = new THREE.Group();
    head.position.y = 1.6;
    const dome = sph(0.19, armour, 8);      // crown lands on PLAYER_HEIGHT
    dome.scale.set(1, 1.0, 1.08);
    dome.position.y = 0.11;
    head.add(dome);
    const brow = box(0.28, 0.05, 0.12, steel);
    brow.position.set(0, 0.16, -0.15);
    head.add(brow);
    const visor = box(0.22, 0.06, 0.08, visorM);
    visor.position.set(0, 0.1, -0.18);
    head.add(visor);
    const jaw = box(0.2, 0.07, 0.1, steel);
    jaw.position.set(0, 0.02, -0.14);
    head.add(jaw);
    const fin = box(0.03, 0.07, 0.24, steel);
    fin.position.set(0, 0.265, 0.0);
    head.add(fin);
    torso.add(head);

    // pauldrons: half-domes riding high on the shoulders — the widest thing
    // on the figure and the biggest team-colour surface from any angle
    for (const s of [1, -1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), armour);
      pad.scale.set(1, 0.8, 1);
      pad.position.set(0.36 * s, 1.47, 0);
      torso.add(pad);
    }

    // arms: shoulder pivot, suit upper arm, steel gauntlet on the elbow
    // pivot, dark hand. Right arm turns inward so the rifle in its hand
    // crosses the chest; left arm hangs looser.
    const arms: THREE.Group[] = [];
    const elbows: THREE.Group[] = [];
    for (const s of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.36 * s, 1.46, 0);
      shoulder.rotation.z = 0.12 * s;
      if (s > 0) shoulder.rotation.y = 0.8;
      const upper = cyl(0.065, 0.06, 0.3, suit, 6);
      upper.position.y = -0.15;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      const gauntlet = box(0.14, 0.28, 0.14, steel);
      gauntlet.position.y = -0.15;
      elbow.add(gauntlet);
      const hand = sph(0.06, black, 6);
      hand.position.y = -0.32;
      elbow.add(hand);
      if (s > 0) elbow.add(this.rifle(black, steel));
      shoulder.add(elbow);
      torso.add(shoulder);
      arms.push(shoulder);
      elbows.push(elbow);
    }

    // legs: hip pivot, suit thigh, knee pivot, suit shin under a steel guard,
    // heavy dark boot
    const legs: THREE.Group[] = [];
    const knees: THREE.Group[] = [];
    for (const s of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(0.15 * s, 0.95, 0);
      const thigh = cyl(0.09, 0.075, 0.42, suit, 6);
      thigh.position.y = -0.21;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      const shin = cyl(0.07, 0.065, 0.34, suit, 6);
      shin.position.y = -0.17;
      knee.add(shin);
      const guard = box(0.14, 0.3, 0.07, steel);
      guard.position.set(0, -0.17, -0.06);
      knee.add(guard);
      const boot = box(0.17, 0.2, 0.28, black);
      boot.position.set(0, -0.42, -0.04);
      knee.add(boot);
      hip.add(knee);
      body.add(hip);
      legs.push(hip);
      knees.push(knee);
    }

    // blob contact shadow, same recipe as the enemy rigs
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({ map: art.shadow, transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.renderOrder = 2;
    group.add(shadow);

    const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: true }));
    nameSprite.position.y = PLAYER_HEIGHT + 0.45;
    nameSprite.scale.set(1.6, 0.4, 1);
    group.add(nameSprite);
    // Every other in-world material fogs radially (radialFog.ts); match it
    // here so remote players don't fog on the stock camera-Z curve. Runs
    // after every mesh is in the group.
    applyRadialFogDeep(group);
    return {
      id: p.id, group, body, torso, head, legs, knees, arms, elbows, shadow, nameSprite, labelKey: '',
      px: p.x, pz: p.z, hasPrev: true, distAcc: 0, timeAcc: 0, speedTarget: 0, speed: 0,
      phase: 0, time: 0, deathT: p.alive ? -1 : 1,
    };
  }

  // Rifle in the elbow frame: the forearm runs down local -y, so the gun's
  // long axis is turned onto -y and it hangs just below the gauntlet.
  private rifle(black: THREE.Material, steel: THREE.Material): THREE.Group {
    const gun = new THREE.Group();
    const receiver = box(0.1, 0.14, 0.66, black);
    gun.add(receiver);
    const barrel = cyl(0.03, 0.03, 0.32, steel, 6);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.02, 0.46);
    gun.add(barrel);
    const mag = box(0.06, 0.16, 0.08, steel);
    mag.position.set(0, 0.12, -0.02);
    gun.add(mag);
    const stock = box(0.07, 0.11, 0.2, steel);
    stock.position.set(0, 0.0, -0.4);
    gun.add(stock);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(-0.02, -0.36, 0.11);
    return gun;
  }

  private setName(rig: Rig, p: RemotePlayerPose): void {
    const key = `${p.name}:${Math.round(p.hp / 5)}`;
    if (rig.labelKey === key) return;
    rig.labelKey = key;
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
