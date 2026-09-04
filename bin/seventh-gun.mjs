#!/usr/bin/env node
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (argv.includes('-h') || argv.includes('--help')) {
  process.stdout.write(`
seventh-gun — run SEVENTH GUN on your own machine or server

  npx seventh-gun [options]

Options:
  -p, --port <n>        port to listen on (default 8080, or $PORT)
  -H, --host <addr>     address to bind (default 0.0.0.0, or $HOST)
      --allow <origins> extra comma-separated origins allowed to join the arena
  -v, --version         print version
  -h, --help            print this

The whole game is served from that port: campaign, random mazes, the editor,
and a multiplayer arena for everyone who can reach the machine. No accounts,
no telemetry, nothing leaves the box.
`);
  process.exit(0);
}

if (argv.includes('-v') || argv.includes('--version')) {
  const require = createRequire(import.meta.url);
  process.stdout.write(`${require('../package.json').version}\n`);
  process.exit(0);
}

const port = Number(flag('-p') ?? flag('--port') ?? process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write(`Not a valid port: ${flag('-p') ?? flag('--port')}\n`);
  process.exit(1);
}

let serve;
try {
  ({ serve } = await import('../dist/node/server.mjs'));
} catch (err) {
  process.stderr.write(
    `Could not load the server bundle (dist/node/server.mjs).\n` +
      `If you are running from a git checkout, build it first:\n\n  npm run build:dist\n\n${err?.message ?? err}\n`,
  );
  process.exit(1);
}

try {
  const server = serve({
    port,
    host: flag('-H') ?? flag('--host') ?? undefined,
    allowedOrigins: flag('--allow') ?? undefined,
  });
  // listen() reports occupied ports and invalid bind addresses asynchronously.
  // Without this listener Node treats them as an unhandled EventEmitter error.
  server.once('error', (err) => {
    process.stderr.write(`Could not start server: ${err.message}\n`);
    process.exitCode = 1;
  });
  const stop = (signal) => {
    process.stdout.write(`\n${signal}: shutting down SEVENTH GUN…\n`);
    void server.shutdown().catch((err) => {
      process.stderr.write(`Could not shut down cleanly: ${err?.message ?? err}\n`);
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));
} catch (err) {
  process.stderr.write(`${err?.message ?? err}\n`);
  process.exit(1);
}
