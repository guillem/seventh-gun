import * as THREE from 'three';

// These positions match the saved pendant lenses/short roof slots in
// tools/modern-art/build_foundry.py. They illuminate actors in the baked room;
// Their positions remain fixed as the viewer moves; replacing a nearest source
// would make an otherwise static light pool pop elsewhere in the room.
export const FOUNDRY_PENDANTS = [
  [46, 8.56, 85.5], [61, 8.56, 89], [76, 8.56, 85.5], [91, 8.56, 89],
] as const;
export const FOUNDRY_SLOTS = [
  [41, 16.23, 80.8], [71, 16.23, 80.8], [100, 16.23, 80.8],
] as const;

export function placeFoundryActorLights(lights: THREE.SpotLight[]): void {
  const sources = [...FOUNDRY_PENDANTS, ...FOUNDRY_SLOTS];
  lights.forEach((light, index) => {
    const source = sources[index];
    light.position.set(source[0], source[1], source[2]);
    light.target.position.set(source[0] + (index < 4 ? .8 : 2), 0, index < 4 ? source[2] + .35 : 88);
  });
}
