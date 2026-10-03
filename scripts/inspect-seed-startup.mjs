// Normal-menu startup regression; never enable ?e2e or call a debug start/step.
// node scripts/inspect-seed-startup.mjs [base URL] [output directory]
// ENGINE=chromium|webkit|both (Chromium uses installed Chrome).
// BASELINE=1 expects the two injected audio faults to remain blocked; point the
// URL at an unfixed build. No source replacement or baseline checkout is made.
// LATE_DECODE_MS=7000 optionally checks a recording completing after fallback.
import { chromium, webkit } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
const output = resolve(process.argv[3] ?? 'art/modern/startup');
const baseline = process.env.BASELINE === '1';
const requestedEngine = process.env.ENGINE ?? 'chromium';
const engines = requestedEngine === 'both' ? ['chromium', 'webkit'] : [requestedEngine];
if (engines.some(engine => !['chromium', 'webkit'].includes(engine))) throw new Error('ENGINE must be chromium, webkit or both');
const url = new URL(base);
if (url.searchParams.has('e2e') || url.searchParams.has('test')) throw new Error('Use a normal URL without e2e/test parameters');
const WATCHDOG_MS = 45_000;
const STARTUP_TIMEOUT_MS = 15_000;
const lateDecodeMs = Number(process.env.LATE_DECODE_MS ?? 0);
if (lateDecodeMs && (!Number.isFinite(lateDecodeMs) || lateDecodeMs < 6000 || lateDecodeMs > 10000)) {
  throw new Error('LATE_DECODE_MS must be between 6000 and 10000');
}
const cases = [
  { id: 'normal-1984-click', seed: '1984', trigger: 'click', fault: 'none' },
  { id: 'normal-1986-enter', seed: '1986', trigger: 'enter', fault: 'none' },
  { id: 'resume-stalled-1984', seed: '1984', trigger: 'click', fault: 'resume' },
  { id: 'decode-stalled-1986', seed: '1986', trigger: 'enter', fault: 'decode' },
  ...(lateDecodeMs ? [{ id: 'decode-late-1984', seed: '1984', trigger: 'click', fault: 'decode-late' }] : []),
];
const workerIndex = process.argv.indexOf('--worker');

function check(condition, message) { if (!condition) throw new Error(message); }

// Runs before the app boots; audio failures are injected at browser prototypes,
// never by changing game state or skipping its normal preparation path.
function installProbe({ fault, lateDecodeMs }) {
  const probe = window.__startupProbe = {
    startedAt: null, overlayAddedAt: null, overlayRemovedAt: null,
    firstFaultAt: null, lateDecodeResolvedAt: null, resumeCalls: 0, decodeCalls: 0,
    patched: [], events: [], warnings: [],
  };
  const originalWarn = console.warn;
  console.warn = function (...args) {
    probe.warnings.push({ at: performance.now(), message: args.map(String).join(' ') });
    return originalWarn.apply(this, args);
  };
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('#start-btn')) probe.startedAt = performance.now();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.code === 'Enter' && event.target instanceof Element && event.target.matches('#seed-input')) probe.startedAt = performance.now();
  }, true);
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node instanceof Element && node.id === 'world-loading') probe.overlayAddedAt = performance.now();
      for (const node of record.removedNodes) if (node instanceof Element && node.id === 'world-loading') probe.overlayRemovedAt = performance.now();
    }
  }).observe(document, { childList: true, subtree: true });

  const constructors = new Set([window.AudioContext, window.webkitAudioContext].filter(Boolean));
  for (const Audio of constructors) {
    const prototype = Audio.prototype;
    const nativeResume = prototype.resume, nativeDecode = prototype.decodeAudioData;
    if (fault === 'resume') Object.defineProperty(prototype, 'state', { configurable: true, get: () => 'suspended' });
    prototype.resume = function (...args) {
      probe.resumeCalls++;
      if (fault === 'resume') {
        probe.firstFaultAt ??= performance.now();
        return new Promise(() => {});
      }
      return nativeResume.apply(this, args);
    };
    prototype.decodeAudioData = function (...args) {
      probe.decodeCalls++;
      if (probe.decodeCalls === 1 && (fault === 'decode' || fault === 'decode-late')) {
        probe.firstFaultAt = performance.now();
        if (fault === 'decode') return new Promise(() => {});
        const decoded = nativeDecode.apply(this, args);
        return Promise.all([decoded, new Promise(resolve => setTimeout(resolve, lateDecodeMs))]).then(([buffer]) => {
          probe.lateDecodeResolvedAt = performance.now();
          return buffer;
        });
      }
      return nativeDecode.apply(this, args);
    };
    probe.patched.push(Audio.name);
  }
}

async function inspectCase(engine, scenario, reportPath) {
  const report = {
    base, engine, ...scenario, baseline, capturedAt: new Date().toISOString(), status: 'running',
    errors: [], warnings: [], requestFailures: [], stages: [],
    limits: { externalWatchdogMs: WATCHDOG_MS, startupTimeoutMs: STARTUP_TIMEOUT_MS },
  };
  const save = async stage => {
    report.stages.push({ stage, at: new Date().toISOString() });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  };
  let browser;
  const wallStart = Date.now();
  try {
    await save('launching');
    browser = engine === 'chromium' ? await chromium.launch({ channel: 'chrome' }) : await webkit.launch();
    report.browserVersion = browser.version();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on('pageerror', error => report.errors.push(error.stack ?? error.message));
    page.on('console', message => {
      if (message.type() === 'error') report.errors.push(message.text());
      if (message.type() === 'warning') report.warnings.push(message.text());
    });
    page.on('requestfailed', request => report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
    // Netlify injects this review toolbar into preview HTML. Its third-party
    // telemetry is unrelated to the game and fails in restricted test browsers.
    await page.route('**/.netlify/scripts/cdp', async route => {
      report.excludedPreviewToolbar = route.request().url();
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    await page.route(/\/src\/main\.ts(?:\?.*)?$/, async route => {
      const response = await route.fetch(), source = await response.text();
      const anchor = 'const game = new Game(canvas, e2e);';
      if (!source.includes(anchor)) report.errors.push('Development game bootstrap probe anchor unavailable');
      await route.fulfill({ response, body: source.replace(anchor, `${anchor} window.__normalGame = game;`) });
    });
    await page.route(/\/assets\/index-[^/]+\.js(?:\?.*)?$/, async route => {
      const response = await route.fetch(), source = await response.text();
      if (!source.includes('[seventh-gun] e2e debug api enabled')) { await route.fulfill({ response }); return; }
      // The lookahead ends after getDebugApi(), before its enclosing condition.
      const anchor = /const ([\w$]+)=new [\w$]+\([^;]+?\);(?=[\w$]+\.remove\(\),[\w$]+&&\(window\.__GAME__=\1\.getDebugApi\(\))/;
      if (!anchor.test(source)) report.errors.push('Built game bootstrap probe anchor unavailable');
      await route.fulfill({ response, body: source.replace(anchor, (match, name) => `${match}window.__normalGame=${name};`) });
    });
    await page.addInitScript(installProbe, { fault: scenario.fault, lateDecodeMs });
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 12_000 });
    await page.waitForFunction(() => !!window.__normalGame, null, { timeout: 12_000 });
    await page.evaluate(() => {
      const game = window.__normalGame, probe = window.__startupProbe;
      for (const [owner, names] of [[game, ['startRun']], [game.renderer, ['setRun', 'prefetchDynamicMeshes']], [game.audio, ['unlock']]]) {
        for (const name of names) {
          const original = owner[name];
          if (typeof original !== 'function') continue;
          owner[name] = function (...args) {
            const start = performance.now();
            probe.events.push({ name, kind: 'begin', at: start });
            const end = kind => probe.events.push({ name, kind, at: performance.now(), ms: performance.now() - start });
            try {
              const result = original.apply(this, args);
              if (result?.then) result.then(() => end('end'), () => end('rejected'));
              else end('end');
              return result;
            } catch (error) { end('threw'); throw error; }
          };
        }
      }
    });
    report.bootMs = Date.now() - wallStart;
    await page.locator('#seed-input').fill(scenario.seed);
    await save('starting-via-menu');
    const start = Date.now();
    if (scenario.trigger === 'click') await page.locator('#start-btn').click({ timeout: STARTUP_TIMEOUT_MS, noWaitAfter: true });
    else await page.locator('#seed-input').press('Enter', { timeout: STARTUP_TIMEOUT_MS, noWaitAfter: true });
    let timedOut = false;
    try {
      await page.waitForFunction(() => {
        const game = window.__normalGame;
        return game?.phase === 'playing' && !game.preparingWorld && !game.input.paused && !document.getElementById('world-loading');
      }, null, { timeout: Math.max(1, STARTUP_TIMEOUT_MS - (Date.now() - start)) });
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error;
      timedOut = true;
    }
    report.startupWallMs = Date.now() - start;
    report.state = await page.evaluate(() => {
      const game = window.__normalGame, probe = window.__startupProbe;
      return {
        at: performance.now(), phase: game.phase, preparing: game.preparingWorld, inputPaused: game.input.paused,
        overlay: !!document.getElementById('world-loading'), seed: game.sim?.map.seed,
        mapHash: game.sim ? game.mapHash() : null, simTime: game.sim?.time,
        renderFrames: game.renderer.debugStats.frames, audioState: game.audio.ctx?.state,
        decodedSamples: game.audio.samples.size, debugApiAbsent: !window.__GAME__, probe,
      };
    });
    const state = report.state, probe = state.probe;
    check(state.debugApiAbsent, 'Normal run unexpectedly enabled the e2e debug API');
    check(probe.startedAt !== null && probe.overlayAddedAt !== null, 'The normal menu preparation path was not observed');
    check(state.seed === scenario.seed, `Wrong map seed: ${state.seed}`);
    if (scenario.fault !== 'none') check(probe.patched.length > 0 && probe.firstFaultAt !== null, 'Requested audio fault was not exercised');
    if (baseline && ['resume', 'decode'].includes(scenario.fault)) {
      check(timedOut && state.overlay && state.preparing && state.inputPaused, 'Unfixed baseline did not retain its loading gate under the audio fault');
      check(probe.events.some(event => event.name === 'startRun' && event.kind === 'end'), 'Baseline stalled before the audio gate could be isolated');
      report.status = 'expected-stall';
    } else {
      check(!timedOut, `World preparation remained blocked after ${STARTUP_TIMEOUT_MS} ms`);
      check(!state.overlay && !state.preparing && !state.inputPaused, 'Loading state did not release gameplay');
      report.readyAfterGestureMs = state.at - probe.startedAt;
      if (scenario.fault !== 'none') {
        const unlock = probe.events.find(event => event.name === 'unlock' && event.kind === 'end');
        check(unlock, 'Audio readiness did not settle');
        report.faultSettledMs = unlock.at - probe.firstFaultAt;
        check(report.faultSettledMs >= 4750 && report.faultSettledMs <= 8500,
          `Audio fault did not use the five-second bounded fallback: ${report.faultSettledMs} ms`);
      }
      await page.waitForFunction(({ time, frames }) => {
        const game = window.__normalGame;
        return game.sim.time > time + .2 && game.renderer.debugStats.frames > frames + 2;
      }, { time: state.simTime, frames: state.renderFrames }, { timeout: 4000 });
      report.progress = await page.evaluate(() => {
        const game = window.__normalGame;
        return { simTime: game.sim.time, renderFrames: game.renderer.debugStats.frames, phase: game.phase, inputPaused: game.input.paused };
      });
      check(report.progress.phase === 'playing' && !report.progress.inputPaused, 'Gameplay paused after preparation');
      if (scenario.fault === 'decode-late') {
        await page.waitForFunction(count => window.__startupProbe.lateDecodeResolvedAt !== null && window.__normalGame.audio.samples.size > count,
          state.decodedSamples, { timeout: lateDecodeMs });
        report.lateDecode = await page.evaluate(() => ({ at: window.__startupProbe.lateDecodeResolvedAt, decodedSamples: window.__normalGame.audio.samples.size }));
      }
      if (scenario.fault === 'none') {
        const name = `${engine}-${scenario.id}.jpg`;
        await page.screenshot({ path: resolve(output, name), quality: 85, timeout: 4000 });
        report.screenshot = name;
      }
      report.status = 'passed';
    }
    check(report.errors.length === 0, report.errors.join('\n'));
    check(report.requestFailures.length === 0, `Failed requests: ${JSON.stringify(report.requestFailures)}`);
  } catch (error) {
    report.status = 'failed'; report.failure = error.stack ?? String(error);
  } finally {
    report.totalWallMs = Date.now() - wallStart;
    await save('finished');
    await browser?.close();
  }
  process.exitCode = ['passed', 'expected-stall'].includes(report.status) ? 0 : 1;
}

await mkdir(output, { recursive: true });
if (workerIndex !== -1) {
  const engine = process.argv[workerIndex + 1], id = process.argv[workerIndex + 2];
  const scenario = cases.find(item => item.id === id);
  check(engines.includes(engine) && scenario, 'Unknown startup probe worker');
  await inspectCase(engine, scenario, resolve(output, `${engine}-${id}.json`));
} else {
  const report = { base, engines, baseline, capturedAt: new Date().toISOString(), cases: [],
    limitations: ['Normal rendering settings with browser-only bootstrap/prototype instrumentation; no game source changes.',
      'Local browser/driver measurements, not a universal performance guarantee. The watchdog bounds each isolated case to 45 seconds.'] };
  for (const engine of engines) for (const scenario of cases) {
    const reportPath = resolve(output, `${engine}-${scenario.id}.json`);
    await writeFile(reportPath, JSON.stringify({ engine, ...scenario, status: 'pending' }, null, 2) + '\n');
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), base, output, '--worker', engine, scenario.id],
      { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let logs = '', watchdog = false;
    child.stdout.on('data', data => { logs = (logs + data).slice(-64000); });
    child.stderr.on('data', data => { logs = (logs + data).slice(-64000); });
    const timeout = setTimeout(() => {
      watchdog = true;
      // This supervisor remains responsive even if the page/driver and its
      // worker are blocked. Kill the browser's process group as well.
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch { /* already exited */ }
    }, WATCHDOG_MS);
    const result = await new Promise(resolve => {
      child.once('error', error => resolve({ error: String(error) }));
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    clearTimeout(timeout);
    let row;
    try { row = JSON.parse(await readFile(reportPath, 'utf8')); }
    catch { row = { engine, ...scenario, status: 'failed', failure: 'Worker left no readable report' }; }
    row.process = { ...result, watchdog };
    if (watchdog || result.error || result.code !== 0 && row.status !== 'failed') {
      row.status = 'failed';
      row.failure = watchdog ? `External ${WATCHDOG_MS} ms watchdog terminated the case` : result.error ?? `Worker exited ${result.code}`;
    }
    if (logs) row.workerLog = logs;
    const normal = report.cases.find(item => item.engine === engine && item.seed === row.seed && item.fault === 'none' && item.state?.mapHash);
    if (normal && row.state?.mapHash && normal.state.mapHash !== row.state.mapHash) {
      row.status = 'failed'; row.failure = 'Audio fault changed the generated map hash';
    }
    await writeFile(reportPath, JSON.stringify(row, null, 2) + '\n');
    report.cases.push(row);
    await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ engine, case: scenario.id, status: row.status, startupWallMs: row.startupWallMs, mapHash: row.state?.mapHash, failure: row.failure }));
  }
  if (report.cases.some(row => !['passed', 'expected-stall'].includes(row.status))) process.exitCode = 1;
  console.log(JSON.stringify({ output, passed: report.cases.filter(row => row.status === 'passed').length, expectedStalls: report.cases.filter(row => row.status === 'expected-stall').length }));
}
