/* The daily eating card: habit check-offs, the day rating, and the trigger
   prompt. Shared by Today and by Goals → Eating so the controls are wherever
   you happen to look for them. */

import * as store from '../store.js';
import { esc, on, sheet } from '../ui.js';
import { icon } from '../icons.js';
import { todayISO } from '../util.js';

/** Check-offs + rating for one day. Returns '' when there's nothing to show. */
export function dailyCard(date, { heading = true } = {}) {
  const habits = store.allHabits();
  const rec = store.nutritionOn(date);
  const { done, total } = store.habitsDoneOn(date);
  const win = store.nutritionWindow(date);
  if (!habits.length && !rec.rating) return '';

  return `
    ${heading ? `<div class="section-title">Eating${total ? ` · ${done}/${total}` : ''}</div>` : ''}
    <div class="card">
      ${habits.map((h) => `
        <div class="row hb-row" data-habit="${esc(h.id)}">
          <button class="tick ${rec.checked[h.id] ? 'on' : ''}" aria-label="Mark done">${icon('check', 22)}</button>
          <span class="grow">
            <div class="row-title ${rec.checked[h.id] ? 'strike' : ''}">${esc(h.name)}</div>
            ${h.note ? `<div class="row-sub tight tiny dim">${esc(h.note)}</div>` : ''}
          </span>
        </div>`).join('')}

      <div class="rate-block">
        <div class="tiny dim" style="margin-bottom:7px">How did today go?</div>
        <div class="rate-row">
          ${store.RATINGS.map((r) => `
            <button class="rate ${rec.rating === r.id ? 'on tone-' + r.tone : ''}" data-rate="${r.id}">
              ${esc(r.label)}</button>`).join('')}
        </div>
        ${rec.rating && rec.rating !== 'on' && rec.triggers?.length ? `
          <div class="chip-scroll" style="padding:10px 0 0">
            ${rec.triggers.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}
            <button class="chip" data-edittrig>Edit</button>
          </div>` : ''}
        ${rec.rating && rec.rating !== 'on' && !rec.triggers?.length ? `
          <button class="chip" data-edittrig style="margin-top:10px">+ What was going on?</button>` : ''}
        ${win.logged >= 3 ? `<div class="tiny dim" style="margin-top:9px">
          ${win.onPlan} of the last ${win.total} days on plan</div>` : ''}
      </div>
    </div>`;
}

/** Wire the card up. Safe to call on a view that doesn't contain one. */
export function mountDaily(root, date, ctx) {
  on(root, '[data-habit]', 'click', async (e, t) => {
    await store.toggleHabit(date, t.dataset.habit);
    ctx.refresh();
  });

  on(root, '[data-rate]', 'click', async (e, t) => {
    const wanted = t.dataset.rate;
    const was = store.nutritionOn(date).rating;
    await store.setRating(date, wanted);
    await ctx.refresh();
    // Newly marked as a rough day — say the thing, then ask what happened.
    if (was !== wanted && wanted !== 'on') triggerSheet(date, ctx);
  });

  on(root, '[data-edittrig]', 'click', () => triggerSheet(date, ctx));
}

/**
 * Shown when a day is rated wobbly or off. Leads with the point of the whole
 * feature — you cannot train your way out of it, and trying is the loop —
 * then collects the trigger, which is the part worth having in six weeks.
 */
export function triggerSheet(date = todayISO(), ctx) {
  const rec = store.nutritionOn(date);
  const picked = new Set(rec.triggers || []);

  sheet({
    title: 'What was going on?',
    body: `
      <div class="reset-note">
        <div class="reset-title">That's one day.</div>
        It doesn't undo the work, and it can't be cancelled out by training
        harder tomorrow — that trade is the loop, not the fix. Next normal meal,
        carry on.
      </div>
      <div class="card-pad tiny dim" style="padding-bottom:4px">
        Tag it and the pattern shows up over a few weeks. Skip it if you'd rather not.
      </div>
      <div class="trig-wrap">
        ${store.TRIGGERS.map((t) => `
          <button class="trig ${picked.has(t) ? 'on' : ''}" data-trig="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <div class="field"><label>Anything worth remembering?</label>
        <textarea data-tnote placeholder="Optional">${esc(rec.note || '')}</textarea></div>`,
    confirm: 'Save',
    onMount(b) {
      on(b, '[data-trig]', 'click', (e, t) => {
        const v = t.dataset.trig;
        picked.has(v) ? picked.delete(v) : picked.add(v);
        t.classList.toggle('on');
      });
    },
    onConfirm(b) {
      store.setTriggers(date, [...picked], b.querySelector('[data-tnote]').value.trim())
        .then(() => ctx.refresh());
    },
  });
}
