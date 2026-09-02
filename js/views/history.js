/* History — everything logged, newest first, with a light filter. */

import * as store from '../store.js';
import { esc, on, menuSheet, confirmSheet, toast, emptyState } from '../ui.js';
import { fmtDate, fmtNum, KIND_LABEL, KIND_ORDER, todayISO, num, pluralize } from '../util.js';
import { kindGlyph } from './today.js';

export async function render(ctx) {
  const filter = ctx.query.get('k') || 'all';
  const all = store.allSessions().filter((s) => s.status === 'done');
  const rows = filter === 'all' ? all : all.filter((s) => s.kind === filter);

  const week = store.weekSummary(todayISO());
  const streak = store.streak();
  const units = store.state.settings.units;

  // Group by month heading.
  const groups = [];
  let lastKey = null;
  for (const s of rows) {
    const key = s.date.slice(0, 7);
    if (key !== lastKey) { groups.push({ key, label: monthLabel(s.date), items: [] }); lastKey = key; }
    groups[groups.length - 1].items.push(s);
  }

  const kinds = ['all', ...KIND_ORDER.filter((k) => all.some((s) => s.kind === k))];

  const html = `
    <div class="card card-pad">
      <div style="display:flex;text-align:center">
        ${stat(week.sessions, 'this week')}
        ${stat(streak, streak === 1 ? 'day streak' : 'day streak')}
        ${stat(all.length, 'total')}
      </div>
      ${week.volume > 0 ? `<div class="tiny dim center" style="margin-top:8px">
        ${comma(Math.round(week.volume))} ${esc(units)} lifted this week</div>` : ''}
    </div>

    ${kinds.length > 2 ? `<div class="chip-scroll">
      ${kinds.map((k) => `<button class="chip ${k === filter ? 'accent' : ''}" data-k="${k}">
        ${k === 'all' ? 'All' : esc(KIND_LABEL[k] || k)}</button>`).join('')}
    </div>` : ''}

    ${groups.length ? groups.map((g) => `
      <div class="section-title">${esc(g.label)}</div>
      <div class="card">
        ${g.items.map((s) => sessionRow(s)).join('')}
      </div>`).join('')
      : emptyState('&#9202;', 'Nothing logged yet', 'Finish a workout and it will show up here.')}
  `;

  function mount(root) {
    on(root, '[data-k]', 'click', (e, t) => ctx.go(`/history?k=${t.dataset.k}`));
    on(root, '[data-open]', 'click', (e, t) => {
      if (e.target.closest('[data-menu]')) return;
      ctx.go(`/session/${t.dataset.open}`);
    });
    on(root, '[data-menu]', 'click', async (e, t) => {
      e.stopPropagation();
      const s = store.session(t.dataset.menu);
      const choice = await menuSheet(s.name, [
        { label: 'Open', value: 'open' },
        { label: 'Delete', value: 'del', danger: true },
      ]);
      if (choice === 'open') ctx.go(`/session/${s.id}`);
      if (choice === 'del') {
        const ok = await confirmSheet({ title: 'Delete this session?', message: `${s.name} — ${fmtDate(s.date, { absolute: true })}` });
        if (ok) { await store.deleteSession(s.id); toast('Deleted'); ctx.refresh(); }
      }
    });
  }

  return { title: 'History', html, mount };
}

function stat(value, label) {
  return `<div style="flex:1">
    <div style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums">${value}</div>
    <div class="tiny dim">${esc(label)}</div>
  </div>`;
}

function sessionRow(s) {
  const settings = store.state.settings;
  let sub;
  if ((s.mode || 'exercises') === 'simple') {
    sub = s.duration ? `${fmtNum(s.duration)} min` : (KIND_LABEL[s.kind] || '');
  } else {
    const sets = (s.entries || []).reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
    let vol = 0;
    for (const e of s.entries || []) {
      const ex = store.exercise(e.exerciseId);
      if (!ex?.track?.weight || !ex?.track?.reps) continue;
      for (const st of e.sets) if (st.done) vol += num(st.weight) * num(st.reps);
    }
    sub = `${pluralize(s.entries?.length || 0, 'exercise')} · ${pluralize(sets, 'set')}`;
    if (vol > 0) sub += ` · ${comma(Math.round(vol))} ${settings.units}`;
  }
  return `<div class="row" data-open="${esc(s.id)}">
    <span class="chip" style="width:38px;height:38px;padding:0;justify-content:center;border-radius:50%;font-size:15px">${kindGlyph(s.kind)}</span>
    <span class="grow">
      <div class="row-title">${esc(s.name)}</div>
      <div class="row-sub">${esc(sub)}</div>
    </span>
    <span class="tiny dim" style="text-align:right;white-space:nowrap">${esc(fmtDate(s.date, { weekday: false }))}</span>
    <button class="ex-menu" data-menu="${esc(s.id)}">&#8943;</button>
  </div>`;
}

function monthLabel(iso) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'long', year: thisYear ? undefined : 'numeric' });
}

function comma(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
