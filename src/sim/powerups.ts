// Powerup tracks. Pure; no DOM. Two tracks: WARD (incoming) vs damage (outgoing).
import type { PowerupKind } from './types';

export const POWERUP_KINDS: PowerupKind[] = ['ward', 'wrath', 'sevenfold'];

export const POWERUP_DEFS: Record<PowerupKind, {
  duration: number;
  incomingMul: number;
  outgoingMul: number;
  color: string;
  hex: number;
  label: string;
  track: 'ward' | 'damage';
}> = {
  ward: {
    duration: 10, incomingMul: 0, outgoingMul: 1,
    color: '#38C8FF', hex: 0x38C8FF, label: 'WARD', track: 'ward',
  },
  wrath: {
    duration: 20, incomingMul: 1, outgoingMul: 3,
    color: '#A24BFF', hex: 0xA24BFF, label: 'WRATH', track: 'damage',
  },
  sevenfold: {
    duration: 7, incomingMul: 1, outgoingMul: 7,
    color: '#4DFF9B', hex: 0x4DFF9B, label: 'SEVENFOLD', track: 'damage',
  },
};

export interface PowerupState {
  wardT: number;
  damageKind: 'wrath' | 'sevenfold' | null;
  damageT: number;
  wardWarned: boolean;
  damageWarned: boolean;
}

export function createPowerupState(): PowerupState {
  return { wardT: 0, damageKind: null, damageT: 0, wardWarned: false, damageWarned: false };
}

export function outgoingMul(s: PowerupState): number {
  if (!s.damageKind || s.damageT <= 0) return 1;
  return POWERUP_DEFS[s.damageKind].outgoingMul;
}

export function wardActive(s: PowerupState): boolean {
  return s.wardT > 0;
}

export interface PowerupApplyResult {
  started: PowerupKind;
  ended: PowerupKind | null;
}

/** Same kind refreshes max(t, dur). Damage track: newest wins. WARD stacks with damage. */
export function applyPowerup(s: PowerupState, kind: PowerupKind): PowerupApplyResult {
  const def = POWERUP_DEFS[kind];
  if (kind === 'ward') {
    s.wardT = Math.max(s.wardT, def.duration);
    s.wardWarned = s.wardT > 3 ? false : s.wardWarned;
    return { started: kind, ended: null };
  }
  const prev = s.damageKind;
  const same = prev === kind;
  s.damageKind = kind;
  s.damageT = same ? Math.max(s.damageT, def.duration) : def.duration;
  s.damageWarned = s.damageT > 3 ? false : s.damageWarned;
  return { started: kind, ended: prev && prev !== kind ? prev : null };
}

export interface PowerupTickEvent {
  t: 'warn' | 'end';
  kind: PowerupKind;
}

const WARN_AT = 3;

export function stepPowerups(s: PowerupState, dt: number): PowerupTickEvent[] {
  const out: PowerupTickEvent[] = [];
  if (s.wardT > 0) {
    const before = s.wardT;
    s.wardT = Math.max(0, s.wardT - dt);
    if (before > WARN_AT && s.wardT <= WARN_AT && !s.wardWarned) {
      s.wardWarned = true;
      out.push({ t: 'warn', kind: 'ward' });
    }
    if (s.wardT <= 0) {
      s.wardT = 0;
      s.wardWarned = false;
      out.push({ t: 'end', kind: 'ward' });
    }
  }
  if (s.damageKind && s.damageT > 0) {
    const kind = s.damageKind;
    const before = s.damageT;
    s.damageT = Math.max(0, s.damageT - dt);
    if (before > WARN_AT && s.damageT <= WARN_AT && !s.damageWarned) {
      s.damageWarned = true;
      out.push({ t: 'warn', kind });
    }
    if (s.damageT <= 0) {
      s.damageT = 0;
      s.damageKind = null;
      s.damageWarned = false;
      out.push({ t: 'end', kind });
    }
  }
  return out;
}
