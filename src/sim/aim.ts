/**
 * Gun aim basis. Yaw about Y, look −Z.
 *
 * Positive pitch is look-DOWN (live playtest `look(0, 22)` → pitch +0.384).
 * That is the opposite of Three.js YXZ `rotation.x` (positive X looks up),
 * so the renderer stores `camera.rotation.x = -player.pitch`.
 *
 * dirY = −sin(pitch): +22° from eye 1.7 hits y≈0.5 at t=3.2.
 */
export function aimDirFromLook(
  yaw: number,
  pitch: number,
): { dirX: number; dirY: number; dirZ: number } {
  const cp = Math.cos(pitch);
  return {
    dirX: -Math.sin(yaw) * cp,
    dirY: -Math.sin(pitch),
    dirZ: -Math.cos(yaw) * cp,
  };
}

/** Three.js YXZ camera.rotation.x for a Quake-style look-down pitch. */
export function threePitchFromLook(pitch: number): number {
  return -pitch;
}

/** Quake-style pitch from a YXZ camera.rotation.x. */
export function lookPitchFromThree(rotX: number): number {
  return -rotX;
}
