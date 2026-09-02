// Enemy meshes: procedural organic/biomechanic demons with faces, walk /
// attack / pain / death animation and blob contact shadows.
import * as THREE from 'three';
import { getTextures } from './textures';
import type { EnemyEnt } from '../sim/sim';
import { ENEMIES } from '../sim/enemyTypes';

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
  baseY: number;            // ground/hover offset
  radius: number;
  height: number;
  shadow: THREE.Mesh;
}

function mat(skin: THREE.Texture, color = 0xffffff): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: skin, color });
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
  return { mesh: sph(r, m, 6), mat: m };
}

// ------------------------------------------------------------------ builders

function buildHusk(tex: ReturnType<typeof getTextures>): EnemyRig {
  const skin = mat(tex.skins.husk);
  const cloth = mat(tex.skins.husk, 0x77776a);
  const group = new THREE.Group();
  const yawGroup = new THREE.Group();
  const body = new THREE.Group();
  group.add(yawGroup);
  yawGroup.add(body);

  // torso: hunched rib cage
  const torso = box(0.62, 0.72, 0.4, skin);
  torso.position.y = 1.12;
  body.add(torso);
  const belly = sph(0.26, skin, 8);
  belly.scale.set(1, 0.8, 0.7);
  belly.position.set(0, 0.82, 0.08);
  body.add(belly);
  // shoulder spikes
  for (const s of [-1, 1]) {
    const sp = cone(0.07, 0.28, skin);
    sp.position.set(0.34 * s, 1.42, 0);
    sp.rotation.z = -0.5 * s;
    body.add(sp);
    const pad = box(0.22, 0.16, 0.28, cloth);
    pad.position.set(0.4 * s, 1.4, 0.02);
    pad.rotation.z = -0.25 * s;
    body.add(pad);
  }
  // exposed spine / feeding tube down the back
  const spine = cyl(0.045, 0.035, 0.7, cloth, 6);
  spine.position.set(0, 1.05, -0.18);
  spine.rotation.x = 0.18;
  body.add(spine);
  for (let i = 0; i < 3; i++) {
    const ring = cyl(0.07, 0.07, 0.04, skin, 6);
    ring.position.set(0, 1.28 - i * 0.18, -0.16 - i * 0.03);
    body.add(ring);
  }
  // head with FACE on +z
  const head = new THREE.Group();
  const skull = box(0.3, 0.32, 0.3, skin);
  head.add(skull);
  const jaw = box(0.26, 0.14, 0.22, skin);
  jaw.position.set(0, -0.22, 0.08);
  head.add(jaw);
  const mandible = box(0.18, 0.08, 0.2, skin);
  mandible.position.set(0, -0.32, 0.12);
  mandible.rotation.x = 0.35;
  head.add(mandible);
  const mouth = box(0.18, 0.05, 0.04, new THREE.MeshBasicMaterial({ color: 0x1a0505 }));
  mouth.position.set(0, -0.13, 0.15);
  head.add(mouth);
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const { mesh, mat: em } = eyeMesh(0.045, 0xffa428);
    mesh.position.set(0.08 * s, 0.03, 0.15);
    head.add(mesh);
    eyes.push(mesh);
    void em;
  }
  head.position.set(0, 1.62, 0.06);
  body.add(head);

  // arms (pivot at shoulder)
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.38 * s, 1.38, 0);
    const upper = cyl(0.07, 0.06, 0.5, skin);
    upper.position.y = -0.25;
    shoulder.add(upper);
    const claw = cone(0.07, 0.18, skin, 5);
    claw.rotation.x = Math.PI;
    claw.position.y = -0.56;
    shoulder.add(claw);
    shoulder.rotation.x = 0.35;
    body.add(shoulder);
    arms.push(shoulder);
  }
  // legs (pivot at hip)
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.16 * s, 0.72, 0);
    const thigh = cyl(0.09, 0.07, 0.5, cloth);
    thigh.position.y = -0.25;
    hip.add(thigh);
    const shin = cyl(0.06, 0.08, 0.44, cloth);
    shin.position.y = -0.68;
    hip.add(shin);
    body.add(hip);
    legs.push(hip);
  }

  const shadow = shadowMesh(0.62);
  group.add(shadow);
  return { group, yawGroup, body, head, eyes, legs, arms, extras: [], eyeMat: eyes.length ? (eyes[0].material as THREE.MeshBasicMaterial) : new THREE.MeshBasicMaterial(), baseY: 0, radius: 0.55, height: 1.9, shadow };
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

function buildSlab(tex: ReturnType<typeof getTextures>): EnemyRig {
  const hide = mat(tex.skins.slab);
  const hide2 = mat(tex.skins.slab, 0xcc9988);
  const group = new THREE.Group();
  const yawGroup = new THREE.Group();
  const body = new THREE.Group();
  group.add(yawGroup);
  yawGroup.add(body);

  // massive plated torso — bulky brute, no chest-sphere pair
  const torso = box(1.18, 1.08, 0.72, hide);
  torso.position.y = 1.55;
  body.add(torso);
  const sternum = box(0.22, 0.85, 0.18, hide2);
  sternum.position.set(0, 1.58, 0.38);
  body.add(sternum);
  for (const s of [-1, 1]) {
    const plate = box(0.46, 0.55, 0.12, hide2);
    plate.position.set(0.34 * s, 1.72, 0.4);
    plate.rotation.y = 0.18 * s;
    body.add(plate);
    const pauldron = box(0.42, 0.28, 0.5, hide);
    pauldron.position.set(0.72 * s, 2.08, 0.02);
    pauldron.rotation.z = -0.35 * s;
    pauldron.rotation.x = -0.12;
    body.add(pauldron);
    const pauldronCap = box(0.28, 0.1, 0.36, hide2);
    pauldronCap.position.set(0.78 * s, 2.22, 0.04);
    pauldronCap.rotation.z = -0.4 * s;
    body.add(pauldronCap);
  }
  // armored gut
  const gut = box(0.95, 0.55, 0.55, hide);
  gut.position.set(0, 0.98, 0.08);
  body.add(gut);
  // back spikes
  for (let i = 0; i < 4; i++) {
    const sp = cone(0.1, 0.4, hide2);
    sp.position.set((i % 2 ? 0.18 : -0.18), 1.8 + i * 0.08, -0.36);
    sp.rotation.x = -0.7;
    body.add(sp);
  }
  // tiny head, one big eye, on +z
  const head = new THREE.Group();
  const skull = box(0.34, 0.3, 0.34, hide);
  head.add(skull);
  const { mesh: eye, mat: eyeM } = eyeMesh(0.09, 0x66ff2b);
  eye.position.set(0, 0.02, 0.16);
  head.add(eye);
  const brow = box(0.36, 0.08, 0.08, hide2);
  brow.position.set(0, 0.12, 0.14);
  head.add(brow);
  const mouth = box(0.24, 0.06, 0.04, new THREE.MeshBasicMaterial({ color: 0x250606 }));
  mouth.position.set(0, -0.1, 0.16);
  head.add(mouth);
  const tusks = cone(0.035, 0.16, hide2, 5);
  tusks.position.set(-0.13, -0.08, 0.16);
  head.add(tusks);
  const tusks2 = tusks.clone();
  tusks2.position.x = 0.13;
  head.add(tusks2);
  head.position.set(0, 2.24, 0.18);
  body.add(head);

  // huge arms
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.72 * s, 2.0, 0);
    const upper = cyl(0.17, 0.14, 0.72, hide);
    upper.position.y = -0.36;
    shoulder.add(upper);
    const fist = box(0.34, 0.32, 0.34, hide2);
    fist.position.y = -0.85;
    shoulder.add(fist);
    body.add(shoulder);
    arms.push(shoulder);
  }
  // short legs
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.3 * s, 1.0, 0);
    const thigh = cyl(0.18, 0.15, 0.55, hide);
    thigh.position.y = -0.28;
    hip.add(thigh);
    const foot = box(0.3, 0.2, 0.42, hide2);
    foot.position.set(0, -0.62, 0.08);
    hip.add(foot);
    body.add(hip);
    legs.push(hip);
  }

  body.rotation.x = 0.12; // hunched
  const shadow = shadowMesh(1.0);
  group.add(shadow);
  return { group, yawGroup, body, head, eyes: [eye], legs, arms, extras: [], eyeMat: eyeM, baseY: 0, radius: 0.9, height: 2.6, shadow };
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

function buildHierophant(tex: ReturnType<typeof getTextures>): EnemyRig {
  const carapace = mat(tex.skins.hierophant);
  const bone = new THREE.MeshLambertMaterial({ color: 0xcabfa4 });
  const group = new THREE.Group();
  const yawGroup = new THREE.Group();
  const body = new THREE.Group();
  group.add(yawGroup);
  yawGroup.add(body);

  // robed torso (tapered)
  const robe = cyl(0.34, 0.62, 1.3, carapace, 8);
  robe.position.y = 1.15;
  body.add(robe);
  const chest = box(0.56, 0.5, 0.36, carapace);
  chest.position.y = 1.72;
  body.add(chest);
  // robe plates — silhouette, not a new type
  for (let i = 0; i < 3; i++) {
    const plate = box(0.42 - i * 0.04, 0.28, 0.08, bone);
    plate.position.set(0, 1.55 - i * 0.32, 0.28);
    body.add(plate);
  }
  // bone collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 6, 12), bone);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.98;
  body.add(collar);
  // floating pauldrons
  const extras: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const p = sph(0.16, bone, 7);
    p.scale.set(1, 0.7, 1);
    p.position.set(0.5 * s, 2.02, 0);
    body.add(p);
    extras.push(p);
  }
  // horned head on +z
  const head = new THREE.Group();
  const skull = box(0.3, 0.34, 0.32, carapace);
  head.add(skull);
  for (const s of [-1, 1]) {
    const horn = cone(0.05, 0.34, bone, 6);
    horn.position.set(0.17 * s, 0.22, -0.02);
    horn.rotation.z = -0.85 * s;
    head.add(horn);
  }
  // crown / horns-lite
  const crown = box(0.34, 0.08, 0.28, bone);
  crown.position.set(0, 0.2, 0);
  head.add(crown);
  for (const s of [-1, 0, 1]) {
    const tine = cone(0.03, 0.16, bone, 5);
    tine.position.set(0.1 * s, 0.3, -0.04);
    tine.rotation.z = -0.2 * s;
    head.add(tine);
  }
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const { mesh } = eyeMesh(0.05, 0xc44dff);
    mesh.position.set(0.09 * s, 0.05, 0.16);
    head.add(mesh);
    eyes.push(mesh);
  }
  const maw = box(0.16, 0.04, 0.04, new THREE.MeshBasicMaterial({ color: 0x2a0733 }));
  maw.position.set(0, -0.1, 0.16);
  head.add(maw);
  head.position.set(0, 2.2, 0.02);
  body.add(head);

  // arms with gauntlets
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.42 * s, 1.88, 0);
    const upper = cyl(0.08, 0.065, 0.6, carapace);
    upper.position.y = -0.3;
    shoulder.add(upper);
    const gauntlet = box(0.16, 0.22, 0.16, bone);
    gauntlet.position.y = -0.68;
    shoulder.add(gauntlet);
    body.add(shoulder);
    arms.push(shoulder);
  }
  // vestigial floating leg shroud
  const shroud = cone(0.42, 0.5, carapace, 8);
  shroud.position.y = 0.3;
  body.add(shroud);
  const legs = [shroud];

  const shadow = shadowMesh(0.8);
  group.add(shadow);
  return { group, yawGroup, body, head, eyes, legs, arms, extras, eyeMat: (eyes[0].material as THREE.MeshBasicMaterial), baseY: 0, radius: 0.72, height: 2.5, shadow };
}

function buildFiend(tex: ReturnType<typeof getTextures>): EnemyRig {
  const hide = mat(tex.skins.fiend);
  const hide2 = mat(tex.skins.fiend, 0xaa5533);
  const hornMat = new THREE.MeshLambertMaterial({ color: 0x2a1810 });
  const group = new THREE.Group();
  const yawGroup = new THREE.Group();
  const body = new THREE.Group();
  group.add(yawGroup);
  yawGroup.add(body);

  const torso = box(0.95, 1.05, 0.58, hide);
  torso.position.y = 1.65;
  body.add(torso);
  const plate = box(0.7, 0.55, 0.14, hide2);
  plate.position.set(0, 1.78, 0.32);
  body.add(plate);
  const gut = box(0.78, 0.5, 0.48, hide);
  gut.position.set(0, 1.05, 0.06);
  body.add(gut);

  for (const s of [-1, 1]) {
    const pad = box(0.32, 0.22, 0.4, hide2);
    pad.position.set(0.58 * s, 2.12, 0);
    pad.rotation.z = -0.3 * s;
    body.add(pad);
  }

  const head = new THREE.Group();
  const skull = box(0.36, 0.38, 0.36, hide);
  head.add(skull);
  const snout = box(0.22, 0.16, 0.28, hide2);
  snout.position.set(0, -0.08, 0.22);
  head.add(snout);
  for (const s of [-1, 1]) {
    const horn = cone(0.07, 0.55, hornMat, 6);
    horn.position.set(0.2 * s, 0.34, -0.04);
    horn.rotation.z = -0.55 * s;
    horn.rotation.x = -0.35;
    head.add(horn);
  }
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const { mesh } = eyeMesh(0.055, 0xff3311);
    mesh.position.set(0.1 * s, 0.06, 0.18);
    head.add(mesh);
    eyes.push(mesh);
  }
  const maw = box(0.2, 0.06, 0.05, new THREE.MeshBasicMaterial({ color: 0x1a0505 }));
  maw.position.set(0, -0.14, 0.36);
  head.add(maw);
  head.position.set(0, 2.38, 0.06);
  body.add(head);

  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.58 * s, 2.08, 0);
    const upper = cyl(0.12, 0.1, 0.7, hide);
    upper.position.y = -0.35;
    shoulder.add(upper);
    const claw = box(0.22, 0.28, 0.22, hide2);
    claw.position.y = -0.78;
    shoulder.add(claw);
    body.add(shoulder);
    arms.push(shoulder);
  }
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.24 * s, 0.85, 0);
    const thigh = cyl(0.14, 0.11, 0.5, hide);
    thigh.position.y = -0.25;
    hip.add(thigh);
    const shin = cyl(0.1, 0.12, 0.48, hide2);
    shin.position.y = -0.7;
    hip.add(shin);
    const hoof = box(0.22, 0.12, 0.34, hornMat);
    hoof.position.set(0, -0.96, 0.06);
    hip.add(hoof);
    body.add(hip);
    legs.push(hip);
  }

  const tail = cone(0.08, 0.7, hide, 6);
  tail.position.set(0, 0.85, -0.4);
  tail.rotation.x = 1.1;
  body.add(tail);

  body.rotation.x = 0.08;
  const shadow = shadowMesh(0.95);
  group.add(shadow);
  return {
    group, yawGroup, body, head, eyes, legs, arms, extras: [tail],
    eyeMat: (eyes[0].material as THREE.MeshBasicMaterial),
    baseY: 0, radius: 0.85, height: 2.8, shadow,
  };
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
    switch (type) {
      case 'crawler': return buildCrawler(tex);
      case 'slab': return buildSlab(tex);
      case 'wisp': return buildWisp(tex);
      case 'hierophant': return buildHierophant(tex);
      case 'fiend': return buildFiend(tex);
      default: return buildHusk(tex);
    }
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
        rig.eyeMat.color.multiplyScalar(0.9); // eyes go dark
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
        rig.body.position.y = rig.baseY + Math.sin(e.animPhase * 2.2) * 0.18;
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
        if (e.type === 'slab') rig.body.rotation.x = 0.12 + Math.sin(e.animPhase * 3) * 0.02;
        if (e.type === 'fiend') {
          rig.extras.forEach(t => { t.rotation.x = 1.1 + Math.sin(e.animPhase * 3) * 0.12 * speedNorm; });
        }
      }

      // attack windup: rear back, eyes flare
      if (e.state === 'attack') {
        const t = Math.min(1, e.timer / Math.max(0.01, def.windup));
        rig.body.rotation.x = -0.22 * t;
        rig.arms.forEach(a => { a.rotation.x = -0.9 * t; });
        const flare = 1 + t * 1.6;
        rig.eyeMat.color.setRGB(
          Math.min(1, (rig.eyeMat.color.r) * 1 + flare * 0.4),
          Math.min(1, flare * 0.28),
          Math.min(1, flare * 0.12),
        );
      } else if (e.state === 'pain') {
        rig.body.rotation.x = 0.3;
        rig.eyeMat.color.setRGB(2, 0.6, 0.4);
      } else {
        rig.body.rotation.x = e.type === 'slab' ? 0.12 : e.type === 'fiend' ? 0.08 : 0;
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
