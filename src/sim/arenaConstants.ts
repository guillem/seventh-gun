// Arena-specific constants (separate from maze GEN_VERSION so single-player
// layout determinism stays byte-identical).

export const ARENA_GEN_VERSION = 1;
export const ARENA_GRID = 96;

export const ARENA_MAX_PLAYERS = 10;

// Server tick + snapshot + client input pacing.
export const ARENA_TICK_HZ = 60; // = 1 / STEP_DT
export const ARENA_SNAPSHOT_HZ = 20;
export const ARENA_INPUT_HZ = 15; // client batches 4 ticks per message

export const ARENA_RESPAWN = {
  gun: 25,
  gun7: 40,
  ammo: 12,
  medikit: 20,
};

export const ARENA_SPAWN_PROTECT = 2;
export const ARENA_DEATH_LOCKOUT = 2;
export const ARENA_IDLE_S = 120;
export const ARENA_LAST_HIT_S = 5;

// Best-effort spawn spacing; if no candidate satisfies, fall back.
export const ARENA_MIN_SPAWN_DIST = 16;

