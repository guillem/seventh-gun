// Builds the static world from the map: merged per-theme PBR geometry, soft
// no-shadow look-dev lights, decal planes, doors, the arena seal, sky dome.
// Campaign runs swap the theme atlas for getCampaignTextures(artId) and add
// extra artwork; maze / #m= keep the shared four-theme look.
import * as THREE from 'three';
import { CELL, CEIL_H, WALL_H, cellToWorld } from '../sim/types';
import type { GameMap, Room, Theme } from '../sim/types';
import { getTextures, MAZE_PBR } from './textures';
import {
  getCampaignTextures,
  SECRET_HINT_COLORS,
  type CampaignArtId, type CampaignTextureLib,
} from './campaignTextures';
import {
  applyCampaignDecor, CAMPAIGN_DOOR_EMISSIVE,
} from './campaignDecor';
import { applyRadialFog } from './radialFog';

interface QuadMesh {
  pos: number[];
  norm: number[];
  uv: number[];
  col: number[];
}

function newMesh(): QuadMesh {
  return { pos: [], norm: [], uv: [], col: [] };
}

function pushQuad(
  m: QuadMesh,
  a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3,
  normal: THREE.Vector3,
  uvX: number,
  uvY: number,
  colors: THREE.Color[], // per-corner (a,b,c,d)
): void {
  // two triangles a-b-c, a-c-d
  const tris = [a, b, c, a, c, d];
  const uvs = [
    [0, 0], [uvX, 0], [uvX, uvY],
    [0, 0], [uvX, uvY], [0, uvY],
  ];
  const cols = [colors[0], colors[1], colors[2], colors[0], colors[2], colors[3]];
  for (let i = 0; i < 6; i++) {
    m.pos.push(tris[i].x, tris[i].y, tris[i].z);
    m.norm.push(normal.x, normal.y, normal.z);
    m.uv.push(uvs[i][0], uvs[i][1]);
    m.col.push(cols[i].r, cols[i].g, cols[i].b);
  }
}


function worldStandard(opts: {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
  bumpMap?: THREE.Texture;
  roughness: number;
  metalness: number;
  side?: THREE.Side;
}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: opts.map,
    roughnessMap: opts.roughnessMap,
    bumpMap: opts.bumpMap,
    bumpScale: opts.bumpMap ? 0.18 : 0,
    roughness: opts.roughness,
    metalness: opts.metalness,
    envMapIntensity: 0.12,
    fog: true,
    side: opts.side ?? THREE.FrontSide,
  });
  applyRadialFog(mat);
  return mat;
}

const MAX_OVERHEADS = 6;

/** Fill lives on the renderer. Soft, wide, no-shadow overheads so rooms are not flashlight pools. */
function attachLookdevLights(group: THREE.Group, map: GameMap): void {
  const ranked = map.lights.slice().sort((a, b) => {
    const coolA = a.color[2] - a.color[0];
    const coolB = b.color[2] - b.color[0];
    if (coolB !== coolA) return coolB - coolA;
    return b.intensity - a.intensity;
  });
  const picked = ranked.slice(0, MAX_OVERHEADS);
  picked.forEach((L) => {
    const dist = Math.min(32, Math.max(18, L.radius * 2.4));
    const intensity = 1.8 + L.intensity * 1.6;
    const color = new THREE.Color().setRGB(L.color[0], L.color[1], L.color[2]);
    const light = new THREE.PointLight(color, intensity, dist, 1.15);
    light.position.set(L.x, L.y, L.z);
    light.castShadow = false;
    group.add(light);
  });
}

function roomThemeAt(map: GameMap, cx: number, cz: number): { theme: Theme; outdoor: boolean } {
  for (const r of map.rooms) {
    if (cx >= r.x && cx < r.x + r.w && cz >= r.z && cz < r.z + r.h) {
      return { theme: r.theme, outdoor: r.outdoor };
    }
  }
  // corridors inherit from nearest room by theme of nearest room center
  let best: Room | null = null;
  let bestD = Infinity;
  for (const r of map.rooms) {
    const d = Math.hypot(r.cx / CELL - cx, r.cz / CELL - cz);
    if (d < bestD) { bestD = d; best = r; }
  }
  return { theme: best ? best.theme : 'stone', outdoor: false };
}

export function buildWorld(map: GameMap, artId?: CampaignArtId): {
  group: THREE.Group;
  doorMeshes: Map<number, THREE.Mesh>;
  plateMeshes: Map<number, THREE.Mesh>;
  sealMesh: THREE.Group;
  sky: THREE.Mesh | null;
  dispose: () => void;
} {
  const tex = getTextures();
  const resolved = artId;
  const camp: CampaignTextureLib | null = resolved ? getCampaignTextures(resolved) : null;
  const group = new THREE.Group();
  const disposables: THREE.BufferGeometry[] = [];

  const buckets = new Map<string, QuadMesh>();
  const bucket = (kind: string): QuadMesh => {
    if (!buckets.has(kind)) buckets.set(kind, newMesh());
    return buckets.get(kind)!;
  };

  // Vertex bake is skipped: real lights drive MeshStandardMaterial.
  const WHITE = new THREE.Color(1, 1, 1);
  const WHITE4 = [WHITE, WHITE, WHITE, WHITE];

  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  for (let cz = 0; cz < map.h; cz++) {
    for (let cx = 0; cx < map.w; cx++) {
      if (map.grid[cz * map.w + cx] !== 1) continue;
      const { theme, outdoor } = roomThemeAt(map, cx, cz);
      const x0 = cx * CELL, x1 = x0 + CELL;
      const z0 = cz * CELL, z1 = z0 + CELL;
      const surf = camp ? 'campaign' : theme;

      // floor (winding faces UP: cross((b-a),(c-b)) = +Y)
      {
        const m = bucket(`floor:${surf}`);
        pushQuad(m, V(x0, 0, z1), V(x1, 0, z1), V(x1, 0, z0), V(x0, 0, z0),
          V(0, 1, 0), 1, 1, WHITE4);
      }
      // ceiling (indoor only)
      if (!outdoor) {
        const m = bucket(`ceil:${surf}`);
        pushQuad(m, V(x0, CEIL_H, z0), V(x1, CEIL_H, z0), V(x1, CEIL_H, z1), V(x0, CEIL_H, z1),
          V(0, -1, 0), 1, 1, WHITE4);
      }
      // walls toward solid neighbors
      const solidAt = (x: number, z: number) =>
        x < 0 || z < 0 || x >= map.w || z >= map.h || map.grid[z * map.w + x] === 0;
      const sides: [number, number, THREE.Vector3][] = [
        [0, -1, V(0, 0, 1)],
        [0, 1, V(0, 0, -1)],
        [-1, 0, V(1, 0, 0)],
        [1, 0, V(-1, 0, 0)],
      ];
      const m = bucket(`wall:${surf}`);
      for (const [dx, dz, n] of sides) {
        if (!solidAt(cx + dx, cz + dz)) continue;
        let a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3;
        if (n.z === 1) {
          a = V(x0, 0, z0); b = V(x1, 0, z0); c = V(x1, WALL_H, z0); d = V(x0, WALL_H, z0);
        } else if (n.z === -1) {
          a = V(x1, 0, z1); b = V(x0, 0, z1); c = V(x0, WALL_H, z1); d = V(x1, WALL_H, z1);
        } else if (n.x === 1) {
          a = V(x0, 0, z1); b = V(x0, 0, z0); c = V(x0, WALL_H, z0); d = V(x0, WALL_H, z1);
        } else {
          a = V(x1, 0, z0); b = V(x1, 0, z1); c = V(x1, WALL_H, z1); d = V(x1, WALL_H, z0);
        }
        pushQuad(m, a, b, c, d, n, 1, WALL_H / CELL, WHITE4);
      }
    }
  }

  // emit buckets as meshes
  for (const [kind, m] of buckets) {
    if (!m.pos.length) continue;
    const [type, themeStr] = kind.split(':');
    const theme = themeStr as Theme;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(m.norm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
    disposables.push(geo);
    const albedo = camp
      ? (type === 'floor' ? camp.floors : type === 'ceil' ? camp.ceilings : camp.walls)
      : type === 'floor' ? tex.floors[theme]
        : type === 'ceil' ? tex.ceilings[theme]
          : tex.walls[theme];
    const roughnessMap = camp
      ? (type === 'floor' ? camp.roughnessFloors : type === 'ceil' ? camp.roughnessCeilings : camp.roughnessWalls)
      : type === 'floor' ? tex.roughness.floors[theme]
        : type === 'ceil' ? tex.roughness.ceilings[theme]
          : tex.roughness.walls[theme];
    const bumpMap = camp
      ? (type === 'floor' ? camp.bumpFloors : type === 'ceil' ? camp.bumpCeilings : camp.bumpWalls)
      : type === 'floor' ? tex.bump.floors[theme]
        : type === 'ceil' ? tex.bump.ceilings[theme]
          : tex.bump.walls[theme];
    const mazePbr = themeStr === 'campaign' ? null : MAZE_PBR[theme];
    const mat = worldStandard({
      map: albedo,
      roughnessMap,
      bumpMap,
      roughness: camp ? camp.pbrRoughness : mazePbr!.roughness,
      metalness: camp ? camp.pbrMetalness : mazePbr!.metalness,
      // floors/ceilings are single-sided quads seen from one side; DoubleSide
      // removes any chance of a culled surface showing the sky through it
      side: type === 'wall' ? THREE.FrontSide : THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = true;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    group.add(mesh);
  }

  // decal planes (mounted on walkable wall faces, centered on the panel)
  const decalGeo = new THREE.PlaneGeometry(CELL * 0.82, CELL * 0.82);
  disposables.push(decalGeo);
  for (const d of map.decors) {
    const size = d.kind === 'tendrils' ? CELL : CELL * 0.8;
    const geo = d.kind === 'tendrils' ? new THREE.PlaneGeometry(size, size) : decalGeo;
    if (d.kind === 'tendrils') disposables.push(geo);
    const mat = new THREE.MeshBasicMaterial({
      map: tex.decals[d.kind],
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    applyRadialFog(mat);
    if (d.kind === 'lamp') {
      mat.color = new THREE.Color(2.2, 1.9, 1.4); // emissive lamp
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(d.x, d.y, d.z);
    mesh.rotation.y = d.facing;
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  // doors (slabs that slide up)
  const doorMeshes = new Map<number, THREE.Mesh>();
  for (const d of map.doors) {
    // axis = corridor travel direction: the slab must SPAN the doorway's
    // 3 cells (across travel) and be thin ALONG travel
    const geo = new THREE.BoxGeometry(
      d.axis === 'x' ? 0.5 : CELL * 3,
      WALL_H * 0.72,
      d.axis === 'x' ? CELL * 3 : 0.5,
    );
    disposables.push(geo);
    const mat = new THREE.MeshStandardMaterial({
      map: camp?.door ?? tex.door,
      roughness: camp ? Math.min(0.94, camp.pbrRoughness + 0.06) : 0.88,
      metalness: camp ? Math.min(0.06, camp.pbrMetalness) : 0.04,
      envMapIntensity: 0.12,
      emissive: new THREE.Color(resolved ? CAMPAIGN_DOOR_EMISSIVE[resolved] : 0x2a1000),
      fog: true,
    });
    applyRadialFog(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(d.x, (WALL_H * 0.72) / 2, d.z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    doorMeshes.set(d.id, mesh);
  }

  // secret plates: WALL texture (not door), slide up like doors
  const plateMeshes = new Map<number, THREE.Mesh>();
  for (const s of map.secrets ?? []) {
    const room = map.rooms.find(r => r.id === s.roomId);
    const theme = room?.theme ?? 'stone';
    const geo = new THREE.BoxGeometry(
      s.axis === 'x' ? 0.5 : CELL * 3,
      WALL_H * 0.72,
      s.axis === 'x' ? CELL * 3 : 0.5,
    );
    disposables.push(geo);
    const wallTex = camp?.walls ?? tex.walls[theme];
    const plateRough = camp?.roughnessWalls ?? tex.roughness.walls[theme];
    const plateBump = camp?.bumpWalls ?? tex.bump.walls[theme];
    const mat = worldStandard({
      map: wallTex,
      roughnessMap: plateRough,
      bumpMap: plateBump,
      roughness: camp ? camp.pbrRoughness : MAZE_PBR[theme].roughness,
      metalness: camp ? camp.pbrMetalness : MAZE_PBR[theme].metalness,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(s.x, (WALL_H * 0.72) / 2, s.z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    plateMeshes.set(s.id, mesh);

    // crack / light seam on the parent-facing side
    const secretEast = room ? room.x >= s.cx : false;
    const secretSouth = room ? room.z >= s.cz : false;
    const crack = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL * 2.6, WALL_H * 0.55),
      new THREE.MeshBasicMaterial({
        color: resolved ? SECRET_HINT_COLORS[resolved] : 0xffc850,
        transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }),
    );
    applyRadialFog(crack.material as THREE.MeshBasicMaterial);
    crack.position.y = WALL_H * 0.36;
    if (s.axis === 'x') {
      crack.rotation.y = secretEast ? Math.PI / 2 : -Math.PI / 2;
      crack.position.x = secretEast ? -0.28 : 0.28;
    } else {
      crack.rotation.y = secretSouth ? 0 : Math.PI;
      crack.position.z = secretSouth ? -0.28 : 0.28;
    }
    mesh.add(crack);

    if (s.trigger && (s.kind === 'remote-use' || s.kind === 'remote-shoot')) {
      const tx = cellToWorld(s.trigger.x);
      const tz = cellToWorld(s.trigger.z);
      const isLever = s.kind === 'remote-use';
      const trig = new THREE.Group();
      if (isLever) {
        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.7, 0.18),
          new THREE.MeshLambertMaterial({ color: 0x8a7a50 }),
        );
        arm.position.y = 1.4;
        arm.rotation.z = 0.45;
        trig.add(arm);
        const knob = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xffc850 }),
        );
        knob.position.set(0.22, 1.7, 0);
        trig.add(knob);
      } else {
        const sigil = new THREE.Mesh(
          new THREE.CircleGeometry(0.45, 12),
          new THREE.MeshBasicMaterial({
            color: 0xa24bff, transparent: true, opacity: 0.7,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
          }),
        );
        applyRadialFog(sigil.material as THREE.MeshBasicMaterial);
        sigil.position.y = 1.65;
        trig.add(sigil);
      }
      trig.position.set(tx, 0, tz);
      group.add(trig);
    }
  }

  // arena seal barrier
  const sealMesh = new THREE.Group();
  {
    const geo = new THREE.PlaneGeometry(CELL * 3, CEIL_H);
    disposables.push(geo);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x7a1aff,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const plane = new THREE.Mesh(geo, mat);
    plane.position.y = CEIL_H / 2;
    sealMesh.add(plane);
    // rune ring on top of it
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xd7a5ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
    );
    disposables.push(ring.geometry as THREE.BufferGeometry);
    ring.position.y = 2.2;
    sealMesh.add(ring);
    sealMesh.position.set(map.seal.x, 0, map.seal.z);
    if (map.seal.axis === 'x') sealMesh.rotation.y = Math.PI / 2;
    group.add(sealMesh);
  }

  // Sky dome: texture must fill the canvas (equirect) so the sphere is not a
  // small painted disc on black. Follows the camera so map-edge views never
  // clip a far hemisphere past camera.far (that clip is the black horizon arch).
  let sky: THREE.Mesh | null = null;
  {
    const geo = new THREE.SphereGeometry(380, 24, 16);
    disposables.push(geo);
    const skyMap = camp?.sky ?? tex.sky;
    skyMap.wrapS = THREE.ClampToEdgeWrapping;
    skyMap.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshBasicMaterial({
      map: skyMap, side: THREE.BackSide, fog: false, depthWrite: false,
    });
    sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    group.add(sky);
  }

  if (camp && resolved) {
    applyCampaignDecor(group, map, resolved, camp, disposables);
  }

  attachLookdevLights(group, map);

  return {
    group,
    doorMeshes,
    plateMeshes,
    sealMesh,
    sky,
    dispose: () => { for (const g of disposables) g.dispose(); },
  };
}
