// Builds the static world from the map: merged per-theme geometry with baked
// per-vertex light, decal planes, doors, the arena seal, sky dome.
// Campaign runs swap the theme atlas for getCampaignTextures(artId) and add
// extra artwork; maze / #m= keep the shared four-theme look.
import * as THREE from 'three';
import { CELL, CEIL_H, WALL_H } from '../sim/types';
import type { GameMap, Room, Theme } from '../sim/types';
import { getTextures } from './textures';
import {
  getCampaignTextures,
  type CampaignArtId, type CampaignTextureLib,
} from './campaignTextures';
import {
  applyCampaignDecor, CAMPAIGN_AMBIENT, CAMPAIGN_DOOR_EMISSIVE,
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

function bakeColor(
  lights: GameMap['lights'],
  x: number, y: number, z: number,
  ambient: THREE.Color,
  skyLit: boolean,
): THREE.Color {
  const out = ambient.clone();
  if (skyLit) out.add(new THREE.Color(0.32, 0.28, 0.34));
  for (const L of lights) {
    const d = Math.hypot(L.x - x, L.z - z) + Math.abs(L.y - y) * 0.4;
    if (d > L.radius) continue;
    const f = (1 - d / L.radius) ** 1.6 * L.intensity;
    out.r += L.color[0] * f;
    out.g += L.color[1] * f;
    out.b += L.color[2] * f;
  }
  out.r = Math.min(1.15, out.r);
  out.g = Math.min(1.15, out.g);
  out.b = Math.min(1.15, out.b);
  return out;
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

  const themeAmbient: Record<Theme, THREE.Color> = {
    industrial: new THREE.Color(0.22, 0.24, 0.22),
    organic: new THREE.Color(0.26, 0.13, 0.13),
    stone: new THREE.Color(0.18, 0.21, 0.25),
    tech: new THREE.Color(0.18, 0.17, 0.27),
  };
  const campAmb = resolved
    ? new THREE.Color().fromArray(CAMPAIGN_AMBIENT[resolved])
    : null;

  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  for (let cz = 0; cz < map.h; cz++) {
    for (let cx = 0; cx < map.w; cx++) {
      if (map.grid[cz * map.w + cx] !== 1) continue;
      const { theme, outdoor } = roomThemeAt(map, cx, cz);
      const x0 = cx * CELL, x1 = x0 + CELL;
      const z0 = cz * CELL, z1 = z0 + CELL;
      const amb = campAmb ?? themeAmbient[theme];
      const surf = camp ? 'campaign' : theme;

      // floor (winding faces UP: cross((b-a),(c-b)) = +Y)
      {
        const m = bucket(`floor:${surf}`);
        const c00 = bakeColor(map.lights, x0, 0, z0, amb, outdoor);
        const c10 = bakeColor(map.lights, x1, 0, z0, amb, outdoor);
        const c11 = bakeColor(map.lights, x1, 0, z1, amb, outdoor);
        const c01 = bakeColor(map.lights, x0, 0, z1, amb, outdoor);
        pushQuad(m, V(x0, 0, z1), V(x1, 0, z1), V(x1, 0, z0), V(x0, 0, z0),
          V(0, 1, 0), 1, 1, [c01, c11, c10, c00]);
      }
      // ceiling (indoor only)
      if (!outdoor) {
        const m = bucket(`ceil:${surf}`);
        const c00 = bakeColor(map.lights, x0, CEIL_H, z0, amb, false);
        const c10 = bakeColor(map.lights, x1, CEIL_H, z0, amb, false);
        const c11 = bakeColor(map.lights, x1, CEIL_H, z1, amb, false);
        const c01 = bakeColor(map.lights, x0, CEIL_H, z1, amb, false);
        pushQuad(m, V(x0, CEIL_H, z0), V(x1, CEIL_H, z0), V(x1, CEIL_H, z1), V(x0, CEIL_H, z1),
          V(0, -1, 0), 1, 1, [c00, c10, c11, c01]);
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
      const bake = (p: THREE.Vector3) => bakeColor(map.lights, p.x, p.y, p.z, amb, outdoor);
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
        pushQuad(m, a, b, c, d, n, 1, WALL_H / CELL, [bake(a), bake(b), bake(c), bake(d)]);
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
    geo.setAttribute('color', new THREE.Float32BufferAttribute(m.col, 3));
    disposables.push(geo);
    const texture = camp
      ? (type === 'floor' ? camp.floors : type === 'ceil' ? camp.ceilings : camp.walls)
      : type === 'floor' ? tex.floors[theme]
        : type === 'ceil' ? tex.ceilings[theme]
          : tex.walls[theme];
    const wallRepeat = type === 'wall' ? 1 : 1;
    const mat = new THREE.MeshBasicMaterial({
      map: texture, vertexColors: true, fog: true,
      // floors/ceilings are single-sided quads seen from one side; DoubleSide
      // removes any chance of a culled surface showing the sky through it
      side: type === 'wall' ? THREE.FrontSide : THREE.DoubleSide,
    });
    applyRadialFog(mat);
    void wallRepeat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = true;
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
    const mat = new THREE.MeshLambertMaterial({
      map: camp?.door ?? tex.door,
      emissive: new THREE.Color(resolved ? CAMPAIGN_DOOR_EMISSIVE[resolved] : 0x2a1000),
    });
    applyRadialFog(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(d.x, (WALL_H * 0.72) / 2, d.z);
    group.add(mesh);
    doorMeshes.set(d.id, mesh);
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

  return {
    group,
    doorMeshes,
    sealMesh,
    sky,
    dispose: () => { for (const g of disposables) g.dispose(); },
  };
}
