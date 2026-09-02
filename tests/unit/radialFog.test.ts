import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ShaderLib, ShaderChunk } from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyRadialFog,
  applyRadialFogDeep,
  rewriteFogVertexShader,
} from '../../src/render/radialFog';

const STOCK_FOG_VERTEX = readFileSync(
  join(process.cwd(), 'node_modules', 'three', 'src', 'renderers', 'shaders', 'ShaderChunk', 'fog_vertex.glsl.js'),
  'utf8',
);

function resolveIncludes(src: string): string {
  return src.replace(/#include <(\w+)>/g, (_, name: string) => {
    const chunk = (ShaderChunk as Record<string, string>)[name];
    return chunk ? resolveIncludes(chunk) : '';
  });
}

function compileHook(mat: THREE.Material, vertexShader: string): string {
  const shader = { vertexShader, fragmentShader: '' };
  mat.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
  return shader.vertexShader;
}

describe('radial fog', () => {
  it('stock three.js r171 fog_vertex is camera-Z, not what onBeforeCompile sees', () => {
    // The assignment lives in the chunk file. ShaderLib materials only
    // `#include <fog_vertex>` — WebGLProgram expands that AFTER onBeforeCompile.
    expect(STOCK_FOG_VERTEX).toMatch(/vFogDepth\s*=\s*-\s*mvPosition\.z\s*;/);
    expect(STOCK_FOG_VERTEX).not.toContain('length( mvPosition.xyz )');

    for (const kind of ['basic', 'lambert', 'phong', 'standard', 'physical'] as const) {
      const vert = ShaderLib[kind].vertexShader;
      expect(vert, kind).toContain('#include <fog_vertex>');
      expect(vert, kind).not.toMatch(/vFogDepth\s*=\s*-\s*mvPosition\.z/);
    }
  });

  it('rewrites the real fog chunk and ShaderLib sources to length(mvPosition.xyz)', () => {
    const chunk = rewriteFogVertexShader(STOCK_FOG_VERTEX);
    expect(chunk).toContain('length( mvPosition.xyz )');
    expect(chunk).not.toMatch(/vFogDepth\s*=\s*-\s*mvPosition\.z\s*;/);

    const lambert = rewriteFogVertexShader(ShaderLib.lambert.vertexShader);
    expect(lambert).toContain('#include <fog_vertex>');
    expect(lambert).toContain('length( mvPosition.xyz )');

    const resolved = resolveIncludes(ShaderLib.lambert.vertexShader);
    expect(resolved).toContain('length( mvPosition.xyz )');
    expect(resolved).not.toMatch(/(vFogDepth|fogDepth)\s*=\s*-\s*mvPosition\.z\s*;/);
  });

  it('ShaderChunk.fog_vertex is patched at import for every material type', () => {
    expect(ShaderChunk.fog_vertex).toContain('length( mvPosition.xyz )');
    expect(ShaderChunk.fog_vertex).not.toMatch(/(vFogDepth|fogDepth)\s*=\s*-\s*mvPosition\.z\s*;/);
  });

  it('onBeforeCompile rewrites real ShaderLib verts on Basic/Lambert/Phong/Standard', () => {
    const kinds: Array<{ name: string; mat: THREE.Material; vert: string }> = [
      { name: 'basic', mat: new THREE.MeshBasicMaterial({ fog: true }), vert: ShaderLib.basic.vertexShader },
      { name: 'lambert', mat: new THREE.MeshLambertMaterial({ fog: true }), vert: ShaderLib.lambert.vertexShader },
      { name: 'phong', mat: new THREE.MeshPhongMaterial({ fog: true }), vert: ShaderLib.phong.vertexShader },
      { name: 'standard', mat: new THREE.MeshStandardMaterial({ fog: true }), vert: ShaderLib.physical.vertexShader },
      { name: 'physical', mat: new THREE.MeshPhysicalMaterial({ fog: true }), vert: ShaderLib.physical.vertexShader },
    ];
    for (const { name, mat, vert } of kinds) {
      applyRadialFog(mat);
      expect(mat.userData.radialFog, name).toBe(true);
      expect(mat.customProgramCacheKey(), name).toContain('radialFog');
      const out = compileHook(mat, vert);
      expect(out, name).toContain('length( mvPosition.xyz )');
      expect(out, name).toContain('#include <fog_vertex>');
    }

    const skip = new THREE.MeshBasicMaterial({ fog: false });
    applyRadialFog(skip);
    expect(skip.userData.radialFog).toBeUndefined();
  });

  it('cloned and late-created materials still get the rewrite', () => {
    const mat = new THREE.MeshLambertMaterial({ fog: true });
    applyRadialFog(mat);
    const clone = mat.clone();
    // r171 copy() clones userData, not onBeforeCompile — must still hook.
    applyRadialFog(clone);
    expect(compileHook(clone, ShaderLib.lambert.vertexShader)).toContain('length( mvPosition.xyz )');

    const late = new THREE.MeshPhongMaterial({ fog: true });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), late));
    applyRadialFogDeep(group);
    expect(late.userData.radialFog).toBe(true);
    expect(compileHook(late, ShaderLib.phong.vertexShader)).toContain('length( mvPosition.xyz )');

    // Un-hooked materials still compile radial via the patched ShaderChunk.
    expect(resolveIncludes(ShaderLib.basic.vertexShader)).toContain('length( mvPosition.xyz )');
  });

  it('is wired into world, enemy, campaign, pickup, and fx materials', () => {
    const world = readFileSync(join(process.cwd(), 'src', 'render', 'world.ts'), 'utf8');
    const enemies = readFileSync(join(process.cwd(), 'src', 'render', 'enemies.ts'), 'utf8');
    const decor = readFileSync(join(process.cwd(), 'src', 'render', 'campaignDecor.ts'), 'utf8');
    const pickups = readFileSync(join(process.cwd(), 'src', 'render', 'pickups.ts'), 'utf8');
    const fx = readFileSync(join(process.cwd(), 'src', 'render', 'fx.ts'), 'utf8');
    const renderer = readFileSync(join(process.cwd(), 'src', 'render', 'renderer.ts'), 'utf8');
    expect(world).toContain('applyRadialFog(mat)');
    expect(enemies).toContain('applyRadialFog(m)');
    expect(decor).toContain('applyRadialFog(mat)');
    expect(pickups).toContain('applyRadialFogDeep(g)');
    expect(fx).toContain('applyRadialFogDeep(g)');
    expect(renderer).toContain('installRadialFog()');
  });
});
