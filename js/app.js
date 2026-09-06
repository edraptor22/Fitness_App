/* Router + app shell. */

import * as store from './store.js';
import { toast, closeSheet } from './ui.js';
import { icon } from './icons.js';

import * as Today from './views/today.js';
import * as Goals from './views/goals.js';
import * as Session from './views/session.js';
import * as Plans from './views/plans.js';
import * as Plan from './views/plan.js';
import * as Workout from './views/workout.js';
import * as History from './views/history.js';
import * as Library from './views/library.js';
import * as Exercise from './views/exercise.js';
import * as Settings from './views/settings.js';

const ROUTES = [
  [/^\/today$/, Today, 'today'],
  [/^\/goals$/, Goals, 'goals'],
  [/^\/session\/([^/]+)$/, Session, 'today'],
  [/^\/plans$/, Plans, 'plans'],
  [/^\/plan\/([^/]+)$/, Plan, 'plans'],
  [/^\/workout\/([^/]+)$/, Workout, 'plans'],
  [/^\/history$/, History, 'history'],
  [/^\/library$/, Library, 'library'],
  [/^\/exercise\/([^/]+)$/, Exercise, 'library'],
  [/^\/settings$/, Settings, 'settings'],
];

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('subtitle');
const backBtn = document.getElementById('backBtn');
const actionBtn = document.getElementById('actionBtn');

let currentPath = '';
const scrollMemory = new Map();

export function go(path, { replace = false } = {}) {
  if (replace) location.replace('#' + path);
  else location.hash = path;
}

/** Re-render the current route in place. Await it before opening a sheet —
    a render closes any open sheet, so celebrating first would flash and vanish. */
export function refresh() { return render(true); }

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/today';
  const [path, qs] = raw.split('?');
  return { path, query: new URLSearchParams(qs || '') };
}

async function render(inPlace = false) {
  closeSheet();
  const { path, query } = parseHash();

  if (!inPlace && currentPath && currentPath !== path) {
    scrollMemory.set(currentPath, viewEl.scrollTop);
  }
  const keepScroll = inPlace ? viewEl.scrollTop : (scrollMemory.get(path) || 0);

  const match = ROUTES.find(([re]) => re.test(path));
  if (!match) return go('/today', { replace: true });

  const [re, mod, tab] = match;
  const params = (path.match(re) || []).slice(1).map(decodeURIComponent);

  let out;
  try {
    out = await mod.render({ params, query, go, refresh });
  } catch (err) {
    console.error(err);
    out = { title: 'Error', html: `<div class="empty">${err.message}</div>` };
  }

  titleEl.textContent = out.title || '';
  subEl.textContent = out.subtitle || '';
  subEl.hidden = !out.subtitle;

  backBtn.hidden = !out.back;
  backBtn.onclick = () => (history.length > 1 ? history.back() : go(out.back === true ? '/today' : out.back));

  if (out.action) {
    actionBtn.hidden = false;
    actionBtn.textContent = out.action.label;
    actionBtn.onclick = out.action.onClick;
  } else {
    actionBtn.hidden = true;
    actionBtn.onclick = null;
  }

  // Each render gets a fresh holder. Views attach delegated listeners to it,
  // so replacing the holder throws those listeners away with it — otherwise
  // every previous view's handlers would keep firing on the new one.
  const holder = document.createElement('div');
  holder.innerHTML = out.html || '';
  viewEl.replaceChildren(holder);
  if (out.mount) out.mount(holder);

  document.querySelectorAll('#tabbar a').forEach((a) =>
    a.classList.toggle('active', a.dataset.tab === tab));

  viewEl.scrollTop = keepScroll;
  currentPath = path;
}

function applyTheme() {
  const t = store.state.settings?.theme || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

async function boot() {
  await store.load();
  applyTheme();

  // Tab icons are declared in the markup and drawn once here.
  document.querySelectorAll('#tabbar a[data-icon]').forEach((a) =>
    a.insertAdjacentHTML('afterbegin', icon(a.dataset.icon, 22)));
  store.subscribe(applyTheme);

  window.addEventListener('hashchange', () => render());
  if (!location.hash) location.replace('#/today');
  await render();

  // Re-render Today when the app comes back to the foreground on a new day.
  let lastDay = new Date().toDateString();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = new Date().toDateString();
    if (now !== lastDay) { lastDay = now; render(true); }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot().catch((e) => {
  console.error(e);
  viewEl.innerHTML = `<div class="empty">Could not start: ${e.message}</div>`;
});

// Handy in Safari's console while testing.
window.LiftLog = { store, go, refresh, toast };
