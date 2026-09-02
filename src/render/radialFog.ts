// THREE.Fog is a depth slab: the stock fog_vertex chunk assigns
// `vFogDepth = - mvPosition.z` (camera-Z). Looking down a hall fogs the
// vanishing point while wall/ceiling corners stay bright, and a sideways
// glance un-fogs distant enemies.
//
// onBeforeCompile sees ShaderLib sources with `#include <fog_vertex>` still
// unresolved — WebGLProgram expands chunks AFTER the callback. Replacing the
// assignment string there is a no-op. Patch ShaderChunk.fog_vertex (so every
// fog-using program gets Euclidean length) and also inject after the include
// / regex-replace the assignment so cloned and late-created materials recompile.
import * as THREE from 'three';

const FOG_INCLUDE = '#include <fog_vertex>';
const DEPTH_ASSIGN = /(vFogDepth|fogDepth)\s*=\s*-\s*mvPosition\.z\s*;/g;

export function fogDepthIdent(src: string): string {
  if (/\bfogDepth\b/.test(src) && !/\bvFogDepth\b/.test(src)) return 'fogDepth';
  return 'vFogDepth';
}

/** Rewrite a vertex shader or ShaderChunk.fog_vertex to radial distance. */
export function rewriteFogVertexShader(src: string): string {
  const ident = fogDepthIdent(src);
  const radial = `${ident} = length( mvPosition.xyz );`;

  let out = src.replace(DEPTH_ASSIGN, radial);

  // Unresolved ShaderLib (what onBeforeCompile actually receives).
  if (out.includes(FOG_INCLUDE) && !out.includes(radial)) {
    out = out.replaceAll(
      FOG_INCLUDE,
      `${FOG_INCLUDE}\n#ifdef USE_FOG\n	${radial}\n#endif`,
    );
  }

  return out;
}

let installed = false;

export function installRadialFog(): void {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.fog_vertex = rewriteFogVertexShader(THREE.ShaderChunk.fog_vertex);
}

// Patch the chunk at import so MeshLambert/Phong/Basic/Standard (and anything
// else that includes fog_vertex) compile radial even if applyRadialFog is missed.
installRadialFog();

// r171 Material.copy clones userData but not onBeforeCompile. A userData
// flag would skip the hook on clones; track instances instead.
const patched = new WeakSet<THREE.Material>();

export function applyRadialFog(mat: THREE.Material): void {
  installRadialFog();
  if (patched.has(mat)) return;
  const foggy = (mat as THREE.MeshBasicMaterial).fog;
  if (foggy === false) return;
  patched.add(mat);
  mat.userData.radialFog = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.vertexShader = rewriteFogVertexShader(shader.vertexShader);
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => prevKey() + '|radialFog';
  mat.needsUpdate = true;
}

export function applyRadialFogDeep(root: THREE.Object3D): void {
  installRadialFog();
  root.traverse(obj => {
    const drawable = obj as THREE.Mesh | THREE.Sprite | THREE.Line | THREE.Points;
    const ok = (drawable as THREE.Mesh).isMesh
      || (drawable as THREE.Sprite).isSprite
      || (drawable as THREE.Line).isLine
      || (drawable as THREE.Points).isPoints;
    if (!ok) return;
    const mats = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
    for (const m of mats) {
      if (m) applyRadialFog(m);
    }
  });
}
