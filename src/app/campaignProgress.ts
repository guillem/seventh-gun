// Campaign continue state. App-layer only — never import this from src/sim/.
// localStorage key `seventh-gun.campaign`. Fail soft on quota / private mode.
import type { AmmoType, Difficulty, PlayerLoadout } from '../sim/types';

export const CAMPAIGN_PROGRESS_KEY = 'seventh-gun.campaign';

export interface CampaignProgress {
  difficulty: Difficulty;
  nextMap: number; // 1..8; 8 = finished
  loadout: PlayerLoadout;
  /** Highest playable map 1..7. Derived from nextMap when missing. */
  unlocked?: number;
  mapStartedAt?: number;
}

export interface CampaignStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const AMMO_TYPES: AmmoType[] = ['bullets', 'shells', 'nails', 'grenades', 'cores', 'void'];

function defaultStorage(): CampaignStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function resolveStorage(storage?: CampaignStorage): CampaignStorage | null {
  return storage ?? defaultStorage();
}

function parseDifficulty(raw: unknown): Difficulty {
  return typeof raw === 'string' && (DIFFICULTIES as string[]).includes(raw)
    ? raw as Difficulty
    : 'normal';
}

function parseLoadout(raw: unknown): PlayerLoadout | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const ownedIn = Array.isArray(o.owned) ? o.owned : [];
  const owned = [false, false, false, false, false, false, false, false];
  for (let i = 0; i < 8; i++) owned[i] = ownedIn[i] === true;
  if (!owned[1]) owned[1] = true;
  const ammoSrc = (o.ammo && typeof o.ammo === 'object') ? o.ammo as Record<string, unknown> : {};
  const ammo = {
    bullets: 0, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0,
  } as Record<AmmoType, number>;
  for (const t of AMMO_TYPES) {
    const v = ammoSrc[t];
    ammo[t] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0;
  }
  const gun = typeof o.gun === 'number' && o.gun >= 1 && o.gun <= 7 && owned[o.gun] ? o.gun : 1;
  return { owned, ammo, gun };
}

export function parseCampaignProgress(raw: unknown): CampaignProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const loadout = parseLoadout(o.loadout);
  if (!loadout) return null;
  const nextMap = typeof o.nextMap === 'number' && Number.isFinite(o.nextMap)
    ? Math.max(1, Math.min(8, Math.floor(o.nextMap)))
    : 1;
  const progress: CampaignProgress = {
    difficulty: parseDifficulty(o.difficulty),
    nextMap,
    loadout,
  };
  if (typeof o.unlocked === 'number' && Number.isFinite(o.unlocked)) {
    progress.unlocked = Math.max(1, Math.min(7, Math.floor(o.unlocked)));
  }
  if (typeof o.mapStartedAt === 'number' && Number.isFinite(o.mapStartedAt)) {
    progress.mapStartedAt = o.mapStartedAt;
  }
  return progress;
}

export function loadCampaignProgress(storage?: CampaignStorage): CampaignProgress | null {
  const store = resolveStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(CAMPAIGN_PROGRESS_KEY);
    if (!raw) return null;
    return parseCampaignProgress(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveCampaignProgress(progress: CampaignProgress, storage?: CampaignStorage): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(CAMPAIGN_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function clearCampaignProgress(storage?: CampaignStorage): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    if (store.removeItem) store.removeItem(CAMPAIGN_PROGRESS_KEY);
    else store.setItem(CAMPAIGN_PROGRESS_KEY, '');
  } catch {
    /* ignore */
  }
}

export function canContinue(progress: CampaignProgress | null): boolean {
  return !!progress && progress.nextMap >= 2 && progress.nextMap <= 7;
}

/** Highest map the player may click. First visit: only map 1. */
export function unlockedThrough(progress: CampaignProgress | null): number {
  if (!progress) return 1;
  const raw = typeof progress.unlocked === 'number' ? progress.unlocked : progress.nextMap;
  return Math.max(1, Math.min(7, Math.floor(raw)));
}

export function isMapUnlocked(n: number, progress: CampaignProgress | null): boolean {
  return n >= 1 && n <= 7 && n <= unlockedThrough(progress);
}

/** Persist a map win: unlock N+1, keep CONTINUE on the frontier, never rewind. */
export function applyMapWin(
  progress: CampaignProgress | null,
  completed: number,
  loadout: PlayerLoadout,
  difficulty: Difficulty,
): CampaignProgress {
  const done = Math.max(1, Math.min(7, Math.floor(completed)));
  const prevNext = progress?.nextMap ?? 1;
  const unlocked = Math.min(7, Math.max(unlockedThrough(progress), done >= 7 ? 7 : done + 1));
  const onFrontier = done >= prevNext;
  return {
    difficulty,
    nextMap: onFrontier ? Math.min(8, done + 1) : prevNext,
    loadout: onFrontier ? loadout : (progress?.loadout ?? loadout),
    unlocked,
  };
}
