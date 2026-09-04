// Architecture guards: the sim stays headless and deterministic.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('architecture guards', () => {
  const simFiles = walk(join(process.cwd(), 'src', 'sim'));
  const campaignFiles = walk(join(process.cwd(), 'src', 'campaign'));
  const editorModel = join(process.cwd(), 'src', 'editor', 'model.ts');

  it('sim directory exists and has sources', () => {
    expect(simFiles.length).toBeGreaterThan(5);
  });

  it('sim never imports Three.js', () => {
    for (const f of simFiles) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} must not import three`).not.toMatch(/from\s+['"]three/);
      expect(src, `${f} must not import @types`).not.toMatch(/THREE\./);
    }
  });

  it('sim never touches Math.random, DOM or window', () => {
    for (const f of simFiles) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} uses Math.random`).not.toContain('Math.random');
      expect(src, `${f} touches document`).not.toMatch(/\bdocument\b/);
      expect(src, `${f} touches window`).not.toMatch(/\bwindow\b/);
      expect(src, `${f} touches localStorage`).not.toContain('localStorage');
    }
  });

  it('sim files never import from the renderer/ui layers', () => {
    for (const f of simFiles) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} imports render`).not.toMatch(/from\s+['"]\.\.\/(render|ui|audio|app)/);
      expect(src, `${f} imports net`).not.toMatch(/from\s+['"]\.\.\/net/);
      expect(src, `${f} imports server`).not.toMatch(/from\s+['"]\.\.\/\.\.\/server/);
    }
  });

  it('campaign and editor model stay pure (no Math.random / DOM / localStorage / three)', () => {
    expect(campaignFiles.length).toBeGreaterThan(0);
    for (const f of [...campaignFiles, editorModel]) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} uses Math.random`).not.toContain('Math.random');
      expect(src, `${f} touches document`).not.toMatch(/\bdocument\b/);
      expect(src, `${f} touches window`).not.toMatch(/\bwindow\b/);
      expect(src, `${f} touches localStorage`).not.toContain('localStorage');
      expect(src, `${f} must not import three`).not.toMatch(/from\s+['"]three/);
      expect(src, `${f} must not use THREE.`).not.toMatch(/THREE\./);
    }
  });
});
