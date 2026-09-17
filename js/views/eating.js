/* The daily eating card: habit check-offs, the day rating, and the trigger
   prompt. Shared by Today and by Goals → Eating so the controls are wherever
   you happen to look for them. */

import * as store from '../store.js';
import { esc, on, sheet, toast } from '../ui.js';
import { icon } from '../icons.js';
import { todayISO } from '../util.js';

/** Check-offs + rating for one day. Returns '' when there's nothing to show. */
export function dailyCard(date, { heading = true, grid = false } = {}) {
  const habits = store.allHabits();
  const rec = store.nutritionOn(date);
  const { done, total } = store.habitsDoneOn(date);
  const win = store.nutritionWindow(date);
  if (!habits.length && !rec.rating) return '';

  return `
    ${heading ? `<div class="section-title">Eating${total ? ` · ${done}/${total}` : ''}</div>` : ''}
    ${urgeCard(date)}
    <div class="card">
      ${habits.map((h) => habitRow(h, date, rec)).join('')}

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
      ${grid ? `<div class="grid-block">${dayGrid(date)}</div>` : ''}
    </div>`;
}

/** A habit row — plus its sequence, once the hour has come round. */
function habitRow(h, date, rec) {
  const stepsDone = store.habitStepsDone(date, h);
  const unfolded = store.habitUnfolded(date, h);
  const ticked = !!rec.checked[h.id];

  return `
    <div class="row hb-row" data-habit="${esc(h.id)}">
      <button class="tick ${ticked ? 'on' : ''}" aria-label="Mark done">${icon('check', 22)}</button>
      <span class="grow">
        <div class="row-title ${ticked ? 'strike' : ''}">${esc(h.name)}</div>
        ${h.note ? `<div class="row-sub tight tiny dim">${esc(h.note)}</div>` : ''}
      </span>
      ${stepsDone ? `<span class="chip ${stepsDone.done === stepsDone.total ? 'done' : ''}">${stepsDone.done}/${stepsDone.total}</span>` : ''}
    </div>
    ${h.steps?.length ? `<div class="steps ${unfolded ? '' : 'folded'}">
      ${unfolded
        ? h.steps.map((label, i) => {
            const on = !!rec.checked[`${h.id}#${i}`];
            return `<button class="step ${on ? 'on' : ''}" data-habit-step="${esc(h.id)}" data-i="${i}">
              <i></i><span>${esc(label)}</span></button>`;
          }).join('')
        : `<div class="tiny dim" style="padding:2px 0 2px 54px">Unfolds at ${esc(h.after)}</div>`}
    </div>` : ''}`;
}

/** 30-day rating strip, oldest to newest. Shared by Today and Goals. */
export function dayGrid(date = todayISO()) {
  const win = store.nutritionWindow(date);
  return `
    <div class="daygrid">
      ${win.days.map((d) => `<i class="dg dg-${d.rating || 'none'}" title="${esc(d.date)}"></i>`).join('')}
    </div>
    <div class="daygrid-key tiny dim">
      <span><i class="dg dg-on"></i> on plan ${win.onPlan}</span>
      <span><i class="dg dg-wobbly"></i> wobbly ${win.wobbly}</span>
      <span><i class="dg dg-off"></i> off ${win.off}</span>
      <span><i class="dg dg-none"></i> not rated ${win.total - win.logged}</span>
    </div>`;
}

/* ----------------------------------------------------------------- urges */

/**
 * The button, or — if a wait is running — the countdown and the three
 * outcomes. Rendered on Today above the habits, because it's the thing you
 * reach for at the moment it matters.
 */
export function urgeCard(date) {
  if (date !== todayISO()) return '';
  const pending = store.pendingUrge();
  if (!pending) {
    return `<button class="btn urge-btn block" data-urge-start>
      ${icon('flame', 18)} I want to eat</button>`;
  }

  const trig = store.urgeTrigger(pending.trigger);
  const left = store.waitRemaining(pending);
  const up = left === 0;

  return `
    <div class="card urge-live">
      <div class="urge-head">
        <div class="grow">
          <div class="hero-label">${up ? 'Time’s up' : 'Sit with it'}</div>
          <div style="font-weight:700;font-size:16px;margin-top:2px">
            ${trig ? esc(trig.label) : 'Urge'}${trig ? ` · wants ${esc(trig.wants)}` : ''}</div>
        </div>
        <div class="urge-clock mono ${up ? 'up' : ''}" data-urge-clock
          data-until="${esc(pending.waitUntil || '')}">${fmtClock(left)}</div>
      </div>
      ${trig ? `<div class="urge-suggest">${trig.suggest.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
      <div class="urge-outcomes">
        ${store.URGE_OUTCOMES.map((o) => `
          <button class="btn" data-urge-out="${o.id}" data-urge-id="${esc(pending.id)}">${esc(o.label)}</button>`).join('')}
      </div>
      <button class="row urge-cancel" data-urge-cancel="${esc(pending.id)}">
        <span class="grow tiny dim">Never mind — remove this</span></button>
    </div>`;
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** One sheet that walks the steps, so nothing can close mid-flow. */
function urgeSheet(date, ctx) {
  const s = sheet({ title: 'Before you eat', body: '<div data-step></div>' });
  const slot = s.body.querySelector('[data-step]');

  const askHunger = () => {
    slot.innerHTML = `
      <div class="card-pad" style="padding-bottom:6px">
        <div style="font-size:17px;font-weight:650;line-height:1.35">
          Are you physically hungry, or do you want to eat?</div>
        <div class="small muted" style="margin-top:6px">
          Both are fine answers. The point is to notice which one it is.</div>
      </div>
      <div class="card" style="margin:6px 12px 12px">
        <button class="row" data-h="1"><span class="grow row-title">I'm actually hungry</span>
          <span class="chev">${icon('chevron', 18)}</span></button>
        <button class="row" data-h="0"><span class="grow row-title">I want to eat</span>
          <span class="chev">${icon('chevron', 18)}</span></button>
      </div>`;
    on(slot, '[data-h]', 'click', async (e, t) => {
      if (t.dataset.h === '1') {
        await store.startUrge({ hungry: true, date });
        s.close();
        toast('Then eat — properly, sitting down');
        ctx.refresh();
      } else {
        askTrigger();
      }
    });
  };

  const askTrigger = () => {
    slot.innerHTML = `
      <div class="card-pad" style="padding-bottom:6px">
        <div style="font-size:17px;font-weight:650">What's driving it?</div>
      </div>
      <div class="card" style="margin:6px 12px 12px">
        ${store.URGE_TRIGGERS.map((t) => `
          <button class="row" data-t="${t.id}">
            <span class="grow"><div class="row-title">${esc(t.label)}</div>
            <div class="row-sub tight tiny dim">wants ${esc(t.wants)}</div></span>
            <span class="chev">${icon('chevron', 18)}</span></button>`).join('')}
      </div>`;
    on(slot, '[data-t]', 'click', async (e, t) => {
      const trig = store.urgeTrigger(t.dataset.t);
      await store.startUrge({ hungry: false, trigger: trig.id, date });
      showWait(trig);
    });
  };

  const showWait = (trig) => {
    slot.innerHTML = `
      <div class="card-pad center">
        <div class="hero-label">Ten minutes</div>
        <div style="font-size:17px;font-weight:650;margin:6px 0 2px">
          Your brain wants ${esc(trig.wants)}</div>
        <div class="small muted">Not deciding now. Just not deciding yet.</div>
      </div>
      <div class="card" style="margin:6px 12px 10px">
        ${trig.suggest.map((x) => `<div class="row" style="min-height:44px">
          <span class="grow small">${esc(x)}</span></div>`).join('')}
      </div>
      <div class="reset-note" style="margin-bottom:14px">
        If you still want it in ten minutes, have it — portioned, sitting down,
        no guilt. That's a win too. The loop you're breaking is the one where
        you never got to choose.
      </div>`;
    setTimeout(() => { s.close(); ctx.refresh(); }, 2600);
  };

  askHunger();
}

/** Wire the card up. Safe to call on a view that doesn't contain one. */
export function mountDaily(root, date, ctx) {
  on(root, '[data-urge-start]', 'click', () => urgeSheet(date, ctx));

  on(root, '[data-urge-out]', 'click', async (e, t) => {
    await store.resolveUrge(t.dataset.urgeId, t.dataset.urgeOut);
    await ctx.refresh();
    toast(t.dataset.urgeOut === 'automatic'
      ? 'Logged. Next normal meal, carry on.'
      : 'That was a decision. Logged.');
  });

  on(root, '[data-urge-cancel]', 'click', async (e, t) => {
    await store.deleteUrge(t.dataset.urgeCancel);
    ctx.refresh();
  });

  // Live countdown without re-rendering the whole view.
  const clock = root.querySelector('[data-urge-clock]');
  if (clock?.dataset.until) {
    const tick = () => {
      if (!clock.isConnected) return clearInterval(id);
      const left = Math.max(0, Math.round((new Date(clock.dataset.until) - Date.now()) / 1000));
      clock.textContent = fmtClock(left);
      if (left === 0) { clock.classList.add('up'); clearInterval(id); }
    };
    const id = setInterval(tick, 1000);
    tick();
  }

  on(root, '[data-habit-step]', 'click', async (e, t) => {
    e.stopPropagation();
    await store.toggleHabitStep(date, t.dataset.habitStep, Number(t.dataset.i));
    ctx.refresh();
  });

  on(root, '[data-habit]', 'click', async (e, t) => {
    if (e.target.closest('[data-habit-step]')) return;
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
