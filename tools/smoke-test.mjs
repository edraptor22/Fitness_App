/* End-to-end smoke test. Serves the app, drives it in an iPhone-sized
   Chromium, and screenshots every screen into tools/shots/.

     npm i playwright && npx playwright install chromium
     node tools/smoke-test.mjs
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SHOTS = path.join(ROOT, 'tools', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(8765, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
});
const page = await ctx.newPage();

const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });

const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log('shot ' + name);
};

const step = async (label, fn) => {
  try { await fn(); console.log('OK   ' + label); }
  catch (e) { problems.push(`step "${label}": ${e.message}`); console.log('FAIL ' + label + ' — ' + e.message); }
};

await page.goto('http://localhost:8765/index.html');
await page.waitForTimeout(900);
await shot('01-today');

await step('weekly progress rendered', async () => {
  await page.waitForSelector('.meter');
});

await step('open a scheduled workout', async () => {
  const rows = page.locator('[data-wo]');
  const n = await rows.count();
  if (!n) throw new Error('no scheduled workouts on today');
  // Prefer an exercise-style workout over the mobility check-off row.
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const hasTick = await rows.nth(i).locator('[data-tick]').count();
    if (!hasTick) { idx = i; break; }
  }
  await rows.nth(idx).click();
  await page.waitForSelector('.ex-card');
});
await shot('02-session');

await step('edit a set + steppers', async () => {
  const first = page.locator('.set-row').first();
  await first.locator('.stepper input').first().fill('135');
  await first.locator('[data-step="1"]').first().click();
  await first.locator('.tick').click();
  await page.waitForSelector('.set-row.done');
});

await step('add a set', async () => {
  const before = await page.locator('.set-row').count();
  await page.locator('[data-addset]').first().click();
  await page.waitForTimeout(300);
  const after = await page.locator('.set-row').count();
  if (after <= before) throw new Error(`set count did not grow (${before} -> ${after})`);
});

await step('add an exercise mid-session', async () => {
  await page.locator('[data-addex]').click();
  await page.waitForSelector('.sheet');
  await page.locator('.sheet [data-q]').fill('deadlift');
  await page.waitForTimeout(200);
  await page.locator('.sheet [data-pick]').first().click();
  await page.waitForTimeout(350);
});
await shot('03-session-added');

await step('finish the workout', async () => {
  await page.locator('[data-finish]').last().click();
  await page.waitForTimeout(400);
  const sheetOpen = await page.locator('[data-sheet-ok]').count();
  if (sheetOpen) await page.locator('[data-sheet-ok]').click();
  await page.waitForTimeout(500);
  if (!/today/.test(page.url())) throw new Error('did not return to Today, url=' + page.url());
});
await shot('04-today-after');

await step('progressive overload: next session shows last numbers', async () => {
  // Jump forward a week to the same weekday, start the same workout again.
  const nextWeek = await page.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  await page.goto(`http://localhost:8765/index.html#/today?d=${nextWeek}`);
  await page.waitForTimeout(600);
  const rows = page.locator('[data-wo]');
  let idx = 0;
  for (let i = 0; i < await rows.count(); i++) {
    if (!(await rows.nth(i).locator('[data-tick]').count())) { idx = i; break; }
  }
  await rows.nth(idx).click();
  await page.waitForSelector('.ex-card');
  const line = await page.locator('.ex-last').first().textContent();
  if (!/Last/.test(line)) throw new Error('no last-session line: ' + line);
  const prefilled = await page.locator('.set-row .stepper input').first().inputValue();
  if (!prefilled) throw new Error('set was not prefilled from last time');
  console.log('     ' + line.trim() + '   | prefilled=' + prefilled);
  await page.screenshot({ path: `${SHOTS}/03b-overload.png` });
});

await step('mobility one-tap complete', async () => {
  const tick = page.locator('[data-tick]').first();
  if (!(await tick.count())) throw new Error('no check-off workout found');
  await tick.click();
  await page.waitForTimeout(400);
  if (!(await page.locator('.tick.on').count())) throw new Error('tick did not stick');
});
await shot('05-mobility-done');

for (const [hash, name] of [
  ['#/plans', '06-plans'],
  ['#/history', '09-history'],
  ['#/library', '10-library'],
  ['#/settings', '12-settings'],
]) {
  await step('navigate ' + hash, async () => {
    await page.goto('http://localhost:8765/index.html' + hash);
    await page.waitForTimeout(600);
  });
  await shot(name);
}

await step('plan detail + workout editor', async () => {
  await page.goto('http://localhost:8765/index.html#/plans');
  await page.waitForTimeout(500);
  await page.locator('[data-plan]').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/07-plan.png` });
  await page.locator('[data-wo]').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/08-workout.png` });
  if (!(await page.locator('.days button').count())) throw new Error('day picker missing');
});

await step('exercise detail', async () => {
  await page.goto('http://localhost:8765/index.html#/library');
  await page.waitForTimeout(500);
  await page.locator('[data-ex]').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/11-exercise.png` });
});

await step('export produces valid json', async () => {
  const json = await page.evaluate(async () => JSON.stringify(await window.LiftLog.store.exportData()).length);
  if (json < 1000) throw new Error('export looks empty: ' + json);
});

await step('data survives a reload', async () => {
  await page.goto('http://localhost:8765/index.html#/history');
  await page.reload();
  await page.waitForTimeout(900);
  const rows = await page.locator('[data-open]').count();
  if (rows < 1) throw new Error('no history rows after reload');
});

console.log('\n--- problems ---');
console.log(problems.length ? problems.join('\n') : 'none');

await browser.close();
server.close();
process.exit(problems.length ? 1 : 0);
