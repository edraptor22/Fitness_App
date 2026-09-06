/* Plan detail — the weekly schedule and the workout templates it contains. */

import * as store from '../store.js';
import { esc, on, sheet, toast, menuSheet, confirmSheet, promptSheet } from '../ui.js';
import { icon, kindBadge, ring } from '../icons.js';
import { DOW_NAME, dowOrder, KIND_LABEL, KIND_ORDER, uid } from '../util.js';
import { summaryOf } from './today.js';

export async function render(ctx) {
  const id = ctx.params[0];
  const p = store.plan(id);
  if (!p) return { title: 'Not found', back: '/plans', html: '<div class="empty">This plan no longer exists.</div>' };

  const workouts = store.planWorkouts(id);
  const isActive = store.state.settings.activePlanId === id;
  const order = dowOrder(store.state.settings.weekStartsOn);

  const weekly = KIND_ORDER.map((k) => {
    const n = workouts.filter((w) => w.kind === k).reduce((t, w) => t + (w.days?.length || 0), 0);
    return n ? `${n}× ${KIND_LABEL[k].toLowerCase()}` : null;
  }).filter(Boolean).join(' · ');

  const html = `
    ${!isActive ? `<div class="btn-row"><button class="btn primary block" data-activate>Make this my active plan</button></div>` : ''}

    <div class="section-title">Week at a glance</div>
    <div class="card">
      ${order.map((d) => {
        const ws = workouts.filter((w) => (w.days || []).includes(d));
        return `<div class="row" style="min-height:44px">
          <span style="width:34px;font-size:12px;font-weight:700;color:var(--text-3)">${DOW_NAME[d].slice(0, 3).toUpperCase()}</span>
          <span class="grow small ${ws.length ? '' : 'dim'}">
            ${ws.length ? ws.map((w) => esc(w.name)).join(' · ') : 'Rest'}
          </span>
        </div>`;
      }).join('')}
      ${weekly ? `<div class="card-pad tiny dim" style="border-top:1px solid var(--line-soft)">${esc(weekly)} per week</div>` : ''}
    </div>

    <div class="section-title">Workouts</div>
    <div class="card">
      ${workouts.length ? workouts.map((w) => `
        <div class="row" data-wo="${esc(w.id)}">
          ${kindBadge(w.kind, { size: 38 })}
          <span class="grow">
            <div class="row-title">${esc(w.name)}</div>
            <div class="row-sub">${esc(daysLabel(w, order))} · ${esc(summaryOf(w))}</div>
          </span>
          <button class="ex-menu" data-menu="${esc(w.id)}">${icon('more', 18)}</button>
        </div>`).join('')
        : '<div class="card-pad muted small">No workouts in this plan yet.</div>'}
    </div>

    <div class="btn-row"><button class="btn primary block" data-add>+ Add workout</button></div>

    <div class="card">
      <div class="field"><label>Plan notes</label>
        <textarea data-notes placeholder="Block goals, deload weeks, anything worth remembering">${esc(p.notes || '')}</textarea></div>
    </div>`;

  function mount(root) {
    on(root, '[data-activate]', 'click', async () => {
      await store.saveSettings({ activePlanId: id });
      toast(`${p.name} is now active`);
      ctx.refresh();
    });

    on(root, '[data-notes]', 'input', (e, t) => store.savePlan({ ...p, notes: t.value }));

    on(root, '[data-wo]', 'click', (e, t) => {
      if (e.target.closest('[data-menu]')) return;
      ctx.go(`/workout/${t.dataset.wo}`);
    });

    on(root, '[data-menu]', 'click', async (e, t) => {
      e.stopPropagation();
      const w = store.workout(t.dataset.menu);
      const choice = await menuSheet(w.name, [
        { label: 'Edit', value: 'edit' },
        { label: 'Duplicate', value: 'dupe' },
        { label: 'Delete', value: 'del', danger: true },
      ]);
      if (choice === 'edit') return ctx.go(`/workout/${w.id}`);
      if (choice === 'dupe') {
        await store.saveWorkout({
          ...w, id: uid('wo'), name: `${w.name} copy`, days: [],
          items: (w.items || []).map((i) => ({ ...i })), order: workouts.length,
        });
        toast('Duplicated'); ctx.refresh();
      }
      if (choice === 'del') {
        const ok = await confirmSheet({ title: `Delete ${w.name}?`, message: 'Logged history is not affected.' });
        if (ok) { await store.deleteWorkout(w.id); ctx.refresh(); }
      }
    });

    on(root, '[data-add]', 'click', () => addWorkoutSheet(id, workouts.length, ctx));
  }

  return {
    title: p.name,
    subtitle: isActive ? 'Active plan' : '',
    back: '/plans',
    action: {
      label: 'Rename',
      onClick: async () => {
        const name = await promptSheet({ title: 'Rename plan', label: 'Name', value: p.name });
        if (name) { await store.savePlan({ ...p, name }); ctx.refresh(); }
      },
    },
    html,
    mount,
  };
}

function daysLabel(w, order) {
  const days = (w.days || []);
  if (!days.length) return 'Unscheduled';
  if (days.length === 7) return 'Every day';
  return order.filter((d) => days.includes(d)).map((d) => DOW_NAME[d].slice(0, 3)).join(', ');
}

function addWorkoutSheet(planId, count, ctx) {
  sheet({
    title: 'New workout',
    body: `
      <div class="field"><label>Name</label>
        <input type="text" name="name" placeholder="e.g. Upper Body" autocapitalize="words"></div>
      <div class="field"><label>Type</label>
        <select name="kind">${KIND_ORDER.map((k) => `<option value="${k}">${KIND_LABEL[k]}</option>`).join('')}</select></div>
      <div class="field"><label>Log style</label>
        <select name="mode">
          <option value="exercises">Exercises &amp; sets</option>
          <option value="simple">Just check it off (optional video link)</option>
        </select></div>`,
    confirm: 'Create',
    onMount(b) {
      // Mobility defaults to the check-off style; weights default to exercises.
      const kind = b.querySelector('[name=kind]');
      const mode = b.querySelector('[name=mode]');
      kind.addEventListener('change', () => { mode.value = kind.value === 'mobility' ? 'simple' : 'exercises'; });
    },
    onConfirm(b) {
      const name = b.querySelector('[name=name]').value.trim();
      if (!name) return false;
      const kind = b.querySelector('[name=kind]').value;
      const mode = b.querySelector('[name=mode]').value;
      const w = store.newWorkout(planId, { name, kind, mode, order: count });
      store.saveWorkout(w).then(() => ctx.go(`/workout/${w.id}`));
    },
  });
}
