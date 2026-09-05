import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const tarball = readdirSync('.').find((file) => file.endsWith('.tgz'));
if (!tarball) throw new Error('No npm package artifact was downloaded.');
const expected = JSON.parse(execFileSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' }));
const integrity = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
try {
  const published = JSON.parse(execFileSync(
    'npm', ['view', `${expected.name}@${expected.version}`, 'dist.integrity', '--json'], { encoding: 'utf8' },
  ));
  if (published === integrity) {
    process.stdout.write(`${expected.name}@${expected.version} is already published with this exact tarball; retaining it on rerun.\n`);
    process.exit(0);
  }
  throw new Error(`${expected.name}@${expected.version} already exists with different integrity; refusing to overwrite an immutable release.`);
} catch (error) {
  const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
  if (!stderr.includes('E404')) throw error;
  // npm's E404 is the documented result for an unpublished package/version.
}
execFileSync('npm', ['publish', tarball, '--provenance', '--access', 'public'], { stdio: 'inherit' });
