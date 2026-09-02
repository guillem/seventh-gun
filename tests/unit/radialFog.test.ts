import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyRadialFog } from '../../src/render/radialFog';

describe('radial fog', () => {
  it('rewrites depth fog to length(mvPosition.xyz) and skips fog:false', () => {
    const mat = new THREE.MeshBasicMaterial({ fog: true });
    applyRadialFog(mat);
    const shader = { vertexShader: 'vFogDepth = - mvPosition.z;', fragmentShader: '' };
    mat.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('length( mvPosition.xyz )');
    expect(shader.vertexShader).not.toContain('vFogDepth = - mvPosition.z;');

    const skip = new THREE.MeshBasicMaterial({ fog: false });
    applyRadialFog(skip);
    expect(skip.userData.radialFog).toBeUndefined();
  });

  it('is wired into world, enemy, and campaign decal materials', () => {
    const world = readFileSync(join(process.cwd(), 'src', 'render', 'world.ts'), 'utf8');
    const enemies = readFileSync(join(process.cwd(), 'src', 'render', 'enemies.ts'), 'utf8');
    const decor = readFileSync(join(process.cwd(), 'src', 'render', 'campaignDecor.ts'), 'utf8');
    expect(world).toContain('applyRadialFog(mat)');
    expect(enemies).toContain('applyRadialFog(m)');
    expect(decor).toContain('applyRadialFog(mat)');
  });
});
