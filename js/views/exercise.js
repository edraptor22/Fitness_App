/* Exercise detail — what it tracks, its personal best, and every logged set. */

import * as store from '../store.js';
import { esc, on, toast, confirmSheet, switchRow } from '../ui.js';
import {
  KIND_LABEL, KIND_ORDER, fmtDate, fmtNum, fmtSet, bestSet, num, METRICS,
} from '../util.js';

export async function render(ctx) {
  const id = ctx.params[0];
  const ex = store.exercise(id);
  if (!ex) return { title: 'Not found', back: '/library', html: '<div class="empty">This exercise no longer exists.</div>' };

  const settings = store.state.settings;
  const history = store.exerciseHistory(id);
  const pb = store.personalBest(id);
  const usedIn = [...store.state.workouts.values()].filter((w) => (w.items || []).some((i) => i.exerciseId === id));

  const html = `
    ${history.length ? `
      <div class="card">
        <div class="card-pad" style="padding-bottom:0;display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-weight:650">Best set</span>
          <span class="mono" style="font-weight:700;color:var(--accent)">${pb ? esc(fmtSet(pb, ex, settings)) : '—'}</span>
        </div>
        ${chart(history, ex, settings)}
      </div>` : ''}

    <div class="section-title">Settings</div>
    <div class="card">
      <div class="field"><label>Name</label>
        <input type="text" data-f="name" value="${esc(ex.name)}" autocapitalize="words"></div>
      <div class="field"><label>Type</label>
        <select data-f="kind">${KIND_ORDER.map((k) =>
          `<option value="${k}" ${k === ex.kind ? 'selected' : ''}>${KIND_LABEL[k]}</option>`).join('')}</select></div>
      <div class="field"><label>Video link (optional)</label>
        <input type="url" data-f="link" value="${esc(ex.link || '')}" placeholder="https://youtube.com/watch?v=…"
          autocapitalize="none" autocorrect="off"></div>
      <div class="field"><label>Notes</label>
        <textarea data-f="notes" placeholder="Setup cues, bar height, machine number…">${esc(ex.notes || '')}</textarea></div>
    </div>

    <div class="section-title">Track</div>
    <div class="card">
      ${switchRow('Weight', 'weight', !!ex.track?.weight)}
      ${switchRow('Reps', 'reps', !!ex.track?.reps)}
      ${switchRow('Time', 'duration', !!ex.track?.duration)}
      ${switchRow('Distance', 'distance', !!ex.track?.distance)}
      ${ex.track?.duration ? `<div class="field"><label>Time unit</label>
        <select data-f="durationUnit">
          <option value="sec" ${ex.durationUnit === 'sec' ? 'selected' : ''}>Seconds</option>
          <option value="min" ${ex.durationUnit !== 'sec' ? 'selected' : ''}>Minutes</option>
        </select></div>` : ''}
      ${ex.track?.distance ? `<div class="field"><label>Distance unit</label>
        <select data-f="distanceUnit">
          ${['m', 'yd', 'km', 'mi', 'ft'].map((u) => `<option value="${u}" ${ (ex.distanceUnit || 'm') === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select></div>` : ''}
    </div>

    ${usedIn.length ? `
      <div class="section-title">Used in</div>
      <div class="card">
        ${usedIn.map((w) => `<div class="row" data-wo="${esc(w.id)}">
          <span class="grow"><div class="row-title">${esc(w.name)}</div>
          <div class="row-sub">${esc(store.plan(w.planId)?.name || '')}</div></span>
          <span class="chev">&#8250;</span></div>`).join('')}
      </div>` : ''}

    <div class="section-title">History${history.length ? ` · ${history.length}` : ''}</div>
    <div class="card">
      ${history.length ? history.slice(0, 60).map((h) => `
        <div class="row" data-sess="${esc(h.sessionId)}">
          <span class="grow">
            <div class="row-title mono" style="font-size:15px">${esc(h.sets.map((x) => fmtSet(x, ex, settings)).join(', '))}</div>
            <div class="row-sub tight tiny dim">${esc(h.sessionName)}</div>
          </span>
          <span class="tiny dim" style="white-space:nowrap">${esc(fmtDate(h.date, { weekday: false }))}</span>
        </div>`).join('')
        : '<div class="card-pad muted small">No logged sets yet.</div>'}
    </div>

    <div class="btn-row"><button class="btn danger block" data-del>Delete exercise</button></div>`;

  function mount(root) {
    on(root, '[data-f]', 'input', (e, t) => store.saveExercise({ ...ex, [t.dataset.f]: t.value }));
    on(root, '[data-f]', 'change', (e, t) => {
      if (t.tagName !== 'SELECT') return;
      store.saveExercise({ ...ex, [t.dataset.f]: t.value }).then(() => ctx.refresh());
    });

    on(root, 'input[type=checkbox][name]', 'change', (e, t) => {
      if (!METRICS.includes(t.name)) return;
      const track = { ...ex.track, [t.name]: t.checked };
      store.saveExercise({ ...ex, track }).then(() => ctx.refresh());
    });

    on(root, '[data-wo]', 'click', (e, t) => ctx.go(`/workout/${t.dataset.wo}`));
    on(root, '[data-sess]', 'click', (e, t) => ctx.go(`/session/${t.dataset.sess}`));

    on(root, '[data-del]', 'click', async () => {
      const ok = await confirmSheet({
        title: `Delete ${ex.name}?`,
        message: 'It is removed from your plans. Sessions you already logged keep their record.',
      });
      if (ok) { await store.deleteExercise(ex.id); toast('Deleted'); ctx.go('/library'); }
    });
  }

  return { title: ex.name, subtitle: KIND_LABEL[ex.kind] || '', back: '/library', html, mount };
}

/** Bar chart of the best set from each of the last 12 sessions. */
function chart(history, ex, settings) {
  const key = ex.track?.weight ? 'weight'
    : ex.track?.distance ? 'distance'
    : ex.track?.duration ? 'duration' : 'reps';

  const points = history.slice(0, 12).reverse().map((h) => {
    const b = bestSet(h.sets, ex);
    return { date: h.date, value: b ? num(b[key]) : 0 };
  }).filter((p) => p.value > 0);

  if (points.length < 2) return '<div class="card-pad tiny dim">Log a couple more sessions to see a trend.</div>';

  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(...points.map((p) => p.value));
  const span = Math.max(max - min, max * 0.15, 1);

  return `
    <div class="spark">
      ${points.map((p) => {
        const h = 12 + ((p.value - min) / span) * 78;
        return `<div style="height:${Math.min(100, h)}%" title="${esc(fmtNum(p.value))}"></div>`;
      }).join('')}
    </div>
    <div class="spark-labels">
      ${points.map((p, i) => `<div>${i === 0 || i === points.length - 1 ? esc(p.date.slice(5).replace('-', '/')) : ''}</div>`).join('')}
    </div>
    <div class="card-pad tiny dim" style="padding-top:0">Best ${key} per session · latest ${fmtNum(points[points.length - 1].value)}</div>`;
}
