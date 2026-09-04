import { test, expect } from '@playwright/test';

test.describe('arena server', () => {
  test('health and websocket welcome', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    const health = await page.request.get('/health');
    expect(await health.text()).toBe('ok');
    await page.goto('/?e2e=1');
    const got = await page.evaluate(async () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/arena`);
      return await new Promise<string>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 5000);
        ws.onopen = () => ws.send(JSON.stringify({ v: 3, t: 'join', name: 'E2E' }));
        ws.onmessage = (ev) => {
          clearTimeout(t);
          resolve(String(ev.data));
          ws.close();
        };
        ws.onerror = () => reject(new Error('ws error'));
      });
    });
    const msg = JSON.parse(got);
    expect(msg.t).toBe('welcome');
    expect(msg.v).toBe(1);
  });
});
