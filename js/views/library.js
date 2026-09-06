/* Library — every exercise you can log, grouped by type. */

import * as store from '../store.js';
import { esc, on, sheet, emptyState } from '../ui.js';
import { icon, kindBadge, ring } from '../icons.js';
import { KIND_LABEL, KIND_ORDER } from '../util.js';

export async function render(ctx) {
  const q = (ctx.query.get('q') || '').toLowerCase();
  const all = store.allExercises();
  const hits = q ? all.filter((e) => e.name.toLowerCase().includes(q)) : all;

  const groups = {};
  for (const e of hits) (groups[e.kind] ||= []).push(e);

  const html = `
    <div class="search">
      <input type="text" data-q value="${esc(ctx.query.get('q') || '')}"
        placeholder="Search ${all.length} exercises" autocapitalize="none" autocorrect="off">
    </div>

    ${KIND_ORDER.filter((k) => groups[k]?.length).map((k) => `
      <div class="section-title">${KIND_LABEL[k]} · ${groups[k].length}</div>
      <div class="card">
        ${groups[k].map((e) => `<div class="row" data-ex="${esc(e.id)}">
          <span class="grow">
            <div class="row-title">${esc(e.name)}</div>
            <div class="row-sub tight tiny dim">${esc(trackLabel(e))}</div>
          </span>
          <span class="chev">${icon('chevron', 18)}</span>
        </div>`).join('')}
      </div>`).join('')}

    ${!hits.length ? emptyState('book', q ? 'No matches' : 'Your library is empty', 'Add an exercise below.') : ''}

    <div class="btn-row"><button class="btn primary block" data-new>+ New exercise</button></div>`;

  function mount(root) {
    const input = root.querySelector('[data-q]');
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const v = input.value.trim();
        history.replaceState(null, '', v ? `#/library?q=${encodeURIComponent(v)}` : '#/library');
        ctx.refresh();
        // Keep the caret in the search box across the re-render.
        const next = document.querySelector('[data-q]');
        if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
      }, 180);
    });

    on(root, '[data-ex]', 'click', (e, target) => ctx.go(`/exercise/${target.dataset.ex}`));
    on(root, '[data-new]', 'click', () => newExerciseSheet(ctx));
  }

  return { title: 'Library', html, mount };
}

function trackLabel(e) {
  const on = [];
  if (e.track?.weight) on.push('weight');
  if (e.track?.reps) on.push('reps');
  if (e.track?.duration) on.push(e.durationUnit === 'sec' ? 'seconds' : 'minutes');
  if (e.track?.distance) on.push(`distance (${e.distanceUnit || 'm'})`);
  return on.join(' · ') || 'no metrics';
}

export function newExerciseSheet(ctx) {
  sheet({
    title: 'New exercise',
    body: `
      <div class="field"><label>Name</label>
        <input type="text" name="name" placeholder="e.g. Trap Bar Deadlift" autocapitalize="words"></div>
      <div class="field"><label>Type</label>
        <select name="kind">${KIND_ORDER.map((k) => `<option value="${k}">${KIND_LABEL[k]}</option>`).join('')}</select></div>
      <div class="card-pad tiny dim">You can fine-tune what gets tracked on the next screen.</div>`,
    confirm: 'Create',
    onMount(b) { setTimeout(() => b.querySelector('[name=name]')?.focus(), 60); },
    onConfirm(b) {
      const name = b.querySelector('[name=name]').value.trim();
      if (!name) return false;
      const kind = b.querySelector('[name=kind]').value;
      const ex = store.newExercise({ name, kind });
      store.saveExercise(ex).then(() => ctx.go(`/exercise/${ex.id}`));
    },
  });
}
