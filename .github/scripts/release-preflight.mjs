import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tag = process.env.GITHUB_REF_NAME;
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const validVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const run = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const isDispatch = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';

if (!validVersion.test(version)) throw new Error(`package.json has an invalid version: ${version}.`);
if (version.includes('-')) {
  throw new Error('Prerelease versions are not supported by this workflow because it publishes the latest container tag.');
}
if (!isDispatch && (process.env.GITHUB_REF_TYPE !== 'tag' || tag !== `v${version}`)) {
  throw new Error(`Release tag ${tag} must exactly match package.json version v${version}.`);
}
if (isDispatch && process.env.GITHUB_REF !== 'refs/heads/main') {
  throw new Error('Pre-tag validation must run from main.');
}
execFileSync('git', ['merge-base', '--is-ancestor', process.env.GITHUB_SHA, 'origin/main'], { stdio: 'inherit' });
const releaseTags = run(['tag', '--merged', 'origin/main', '--sort=-v:refname', '-l', 'v*'])
  .split('\n')
  .filter((candidate) => /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(candidate));
if (isDispatch && releaseTags.includes(`v${version}`)) {
  throw new Error(`v${version} already exists; choose the next version before tagging.`);
}
if (!isDispatch && releaseTags[0] !== tag) {
  throw new Error(`Refusing ${tag}: ${releaseTags[0]} is the newest release tag already reachable from main.`);
}
process.stdout.write(`${isDispatch ? 'Pre-tag validation' : 'Release preflight'} passed for ${isDispatch ? `v${version}` : tag} (${process.env.GITHUB_SHA}).\n`);
