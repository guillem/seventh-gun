import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

// Shared by the Linux CI/release jobs; avoid nested shell quoting around JSON.
const result = JSON.parse(execFileSync('npm', ['pack', '--json'], { encoding: 'utf8' }));
const filename = result[0]?.filename;
if (typeof filename !== 'string' || filename !== basename(filename) ||
    /[\r\n]/.test(filename) || !filename.endsWith('.tgz') || !existsSync(filename)) {
  throw new Error('npm pack did not return an existing tarball filename');
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tarball=${filename}\n`);
process.stdout.write(`${filename}\n`);
