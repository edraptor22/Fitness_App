/* Session — the logging screen. Per-set rows prefilled from last time, with
   the previous session shown above each exercise for progressive overload. */

import * as store from '../store.js';
import { esc, on, sheet, toast, menuSheet, confirmSheet } from '../ui.js';
import { pickExerciseSheet } from './today.js';
import {
  fmtDate, fmtAgo, fmtNum, num, activeMetrics, METRIC_LABEL, metricStep, metricUnit,
  fmtSet, KIND_LABEL,
} from '../util.js';

export async function render(ctx) {
  const id = ctx.params[0];
  const s = store.session(id);
  if (!s) return { title: 'Not found', back: '/today', html: '<div class="empty">This session no longer exists.</div>' };

  const settings = store.state.settings;
  const simple = (s.mode || 'exercises') === 'simple';

  const html = simple ? simpleBody(s) : exercisesBody(s, settings);

  function persist(patch = {}) {
    Object.assign(s, patch);
    store.saveSession(s);
  }

  function mount(root) {
    /* ---- simple (check-off) sessions ---- */
    on(root, '[data-done-toggle]', 'click', () => {
      const done = s.status !== 'done';
      persist({ status: done ? 'done' : 'active', done, completedAt: done ? new Date().toISOString() : null });
      ctx.refresh();
    });

    /* ---- shared fields ---- */
    on(root, '[data-field]', 'input', (e, t) => {
      const v = t.type === 'number' ? (t.value === '' ? null : num(t.value)) : t.value;
      persist({ [t.dataset.field]: v });
    });

    /* ---- set editing ---- */
    on(root, '[data-cell]', 'input', (e, t) => {
      const { entry, set, metric } = cellRef(t);
      s.entries[entry].sets[set][metric] = t.value === '' ? '' : num(t.value);
      store.saveSession(s);
    });

    on(root, '[data-step]', 'click', (e, t) => {
      const wrap = t.closest('.stepper');
      const input = wrap.querySelector('input');
      const { entry, set, metric } = cellRef(input);
      const ex = store.exercise(s.entries[entry].exerciseId) || { track: {} };
      const step = metricStep(metric, ex, settings) * Number(t.dataset.step);
      const next = Math.max(0, Math.round((num(input.value) + step) * 100) / 100);
      input.value = fmtNum(next);
      s.entries[entry].sets[set][metric] = next;
      store.saveSession(s);
    });

    on(root, '[data-tick]', 'click', (e, t) => {
      const entry = Number(t.dataset.entry);
      const set = Number(t.dataset.tick);
      const cur = s.entries[entry].sets[set];
      cur.done = !cur.done;
      t.classList.toggle('on', cur.done);
      t.closest('.set-row').classList.toggle('done', cur.done);
      store.saveSession(s);
    });

    on(root, '[data-addset]', 'click', (e, t) => {
      const entry = Number(t.dataset.addset);
      const sets = s.entries[entry].sets;
      const last = sets[sets.length - 1];
      sets.push(last ? { ...last, done: false } : { weight: '', reps: '', duration: '', distance: '', done: false });
      persist();
      ctx.refresh();
    });

    on(root, '[data-delset]', 'click', (e, t) => {
      const entry = Number(t.dataset.delset);
      if (s.entries[entry].sets.length <= 1) return;
      s.entries[entry].sets.pop();
      persist();
      ctx.refresh();
    });

    /* ---- exercise menu ---- */
    on(root, '[data-exmenu]', 'click', async (e, t) => {
      const i = Number(t.dataset.exmenu);
      const entry = s.entries[i];
      const choice = await menuSheet(entry.name, [
        { label: 'Mark all sets done', value: 'all' },
        { label: 'Add a note', value: 'note' },
        { label: 'View exercise history', value: 'hist' },
        { label: 'Move up', value: 'up' },
        { label: 'Move down', value: 'down' },
        { label: 'Remove from session', value: 'del', danger: true },
      ]);
      if (!choice) return;
      if (choice === 'all') { entry.sets.forEach((x) => { x.done = true; }); persist(); ctx.refresh(); }
      if (choice === 'note') return noteSheet(entry, () => { persist(); ctx.refresh(); });
      if (choice === 'hist') return ctx.go(`/exercise/${entry.exerciseId}`);
      if (choice === 'up' && i > 0) { s.entries.splice(i - 1, 0, s.entries.splice(i, 1)[0]); persist(); ctx.refresh(); }
      if (choice === 'down' && i < s.entries.length - 1) { s.entries.splice(i + 1, 0, s.entries.splice(i, 1)[0]); persist(); ctx.refresh(); }
      if (choice === 'del') { s.entries.splice(i, 1); persist(); ctx.refresh(); }
    });

    /* ---- add an exercise on the day ---- */
    on(root, '[data-addex]', 'click', () => {
      pickExerciseSheet(async (ex) => {
        s.entries.push(store.buildEntry(ex, {}, s.date));
        await store.saveSession(s);
        toast(`Added ${ex.name}`);
        ctx.refresh();
      }, { title: 'Add exercise' });
    });

    /* ---- save this session's changes back to the plan template ---- */
    on(root, '[data-savetpl]', 'click', async () => {
      const w = store.workout(s.workoutId);
      if (!w) return;
      const ok = await confirmSheet({
        title: 'Update plan template?',
        message: `“${w.name}” in the plan will be set to the exercises and set counts you used today. Logged history is unchanged.`,
        confirm: 'Update template', danger: false,
      });
      if (!ok) return;
      w.items = s.entries.map((e) => {
        const old = (w.items || []).find((i) => i.exerciseId === e.exerciseId) || {};
        return { ...old, exerciseId: e.exerciseId, targetSets: e.sets.length, targetReps: old.targetReps ?? '' };
      });
      await store.saveWorkout(w);
      toast('Template updated');
    });

    on(root, '[data-finish]', 'click', () => finish());

    function cellRef(input) {
      const cell = input.closest('[data-cell]');
      return {
        entry: Number(cell.dataset.entry),
        set: Number(cell.dataset.set),
        metric: cell.dataset.cell,
      };
    }
  }

  async function finish() {
    if (s.status === 'done') {
      await store.saveSession({ ...s, status: 'active', completedAt: null });
      ctx.refresh();
      return;
    }
    // Untouched sets are dropped rather than logged as zeroes.
    if (!simple) {
      let logged = 0;
      s.entries.forEach((e) => { e.sets.forEach((x) => { if (x.done) logged++; }); });
      if (logged === 0) {
        const ok = await confirmSheet({
          title: 'Nothing ticked off',
          message: 'No sets are marked done. Finish anyway and log every set as completed?',
          confirm: 'Log all sets', danger: false,
        });
        if (!ok) return;
        s.entries.forEach((e) => e.sets.forEach((x) => { x.done = true; }));
      }
    }
    await store.saveSession({ ...s, status: 'done', done: true, completedAt: new Date().toISOString() });
    toast('Workout complete');
    ctx.go(`/today?d=${s.date}`);
  }

  return {
    title: s.name,
    subtitle: `${fmtDate(s.date)} · ${KIND_LABEL[s.kind] || ''}`,
    back: `/today?d=${s.date}`,
    action: { label: s.status === 'done' ? 'Reopen' : 'Finish', onClick: finish },
    html,
    mount,
  };
}

/* ------------------------------------------------------- simple sessions */

function simpleBody(s) {
  const done = s.status === 'done';
  return `
    <div class="card card-pad center">
      <button class="tick ${done ? 'on' : ''}" data-done-toggle
        style="width:88px;height:88px;font-size:38px;margin:6px auto 12px">&#10003;</button>
      <div style="font-weight:650;font-size:17px">${esc(s.name)}</div>
      <div class="small muted" style="margin-top:2px">${done ? 'Completed' : 'Tap to mark complete'}</div>
    </div>

    ${s.link ? `<a class="btn block" href="${esc(s.link)}" target="_blank" rel="noopener">&#9654;&nbsp; Open the video</a>` : ''}

    <div class="card" style="margin-top:12px">
      <div class="field"><label>Minutes</label>
        <input type="number" inputmode="numeric" data-field="duration" value="${esc(s.duration ?? '')}" placeholder="10"></div>
      <div class="field"><label>Notes</label>
        <textarea data-field="notes" placeholder="How did it feel?">${esc(s.notes || '')}</textarea></div>
    </div>

    <div class="btn-row">
      <button class="btn ${done ? '' : 'primary'}" data-finish>${done ? 'Reopen' : 'Finish'}</button>
    </div>`;
}

/* ---------------------------------------------------- exercise sessions */

function exercisesBody(s, settings) {
  const cards = s.entries.map((entry, i) => exerciseCard(entry, i, s, settings)).join('');
  const doneCount = s.entries.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
  const totalCount = s.entries.reduce((n, e) => n + e.sets.length, 0);

  return `
    ${s.entries.length ? `<div class="chip-scroll">
      <span class="chip ${doneCount === totalCount && totalCount ? 'done' : ''}">${doneCount} / ${totalCount} sets</span>
      ${s.status === 'done' ? '<span class="chip done">Finished</span>' : ''}
      ${s.workoutId ? '<button class="chip" data-savetpl>Save to plan</button>' : ''}
    </div>` : ''}

    ${cards || `<div class="empty"><span class="big">&#127947;</span>No exercises yet<div class="tiny" style="margin-top:6px">Add one below.</div></div>`}

    <div class="btn-row">
      <button class="btn block" data-addex>+ Add exercise</button>
    </div>

    <div class="card">
      <div class="field"><label>Session notes</label>
        <textarea data-field="notes" placeholder="Felt strong, bumped bench 5lb…">${esc(s.notes || '')}</textarea></div>
    </div>

    <div class="btn-row">
      <button class="btn ${s.status === 'done' ? '' : 'primary'} block" data-finish>
        ${s.status === 'done' ? 'Reopen workout' : 'Finish workout'}</button>
    </div>`;
}

function exerciseCard(entry, i, s, settings) {
  const ex = store.exercise(entry.exerciseId) || {
    name: entry.name, track: { weight: true, reps: true }, durationUnit: 'min', distanceUnit: 'm',
  };
  const metrics = activeMetrics(ex);
  const cols = `26px ${metrics.map(() => '1fr').join(' ')} 44px`;
  const compact = metrics.length > 2;         // drop +/- buttons when it gets tight

  const last = store.lastPerformance(entry.exerciseId, s.date, s.id);
  const lastLine = last
    ? `Last · ${fmtAgo(last.date)} — <b>${last.sets.map((x) => fmtSet(x, ex, settings)).slice(0, 4).join(', ')}</b>`
    : 'No previous session';

  return `
  <div class="ex-card">
    <div class="ex-head">
      <div class="grow">
        <div class="ex-name">${esc(entry.name)}</div>
        ${settings.showLastSession ? `<div class="ex-last">${lastLine}</div>` : ''}
        ${entry.notes ? `<div class="tiny dim" style="margin-top:3px">${esc(entry.notes)}</div>` : ''}
      </div>
      <button class="ex-menu" data-exmenu="${i}" aria-label="Exercise options">&#8943;</button>
    </div>

    <div class="set-head" style="grid-template-columns:${cols}">
      <div>#</div>
      ${metrics.map((m) => `<div>${METRIC_LABEL[m]}${metricUnit(m, ex, settings) ? ` (${metricUnit(m, ex, settings)})` : ''}</div>`).join('')}
      <div></div>
    </div>

    ${entry.sets.map((set, j) => `
      <div class="set-row ${set.done ? 'done' : ''}" style="grid-template-columns:${cols}">
        <div class="set-idx">${j + 1}</div>
        ${metrics.map((m) => `
          <div class="stepper" data-cell="${m}" data-entry="${i}" data-set="${j}">
            ${compact ? '' : `<button data-step="-1" tabindex="-1">&minus;</button>`}
            <input type="number" inputmode="${m === 'weight' ? 'decimal' : 'numeric'}"
              value="${esc(fmtNum(set[m]))}"
              placeholder="${esc(placeholderFor(m, last, j, ex))}"
              style="${compact ? 'border-radius:var(--radius-s);border-left:1px solid var(--line);border-right:1px solid var(--line)' : ''}">
            ${compact ? '' : `<button data-step="1" tabindex="-1">+</button>`}
          </div>`).join('')}
        <button class="tick ${set.done ? 'on' : ''}" data-tick="${j}" data-entry="${i}" aria-label="Set ${j + 1} done">&#10003;</button>
      </div>`).join('')}

    <div class="set-foot">
      <button class="btn" data-addset="${i}">+ Set</button>
      ${entry.sets.length > 1 ? `<button class="btn" data-delset="${i}">&minus; Set</button>` : ''}
      ${ex.link ? `<a class="btn" href="${esc(ex.link)}" target="_blank" rel="noopener">&#9654; Video</a>` : ''}
    </div>
  </div>`;
}

function placeholderFor(metric, last, j, ex) {
  const set = last?.sets?.[j] || last?.sets?.[last.sets.length - 1];
  return set ? fmtNum(set[metric]) : '';
}

function noteSheet(entry, done) {
  sheet({
    title: entry.name,
    body: `<div class="field"><label>Note</label>
      <textarea data-note placeholder="Cue, tempo, how it felt…">${esc(entry.notes || '')}</textarea></div>`,
    confirm: 'Save',
    onConfirm(b) { entry.notes = b.querySelector('[data-note]').value.trim(); done(); },
  });
}
