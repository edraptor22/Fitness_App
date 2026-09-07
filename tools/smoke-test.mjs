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

await step('weekly progress rings rendered', async () => {
  await page.waitForSelector('.ring-row .ring-bar');
  const n = await page.locator('.ring-wrap').count();
  if (n < 2) throw new Error('expected a ring per discipline, got ' + n);
});

/* Start a named workout via the Add sheet — which day of the week the test
   happens to run on then doesn't matter. */
async function startWorkout(name) {
  await page.locator('[data-add]').click();
  await page.waitForSelector('.sheet [data-q]');
  await page.locator('.sheet [data-q]').fill(name);
  await page.waitForTimeout(250);
  await page.locator('.sheet [data-start]').first().click();
  await page.waitForSelector('.ex-card');
}

await step('start a lifting workout', async () => {
  await startWorkout('Lower Body');
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
  await startWorkout('Lower Body');
  const line = await page.locator('.ex-last').first().textContent();
  if (!/Last/.test(line)) throw new Error('no last-session line: ' + line);
  const prefilled = await page.locator('.set-row .stepper input').first().inputValue();
  if (!prefilled) throw new Error('set was not prefilled from last time');
  console.log('     ' + line.trim() + '   | prefilled=' + prefilled);
  await page.screenshot({ path: `${SHOTS}/03b-overload.png` });
});

await step('mobility one-tap complete', async () => {
  await page.goto('http://localhost:8765/index.html#/today');
  await page.waitForTimeout(600);
  const tick = page.locator('[data-wo] [data-tick]').first();
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

/* ---------------------------------------------------- goals: countdown, weight, quotes */

const EVENT_DATE = await page.evaluate(() => {
  const d = new Date(); d.setDate(d.getDate() + 150);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
});

await step('set a target date', async () => {
  await page.goto('http://localhost:8765/index.html#/goals');
  await page.waitForTimeout(600);
  await page.locator('[data-addevent]').first().click();
  await page.waitForSelector('.sheet');
  await page.locator('.sheet [name=name]').fill('Work Classic');
  await page.locator('.sheet [name=date]').fill(EVENT_DATE);
  await page.locator('[data-sheet-ok]').click();
  await page.waitForTimeout(500);
  const n = await page.locator('.hero-number').textContent();
  if (Number(n.trim()) !== 150) throw new Error('countdown says ' + n);
});
await shot('13-goals-countdown');

await step('countdown appears on Today', async () => {
  await page.goto('http://localhost:8765/index.html#/today');
  await page.waitForTimeout(600);
  if (!(await page.locator('.countdown').count())) throw new Error('no countdown strip on Today');
  const txt = await page.locator('.countdown-name').textContent();
  if (!/Work Classic/.test(txt)) throw new Error('wrong event: ' + txt);
});

await step('daily quote shows and rotates by date', async () => {
  const q1 = await page.locator('.quote').first().textContent();
  await page.goto('http://localhost:8765/index.html#/today?d=' + EVENT_DATE);
  await page.waitForTimeout(500);
  const q2 = await page.locator('.quote').first().textContent();
  if (!q1.trim()) throw new Error('quote empty');
  if (q1 === q2) throw new Error('quote did not change on a different day');
  console.log('     quote: ' + q1.replace(/\s+/g, ' ').trim().slice(0, 70));
});

await step('set a weight goal + generate milestones', async () => {
  await page.goto('http://localhost:8765/index.html#/goals');
  await page.waitForTimeout(500);
  await page.locator('[data-editgoal]').first().click();
  await page.waitForSelector('.sheet');
  await page.locator('.sheet [name=start]').fill('195');
  await page.locator('.sheet [name=target]').fill('175');
  await page.locator('[data-sheet-ok]').click();
  await page.waitForTimeout(500);

  await page.locator('[data-genms]').click();
  await page.waitForSelector('.sheet [name=step]');
  await page.locator('.sheet [name=step]').fill('5');
  await page.locator('[data-sheet-ok]').click();
  await page.waitForTimeout(500);

  const n = await page.locator('.ms-row').count();
  if (n !== 4) throw new Error('expected 4 milestones (190/185/180/175), got ' + n);
  await page.locator('.ms-reward').first().fill('New skate sharpening');
  await page.waitForTimeout(300);
});

await step('logging weight crosses a milestone and pays the reward', async () => {
  await page.locator('[data-w]').fill('195');
  await page.locator('[data-savew]').click();
  await page.waitForTimeout(500);
  if (await page.locator('.sheet').count()) throw new Error('celebrated too early at 195');

  await page.locator('[data-w]').fill('189');
  await page.locator('[data-savew]').click();
  await page.waitForTimeout(600);
  const body = await page.locator('.sheet-body').textContent();
  if (!/New skate sharpening/.test(body)) throw new Error('reward not shown: ' + body);
  await page.locator('[data-sheet-ok]').click();
  await page.waitForTimeout(400);
  if (!(await page.locator('.ms-row.hit').count())) throw new Error('milestone not marked hit');
});
await shot('14-goals-weight');

await step('quotes can be turned off', async () => {
  await page.goto('http://localhost:8765/index.html#/settings');
  await page.waitForTimeout(500);
  await page.locator('input[name=showQuotes]').click();
  await page.waitForTimeout(400);
  await page.goto('http://localhost:8765/index.html#/today');
  await page.waitForTimeout(500);
  if (await page.locator('.quote').count()) throw new Error('quote still showing after toggle off');
  // put it back
  await page.goto('http://localhost:8765/index.html#/settings');
  await page.waitForTimeout(400);
  await page.locator('input[name=showQuotes]').click();
  await page.waitForTimeout(400);
});

await step('replace the quote list from pasted text', async () => {
  await page.locator('[data-quotes]').click();
  await page.waitForSelector('.sheet [data-quotes-text]');
  await page.locator('.sheet [data-quotes-text]').fill(
    '1. “Stay hard.” — David Goggins\n• “Discipline equals freedom.” — Jocko Willink');
  await page.locator('[data-sheet-ok]').click();
  await page.waitForTimeout(500);
  const n = await page.evaluate(() => window.LiftLog.store.state.quotes.size);
  if (n !== 2) throw new Error('expected 2 quotes, got ' + n);
  const list = await page.evaluate(() => window.LiftLog.store.allQuotes().map((q) => q.text + '|' + q.author));
  if (list[0] !== 'Stay hard.|David Goggins') throw new Error('bad parse: ' + list[0]);
});

/* -------------------------------------- deleting sessions, week awareness */

await step('the … menu on an "Also logged" row opens instead of navigating', async () => {
  await page.goto('http://localhost:8765/index.html#/today');
  await page.waitForTimeout(600);
  await startWorkout('Upper Body');           // not scheduled today -> lands in Also logged
  await page.locator('[data-finish]').last().click();
  await page.waitForTimeout(400);
  if (await page.locator('[data-sheet-ok]').count()) await page.locator('[data-sheet-ok]').click();
  await page.waitForTimeout(600);

  const menu = page.locator('[data-sess-menu]').first();
  if (!(await menu.count())) throw new Error('no Also-logged row to test');
  await menu.click();
  await page.waitForTimeout(400);
  if (!(await page.locator('.sheet').count())) throw new Error('menu did not open — row swallowed the tap');
  if (/session/.test(page.url())) throw new Error('navigated to the session instead of opening the menu');
});

await step('delete an "Also logged" session from that menu', async () => {
  const before = await page.locator('[data-sess-menu]').count();
  await page.locator('.sheet [data-val="del"]').click();
  await page.waitForTimeout(600);
  const after = await page.locator('[data-sess-menu]').count();
  if (after >= before) throw new Error(`row not removed (${before} -> ${after})`);
});

await step('a session can be deleted from inside itself', async () => {
  await startWorkout('Upper Body');
  await page.locator('[data-delsession]').click();
  await page.waitForSelector('[data-sheet-ok]');
  await page.locator('[data-sheet-ok]').click();
  await page.waitForTimeout(700);
  if (/\/session\//.test(page.url())) throw new Error('still on the session screen');
  const rows = await page.locator('[data-sess-menu]').count();
  if (rows !== 0) throw new Error('session survived deletion');
});

await step('a workout done early shows as covered on its scheduled day', async () => {
  // Find the day "Full Body" is scheduled, then do it the day before.
  const info = await page.evaluate(() => {
    const s = window.LiftLog.store;
    const w = [...s.state.workouts.values()].find((x) => x.name === 'Full Body' && x.planId === s.state.settings.activePlanId);
    return { id: w.id, days: w.days };
  });
  const target = await page.evaluate((days) => {
    const d = new Date();
    for (let i = 1; i <= 7; i++) {
      const t = new Date(d); t.setDate(d.getDate() + i);
      if (days.includes(t.getDay())) {
        const p = (n) => String(n).padStart(2, '0');
        const iso = (x) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
        const prev = new Date(t); prev.setDate(t.getDate() - 1);
        return { scheduled: iso(t), early: iso(prev) };
      }
    }
  }, info.days);

  // Log it a day early.
  await page.goto(`http://localhost:8765/index.html#/today?d=${target.early}`);
  await page.waitForTimeout(600);
  await startWorkout('Full Body');
  await page.locator('[data-finish]').last().click();
  await page.waitForTimeout(400);
  if (await page.locator('[data-sheet-ok]').count()) await page.locator('[data-sheet-ok]').click();
  await page.waitForTimeout(600);

  // Now look at the day it was actually scheduled.
  await page.goto(`http://localhost:8765/index.html#/today?d=${target.scheduled}`);
  await page.waitForTimeout(700);
  const row = page.locator(`[data-wo="${info.id}"]`);
  if (!(await row.count())) throw new Error('Full Body not scheduled on the day we expected');
  if (!(await row.evaluate((el) => el.classList.contains('covered')))) {
    throw new Error('row not marked covered: ' + (await row.textContent()).replace(/\s+/g, ' ').trim());
  }
  const txt = (await row.textContent()).replace(/\s+/g, ' ').trim();
  if (!/Already done/.test(txt)) throw new Error('no "already done" note: ' + txt);
  console.log('     ' + txt);

  // A daily habit is due every day — one earlier tick must not cover it.
  const daily = await page.evaluate(() => {
    const s = window.LiftLog.store;
    const w = [...s.state.workouts.values()]
      .find((x) => x.planId === s.state.settings.activePlanId && (x.days || []).length === 7);
    return w ? w.id : null;
  });
  if (daily) {
    const row = page.locator(`[data-wo="${daily}"]`);
    if (await row.evaluate((el) => el.classList.contains('covered'))) {
      throw new Error('a 7×/week habit was wrongly marked covered by one earlier day');
    }
  }
  await page.screenshot({ path: `${SHOTS}/15-covered.png` });
});

await step('tapping a covered workout offers view / swap / repeat', async () => {
  const info = await page.evaluate(() => {
    const s = window.LiftLog.store;
    const w = [...s.state.workouts.values()].find((x) => x.name === 'Full Body' && x.planId === s.state.settings.activePlanId);
    return w.id;
  });
  await page.locator(`[data-wo="${info}"]`).click();
  await page.waitForTimeout(500);
  const body = (await page.locator('.sheet-body').textContent()).replace(/\s+/g, ' ');
  for (const want of ['Already done', 'View', 'different workout', 'again today']) {
    if (!body.includes(want)) throw new Error(`sheet missing "${want}": ${body}`);
  }
  if (/\/session\//.test(page.url())) throw new Error('started a duplicate session instead of asking');
});

/* ------------------------------------------------------------- nutrition */

await step('daily habits seed and tick off', async () => {
  await page.goto('http://localhost:8765/index.html#/today');
  await page.waitForTimeout(700);
  const rows = page.locator('[data-habit]');
  const n = await rows.count();
  if (n !== 3) throw new Error('expected 3 seeded habits, got ' + n);
  const names = await rows.locator('.row-title').allTextContents();
  console.log('     habits: ' + names.map((s) => s.trim()).join(' | '));
  if (!names.join(' ').includes('6:30pm')) throw new Error('6:30pm cut-off not seeded');

  await rows.nth(0).click();
  await page.waitForTimeout(400);
  if (!(await rows.nth(0).locator('.tick.on').count())) throw new Error('habit tick did not stick');
});

await step('rating a rough day shows the anti-compensation message', async () => {
  await page.locator('[data-rate="off"]').click();
  await page.waitForSelector('.sheet-body');
  await page.waitForTimeout(600);          // let the slide-up + fade finish before the shot
  const body = (await page.locator('.sheet-body').textContent()).replace(/\s+/g, ' ');
  if (!/can't be cancelled out by training harder/.test(body)) {
    throw new Error('missing the point of the whole feature: ' + body.slice(0, 160));
  }
  await page.screenshot({ path: `${SHOTS}/16-trigger.png` });
});

await step('trigger tags save and surface in Goals', async () => {
  await page.locator('.sheet [data-trig="Late night"]').click();
  await page.locator('.sheet [data-trig="Stress"]').click();
  await page.locator('[data-sheet-ok]').click();
  await page.waitForTimeout(600);

  const tags = await page.evaluate(() => {
    const s = window.LiftLog.store;
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    return s.nutritionOn(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`).triggers;
  });
  if (tags.length !== 2) throw new Error('triggers not saved: ' + JSON.stringify(tags));

  await page.goto('http://localhost:8765/index.html#/goals?tab=nutrition');
  await page.waitForTimeout(700);
  const panel = (await page.locator('#view').textContent()).replace(/\s+/g, ' ');
  if (!/Late night/.test(panel)) throw new Error('trigger not shown in Goals');
  if (!(await page.locator('.daygrid .dg-off').count())) throw new Error('off day missing from the 30-day grid');
  await page.screenshot({ path: `${SHOTS}/17-nutrition.png` });
});

await step('eating never quotes calorie maths or offsets training', async () => {
  // The user's own habit names are their business ("No mindless calories").
  // What must never appear is the app doing calorie arithmetic, or tying
  // eating to training as something you can work off.
  const text = (await page.evaluate(() => {
    const clone = document.querySelector('#view').cloneNode(true);
    clone.querySelectorAll('[data-habitrow], [data-habit]').forEach((n) => n.remove());
    return clone.textContent;
  })).toLowerCase();

  const banned = ['calories burned', 'calories b', 'kcal', 'macro', 'net calories',
    'calorie target', 'calorie goal', 'burn off', 'work it off', 'earned back'];
  for (const b of banned) {
    if (text.includes(b)) throw new Error(`nutrition panel says "${b}"`);
  }
  if (!/never offset against training|tracked separately/.test(text)) {
    throw new Error('the separation-from-training note is missing');
  }
});

await step('habits can be added and deleted', async () => {
  await page.locator('[data-addhabit]').click();
  await page.waitForSelector('.sheet [name=name]');
  await page.locator('.sheet [name=name]').fill('Water before coffee');
  await page.locator('[data-sheet-ok]').click();
  await page.waitForTimeout(600);
  let n = await page.locator('[data-habitrow]').count();
  if (n !== 4) throw new Error('habit not added, count=' + n);

  await page.locator('[data-habitmenu]').last().click();
  await page.waitForTimeout(400);
  await page.locator('.sheet [data-val="del"]').click();
  await page.waitForSelector('[data-sheet-ok]');
  await page.locator('[data-sheet-ok]').click();
  await page.waitForTimeout(600);
  n = await page.locator('[data-habitrow]').count();
  if (n !== 3) throw new Error('habit not deleted, count=' + n);
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
