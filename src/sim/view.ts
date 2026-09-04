import type { GameMap } from './types';
import type {
  DoorState, EnemyEnt, Phase, PickupEnt, PlayerState, ProjectileEnt, SecretState,
} from './sim';
import type { PowerupState } from './powerups';

/** Shared render/HUD surface for maze Sim and arena client views. */
export interface WorldView {
  map: GameMap;
  player: PlayerState;
  phase: Phase;
  phaseTimer: number;
  time: number;
  doors: DoorState[];
  secrets: SecretState[];
  sealIntact: boolean;
  enemies: EnemyEnt[];
  pickups: PickupEnt[];
  projectiles: ProjectileEnt[];
  explored: Uint8Array;
  secretCell: Uint8Array;
  powerups: PowerupState;
  killCount: number;
  arenaEntered: boolean;
  /** True for the network deathmatch; campaign arena messaging differs. */
  networkArena?: boolean;
  hasKey: boolean;
  arenaEnemiesRemaining(): number;
}
