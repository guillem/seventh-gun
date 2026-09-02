// Maze-run history. App-layer only — never import this from src/sim/.
// localStorage key `seventh-gun.maplog`. Fail soft on quota / private mode.
import { GEN_VERSION, type Difficulty } from '../sim/types';

export const MAP_LOG_KEY = 'seventh-gun.maplog';
export const MAP_LOG_CAP = 200;

export type MapLogOutcome = 'won' | 'died' | 'quit';

export interface MapLogEntry {
  seed: string;
  difficulty: Difficulty;
  startedAt: number;
  genVersion: number;
  outcome?: MapLogOutcome;
  durationSec?: number;
  kills?: number;
}

export interface MapLogStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const OUTCOMES: MapLogOutcome[] = ['won', 'died', 'quit'];

const EMPTY_DEFAULTS: Omit<MapLogEntry, 'seed'> = {
  difficulty: 'normal',
  startedAt: 0,
  genVersion: 0,
};

function defaultStorage(): MapLogStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function resolveStorage(storage?: MapLogStorage): MapLogStorage | null {
  return storage ?? defaultStorage();
}

function parseDifficulty(raw: unknown): Difficulty {
  return typeof raw === 'string' && (DIFFICULTIES as string[]).includes(raw)
    ? raw as Difficulty
    : EMPTY_DEFAULTS.difficulty;
}

function parseStartedAt(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Date.parse(raw);
    if (!Number.isNaN(n)) return n;
  }
  return EMPTY_DEFAULTS.startedAt;
}

function parseGenVersion(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : EMPTY_DEFAULTS.genVersion;
}

function parseOutcome(raw: unknown): MapLogOutcome | undefined {
  return typeof raw === 'string' && (OUTCOMES as string[]).includes(raw)
    ? raw as MapLogOutcome
    : undefined;
}

function parseOptionalNumber(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

/** Parse one stored object. Unknown fields are dropped; missing fields get defaults. */
export function parseMapLogEntry(raw: unknown): MapLogEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.seed !== 'string' || !o.seed) return null;
  if (o.seed.startsWith('campaign:')) return null;
  const entry: MapLogEntry = {
    ...EMPTY_DEFAULTS,
    seed: o.seed,
    difficulty: parseDifficulty(o.difficulty),
    startedAt: parseStartedAt(o.startedAt),
    genVersion: parseGenVersion(o.genVersion),
  };
  const outcome = parseOutcome(o.outcome);
  if (outcome) entry.outcome = outcome;
  const durationSec = parseOptionalNumber(o.durationSec);
  if (durationSec !== undefined) entry.durationSec = durationSec;
  const kills = parseOptionalNumber(o.kills);
  if (kills !== undefined) entry.kills = kills;
  return entry;
}

export function loadMapLog(storage?: MapLogStorage): MapLogEntry[] {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(MAP_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const entries: MapLogEntry[] = [];
    for (const item of parsed) {
      const entry = parseMapLogEntry(item);
      if (entry) entries.push(entry);
    }
    return entries;
  } catch {
    return [];
  }
}

export function saveMapLog(entries: MapLogEntry[], storage?: MapLogStorage): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(MAP_LOG_KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Maze seeds only. Campaign, editor playtest, and `#m=` runs stay out of the log. */
export function shouldLogRun(runKind: 'maze' | 'map' | 'campaign', seed: string): boolean {
  return runKind === 'maze' && !!seed && !seed.startsWith('campaign:');
}

export function prependMapLog(
  input: {
    seed: string;
    difficulty: Difficulty;
    startedAt?: number;
    genVersion?: number;
  },
  storage?: MapLogStorage,
): MapLogEntry[] {
  if (!shouldLogRun('maze', input.seed)) return loadMapLog(storage);
  const entries = loadMapLog(storage);
  const entry: MapLogEntry = {
    seed: input.seed,
    difficulty: input.difficulty,
    startedAt: input.startedAt ?? Date.now(),
    genVersion: input.genVersion ?? GEN_VERSION,
  };
  entries.unshift(entry);
  if (entries.length > MAP_LOG_CAP) entries.length = MAP_LOG_CAP;
  saveMapLog(entries, storage);
  return entries;
}

export function patchLatestMapLog(
  match: { seed: string; startedAt?: number; difficulty?: Difficulty },
  patch: { outcome: MapLogOutcome; durationSec?: number; kills?: number },
  storage?: MapLogStorage,
): MapLogEntry[] {
  const entries = loadMapLog(storage);
  const i = entries.findIndex((e) => {
    if (e.seed !== match.seed) return false;
    if (match.startedAt !== undefined && e.startedAt !== match.startedAt) return false;
    if (match.difficulty !== undefined && e.difficulty !== match.difficulty) return false;
    return true;
  });
  if (i === -1) return entries;
  const next: MapLogEntry = { ...entries[i], outcome: patch.outcome };
  if (patch.durationSec !== undefined) next.durationSec = patch.durationSec;
  if (patch.kills !== undefined) next.kills = patch.kills;
  entries[i] = next;
  saveMapLog(entries, storage);
  return entries;
}

export function formatRelativeTime(startedAt: number, now = Date.now()): string {
  if (!startedAt) return 'unknown';
  const delta = Math.max(0, now - startedAt);
  const sec = Math.floor(delta / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  try {
    return new Date(startedAt).toLocaleDateString();
  } catch {
    return 'unknown';
  }
}
