/* Workout template editor — name, type, which days, and the exercise list
   with default set/rep targets. */

import * as store from '../store.js';
import { esc, on, toast, menuSheet, confirmSheet } from '../ui.js';
import { icon, kindBadge, ring } from '../icons.js';
import { pickExerciseSheet } from './today.js';
import {
  DOW_SHORT, DOW_NAME, dowOrder, KIND_LABEL, KIND_ORDER, todayISO, num, metricUnit,
} from '../util.js';

export async function render(ctx) {
  const id = ctx.params[0];
  const w = store.workout(id);
  if (!w) return { title: 'Not found', back: '/plans', html: '<div class="empty">This workout no longer exists.</div>' };

  const plan = store.plan(w.planId);
  const order = dowOrder(store.state.settings.weekStartsOn);
  const simple = (w.mode || 'exercises') === 'simple';
  const settings = store.state.settings;

  const html = `
    <div class="card">
      <div class="field"><label>Name</label>
        <input type="text" data-f="name" value="${esc(w.name)}" autocapitalize="words"></div>
      <div class="field"><label>Type</label>
        <select data-f="kind">${KIND_ORDER.map((k) =>
          `<option value="${k}" ${k === w.kind ? 'selected' : ''}>${KIND_LABEL[k]}</option>`).join('')}</select></div>
      <div class="field"><label>Log style</label>
        <select data-f="mode">
          <option value="exercises" ${!simple ? 'selected' : ''}>Exercises &amp; sets</option>
          <option value="simple" ${simple ? 'selected' : ''}>Just check it off</option>
        </select></div>
    </div>

    <div class="section-title">Days</div>
    <div class="card card-pad">
      <div class="days">
        ${order.map((d) => `<button data-day="${d}" class="${(w.days || []).includes(d) ? 'on' : ''}"
          aria-label="${DOW_NAME[d]}">${DOW_SHORT[d]}</button>`).join('')}
      </div>
      <div class="tiny dim" style="margin-top:8px">
        Days set the weekly target and what shows on Today. You can always start this workout on any other day.
      </div>
      <div class="btn-row" style="margin-bottom:0">
        <button class="btn ghost" data-days="all" style="min-height:34px">Every day</button>
        <button class="btn ghost" data-days="none" style="min-height:34px">Clear</button>
      </div>
    </div>

    ${simple ? `
      <div class="section-title">Details</div>
      <div class="card">
        <div class="field"><label>Target minutes</label>
          <input type="number" inputmode="numeric" data-f="targetDuration" value="${esc(w.targetDuration ?? '')}" placeholder="10"></div>
        <div class="field"><label>Video link (optional)</label>
          <input type="url" data-f="link" value="${esc(w.link || '')}" placeholder="https://youtube.com/watch?v=…"
            autocapitalize="none" autocorrect="off"></div>
        <div class="field"><label>Notes</label>
          <textarea data-f="notes" placeholder="What this session is for">${esc(w.notes || '')}</textarea></div>
      </div>`
    : `
      <div class="section-title">Exercises</div>
      <div class="card">
        ${(w.items || []).length ? w.items.map((item, i) => itemRow(item, i, settings)).join('')
          : '<div class="card-pad muted small">No exercises yet.</div>'}
      </div>
      <div class="btn-row"><button class="btn block" data-addex>+ Add exercise</button></div>
      <div class="card">
        <div class="field"><label>Notes</label>
          <textarea data-f="notes" placeholder="Warm-up, tempo, rest times…">${esc(w.notes || '')}</textarea></div>
      </div>`}

    <div class="btn-row">
      <button class="btn primary block" data-start>Start this workout today</button>
    </div>
    <div class="btn-row">
      <button class="btn danger block" data-del>Delete workout</button>
    </div>`;

  function save(patch) {
    Object.assign(w, patch);
    return store.saveWorkout(w);
  }

  function mount(root) {
    on(root, '[data-f]', 'input', (e, t) => {
      const key = t.dataset.f;
      const v = t.type === 'number' ? (t.value === '' ? null : num(t.value)) : t.value;
      save({ [key]: v });
    });

    on(root, '[data-f]', 'change', (e, t) => {
      if (t.tagName !== 'SELECT') return;
      save({ [t.dataset.f]: t.value });
      ctx.refresh();
    });

    on(root, '[data-day]', 'click', (e, t) => {
      const d = Number(t.dataset.day);
      const days = new Set(w.days || []);
      days.has(d) ? days.delete(d) : days.add(d);
      save({ days: [...days].sort() });
      t.classList.toggle('on');
    });

    on(root, '[data-days]', 'click', (e, t) => {
      save({ days: t.dataset.days === 'all' ? [0, 1, 2, 3, 4, 5, 6] : [] });
      ctx.refresh();
    });

    on(root, '[data-target]', 'input', (e, t) => {
      const i = Number(t.dataset.i);
      w.items[i][t.dataset.target] = t.value === '' ? '' : num(t.value);
      store.saveWorkout(w);
    });

    on(root, '[data-itemmenu]', 'click', async (e, t) => {
      const i = Number(t.dataset.itemmenu);
      const ex = store.exercise(w.items[i].exerciseId);
      const choice = await menuSheet(ex?.name || 'Exercise', [
        { label: 'Move up', value: 'up' },
        { label: 'Move down', value: 'down' },
        { label: 'Open in library', value: 'lib' },
        { label: 'Remove', value: 'del', danger: true },
      ]);
      if (choice === 'up' && i > 0) { w.items.splice(i - 1, 0, w.items.splice(i, 1)[0]); await store.saveWorkout(w); ctx.refresh(); }
      if (choice === 'down' && i < w.items.length - 1) { w.items.splice(i + 1, 0, w.items.splice(i, 1)[0]); await store.saveWorkout(w); ctx.refresh(); }
      if (choice === 'lib' && ex) ctx.go(`/exercise/${ex.id}`);
      if (choice === 'del') { w.items.splice(i, 1); await store.saveWorkout(w); ctx.refresh(); }
    });

    on(root, '[data-addex]', 'click', () => {
      pickExerciseSheet(async (ex) => {
        w.items = w.items || [];
        w.items.push({ exerciseId: ex.id, targetSets: 3, targetReps: ex.track?.reps ? 8 : '', targetDuration: '', targetDistance: '', notes: '' });
        await store.saveWorkout(w);
        ctx.refresh();
      }, { title: 'Add to workout' });
    });

    on(root, '[data-start]', 'click', async () => {
      const s = await store.startSession({ workoutTemplate: w, date: todayISO() });
      ctx.go(`/session/${s.id}`);
    });

    on(root, '[data-del]', 'click', async () => {
      const ok = await confirmSheet({ title: `Delete ${w.name}?`, message: 'Logged history is not affected.' });
      if (ok) { await store.deleteWorkout(w.id); toast('Deleted'); ctx.go(`/plan/${w.planId}`); }
    });
  }

  return {
    title: w.name || 'Workout',
    subtitle: plan ? plan.name : '',
    back: `/plan/${w.planId}`,
    html,
    mount,
  };
}

function itemRow(item, i, settings) {
  const ex = store.exercise(item.exerciseId);
  if (!ex) return '';
  // The second target box follows whatever the exercise actually tracks.
  const metric = ex.track?.reps ? 'reps' : ex.track?.duration ? 'duration' : ex.track?.distance ? 'distance' : null;
  const field = { reps: 'targetReps', duration: 'targetDuration', distance: 'targetDistance' }[metric];
  const unit = metric ? metricUnit(metric, ex, settings) : '';

  return `<div class="row">
    <span class="grow">
      <div class="row-title">${esc(ex.name)}</div>
      <div class="row-sub tight tiny dim">${esc(KIND_LABEL[ex.kind] || '')}</div>
    </span>
    <span style="display:flex;align-items:center;gap:4px">
      <input type="number" inputmode="numeric" data-target="targetSets" data-i="${i}"
        value="${esc(item.targetSets ?? '')}" placeholder="3"
        style="width:46px;height:38px;text-align:center;font-size:16px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2)">
      <span class="tiny dim">×</span>
      ${field ? `<input type="number" inputmode="numeric" data-target="${field}" data-i="${i}"
        value="${esc(item[field] ?? '')}" placeholder="8"
        style="width:54px;height:38px;text-align:center;font-size:16px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2)">
        ${unit ? `<span class="tiny dim">${esc(unit)}</span>` : ''}` : ''}
    </span>
    <button class="ex-menu" data-itemmenu="${i}">${icon('more', 18)}</button>
  </div>`;
}
