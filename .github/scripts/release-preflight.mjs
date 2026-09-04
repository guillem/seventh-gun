import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tag = process.env.GITHUB_REF_NAME;
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const validVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const run = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (process.env.GITHUB_REF_TYPE !== 'tag') {
  throw new Error('Releases must start from a pushed v<package.json version> tag; manual dispatch cannot publish one.');
}
if (!validVersion.test(version) || tag !== `v${version}`) {
  throw new Error(`Tag ${tag} must exactly match package.json version v${version}.`);
}
if (version.includes('-')) {
  throw new Error('Prerelease versions are not supported by this workflow because it publishes the latest container tag.');
}
execFileSync('git', ['merge-base', '--is-ancestor', process.env.GITHUB_SHA, 'origin/main'], { stdio: 'inherit' });
const releaseTags = run(['tag', '--merged', 'origin/main', '--sort=-v:refname', '-l', 'v*'])
  .split('\n')
  .filter((candidate) => /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(candidate));
if (releaseTags[0] !== tag) {
  throw new Error(`Refusing ${tag}: ${releaseTags[0]} is the newest release tag already reachable from main.`);
}
process.stdout.write(`Release preflight passed for ${tag} (${process.env.GITHUB_SHA}).\n`);
