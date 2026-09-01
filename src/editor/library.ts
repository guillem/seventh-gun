// User map library. App/editor layer — never import from src/sim/.
// localStorage key `seventh-gun.mymaps`. Cap ~40. Fail soft on quota.

export const MYMAPS_KEY = 'seventh-gun.mymaps';
export const MYMAPS_CAP = 40;

export interface LibraryEntry {
  id: string;
  title: string;
  savedAt: number;
  code: string;
}

export interface LibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): LibraryStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function resolveStorage(storage?: LibraryStorage): LibraryStorage | null {
  return storage ?? defaultStorage();
}

export function parseLibraryEntry(raw: unknown): LibraryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;
  if (typeof o.code !== 'string' || !o.code) return null;
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'UNTITLED';
  const savedAt = typeof o.savedAt === 'number' && Number.isFinite(o.savedAt) ? o.savedAt : 0;
  return { id: o.id, title, savedAt, code: o.code };
}

export function loadLibrary(storage?: LibraryStorage): LibraryEntry[] {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(MYMAPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: LibraryEntry[] = [];
    for (const item of parsed) {
      const e = parseLibraryEntry(item);
      if (e) out.push(e);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveLibrary(entries: LibraryEntry[], storage?: LibraryStorage): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(MYMAPS_KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode */
  }
}

export function newLibraryId(savedAt = Date.now()): string {
  return `m${savedAt.toString(36)}`;
}

export function upsertLibrary(
  input: { id?: string; title: string; code: string; savedAt?: number },
  storage?: LibraryStorage,
): LibraryEntry[] {
  const entries = loadLibrary(storage);
  const savedAt = input.savedAt ?? Date.now();
  const id = input.id ?? newLibraryId(savedAt);
  const next: LibraryEntry = {
    id,
    title: input.title.trim() || 'UNTITLED',
    savedAt,
    code: input.code,
  };
  const filtered = entries.filter(e => e.id !== id);
  filtered.unshift(next);
  if (filtered.length > MYMAPS_CAP) filtered.length = MYMAPS_CAP;
  saveLibrary(filtered, storage);
  return filtered;
}

export function filenameFromTitle(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${slug || 'untitled'}.sgmap`;
}
