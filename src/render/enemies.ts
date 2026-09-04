// Enemy meshes: procedural organic/biomechanic demons with faces, walk /
// attack / pain / death animation and blob contact shadows.
import * as THREE from 'three';
import { getTextures } from './textures';
import type { EnemyEnt } from '../sim/sim';
import { ENEMIES } from '../sim/enemyTypes';
import { applyRadialFog, applyRadialFogDeep } from './radialFog';

export interface EnemyRig {
  group: THREE.Group;       // positioned at feet, faces +z when yaw applied
  yawGroup: THREE.Group;    // rotates with facing
  body: THREE.Group;        // bobbing/lean animations
  head?: THREE.Object3D;
  eyes: THREE.Mesh[];
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  extras: THREE.Object3D[];
  eyeMat: THREE.MeshBasicMaterial;
  // Each species' resting eye colour, cloned from eyeMat.color once the rig
  // is built. Populated centrally in EnemyRenderer.build() (not by any
  // builder, which only ever pick the base hue) so every builder's flare
  // has something to derive from and something to restore to. Optional at
  // the type level only because builders (whose declared return type is
  // EnemyRig) don't set it themselves; EnemyRenderer.build() is the sole
  // constructor path and always populates it before a rig reaches update().
  eyeBase?: THREE.Color;
  baseY: number;            // ground/hover offset
  radius: number;
  height: number;
  shadow: THREE.Mesh;
}

function mat(skin: THREE.Texture, color = 0xffffff): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map: skin, color });
  applyRadialFog(m);
  return m;
}

function box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
}
function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 7): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
}
function sph(r: number, m: THREE.Material, seg = 10): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), m);
}
function cone(r: number, h: number, m: THREE.Material, seg = 7): THREE.Mesh {
  return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
}

function eyeMesh(r: number, color: number): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const m = new THREE.MeshBasicMaterial({ color });
  applyRadialFog(m);
  return { mesh: sph(r, m, 6), mat: m };
}

// ------------------------------------------------------------ eye flare
// Eye colour during attack/pain is derived from each rig's own resting
// colour (eyeBase) rather than a hardcoded hue, so a green-eyed enemy
// flares hot-green/white, not orange.
const EYE_FLARE_WHITE = new THREE.Color(1, 1, 1);

function clampColor01(c: THREE.Color): THREE.Color {
  c.r = Math.min(1, Math.max(0, c.r));
  c.g = Math.min(1, Math.max(0, c.g));
  c.b = Math.min(1, Math.max(0, c.b));
  return c;
}

// ------------------------------------------------------------------ builders

// HUSK — the shambling grunt. Read in one frame: a gaunt, over-tall biped
// with one shoulder hitched up into a hump and the other side collapsed,
// so the long arm on the collapsed side hangs past the knee and its hook
// brushes the floor. The head hangs low and forward between the shoulders,
// lolling toward the collapsed side, jaw slack. Cold slate body, bone-grey
// ribs; the ONLY hot colour is the acid-green of the eyes and the split
// sternum, and both share one material so they flare together on attack.
//
//   silhouette, front (enemy's own left = viewer's right):
//
//            _/\_          <- hump over the hitched shoulder
//           / o  \
//           \_ (_/         <- skull hangs low, tilted, jaw open
//        |  |    |
//        |  | )( |         <- lathe torso, hollow waist, flat ribs
//         \ |    |
//          \|    |
//           | |  |
//           | |  |
//           ( |  |         <- hook claw brushes the floor
//              /  \        <- one leg straight, one knee dragging behind
//
// Everything hangs off pivot groups the biped animation already drives:
// legs[] are hip pivots (rotation.x = walk swing), arms[] are shoulder
// pivots (rotation.x = swing / attack rear-back). The permanent lean of
// knee, elbow and neck lives in CHILD groups, so the animation never
// overwrites the pose.
function buildHusk(tex: ReturnType<typeof getTextures>): EnemyRig {
  const skin = mat(tex.skins.husk);
  // bone parts carry no map: a Lambert tint can only darken the slate skin,
  // and the skull has to read pale at distance
  const bone = new THREE.MeshLambertMaterial({ color: 0xb8b1a0 });
  applyRadialFog(bone);
  const group = new THREE.Group();
  const yawGroup = new THREE.Group();
  const body = new THREE.Group();
  group.add(yawGroup);
  yawGroup.add(body);

  // accent: one unlit material for the eyes and the split sternum
  const accent = new THREE.MeshBasicMaterial({ color: 0x9dff3a });
  applyRadialFog(accent);

  // torso: a lathe from pelvis up through a hollow waist to a flared ribcage,
  // squashed front-to-back, then leant forward and tipped so one shoulder
  // rides higher than the other.
  const profile = [
    [0.15, 0.0], [0.12, 0.14], [0.14, 0.32], [0.23, 0.52],
    [0.25, 0.66], [0.19, 0.8], [0.07, 0.88],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 7), skin);
  torso.scale.z = 0.72;
  torso.position.set(0, 0.92, 0);
  torso.rotation.set(0.16, 0, -0.1);
  body.add(torso);
  // the split down the sternum: two offset unlit slivers sunk low into the
  // ribcage, so it reads as a crack and sits well clear of the eyes
  for (const [x, y, h, tilt] of [[-0.02, 1.36, 0.13, -0.25], [-0.05, 1.24, 0.11, 0.1]]) {
    const split = new THREE.Mesh(new THREE.BoxGeometry(0.025, h, 0.05), accent);
    split.position.set(x, y, 0.2);
    split.rotation.set(0.16, 0, tilt);
    body.add(split);
  }

  // hitched shoulder: a flat ridge riding up over the collarbone (enemy's
  // -x). Kept low and wide so it never reads as a second head.
  const hump = sph(0.17, skin, 8);
  hump.scale.set(1.25, 0.5, 0.9);
  hump.position.set(-0.24, 1.78, -0.02);
  hump.rotation.z = 0.4;
  body.add(hump);

  // neck: a tube craning forward and down out of the ribcage
  const neckPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.03, 1.74, 0.08),
    new THREE.Vector3(0.0, 1.82, 0.24),
    new THREE.Vector3(0.04, 1.81, 0.4),
  ]);
  body.add(new THREE.Mesh(new THREE.TubeGeometry(neckPath, 5, 0.055, 5, false), skin));

  // head: an elongated skull thrown forward on the neck, clear of the
  // ribcage outline, lolling toward the collapsed side, jaw dropped open.
  // Face on +z; eyes high in the skull so they read as eyes, not a wound.
  const head = new THREE.Group();
  const skull = sph(0.12, bone, 8);
  skull.scale.set(0.82, 1.22, 0.95);
  head.add(skull);
  const jaw = cyl(0.045, 0.075, 0.16, bone, 6);
  jaw.position.set(0, -0.19, 0.05);
  jaw.rotation.x = 0.5;
  head.add(jaw);
  const maw = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: 0x06080a }));
  applyRadialFog(maw.material as THREE.Material);
  maw.scale.set(1.2, 1, 0.6);
  maw.position.set(0, -0.11, 0.1);
  head.add(maw);
  const eyes: THREE.Mesh[] = [];
  // uneven sockets: one eye swollen wide, the other a pinprick
  for (const [x, y, r] of [[-0.05, 0.05, 0.038], [0.05, 0.04, 0.028]]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), accent);
    eye.position.set(x, y, 0.1);
    head.add(eye);
    eyes.push(eye);
  }
  // skull top must stay under enemyVolumeY (height 1.9 + 0.15) minus walk bob
  head.position.set(0.06, 1.79, 0.46);
  head.rotation.set(0.22, 0, 0.3);
  body.add(head);

  // arms. Collapsed side (+x): one long bowed bone hanging past the knee,
  // ending in a hook that brushes the floor. Hitched side (-x): a withered
  // arm clutched up against the ribs.
  const arms: THREE.Object3D[] = [];
  const longArm = new THREE.Group();
  longArm.position.set(0.3, 1.62, 0.02);
  longArm.rotation.z = 0.28;      // hangs wide of the hip, not across it
  const bonePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.07, -0.55, -0.04),
    new THREE.Vector3(0.02, -1.12, 0.06),
  ]);
  longArm.add(new THREE.Mesh(new THREE.TubeGeometry(bonePath, 6, 0.055, 5, false), skin));
  const hook = cone(0.06, 0.34, bone, 5);
  hook.position.set(0.02, -1.25, 0.1);
  hook.rotation.set(Math.PI - 0.5, 0, 0);
  longArm.add(hook);
  body.add(longArm);
  arms.push(longArm);

  const shortArm = new THREE.Group();
  shortArm.position.set(-0.3, 1.74, 0.06);
  shortArm.rotation.z = 0.25;
  const upper = cyl(0.045, 0.035, 0.32, skin, 6);
  upper.position.y = -0.16;
  shortArm.add(upper);
  const elbow = new THREE.Group();
  elbow.position.y = -0.32;
  elbow.rotation.x = -1.9;
  const fore = cyl(0.035, 0.025, 0.28, skin, 6);
  fore.position.y = -0.14;
  elbow.add(fore);
  const talon = cone(0.03, 0.12, bone, 5);
  talon.position.y = -0.32;
  talon.rotation.x = Math.PI;
  elbow.add(talon);
  shortArm.add(elbow);
  body.add(shortArm);
  arms.push(shortArm);

  // legs (pivot at hip). One straight and splayed, one with the knee bent so
  // the shin trails behind: the drag.
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.13 * s, 0.94, 0);
    const thigh = cyl(0.07, 0.055, 0.5, skin, 6);
    thigh.position.y = -0.25;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.5;
    const shin = cyl(0.05, 0.065, 0.46, skin, 6);
    shin.position.y = -0.23;
    knee.add(shin);
    const foot = cyl(0.04, 0.06, 0.2, bone, 5);
    foot.position.set(0, -0.44, 0.07);
    foot.rotation.x = Math.PI / 2 - 0.3;
    knee.add(foot);
    if (s > 0) {
      knee.rotation.x = 0.5;           // dragging leg
    } else {
      hip.rotation.z = 0.08;           // straight leg splayed out
    }
    hip.add(knee);
    body.add(hip);
    legs.push(hip);
  }

  const shadow = shadowMesh(0.6);
  group.add(shadow);
  return { group, yawGroup, body, head, eyes, legs, arms, extras: [], eyeMat: accent, baseY: 0, radius: 0.55, height: 1.9, shadow };
}

function buildCrawler(tex: ReturnType<typeof getTextures>): EnemyRig {
  const chitin = mat(tex.skins.crawler);
  const chitin2 = mat(tex.skins.crawler, 0xb08090);
  const group = new THREE.Group();
  const yawGroup = new THREE.Group();
  const body = new THREE.Group();
  group.add(yawGroup);
  yawGroup.add(body);

  // abdomen + thorax
  const abdomen = sph(0.42, chitin, 10);
  abdomen.scale.set(1, 0.75, 1.25);
  abdomen.position.set(0, 0.52, -0.3);
  body.add(abdomen);
  const markings = sph(0.2, new THREE.MeshBasicMaterial({ color: 0x8a1622 }), 8);
  markings.scale.set(1, 0.4, 1.1);
  markings.position.set(0, 0.72, -0.3);
  body.add(markings);
  const thorax = sph(0.3, chitin2, 9);
  thorax.scale.set(1, 0.8, 1);
  thorax.position.set(0, 0.48, 0.22);
  body.add(thorax);

  // head with eye cluster on +z
  const head = new THREE.Group();
  const skull = sph(0.2, chitin, 8);
  skull.scale.set(1.1, 0.8, 0.9);
  head.add(skull);
  const fangs = cone(0.035, 0.14, chitin2, 5);
  fangs.position.set(-0.07, -0.12, 0.14);
  fangs.rotation.x = Math.PI;
  head.add(fangs);
  const fangs2 = fangs.clone();
  fangs2.position.x = 0.07;
  head.add(fangs2);
  const eyes: THREE.Mesh[] = [];
  const eyePos: [number, number, number][] = [
    [-0.09, 0.08, 0.14], [0.09, 0.08, 0.14],
    [-0.05, 0.0, 0.17], [0.05, 0.0, 0.17],
  ];
  for (const [x, y, z] of eyePos) {
    const { mesh } = eyeMesh(0.032, 0xff2b2b);
    mesh.position.set(x, y, z);
    head.add(mesh);
    eyes.push(mesh);
  }
  head.position.set(0, 0.5, 0.5);
  body.add(head);

  // 6 legs, two segments, pivot at body: upper juts out+up, lower drops to floor
  const legs: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const idx = i % 3;
    const hip = new THREE.Group();
    hip.position.set(side * 0.2, 0.46, 0.24 - idx * 0.26);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.52, 6), chitin);
    upper.rotation.z = Math.PI / 2; // axis along X
    upper.position.set(side * 0.24, 0.12, 0);
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.set(side * 0.47, 0.12, 0);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.012, 0.58, 6), chitin);
    lower.position.y = -0.28;
    knee.add(lower);
    knee.rotation.z = side * -0.38;
    hip.add(knee);
    hip.rotation.z = side * -0.12;
    hip.rotation.x = (idx - 1) * 0.14; // front/rear legs angled
    body.add(hip);
    legs.push(hip);
  }

  const shadow = shadowMesh(0.72);
  group.add(shadow);
  return { group, yawGroup, body, head, eyes, legs, arms: [], extras: [], eyeMat: (eyes[0].material as THREE.MeshBasicMaterial), baseY: 0, radius: 0.5, height: 1.0, shadow };
}

// SLAB — the siege piece. Read in one frame: a wide, low-centred boulder
// of a body on two pillar legs, a carapace crest over the back, a blunt
// iron visor sunk into the front with ONE molten eye, and a mortar bell
// hanging off the right shoulder in place of a hand. The left arm is a
// thick brace it knuckles along on. Nothing about it is tall or thin: the
// husk is a stalk, the slab is a wall.
//
//   silhouette, front (enemy's own right = viewer's left):
//
//          ___/‾‾‾‾‾‾\___           <- crest over the back
//        /   ____________  \
//       (   (   [o]      )  )       <- visor sunk low in the front, one eye
//       |\_/            \_/|
//      /  |  |          |  |\
//     (   |  |          |  | )      <- brace arm      mortar bell arm
//      \_/   |__|  |__|  |  |
//              []    []  (==)       <- bell mouth: the throat glows
//
// Threat telegraph: the bell is the right ARM (arms[0]). The biped windup
// writes arms[i].rotation.x = -0.9, which swings the bell up and forward
// until the mouth points at the player, while the throat (same material as
// the eye) flares white-hot through eyeMat. That is the 0.55s dodge window.
function buildSlab(tex: ReturnType<typeof getTextures>): EnemyRig {
  const hide = mat(tex.skins.slab);
  // hard parts carry no map: a Lambert tint can only darken the sooty hide,
  // and the visor/bell need to read as separate iron at distance
  const iron = new THREE.MeshLambertMaterial({ color: 0x7a766c });
  applyRadialFog(iron);
  // accent: one unlit material for the eye and the bell throat
  const accent = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  applyRadialFog(accent);
  const group = new THREE.Group();
  const yawGroup = new THREE.Group();
  const body = new THREE.Group();
  group.add(yawGroup);
  yawGroup.add(body);

  // body: one lathe, hips narrow, widest at the belly, shouldering in to a
  // rounded top. Squashed front-to-back, leant onto the bell side.
  const profile = [
    [0.42, 0.0], [0.66, 0.22], [0.76, 0.52], [0.72, 0.84],
    [0.56, 1.1], [0.3, 1.28], [0.08, 1.34],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 8), hide);
  torso.scale.z = 0.8;
  torso.position.set(0, 0.86, 0);
  torso.rotation.set(0.1, 0, 0.06);
  body.add(torso);
  // carapace shell sliding down the back: sits behind the top of the mass
  // so it reads as a ridge over the shoulders, not a lid on top
  const crest = sph(0.5, hide, 8);
  crest.scale.set(1.05, 0.34, 0.95);
  crest.position.set(0, 2.06, -0.34);
  crest.rotation.x = -0.45;
  body.add(crest);

  // head: an iron visor sunk low into the front of the mass, one molten eye
  // and a dark slit under it. Face on +z.
  const head = new THREE.Group();
  const visor = sph(0.22, iron, 8);
  visor.scale.set(1.25, 0.72, 0.9);
  head.add(visor);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), accent);
  eye.position.set(0.02, 0.01, 0.17);
  head.add(eye);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0x140806 }));
  applyRadialFog(slit.material as THREE.Material);
  slit.position.set(0, -0.11, 0.18);
  head.add(slit);
  head.position.set(0.04, 1.72, 0.6);
  head.rotation.x = 0.12;
  body.add(head);

  // arms. Right (+x): the mortar. Upper arm tube down to an elbow, then a
  // lathe bell whose mouth rests pointing down-forward; the windup swings
  // it up to bear. Left (-x): a long brace arm bowed out to a knuckle
  // planted near the floor.
  const arms: THREE.Object3D[] = [];
  const gunArm = new THREE.Group();
  gunArm.position.set(0.82, 1.86, 0.08);
  gunArm.rotation.z = -0.18;
  const gunPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.12, -0.34, 0.04),
    new THREE.Vector3(0.06, -0.64, 0.02),
  ]);
  gunArm.add(new THREE.Mesh(new THREE.TubeGeometry(gunPath, 5, 0.15, 6, false), hide));
  const bell = new THREE.Group();
  bell.position.set(0.06, -0.64, 0.02);
  bell.rotation.x = Math.PI - 0.7;   // mouth (+y of the lathe) points down-forward at rest
  const bellProfile = [
    [0.14, 0.0], [0.18, 0.2], [0.2, 0.42], [0.3, 0.56], [0.32, 0.62], [0.24, 0.62],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  bell.add(new THREE.Mesh(new THREE.LatheGeometry(bellProfile, 8), iron));
  const breech = sph(0.2, iron, 8);
  breech.scale.set(1, 0.7, 1);
  bell.add(breech);
  const throat = cyl(0.23, 0.2, 0.08, accent, 8);
  throat.position.y = 0.58;
  bell.add(throat);
  gunArm.add(bell);
  body.add(gunArm);
  arms.push(gunArm);

  const braceArm = new THREE.Group();
  braceArm.position.set(-0.82, 1.86, 0.08);
  braceArm.rotation.z = 0.12;
  const bracePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.22, -0.6, 0.12),
    new THREE.Vector3(-0.2, -1.5, 0.3),
  ]);
  braceArm.add(new THREE.Mesh(new THREE.TubeGeometry(bracePath, 6, 0.15, 6, false), hide));
  const knuckle = sph(0.24, iron, 8);
  knuckle.scale.set(1.2, 0.7, 1.1);
  knuckle.position.set(-0.2, -1.56, 0.32);
  braceArm.add(knuckle);
  body.add(braceArm);
  arms.push(braceArm);

  // legs: short pillars on iron feet, splayed wide under the mass
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.38 * s, 0.95, 0);
    hip.rotation.z = s * -0.1;
    const thigh = cyl(0.2, 0.17, 0.5, hide, 7);
    thigh.position.y = -0.25;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.5;
    knee.rotation.z = s * 0.1;
    const shin = cyl(0.16, 0.2, 0.38, hide, 7);
    shin.position.y = -0.19;
    knee.add(shin);
    const foot = sph(0.24, iron, 7);
    foot.scale.set(1.1, 0.4, 1.4);
    foot.position.set(0, -0.36, 0.1);
    knee.add(foot);
    hip.add(knee);
    body.add(hip);
    legs.push(hip);
  }

  const shadow = shadowMesh(1.0);
  group.add(shadow);
  return { group, yawGroup, body, head, eyes: [eye], legs, arms, extras: [], eyeMat: accent, baseY: 0, radius: 0.9, height: 2.6, shadow };
}

function buildWisp(tex: ReturnType<typeof getTextures>): EnemyRig {
  const shell = new THREE.MeshLambertMaterial({ map: tex.skins.wisp, color: 0xbfd4ff, emissive: new THREE.Color(0x16283f) });
  const group = new THREE.Group();
  const yawGroup = new THREE.Group();
  const body = new THREE.Group();
  group.add(yawGroup);
  yawGroup.add(body);

  // hovering rhombus body
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), shell);
  core.scale.set(1, 1.25, 1);
  body.add(core);
  const heart = sph(0.2, new THREE.MeshBasicMaterial({ color: 0x8df1ff }), 8);
  body.add(heart);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x2b9fd8, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  body.add(halo);
  // face plate on +z
  const face = new THREE.Group();
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const { mesh } = eyeMesh(0.05, 0xaef6ff);
    mesh.position.set(0.12 * s, 0.08, 0.34);
    face.add(mesh);
    eyes.push(mesh);
  }
  const maw = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.16, 6),
    new THREE.MeshBasicMaterial({ color: 0x06121e }),
  );
  maw.rotation.x = Math.PI;
  maw.position.set(0, -0.1, 0.34);
  face.add(maw);
  body.add(face);
  // wings
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    const blade = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x6fd0f2, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
    );
    blade.position.x = s * 0.42;
    wing.add(blade);
    wing.position.y = 0.1;
    body.add(wing);
    wings.push(wing);
  }
  // hanging tentacles
  const tentacles: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Group();
    const seg = cyl(0.03, 0.015, 0.6, shell, 5);
    seg.position.y = -0.3;
    t.add(seg);
    t.position.set((i - 1.5) * 0.14, -0.35, 0.1);
    body.add(t);
    tentacles.push(t);
  }

  const shadow = shadowMesh(0.55);
  group.add(shadow);
  const rig: EnemyRig = {
    group, yawGroup, body, eyes, legs: [], arms: [], extras: [...wings, ...tentacles],
    eyeMat: (eyes[0].material as THREE.MeshBasicMaterial), baseY: 2.3, radius: 0.5, height: 1.1, shadow,
  };
  body.position.y = rig.baseY;
  return rig;
}

// HIEROPHANT — the elite caster. Read in one frame: a tall, narrow, upright
// column of dark robe hovering just off the floor, crowned by a pale mask
// and a bone mitre that make it the tallest point in any room, a staff
// taller than itself in one hand, and three small orbs hanging in the air
// at its shoulders — the burst it is about to throw. Nothing shambles,
// nothing hunches: the husk is a broken stalk, the slab is a wall, this one
// stands like it chose the ground.
//
//   silhouette, front:
//
//              /\               <- bone mitre, gold band
//             |  |
//          o  (oo)  o           <- three orbs float at shoulder height
//          |  /||\  |              (extras[]: manager bobs them on y)
//          |_/ || \_|
//          |   ||   |           <- staff in the left hand, taller than it
//          |  /  \  |
//          | /    \ |           <- one lathe robe, waisted, flaring to a hem
//          |/______\|
//            \ | /              <- trailing hem streamers (legs[0]: manager
//                                  twists them on rotation.y as it moves)
//
// Threat telegraph: both arms are arms[]; the biped windup raises them to
// point at the player, which swings the staff from vertical to bearing on
// you, while eyes + all three orbs share eyeMat and flare together.
function buildHierophant(tex: ReturnType<typeof getTextures>): EnemyRig {
  const robeMat = mat(tex.skins.hierophant);
  // hard parts carry no map: a Lambert tint can only darken the robe
  const bone = new THREE.MeshLambertMaterial({ color: 0xd9d2bd });
  applyRadialFog(bone);
  const gold = new THREE.MeshLambertMaterial({ color: 0xb8913c });
  applyRadialFog(gold);
  // accent: one unlit material for the eyes and the three orbs
  const accent = new THREE.MeshBasicMaterial({ color: 0xc44dff });
  applyRadialFog(accent);
  const group = new THREE.Group();
  const yawGroup = new THREE.Group();
  const body = new THREE.Group();
  group.add(yawGroup);
  yawGroup.add(body);

  // robe: one lathe from a wide hem up through a pinched waist to narrow
  // shoulders, hovering a hand's width off the floor
  const profile = [
    [0.5, 0.0], [0.44, 0.28], [0.32, 0.75], [0.27, 1.15],
    [0.3, 1.5], [0.35, 1.72], [0.22, 1.86], [0.08, 1.92],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const robe = new THREE.Mesh(new THREE.LatheGeometry(profile, 8), robeMat);
  robe.position.y = 0.25;
  body.add(robe);

  // hem streamers: three dark tails trailing back from under the hem. The
  // manager yaws this group as it moves, so they swing behind it.
  const hem = new THREE.Group();
  for (const [x, len] of [[0.22, 0.75], [-0.26, 0.65], [0.0, 0.95]]) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0.32, -0.3),
      new THREE.Vector3(x * 1.4, 0.16, -0.3 - len * 0.45),
      new THREE.Vector3(x * 1.2, 0.04, -0.3 - len),
    ]);
    hem.add(new THREE.Mesh(new THREE.TubeGeometry(path, 5, 0.045, 5, false), robeMat));
  }
  body.add(hem);
  const legs: THREE.Object3D[] = [hem];

  // head: a long pale mask set into a dark cowl, bone mitre above with one
  // gold band. Face on +z; the mask is the only pale mass up top, so the
  // eyes own it.
  const head = new THREE.Group();
  const cowl = sph(0.2, robeMat, 8);
  cowl.scale.set(1.1, 1.15, 1.0);
  cowl.position.set(0, 0.02, -0.06);
  head.add(cowl);
  const mask = sph(0.13, bone, 8);
  mask.scale.set(0.8, 1.35, 0.7);
  mask.position.set(0, -0.02, 0.12);
  head.add(mask);
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 6), accent);
    eye.position.set(0.05 * s, 0.05, 0.2);
    head.add(eye);
    eyes.push(eye);
  }
  // mitre height is budgeted against enemyVolumeY (height 2.5 + 0.15) minus
  // the hover bob: a sharper, shorter cone keeps the pointed-crown read
  const mitreProfile = [
    [0.14, 0.0], [0.15, 0.08], [0.11, 0.2], [0.05, 0.28], [0.0, 0.31],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const mitre = new THREE.Mesh(new THREE.LatheGeometry(mitreProfile, 7), bone);
  mitre.position.set(0, 0.1, -0.02);
  head.add(mitre);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.02, 5, 10), gold);
  band.rotation.x = Math.PI / 2;
  band.position.set(0, 0.18, -0.02);
  head.add(band);
  head.position.set(0, 2.08, 0.04);
  head.rotation.x = -0.06;   // chin up
  body.add(head);

  // arms: long sleeves on curves from narrow shoulders, pale hands. Left
  // (-x) holds the staff upright; the windup swings it to bear.
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.3 * s, 1.92, 0.02);
    shoulder.rotation.z = s * 0.12;
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.12 * s, -0.4, 0.1),
      new THREE.Vector3(0.06 * s, -0.62, 0.3),
    ]);
    shoulder.add(new THREE.Mesh(new THREE.TubeGeometry(path, 5, 0.07, 5, false), robeMat));
    const hand = sph(0.07, bone, 6);
    hand.scale.set(0.8, 1.3, 0.8);
    hand.position.set(0.06 * s, -0.68, 0.34);
    shoulder.add(hand);
    if (s < 0) {
      const staff = cyl(0.02, 0.025, 2.5, bone, 5);
      staff.position.set(0.06 * s, -0.68 + 0.45, 0.4);
      shoulder.add(staff);
      const finial = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 5, 10), gold);
      finial.position.set(0.06 * s, -0.68 + 0.45 + 1.3, 0.4);
      shoulder.add(finial);
    }
    body.add(shoulder);
    arms.push(shoulder);
  }

  // the three orbs: small, wide of the body at shoulder height, sharing the
  // eye material so the whole burst lights up on windup. The manager owns
  // their y (bobs around 2.02).
  const extras: THREE.Object3D[] = [];
  for (const [x, z] of [[0.66, 0.12], [-0.7, -0.08], [0.1, -0.52]]) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), accent);
    orb.position.set(x, 2.02, z);
    body.add(orb);
    extras.push(orb);
  }

  const shadow = shadowMesh(0.8);
  group.add(shadow);
  return { group, yawGroup, body, head, eyes, legs, arms, extras, eyeMat: accent, baseY: 0, radius: 0.72, height: 2.5, shadow };
}

// FIEND — the campaign set-piece brute. Read in one frame: a huge chest
// thrown forward over narrow hips, the whole mass leaning into the player,
// on backward-kneed digitigrade legs that say it is about to move, not
// stand. A low wedge head hung out in front of the shoulders under a wide
// sweep of pale horns — the widest thing at the top of the silhouette.
// Long arms end in pale claws; a heavy tail counterweights the lean and
// carries one small ember at its tip. Dark crimson hide; the only hot
// colour is the ember of the eyes and the tail tip. It is the slab's
// footprint stood up and pointed at you: the slab sits, this one hunts.
//
//   silhouette, front:
//
//       \__          __/         <- horns, pale, wide
//          \  (oo)  /            <- wedge head low in front of the chest
//        __ \______/ __
//       /   |      |   \         <- lathe chest, widest at the shoulders,
//      |    |      |    |           tapering hard to the hips
//      |    |______|    |
//      \/    /    \    \/        <- claws hang below the hips
//           (      )
//            \    /              <- digitigrade legs, knees bent back
//            /|  |\
//           ‾‾    ‾‾             <- hooves
//
// Threat telegraph: both arms are arms[]; the biped windup raises the
// claws forward at the player while eyes + tail ember flare through
// eyeMat. The tail is extras[0]: the manager writes its rotation.x
// (1.1 + sway), so the tail geometry is built to trail back under exactly
// that rotation.
function buildFiend(tex: ReturnType<typeof getTextures>): EnemyRig {
  const hide = mat(tex.skins.fiend);
  // hard parts carry no map: a Lambert tint can only darken the hide
  const bone = new THREE.MeshLambertMaterial({ color: 0xd8cdb4 });
  applyRadialFog(bone);
  // accent: one unlit ember material for the eyes and the tail tip
  const accent = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
  applyRadialFog(accent);
  const group = new THREE.Group();
  const yawGroup = new THREE.Group();
  const body = new THREE.Group();
  group.add(yawGroup);
  yawGroup.add(body);

  // chest: one lathe, narrow hips flaring hard to the shoulders, tipped
  // well forward so the mass hangs over the front feet
  const profile = [
    [0.3, 0.0], [0.36, 0.3], [0.5, 0.7], [0.62, 1.0],
    [0.66, 1.2], [0.5, 1.4], [0.16, 1.5],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const chest = new THREE.Mesh(new THREE.LatheGeometry(profile, 8), hide);
  chest.scale.z = 0.8;
  chest.position.set(0, 1.05, -0.02);
  chest.rotation.set(0.35, 0, 0.04);
  body.add(chest);

  // head: a wedge hung out in front of the shoulders, looking down at you,
  // jaw dropped. Face on +z. Horns are tubes swept out and up.
  const head = new THREE.Group();
  const skull = sph(0.2, hide, 8);
  skull.scale.set(1.1, 0.8, 1.3);
  head.add(skull);
  const jaw = sph(0.14, hide, 7);
  jaw.scale.set(0.8, 0.45, 1.25);
  jaw.position.set(0, -0.15, 0.12);
  jaw.rotation.x = 0.25;
  head.add(jaw);
  const maw = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0x1a0505 }));
  applyRadialFog(maw.material as THREE.Material);
  maw.scale.set(1.2, 0.6, 1);
  maw.position.set(0, -0.08, 0.2);
  head.add(maw);
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), accent);
    eye.position.set(0.1 * s, 0.07, 0.19);
    head.add(eye);
    eyes.push(eye);
  }
  for (const s of [-1, 1]) {
    const hornPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.12 * s, 0.1, -0.06),
      new THREE.Vector3(0.36 * s, 0.22, -0.14),
      new THREE.Vector3(0.52 * s, 0.45, 0.06),
    ]);
    head.add(new THREE.Mesh(new THREE.TubeGeometry(hornPath, 6, 0.06, 5, false), bone));
  }
  head.position.set(0, 2.34, 0.72);   // horn tips under enemyVolumeY minus bob
  head.rotation.x = 0.2;
  body.add(head);

  // arms: long tubes from wide shoulders down past the hips, dark hands,
  // one pale claw each. One arm hangs a little wider than the other.
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.62 * s, 2.12, 0.34);
    shoulder.rotation.z = s * (s < 0 ? -0.18 : -0.08);
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.14 * s, -0.55, -0.02),
      new THREE.Vector3(0.1 * s, -1.05, 0.14),
    ]);
    shoulder.add(new THREE.Mesh(new THREE.TubeGeometry(path, 6, 0.11, 6, false), hide));
    const hand = sph(0.13, hide, 7);
    hand.scale.set(0.9, 1.1, 1.1);
    hand.position.set(0.1 * s, -1.1, 0.16);
    shoulder.add(hand);
    const claw = cone(0.055, 0.32, bone, 5);
    claw.position.set(0.1 * s, -1.24, 0.3);
    claw.rotation.x = Math.PI - 0.55;
    shoulder.add(claw);
    body.add(shoulder);
    arms.push(shoulder);
  }

  // legs: digitigrade. The hip pivot is what the walk swings; the thigh
  // angles forward and the shank folds back in child groups, hooves pale.
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.28 * s, 1.05, -0.05);
    const thighG = new THREE.Group();
    thighG.rotation.x = -0.5;
    const thigh = cyl(0.15, 0.12, 0.6, hide, 7);
    thigh.position.y = -0.3;
    thighG.add(thigh);
    const shankG = new THREE.Group();
    shankG.position.y = -0.6;
    shankG.rotation.x = 1.0;
    const shank = cyl(0.1, 0.09, 0.5, hide, 6);
    shank.position.y = -0.25;
    shankG.add(shank);
    const hoof = sph(0.13, bone, 6);
    hoof.scale.set(0.9, 0.45, 1.5);
    hoof.position.set(0, -0.5, 0.06);
    hoof.rotation.x = -0.5;
    shankG.add(hoof);
    thighG.add(shankG);
    hip.add(thighG);
    body.add(hip);
    legs.push(hip);
  }

  // tail: extras[0]. Under the manager's rotation.x = 1.1 the group's local
  // (0,-0.89,-0.45) points straight back and (0,0.45,-0.89) points up, so
  // this curve trails back level and curls its ember tip upward.
  const tail = new THREE.Group();
  tail.position.set(0, 1.05, -0.28);
  const tailPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.06, -0.55, -0.28),
    new THREE.Vector3(0.02, -1.0, -0.42),
    new THREE.Vector3(-0.02, -0.82, -0.8),
  ]);
  tail.add(new THREE.Mesh(new THREE.TubeGeometry(tailPath, 8, 0.09, 6, false), hide));
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), accent);
  ember.position.set(-0.02, -0.82, -0.8);
  tail.add(ember);
  tail.rotation.x = 1.1;
  body.add(tail);

  const shadow = shadowMesh(0.95);
  group.add(shadow);
  return { group, yawGroup, body, head, eyes, legs, arms, extras: [tail], eyeMat: accent, baseY: 0, radius: 0.85, height: 2.8, shadow };
}

function shadowMesh(r: number): THREE.Mesh {
  const tex = getTextures();
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2, r * 2),
    new THREE.MeshBasicMaterial({ map: tex.shadow, transparent: true, depthWrite: false, opacity: 0.85 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = 2;
  return m;
}

// ------------------------------------------------------------------ manager

export class EnemyRenderer {
  rigs = new Map<number, EnemyRig>();
  private scene: THREE.Scene;
  private time = 0;
  updateCount = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private build(type: string): EnemyRig {
    const tex = getTextures();
    const rig = (() => {
      switch (type) {
        case 'crawler': return buildCrawler(tex);
        case 'slab': return buildSlab(tex);
        case 'wisp': return buildWisp(tex);
        case 'hierophant': return buildHierophant(tex);
        case 'fiend': return buildFiend(tex);
        default: return buildHusk(tex);
      }
    })();
    // Centralized so no builder needs to know about flare/restore state.
    rig.eyeBase = rig.eyeMat.color.clone();
    return rig;
  }

  syncStart(enemies: EnemyEnt[]): void {
    // remove rigs for gone enemies, add new ones
    const alive = new Set(enemies.map(e => e.id));
    for (const [id, rig] of this.rigs) {
      if (!alive.has(id)) {
        this.scene.remove(rig.group);
        this.rigs.delete(id);
      }
    }
    for (const e of enemies) {
      if (!this.rigs.has(e.id)) {
        const rig = this.build(e.type);
        applyRadialFogDeep(rig.group);
        this.rigs.set(e.id, rig);
        this.scene.add(rig.group);
      }
    }
  }

  update(dt: number, enemies: EnemyEnt[], camera: THREE.Camera, simTime: number): void {
    this.time += dt;
    this.updateCount++;
    for (const e of enemies) {
      const rig = this.rigs.get(e.id);
      if (!rig) continue;
      rig.group.position.set(e.x, 0, e.z);
      rig.yawGroup.rotation.y = e.yaw;

      if (e.dead) {
        // fall over, then sink
        const dt2 = simTime - e.deathTime;
        const fall = Math.min(1, dt2 / 0.45);
        rig.group.rotation.x = -fall * Math.PI / 2 * 0.92;
        rig.body.position.y = rig.baseY * (1 - fall);
        if (dt2 > 1.6) {
          const sink = Math.min(1, (dt2 - 1.6) / 1.2);
          rig.group.position.y = -sink * (rig.height + 0.4);
          (rig.shadow.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - sink);
        }
        // Eyes go dark. Recomputed from eyeBase + elapsed death time each
        // frame (not repeated multiplication of whatever colour was live
        // when death began) so a death right after an attack/pain flare
        // starts the fade from the rig's own resting colour, not the flare.
        const base = rig.eyeBase;
        if (base) rig.eyeMat.color.copy(base).multiplyScalar(Math.pow(0.9, dt2 * 60));
        continue;
      }

      const def = ENEMIES[e.type];
      const moving = e.state === 'chase';
      const speedNorm = moving ? e.speed / 5 : 0;

      if (e.type === 'crawler') {
        // skitter: legs ripple forward/back
        rig.legs.forEach((leg, i) => {
          const ph = e.animPhase * 14 + i * 1.7;
          const baseZ = (Math.floor(i / 3) * 2 - 1) * -0.12;
          const baseAng = leg.rotation.z;
          void baseAng;
          leg.rotation.x = (i % 3 - 1) * 0.14 + Math.sin(ph) * 0.4 * speedNorm;
          leg.rotation.z = baseZ + Math.cos(ph) * 0.1 * speedNorm;
        });
        rig.body.position.y = rig.baseY + Math.abs(Math.sin(e.animPhase * 14)) * 0.04 * speedNorm;
      } else if (e.type === 'wisp') {
        // Bob amplitude is read from def.hoverBob, not hardcoded, so this
        // animation can never drift from the hit volume in enemyVolumeY.
        rig.body.position.y = rig.baseY + Math.sin(e.animPhase * 2.2) * def.hoverBob;
        rig.body.rotation.z = Math.sin(e.animPhase * 1.4) * 0.12;
        rig.extras.forEach((w, i) => {
          if (i < 2) w.rotation.y = Math.sin(e.animPhase * 26 + i * Math.PI) * 0.7;
          else w.rotation.x = Math.sin(e.animPhase * 3 + i) * 0.25;
        });
      } else if (e.type === 'hierophant') {
        rig.legs.forEach(l => { l.rotation.y = Math.sin(e.animPhase * 4) * 0.1 * speedNorm; });
        rig.body.position.y = rig.baseY + Math.sin(e.animPhase * 2) * 0.05 + speedNorm * Math.abs(Math.sin(e.animPhase * 5)) * 0.08;
        rig.extras.forEach((p, i) => { p.position.y = 2.02 + Math.sin(e.animPhase * 3 + i * 2) * 0.06; });
      } else {
        // bipeds: leg swing + arm counter-swing
        rig.legs.forEach((leg, i) => {
          leg.rotation.x = Math.sin(e.animPhase * 7 + i * Math.PI) * 0.55 * speedNorm;
        });
        rig.arms.forEach((arm, i) => {
          arm.rotation.x = 0.3 - Math.sin(e.animPhase * 7 + i * Math.PI) * 0.4 * speedNorm;
        });
        rig.body.position.y = rig.baseY + Math.abs(Math.sin(e.animPhase * 7)) * 0.045 * speedNorm;
        if (e.type === 'slab') rig.body.rotation.x = 0.06 + Math.sin(e.animPhase * 3) * 0.02;
        if (e.type === 'fiend') {
          rig.extras.forEach(t => { t.rotation.x = 1.1 + Math.sin(e.animPhase * 3) * 0.12 * speedNorm; });
        }
      }

      // attack windup: rear back, eyes flare
      const base = rig.eyeBase;
      if (e.state === 'attack') {
        const t = Math.min(1, e.timer / Math.max(0.01, def.windup));
        rig.body.rotation.x = -0.22 * t;
        rig.arms.forEach(a => { a.rotation.x = -0.9 * t; });
        // Brighten toward hot/white as a function of windup t only, tinted
        // by this rig's own eye colour — never reads the mutated .color
        // (that used to compound frame over frame and hardcode orange).
        if (base) {
          rig.eyeMat.color.copy(base).lerp(EYE_FLARE_WHITE, t * 0.7).multiplyScalar(1 + t * 0.8);
          clampColor01(rig.eyeMat.color);
        }
      } else if (e.state === 'pain') {
        rig.body.rotation.x = 0.3;
        // Distinct hot spike, still keyed off this rig's own eye colour.
        if (base) {
          rig.eyeMat.color.copy(base).lerp(EYE_FLARE_WHITE, 0.6).multiplyScalar(1.35);
          clampColor01(rig.eyeMat.color);
        }
      } else {
        rig.body.rotation.x = e.type === 'slab' ? 0.06 : e.type === 'fiend' ? 0.08 : 0;
        // Idle: restore resting eye colour (attack/pain flares must not stick).
        if (base) rig.eyeMat.color.copy(base);
      }
      void camera;
    }
  }

  dispose(): void {
    for (const [, rig] of this.rigs) this.scene.remove(rig.group);
    this.rigs.clear();
  }

  rigInfo(): { id: number; visible: boolean; x: number; z: number; scale: number; rotX: number }[] {
    const out: { id: number; visible: boolean; x: number; z: number; scale: number; rotX: number }[] = [];
    for (const [id, rig] of this.rigs) {
      out.push({
        id, visible: rig.group.visible,
        x: +rig.group.position.x.toFixed(1), z: +rig.group.position.z.toFixed(1),
        scale: rig.group.scale.x,
        rotX: +rig.group.rotation.x.toFixed(2),
      });
    }
    return out;
  }

  setAllVisible(v: boolean): void {
    for (const [, rig] of this.rigs) rig.group.visible = v;
  }
}
