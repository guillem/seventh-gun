// The seven guns. Look, sound and behavior must agree.
// All damage values are Normal base; outgoing damage is scaled by difficulty.
import type { AmmoType, ProjectileKind } from './types';

export interface WeaponDef {
  id: number;
  name: string;
  short: string;
  ammo: AmmoType;
  // behavior
  hitscan: boolean;
  pellets: number;          // pellets per shot (shotgun)
  damage: number;           // per pellet / per projectile
  spread: number;           // radians half-cone at reference
  bloomMax: number;         // extra radians at full bloom (chaingun)
  bloomTime: number;        // seconds of hold to reach bloomMax
  fireInterval: number;     // seconds between shots while held
  falloffStart: number;     // range where full damage ends (hitscan)
  falloffEnd: number;       // range where damage bottoms out
  falloffMin: number;       // multiplier at falloffEnd
  pierce: boolean;          // rail: goes through enemies
  projectile?: { kind: ProjectileKind; speed: number; gravity: number; radius: number };
  splash?: { radius: number; damageSelfPct: number };
  // pickup / economy
  spawnAmmo: number;        // granted when the gun is picked up
  boxAmmo: number;          // granted by an ammo box of its type
  maxAmmo: number;
  // presentation hints (audio/render read these)
  muzzleSize: number;       // 0.5..2.5
  loudness: number;         // enemy hearing radius in world units
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 1, name: 'Viper Pistol', short: 'VIPER', ammo: 'bullets',
    hitscan: true, pellets: 1, damage: 13, spread: 0.001, bloomMax: 0, bloomTime: 0,
    fireInterval: 0.3, falloffStart: 30, falloffEnd: 55, falloffMin: 0.6, pierce: false,
    spawnAmmo: 70, boxAmmo: 45, maxAmmo: 300,
    muzzleSize: 0.6, loudness: 18,
  },
  {
    id: 2, name: 'Ripjaw Shotgun', short: 'RIPJAW', ammo: 'shells',
    hitscan: true, pellets: 8, damage: 9, spread: 0.1, bloomMax: 0, bloomTime: 0,
    fireInterval: 1.05, falloffStart: 8, falloffEnd: 26, falloffMin: 0.2, pierce: false,
    spawnAmmo: 16, boxAmmo: 8, maxAmmo: 60,
    muzzleSize: 2.3, loudness: 36,
  },
  {
    id: 3, name: 'Hornet Chaingun', short: 'HORNET', ammo: 'bullets',
    hitscan: true, pellets: 1, damage: 8, spread: 0.02, bloomMax: 0.085, bloomTime: 1.3,
    fireInterval: 0.095, falloffStart: 22, falloffEnd: 45, falloffMin: 0.45, pierce: false,
    spawnAmmo: 90, boxAmmo: 45, maxAmmo: 300,
    muzzleSize: 0.9, loudness: 26,
  },
  {
    id: 4, name: 'Spiker', short: 'SPIKER', ammo: 'nails',
    hitscan: false, pellets: 1, damage: 17, spread: 0.025, bloomMax: 0, bloomTime: 0,
    fireInterval: 0.22, falloffStart: 40, falloffEnd: 60, falloffMin: 1, pierce: false,
    projectile: { kind: 'nail', speed: 34, gravity: 0, radius: 0.18 },
    spawnAmmo: 70, boxAmmo: 35, maxAmmo: 220,
    muzzleSize: 0.8, loudness: 22,
  },
  {
    id: 5, name: 'Bile Launcher', short: 'BILE', ammo: 'grenades',
    hitscan: false, pellets: 1, damage: 90, spread: 0.008, bloomMax: 0, bloomTime: 0,
    fireInterval: 1.15, falloffStart: 40, falloffEnd: 60, falloffMin: 1, pierce: false,
    projectile: { kind: 'grenade', speed: 19, gravity: 22, radius: 0.3 },
    splash: { radius: 5, damageSelfPct: 0.25 },
    spawnAmmo: 8, boxAmmo: 3, maxAmmo: 30,
    muzzleSize: 1.3, loudness: 30,
  },
  {
    id: 6, name: 'Sunlance', short: 'SUNLANCE', ammo: 'cores',
    hitscan: true, pellets: 1, damage: 130, spread: 0, bloomMax: 0, bloomTime: 0,
    fireInterval: 1.05, falloffStart: 90, falloffEnd: 120, falloffMin: 1, pierce: true,
    spawnAmmo: 10, boxAmmo: 4, maxAmmo: 24,
    muzzleSize: 1.1, loudness: 28,
  },
  {
    id: 7, name: 'The Seventh', short: 'SEVENTH', ammo: 'void',
    hitscan: false, pellets: 1, damage: 160, spread: 0, bloomMax: 0, bloomTime: 0,
    fireInterval: 1.35, falloffStart: 40, falloffEnd: 60, falloffMin: 1, pierce: false,
    projectile: { kind: 'voidorb', speed: 17, gravity: 0, radius: 0.55 },
    splash: { radius: 8, damageSelfPct: 0.2 },
    spawnAmmo: 5, boxAmmo: 1, maxAmmo: 12,
    muzzleSize: 2.0, loudness: 40,
  },
];

export const AMMO_TYPES: AmmoType[] = ['bullets', 'shells', 'nails', 'grenades', 'cores', 'void'];

export const AMMO_LABEL: Record<AmmoType, string> = {
  bullets: 'BULLETS', shells: 'SHELLS', nails: 'NAILS',
  grenades: 'GRENADES', cores: 'CORES', void: 'VOID',
};

export function weapon(id: number): WeaponDef {
  return WEAPONS[id - 1];
}
