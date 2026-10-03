import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FOUNDRY_PENDANTS, FOUNDRY_SLOTS, insideAuthoredFoundry, placeFoundryActorLights } from '../../src/render/foundryLighting';

describe('baked Foundry actor lighting', () => {
  it('restricts the dimmed lighting to the authored opening, preserving other rooms and maps', () => {
    expect(insideAuthoredFoundry('campaign:01-foundry', 41, 87)).toBe(true);
    for (const [seed, x, z] of [['campaign:02-gullet', 41, 87], ['campaign:01-foundry', 105, 87], ['maze', 41, 87]] as const) {
      expect(insideAuthoredFoundry(seed, x, z)).toBe(false);
    }
  });

  it('includes every fixed fixture so player movement cannot switch light pools', () => {
    const lights = Array.from({ length: 7 }, () => new THREE.SpotLight());
    placeFoundryActorLights(lights);
    expect(new Set(lights.slice(0, 4).map(light => light.position.x)).size).toBe(4);
    lights.forEach((light, i) => {
      const sources = i < 4 ? FOUNDRY_PENDANTS : FOUNDRY_SLOTS;
      expect(sources.some(source => light.position.equals(new THREE.Vector3(...source)))).toBe(true);
      expect(light.target.position.y).toBe(0);
      expect(light.target.position.x).toBeCloseTo(light.position.x + (i < 4 ? .8 : 2));
      expect(light.target.position.z).toBeCloseTo(i < 4 ? light.position.z + .35 : 88);
    });
  });
});
