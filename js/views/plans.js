/* Plans — list, switch the active plan, create / duplicate / delete. */

import * as store from '../store.js';
import { esc, on, toast, promptSheet, menuSheet, confirmSheet, emptyState } from '../ui.js';
import { icon, kindBadge, ring } from '../icons.js';
import { KIND_LABEL, KIND_ORDER } from '../util.js';

export async function render(ctx) {
  const plans = store.allPlans();
  const activeId = store.state.settings.activePlanId;

  const html = `
    <div class="section-title">Your plans</div>
    ${plans.length ? `<div class="card">
      ${plans.map((p) => {
        const ws = store.planWorkouts(p.id);
        const counts = KIND_ORDER
          .map((k) => {
            const n = ws.filter((w) => w.kind === k).reduce((t, w) => t + (w.days?.length || 0), 0);
            return n ? `${n}× ${KIND_LABEL[k].toLowerCase()}` : null;
          })
          .filter(Boolean).join(' · ');
        return `<div class="row" data-plan="${esc(p.id)}">
          <button class="tick ${p.id === activeId ? 'on' : ''}" data-activate="${esc(p.id)}"
            aria-label="Make active">${icon('check', 22)}</button>
          <span class="grow">
            <div class="row-title">${esc(p.name)}${p.id === activeId ? ' <span class="chip accent" style="margin-left:6px">Active</span>' : ''}</div>
            <div class="row-sub">${esc(counts || 'No workouts yet')}</div>
          </span>
          <button class="ex-menu" data-menu="${esc(p.id)}">${icon('more', 18)}</button>
        </div>`;
      }).join('')}
    </div>` : emptyState('layers', 'No plans yet', 'A plan holds your weekly workouts.')}

    <div class="btn-row"><button class="btn primary block" data-new>+ New plan</button></div>

    <div class="card card-pad small muted">
      A plan is a weekly template — each workout is assigned to the days you
      normally do it. You can still start any workout on any day from the Today tab,
      and the weekly counters track what you actually did.
    </div>`;

  function mount(root) {
    on(root, '[data-plan]', 'click', (e, t) => {
      if (e.target.closest('[data-activate]') || e.target.closest('[data-menu]')) return;
      ctx.go(`/plan/${t.dataset.plan}`);
    });

    on(root, '[data-activate]', 'click', async (e, t) => {
      e.stopPropagation();
      await store.saveSettings({ activePlanId: t.dataset.activate });
      toast('Active plan changed');
      ctx.refresh();
    });

    on(root, '[data-new]', 'click', async () => {
      const name = await promptSheet({ title: 'New plan', label: 'Name', placeholder: 'Plan C', confirm: 'Create' });
      if (!name) return;
      const p = await store.createPlan(name);
      ctx.go(`/plan/${p.id}`);
    });

    on(root, '[data-menu]', 'click', async (e, t) => {
      e.stopPropagation();
      const id = t.dataset.menu;
      const p = store.plan(id);
      const choice = await menuSheet(p.name, [
        { label: 'Edit', value: 'edit' },
        { label: 'Make active', value: 'active' },
        { label: 'Duplicate', value: 'dupe' },
        { label: 'Rename', value: 'rename' },
        { label: 'Delete plan', value: 'del', danger: true },
      ]);
      if (choice === 'edit') return ctx.go(`/plan/${id}`);
      if (choice === 'active') { await store.saveSettings({ activePlanId: id }); ctx.refresh(); }
      if (choice === 'dupe') {
        const name = await promptSheet({ title: 'Duplicate plan', label: 'Name', value: `${p.name} copy`, confirm: 'Duplicate' });
        if (name) { await store.duplicatePlan(id, name); toast('Duplicated'); ctx.refresh(); }
      }
      if (choice === 'rename') {
        const name = await promptSheet({ title: 'Rename plan', label: 'Name', value: p.name });
        if (name) { await store.savePlan({ ...p, name }); ctx.refresh(); }
      }
      if (choice === 'del') {
        const ok = await confirmSheet({
          title: `Delete ${p.name}?`,
          message: 'The plan and its workout templates are removed. Workouts you already logged stay in History.',
        });
        if (ok) { await store.deletePlan(id); toast('Plan deleted'); ctx.refresh(); }
      }
    });
  }

  return { title: 'Plans', html, mount };
}
