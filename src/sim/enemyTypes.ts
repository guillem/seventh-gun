// Enemy archetypes — organic / biomechanic alien demons.
import type { EnemyType, ProjectileKind } from './types';

export interface EnemyDef {
  type: EnemyType;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  height: number;
  flying: boolean;
  hoverY: number;
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
    flying: false, hoverY: 0,
    sightRange: 24, sightFov: 1.0, hearRange: 28, wakeRadius: 5,
    attackRange: 19, attackMinRange: 0,
    projectile: 'plasma', projSpeed: 15, projGravity: 0, projRadius: 0.28,
    burst: 1, burstGap: 0, damage: 8, splashRadius: 0,
    attackInterval: 1.5, windup: 0.35, reaction: 0.6, accuracy: 0.09, painChance: 0.5, painTime: 0.32,
    scoreWeight: 1,
  },
  crawler: {
    type: 'crawler', name: 'Crawler', hp: 18, speed: 5.2, radius: 0.5, height: 1.0,
    flying: false, hoverY: 0,
    sightRange: 18, sightFov: 1.3, hearRange: 22, wakeRadius: 4,
    attackRange: 7.5, attackMinRange: 0,
    projectile: 'spit', projSpeed: 18, projGravity: 3, projRadius: 0.22,
    burst: 2, burstGap: 0.18, damage: 5, splashRadius: 0,
    attackInterval: 0.9, windup: 0.2, reaction: 0.4, accuracy: 0.11, painChance: 0.7, painTime: 0.25,
    scoreWeight: 1,
  },
  slab: {
    type: 'slab', name: 'Slab', hp: 110, speed: 2.3, radius: 0.9, height: 2.6,
    flying: false, hoverY: 0,
    sightRange: 22, sightFov: 0.9, hearRange: 26, wakeRadius: 5,
    attackRange: 16, attackMinRange: 0,
    projectile: 'fireball', projSpeed: 11, projGravity: 0, projRadius: 0.45,
    burst: 1, burstGap: 0, damage: 20, splashRadius: 2.6,
    attackInterval: 2.2, windup: 0.55, reaction: 0.8, accuracy: 0.07, painChance: 0.25, painTime: 0.4,
    scoreWeight: 3,
  },
  wisp: {
    type: 'wisp', name: 'Wisp', hp: 34, speed: 4.6, radius: 0.5, height: 1.1,
    flying: true, hoverY: 2.3,
    sightRange: 26, sightFov: 1.2, hearRange: 30, wakeRadius: 6,
    attackRange: 18, attackMinRange: 0,
    projectile: 'bolt', projSpeed: 17, projGravity: 0, projRadius: 0.2,
    burst: 3, burstGap: 0.14, damage: 6, splashRadius: 0,
    attackInterval: 1.4, windup: 0.25, reaction: 0.5, accuracy: 0.1, painChance: 0.6, painTime: 0.28,
    scoreWeight: 2,
  },
  hierophant: {
    type: 'hierophant', name: 'Hierophant', hp: 170, speed: 3.4, radius: 0.72, height: 2.5,
    flying: false, hoverY: 0,
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
    flying: false, hoverY: 0,
    sightRange: 26, sightFov: 1.0, hearRange: 32, wakeRadius: 6,
    attackRange: 18, attackMinRange: 0,
    projectile: 'fireball', projSpeed: 12, projGravity: 0, projRadius: 0.4,
    burst: 2, burstGap: 0.28, damage: 16, splashRadius: 1.8,
    attackInterval: 2.0, windup: 0.5, reaction: 0.55, accuracy: 0.065, painChance: 0.28, painTime: 0.38,
    scoreWeight: 4,
  },
};

/** Vertical hit volume in world Y. Flying bodies are centered on hoverY (visible torso), not stacked above the head. */
export function enemyVolumeY(def: EnemyDef): { yMin: number; yMax: number; yCenter: number } {
  if (def.flying) {
    const half = def.height * 0.5;
    return { yMin: def.hoverY - half, yMax: def.hoverY + half, yCenter: def.hoverY };
  }
  return { yMin: 0.1, yMax: def.height + 0.15, yCenter: def.height * 0.6 };
}

/** Distance at which an idle enemy hears a noise of the given loudness. */
export function noiseHearRadius(loudness: number, hearRange: number): number {
  return loudness * 0.45 + hearRange;
}

/** Death-cry loudness at the corpse — same-room neighbors, not the whole map. */
export const DEATH_NOISE_RADIUS = 16;
