// Enemy archetypes — organic / biomechanic alien demons.
import { PLAYER_EYE, type EnemyType, type ProjectileKind } from './types';

export interface EnemyDef {
  type: EnemyType;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  height: number;
  flying: boolean;
  hoverY: number;
  // Peak vertical excursion of the render-side torso bob for FLYING enemies
  // (EnemyRenderer reads this too, so the animation and the hit volume can
  // never drift apart — see enemyVolumeY below). 0 for grounded enemies:
  // they bob too, but that bob is small and already absorbed by the
  // grounded branch's fixed `height + 0.15` headroom, so it isn't routed
  // through this field.
  hoverBob: number;
  // Where the projectile actually leaves the body, in the enemy's LOCAL
  // frame: +z is forward (the rig convention, rotation.y = e.yaw); +x is
  // whatever the render-side mesh builder itself calls local +x (e.g. the
  // slab's "Right (+x): the mortar" arm) — copy the value straight out of
  // the builder in src/render/enemies.ts, don't re-derive it by reasoning
  // about handedness. Same reason hoverBob exists: once the roster grew
  // visible launchers (the slab's mortar bell, etc.) a shot spawned on the
  // body axis visibly clips or floats free of the art. `forward`/`right`
  // are rotated by e.yaw at spawn time (sim.ts); `up` is a delta added on
  // top of the existing height-based shotY baseline, so it stays sane if
  // `height` or `hoverY` are retuned later. Not a balance knob — it only
  // moves where the shot starts, not its speed, damage, or range.
  muzzleOffset: { forward: number; right: number; up: number };
  sightRange: number;
  sightFov: number;      // radians, half-angle
  hearRange: number;
  wakeRadius: number;    // proximity wake
  attackRange: number;
  attackMinRange: number;
  projectile: ProjectileKind;
  projSpeed: number;
  projGravity: number;
  projRadius: number;
  burst: number;         // shots per attack
  burstGap: number;
  damage: number;        // per projectile
  splashRadius: number;  // 0 = none
  attackInterval: number;
  windup: number;        // telegraph seconds before first projectile
  reaction: number;      // seconds from wake to acting
  accuracy: number;      // radians of aim error at 16u (scaled by dist & difficulty)
  painChance: number;
  painTime: number;
  scoreWeight: number;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  husk: {
    type: 'husk', name: 'Husk', hp: 30, speed: 3.4, radius: 0.55, height: 1.9,
    flying: false, hoverY: 0, hoverBob: 0,
    // maw: head.position (0.06,1.79,0.46) + jaw/maw local offset — the
    // lolling skull thrown forward on its neck.
    muzzleOffset: { forward: 0.53, right: 0.09, up: 0.30 },
    sightRange: 24, sightFov: 1.0, hearRange: 28, wakeRadius: 5,
    attackRange: 19, attackMinRange: 0,
    projectile: 'plasma', projSpeed: 15, projGravity: 0, projRadius: 0.28,
    burst: 1, burstGap: 0, damage: 8, splashRadius: 0,
    attackInterval: 1.5, windup: 0.35, reaction: 0.6, accuracy: 0.09, painChance: 0.5, painTime: 0.32,
    scoreWeight: 1,
  },
  crawler: {
    type: 'crawler', name: 'Crawler', hp: 18, speed: 5.2, radius: 0.5, height: 1.0,
    flying: false, hoverY: 0, hoverBob: 0,
    // mouth: head.position (0,0.5,0.5) + fang cluster — the eye/fang mass
    // on +z.
    muzzleOffset: { forward: 0.64, right: 0, up: -0.34 },
    sightRange: 18, sightFov: 1.3, hearRange: 22, wakeRadius: 4,
    attackRange: 7.5, attackMinRange: 0,
    projectile: 'spit', projSpeed: 18, projGravity: 3, projRadius: 0.22,
    burst: 2, burstGap: 0.18, damage: 5, splashRadius: 0,
    attackInterval: 0.9, windup: 0.2, reaction: 0.4, accuracy: 0.11, painChance: 0.7, painTime: 0.25,
    scoreWeight: 1,
  },
  slab: {
    type: 'slab', name: 'Slab', hp: 110, speed: 2.3, radius: 0.9, height: 2.6,
    flying: false, hoverY: 0, hoverBob: 0,
    // mortar bell mouth on the right arm (arms[0], gunArm.position
    // (0.82,1.86,0.08)). e.timer counts DOWN from def.windup to 0 and
    // enemyShoot fires at e.timer<=0, so the render-side windup pose
    // (t = e.timer/windup) is at t≈0 — arm.rotation.x≈0 — at the exact
    // instant the shot leaves, not the t=1 pose it snaps to when the
    // attack state is entered. Walked the actual Object3D chain (gunArm
    // -rotation.x=0 -> bell -fixed rotation.x=PI-0.7- -> mouth at local
    // y=0.62) at that pose: world ≈ (0.68, 0.75, 0.50) — hip height,
    // matching the "(==) bell mouth" row drawn low in the silhouette
    // comment above. up is that 0.75 minus the height*0.72 baseline.
    muzzleOffset: { forward: 0.50, right: 0.68, up: -1.12 },
    sightRange: 22, sightFov: 0.9, hearRange: 26, wakeRadius: 5,
    attackRange: 16, attackMinRange: 0,
    projectile: 'fireball', projSpeed: 11, projGravity: 0, projRadius: 0.45,
    burst: 1, burstGap: 0, damage: 20, splashRadius: 2.6,
    attackInterval: 2.2, windup: 0.55, reaction: 0.8, accuracy: 0.07, painChance: 0.25, painTime: 0.4,
    scoreWeight: 3,
  },
  wisp: {
    type: 'wisp', name: 'Wisp', hp: 34, speed: 4.6, radius: 0.5, height: 1.1,
    flying: true, hoverY: 2.3, hoverBob: 0.18,
    // maw: the small cone on the face plate, local (0,-0.1,0.34) off the
    // body root (which is already translated to hoverY).
    muzzleOffset: { forward: 0.34, right: 0, up: -0.10 },
    sightRange: 26, sightFov: 1.2, hearRange: 30, wakeRadius: 6,
    attackRange: 18, attackMinRange: 0,
    projectile: 'bolt', projSpeed: 17, projGravity: 0, projRadius: 0.2,
    burst: 3, burstGap: 0.14, damage: 6, splashRadius: 0,
    attackInterval: 1.4, windup: 0.25, reaction: 0.5, accuracy: 0.1, painChance: 0.6, painTime: 0.28,
    scoreWeight: 2,
  },
  hierophant: {
    type: 'hierophant', name: 'Hierophant', hp: 170, speed: 3.4, radius: 0.72, height: 2.5,
    flying: false, hoverY: 0, hoverBob: 0,
    // No single muzzle: the three burst orbs (extras[]) float wide of the
    // body at shoulder height, not on one launcher. Centre-front at the
    // mask/eyes instead — head.position (0,2.08,0.04) plus the mask's
    // forward offset.
    muzzleOffset: { forward: 0.24, right: 0, up: 0.27 },
    sightRange: 28, sightFov: 1.1, hearRange: 34, wakeRadius: 6,
    attackRange: 20, attackMinRange: 0,
    projectile: 'orb', projSpeed: 14, projGravity: 0, projRadius: 0.32,
    burst: 3, burstGap: 0.22, damage: 12, splashRadius: 0,
    attackInterval: 2.4, windup: 0.5, reaction: 0.45, accuracy: 0.06, painChance: 0.3, painTime: 0.36,
    scoreWeight: 5,
  },
  // Campaign-only brute. generateMap must never pick this type.
  fiend: {
    type: 'fiend', name: 'Fiend', hp: 240, speed: 2.7, radius: 0.85, height: 2.8,
    flying: false, hoverY: 0, hoverBob: 0,
    // maw: the wedge head hung out in front of the shoulders,
    // head.position (0,2.34,0.72) plus the maw's local forward offset.
    // Claws are the melee/windup threat read, not the fireball's source.
    muzzleOffset: { forward: 0.90, right: 0, up: 0.20 },
    sightRange: 26, sightFov: 1.0, hearRange: 32, wakeRadius: 6,
    attackRange: 18, attackMinRange: 0,
    projectile: 'fireball', projSpeed: 12, projGravity: 0, projRadius: 0.4,
    burst: 2, burstGap: 0.28, damage: 16, splashRadius: 1.8,
    attackInterval: 2.0, windup: 0.5, reaction: 0.55, accuracy: 0.065, painChance: 0.28, painTime: 0.38,
    scoreWeight: 4,
  },
};

// Small fixed pad added on top of the exact hover-bob excursion, for the
// flying hit volume. Not a balance knob — just headroom over the measured
// geometry so the box isn't shaving the art at its exact tangent.
const FLYER_VOL_MARGIN = 0.05;

/**
 * Vertical hit volume in world Y. Flying bodies are centered on hoverY
 * (visible torso), not stacked above the head.
 *
 * EnemyRenderer bobs a flyer's body up AND down by `def.hoverBob` each cycle
 * (sin, so the excursion is symmetric). A static box sized only to `height`
 * misses shots at the top of the bob (and, symmetrically, at the bottom) —
 * the art visibly leaves the box every cycle. Widen both ends by the bob
 * amplitude plus a small margin so the box covers the full swing of the
 * visible body.
 */
export function enemyVolumeY(def: EnemyDef): { yMin: number; yMax: number; yCenter: number } {
  if (def.flying) {
    const half = def.height * 0.5 + def.hoverBob + FLYER_VOL_MARGIN;
    return { yMin: def.hoverY - half, yMax: def.hoverY + half, yCenter: def.hoverY };
  }
  return { yMin: 0.1, yMax: def.height + 0.15, yCenter: def.height * 0.6 };
}

/**
 * XZ gun-test radius. Movement / AI / body-blocking keep `def.radius`.
 * Crawler mesh (abdomen + head + legs) overhangs 0.5u — look-down at the
 * visible front must still connect.
 */
export function enemyGunRadius(def: EnemyDef): number {
  if (def.type === 'crawler') return 1.1;
  return def.radius + 0.12;
}

/**
 * Close enough that a floor crawler fills the lower half of a 75° camera
 * while the crosshair sits on the wall above it (live playtest dist 3.2).
 */
export const CLOSE_GUN_LOFT_DIST = 6;

/**
 * Vertical gun-test slab. Grounded feet/legs sit on the floor (yMin 0).
 * At close range the slab lofts to eye height so a level or shallow
 * look-down (pitch 0 / −8° / −16°) still connects — the body is on
 * screen; the reticle is not on the mesh.
 */
export function enemyGunVolumeY(
  def: EnemyDef,
  distXZ = 99,
): { yMin: number; yMax: number; yCenter: number } {
  const v = enemyVolumeY(def);
  if (def.flying) return v;
  let yMax = v.yMax;
  if (distXZ <= CLOSE_GUN_LOFT_DIST) {
    yMax = Math.max(yMax, PLAYER_EYE + 0.35);
  }
  return { yMin: 0, yMax, yCenter: v.yCenter };
}

/** Distance at which an idle enemy hears a noise of the given loudness. */
export function noiseHearRadius(loudness: number, hearRange: number): number {
  return loudness * 0.45 + hearRange;
}

/** Death-cry loudness at the corpse — same-room neighbors, not the whole map. */
export const DEATH_NOISE_RADIUS = 16;
