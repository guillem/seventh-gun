// Whole-economy difficulty multipliers. Normal is the reference balance.
import type { Difficulty } from './types';

export interface DiffSpec {
  label: string;
  enemyHp: number;
  enemyDamage: number;
  enemySpeed: number;
  enemyAccuracy: number; // multiplier on spread cone (lower = more accurate)
  enemyReaction: number; // multiplier on reaction time (lower = faster)
  enemyCount: number;
  playerDamageOut: number;
  medikitCount: number;
  medikitHeal: number;
  ammoAmount: number;
}

export const DIFFICULTIES: Record<Difficulty, DiffSpec> = {
  easy: {
    label: 'Easy',
    enemyHp: 0.75,
    enemyDamage: 0.6,
    enemySpeed: 0.9,
    enemyAccuracy: 1.7,
    enemyReaction: 1.6,
    enemyCount: 0.72,
    playerDamageOut: 1.35,
    medikitCount: 1.5,
    medikitHeal: 35,
    ammoAmount: 1.35,
  },
  normal: {
    label: 'Normal',
    enemyHp: 1,
    enemyDamage: 1,
    enemySpeed: 1,
    enemyAccuracy: 1,
    enemyReaction: 1,
    enemyCount: 1,
    playerDamageOut: 1,
    medikitCount: 1,
    medikitHeal: 25,
    ammoAmount: 1,
  },
  hard: {
    label: 'Hard',
    enemyHp: 1.3,
    enemyDamage: 1.4,
    enemySpeed: 1.1,
    enemyAccuracy: 0.75,
    enemyReaction: 0.7,
    enemyCount: 1.22,
    playerDamageOut: 0.85,
    medikitCount: 0.75,
    medikitHeal: 18,
    ammoAmount: 0.85,
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];
