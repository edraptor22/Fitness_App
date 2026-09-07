/* Goals — the countdown to your target date, body weight, and the reward
   milestones on the way to a goal weight. */

import * as store from '../store.js';
import { esc, on, sheet, toast, menuSheet, confirmSheet, emptyState } from '../ui.js';
import { icon, kindBadge, ring } from '../icons.js';
import { fmtDate, fmtNum, todayISO, num, uid, clamp } from '../util.js';
import { dailyCard, mountDaily } from './eating.js';

export async function render(ctx) {
  const settings = store.state.settings;
  const u = settings.units;
  const events = store.events();
  const next = store.nextEvent();
  const g = store.goal();
  const weights = store.allWeights();
  const today = store.weightOn(todayISO());
  const latest = store.latestWeight();
  const trend = store.weightTrend();

  const tab = ctx.query.get('tab') === 'nutrition' ? 'nutrition' : 'weight';

  const html = `
    ${next ? countdownCard(next, u) : `
      <div class="card card-pad center">
        <div style="color:var(--text-3)">${icon("target", 34)}</div>
        <div style="font-weight:650;margin-top:6px">No target date yet</div>
        <div class="small muted" style="margin:4px 0 12px">
          Set the event you're training for and everything counts down to it.</div>
        <button class="btn primary" data-addevent>Set a target date</button>
      </div>`}

    <div class="pill-tabs">
      <button class="${tab === 'weight' ? 'on' : ''}" data-tab="weight">Body</button>
      <button class="${tab === 'nutrition' ? 'on' : ''}" data-tab="nutrition">Eating</button>
    </div>

    ${tab === 'nutrition' ? nutritionPanel(u) : `
    ${events.length ? `
      <div class="section-title">Target dates</div>
      <div class="card">
        ${events.map((e) => {
          const d = store.daysUntil(e.date);
          return `<div class="row" data-event="${esc(e.id)}">
            <span class="grow">
              <div class="row-title">${esc(e.name)}</div>
              <div class="row-sub">${esc(fmtDate(e.date, { absolute: true }))}</div>
            </span>
            <span class="chip ${d < 0 ? '' : 'accent'} mono">${d < 0 ? 'past' : d === 0 ? 'today' : `${d}d`}</span>
            <button class="ex-menu" data-eventmenu="${esc(e.id)}">${icon('more', 18)}</button>
          </div>`;
        }).join('')}
      </div>
      <div class="btn-row"><button class="btn block" data-addevent>+ Add another date</button></div>` : ''}

    <div class="section-title">Today's weigh-in</div>
    <div class="card">
      <div class="field">
        <label>Weight (${esc(u)})</label>
        <div style="display:flex;gap:8px">
          <input type="number" inputmode="decimal" step="0.1" data-w
            value="${esc(fmtNum(today?.weight))}"
            placeholder="${esc(latest ? fmtNum(latest.weight) : '—')}" style="flex:1">
          <button class="btn primary" data-savew style="flex:none;padding:0 22px">Save</button>
        </div>
      </div>
      ${latest ? `<div class="card-pad tiny dim" style="padding-top:0">
        Last logged ${esc(fmtNum(latest.weight))} ${esc(u)} on ${esc(fmtDate(latest.date))}
        ${trend !== null ? ` · ${trend <= 0 ? '&#8595;' : '&#8593;'} ${esc(fmtNum(Math.abs(Math.round(trend * 10) / 10)))} ${esc(u)}/week` : ''}
      </div>` : ''}
    </div>

    ${g ? goalCard(g, u, next) : `
      <div class="card card-pad center">
        <div style="font-weight:650">No weight goal set</div>
        <div class="small muted" style="margin:4px 0 12px">
          Set a target and break it into milestones, each with a reward.</div>
        <button class="btn primary" data-editgoal>Set a weight goal</button>
      </div>`}

    ${g ? milestonesCard(g, u) : ''}

    ${weights.length >= 2 ? `
      <div class="section-title">Trend</div>
      <div class="card">${weightChart(weights, g?.targetWeight, u)}</div>` : ''}

    ${weights.length ? `
      <div class="section-title">Weigh-ins · ${weights.length}</div>
      <div class="card">
        ${[...weights].reverse().slice(0, 40).map((w) => `
          <div class="row" style="min-height:44px">
            <span class="grow small">${esc(fmtDate(w.date))}</span>
            <span class="mono" style="font-weight:650">${esc(fmtNum(w.weight))} ${esc(u)}</span>
            <button class="ex-menu" data-wmenu="${esc(w.date)}">${icon('more', 18)}</button>
          </div>`).join('')}
      </div>
      <div class="btn-row"><button class="btn block" data-backfill>+ Log another day</button></div>`
      : emptyState('scale', 'No weigh-ins yet', 'Log one above and the trend builds from there.')}
    `}
  `;

  function mount(root) {
    /* ---- weigh-in ---- */
    const saveWeight = async (date, value) => {
      if (!value) return toast('Enter a weight first');
      const { hit } = await store.logWeight(date, value);
      await ctx.refresh();                 // re-render first — it closes sheets
      if (hit.length) celebrate(hit, u);
      else toast('Weight logged');
    };

    on(root, '[data-savew]', 'click', () =>
      saveWeight(todayISO(), num(root.querySelector('[data-w]').value)));

    on(root, '[data-w]', 'keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); root.querySelector('[data-savew]').click(); }
    });

    on(root, '[data-backfill]', 'click', () => {
      sheet({
        title: 'Log a weigh-in',
        body: `
          <div class="field"><label>Date</label>
            <input type="date" name="date" value="${todayISO()}" max="${todayISO()}"></div>
          <div class="field"><label>Weight (${esc(u)})</label>
            <input type="number" inputmode="decimal" step="0.1" name="weight"></div>`,
        confirm: 'Save',
        onConfirm(b) {
          const date = b.querySelector('[name=date]').value;
          const weight = num(b.querySelector('[name=weight]').value);
          if (!date || !weight) return false;
          saveWeight(date, weight);
        },
      });
    });

    on(root, '[data-wmenu]', 'click', async (e, t) => {
      const date = t.dataset.wmenu;
      const choice = await menuSheet(fmtDate(date, { absolute: true }), [
        { label: 'Delete this weigh-in', value: 'del', danger: true },
      ]);
      if (choice === 'del') { await store.deleteWeight(date); toast('Deleted'); ctx.refresh(); }
    });

    /* ---- events ---- */
    on(root, '[data-addevent]', 'click', () => eventSheet(store.newEvent(), ctx));
    on(root, '[data-event]', 'click', (e, t) => {
      if (e.target.closest('[data-eventmenu]')) return;
      eventSheet(store.events().find((x) => x.id === t.dataset.event), ctx);
    });
    on(root, '[data-eventmenu]', 'click', async (e, t) => {
      e.stopPropagation();
      const ev = store.events().find((x) => x.id === t.dataset.eventmenu);
      const choice = await menuSheet(ev.name, [
        { label: 'Edit', value: 'edit' },
        { label: 'Delete', value: 'del', danger: true },
      ]);
      if (choice === 'edit') eventSheet(ev, ctx);
      if (choice === 'del') { await store.deleteEvent(ev.id); toast('Removed'); ctx.refresh(); }
    });

    mountDaily(root, todayISO(), ctx);

    on(root, '[data-tab]', 'click', (e, t) =>
      ctx.go(t.dataset.tab === 'nutrition' ? '/goals?tab=nutrition' : '/goals'));

    /* ---- habits ---- */
    on(root, '[data-addhabit]', 'click', () => habitSheet(store.newHabit(), ctx));
    on(root, '[data-habitrow]', 'click', (e, t) => {
      if (e.target.closest('[data-habitmenu]')) return;
      habitSheet(store.state.habits.get(t.dataset.habitrow), ctx);
    });
    on(root, '[data-habitmenu]', 'click', async (e, t) => {
      e.stopPropagation();
      const h = store.state.habits.get(t.dataset.habitmenu);
      const choice = await menuSheet(h.name, [
        { label: 'Edit', value: 'edit' },
        { label: 'Delete', value: 'del', danger: true },
      ]);
      if (choice === 'edit') return habitSheet(h, ctx);
      if (choice === 'del') {
        const ok = await confirmSheet({
          title: `Delete "${h.name}"?`,
          message: 'Days you already ticked keep their record.',
        });
        if (ok) { await store.deleteHabit(h.id); toast('Deleted'); ctx.refresh(); }
      }
    });

    /* ---- goal ---- */
    on(root, '[data-editgoal]', 'click', () => goalSheet(ctx, u));

    on(root, '[data-ms]', 'input', (e, t) => {
      const goal = store.goal();
      const m = goal.milestones.find((x) => x.id === t.dataset.ms);
      if (!m) return;
      m[t.dataset.field] = t.dataset.field === 'weight' ? num(t.value) : t.value;
      store.saveGoal({ ...goal });
    });

    on(root, '[data-msmenu]', 'click', async (e, t) => {
      const goal = store.goal();
      const m = goal.milestones.find((x) => x.id === t.dataset.msmenu);
      const choice = await menuSheet(`${fmtNum(m.weight)} ${u}`, [
        { label: m.hitDate ? 'Mark not reached' : 'Mark reached', value: 'toggle' },
        { label: 'Delete milestone', value: 'del', danger: true },
      ]);
      if (choice === 'toggle') {
        m.hitDate = m.hitDate ? null : todayISO();
        await store.saveGoal({ ...goal });
        ctx.refresh();
      }
      if (choice === 'del') {
        goal.milestones = goal.milestones.filter((x) => x.id !== m.id);
        await store.saveGoal({ ...goal });
        ctx.refresh();
      }
    });

    on(root, '[data-addms]', 'click', async () => {
      const goal = store.goal();
      goal.milestones = [...(goal.milestones || []),
        { id: uid('ms'), weight: goal.targetWeight, reward: '', hitDate: null }];
      await store.saveGoal({ ...goal });
      ctx.refresh();
    });

    on(root, '[data-genms]', 'click', () => generateSheet(ctx, u));
  }

  return {
    title: 'Goals',
    subtitle: next ? `${Math.max(0, store.daysUntil(next.date))} days to ${next.name}` : '',
    html,
    mount,
  };
}

/* ------------------------------------------------------------- nutrition */

function nutritionPanel() {
  const habits = store.allHabits();
  const today = dailyCard(todayISO(), { heading: false });
  const win = store.nutritionWindow();
  const triggers = store.triggerCounts();
  const pct = win.total ? win.onPlan / win.total : 0;
  const worst = triggers[0];

  return `
    <div class="section-title">Today</div>
    ${today || '<div class="card card-pad muted small">Add a habit below to start ticking days off.</div>'}

    <div class="section-title">Last 30 days at a glance</div>
    <div class="card card-pad">
      <div class="ring-row">
        ${ring(pct, { value: String(win.onPlan), label: 'on plan', tone: 'good' })}
        ${ring(win.total ? win.wobbly / win.total : 0, { value: String(win.wobbly), label: 'wobbly', tone: 'plyo' })}
        ${ring(win.total ? win.off / win.total : 0, { value: String(win.off), label: 'off', tone: 'lift' })}
      </div>
      <div class="tiny dim center" style="margin-top:12px">Last ${win.total} days${
        win.logged < win.total ? ` · ${win.total - win.logged} not rated` : ''}</div>
    </div>

    <div class="section-title">Last 30 days</div>
    <div class="card card-pad">
      <div class="daygrid">
        ${win.days.map((d) => `<i class="dg dg-${d.rating || 'none'}" title="${esc(d.date)}"></i>`).join('')}
      </div>
      <div class="daygrid-key tiny dim">
        <span><i class="dg dg-on"></i> on plan</span>
        <span><i class="dg dg-wobbly"></i> wobbly</span>
        <span><i class="dg dg-off"></i> off</span>
        <span><i class="dg dg-none"></i> not rated</span>
      </div>
    </div>

    ${triggers.length ? `
      <div class="section-title">What derails it · last 6 weeks</div>
      <div class="card card-pad">
        ${triggers.slice(0, 6).map((t) => `
          <div style="margin-bottom:9px">
            <div style="display:flex;justify-content:space-between;font-size:13.5px">
              <span style="font-weight:600">${esc(t.label)}</span>
              <span class="mono muted">${t.count}</span>
            </div>
            <div class="meter"><i style="width:${(t.count / triggers[0].count * 100).toFixed(0)}%"></i></div>
          </div>`).join('')}
        ${worst && worst.count >= 3 ? `<div class="tiny dim" style="margin-top:2px">
          <b>${esc(worst.label)}</b> is your most common one. That's the one worth
          building a rule around, rather than relying on willpower in the moment.</div>` : ''}
      </div>`
      : `<div class="card card-pad tiny dim">
          Tag a rough day on Today and the pattern shows up here after a few weeks.
        </div>`}

    <div class="section-title">Edit your non-negotiables</div>
    <div class="card">
      ${habits.length ? habits.map((h) => `
        <div class="row" data-habitrow="${esc(h.id)}">
          <span class="grow">
            <div class="row-title">${esc(h.name)}</div>
            ${h.note ? `<div class="row-sub tight tiny dim">${esc(h.note)}</div>` : ''}
          </span>
          <button class="ex-menu" data-habitmenu="${esc(h.id)}">${icon('more', 18)}</button>
        </div>`).join('')
        : '<div class="card-pad muted small">No habits yet.</div>'}
    </div>
    <div class="btn-row"><button class="btn block" data-addhabit>+ Add a habit</button></div>

    <div class="card card-pad tiny dim">
      Nothing here is counted, and none of it is ever offset against training.
      Workouts and eating are tracked separately on purpose.
    </div>`;
}

function habitSheet(h, ctx) {
  if (!h) return;
  sheet({
    title: h.name ? 'Edit habit' : 'New habit',
    body: `
      <div class="field"><label>The habit</label>
        <input type="text" name="name" value="${esc(h.name)}"
          placeholder="Kitchen closed after 6:30pm" autocapitalize="sentences"></div>
      <div class="field"><label>Note (optional)</label>
        <input type="text" name="note" value="${esc(h.note || '')}"
          placeholder="What it actually means on a hard day" autocapitalize="sentences"></div>
      <div class="card-pad tiny dim">Keep it a yes-or-no behaviour. Anything you'd
        have to measure belongs in a different app.</div>`,
    confirm: 'Save',
    onMount(b) { setTimeout(() => b.querySelector('[name=name]')?.focus(), 60); },
    onConfirm(b) {
      const name = b.querySelector('[name=name]').value.trim();
      if (!name) return false;
      store.saveHabit({ ...h, name, note: b.querySelector('[name=note]').value.trim() })
        .then(() => ctx.refresh());
    },
  });
}

/* ------------------------------------------------------------- countdown */

function countdownCard(ev, u) {
  const p = store.eventProgress(ev);
  const days = Math.max(0, p.daysLeft);
  const past = p.daysLeft < 0;

  return `
    <div class="card hero" data-event="${esc(ev.id)}">
      <div class="hero-label">${past ? 'Was' : 'Counting down to'}</div>
      <div class="hero-title">${esc(ev.name)}</div>
      <div class="hero-number mono">${past ? '—' : days}</div>
      <div class="hero-label">${past ? esc(fmtDate(ev.date, { absolute: true }))
        : `${days === 1 ? 'day' : 'days'} · ${esc(fmtDate(ev.date, { absolute: true }))}`}</div>
      ${!past ? `
        <div class="meter" style="margin:12px 0 8px"><i style="width:${(p.pct * 100).toFixed(1)}%"></i></div>
        <div class="hero-stats">
          <div><b class="mono">${p.weeksLeft}</b><span>weeks left</span></div>
          <div><b class="mono">${p.sessionsDone}</b><span>sessions done</span></div>
          ${p.perWeek ? `<div><b class="mono">~${p.sessionsLeft}</b><span>workouts left</span></div>` : ''}
        </div>` : ''}
    </div>`;
}

function eventSheet(ev, ctx) {
  if (!ev) return;
  sheet({
    title: ev.name ? 'Edit target date' : 'Target date',
    body: `
      <div class="field"><label>What are you training for?</label>
        <input type="text" name="name" value="${esc(ev.name)}"
          placeholder="Work Classic hockey tournament" autocapitalize="words"></div>
      <div class="field"><label>Date</label>
        <input type="date" name="date" value="${esc(ev.date)}"></div>`,
    confirm: 'Save',
    onMount(b) { setTimeout(() => b.querySelector('[name=name]')?.focus(), 60); },
    onConfirm(b) {
      const name = b.querySelector('[name=name]').value.trim();
      const date = b.querySelector('[name=date]').value;
      if (!name || !date) return false;
      store.saveEvent({ ...ev, name, date }).then(() => ctx.refresh());
    },
  });
}

/* ------------------------------------------------------------ weight goal */

function goalCard(g, u, nextEvent) {
  const latest = store.latestWeight();
  const cur = latest?.weight;
  const pct = store.goalProgress(g) * 100;
  const left = store.remainingToGoal(g);
  const dir = store.goalDirection(g);
  const trend = store.weightTrend();

  // Pace needed to land on the goal by the target date.
  let pace = '';
  const deadline = g.targetDate || nextEvent?.date;
  if (deadline && left !== null && left > 0) {
    const weeks = store.daysUntil(deadline) / 7;
    if (weeks > 0.5) {
      const need = left / weeks;
      const actual = trend === null ? null : Math.abs(trend);
      const onTrack = actual !== null && trend !== null
        && ((dir === 'lose' && trend < 0) || (dir === 'gain' && trend > 0))
        && actual >= need * 0.85;
      pace = `<div class="card-pad tiny ${onTrack ? '' : 'dim'}" style="padding-top:0;${onTrack ? 'color:var(--good)' : ''}">
        ${fmtNum(Math.round(need * 10) / 10)} ${esc(u)}/week to hit it by ${esc(fmtDate(deadline, { absolute: true, weekday: false }))}${
          actual !== null ? ` · you're at ${fmtNum(Math.round(actual * 10) / 10)}` : ''}${onTrack ? ' ' + icon('check', 13) : ''}
      </div>`;
    }
  }

  return `
    <div class="section-title">Weight goal</div>
    <div class="card">
      <div class="card-pad" style="padding-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span class="mono" style="font-size:26px;font-weight:700">${cur !== undefined ? esc(fmtNum(cur)) : '—'}
            <span style="font-size:14px;font-weight:600;color:var(--text-3)">${esc(u)}</span></span>
          <span class="small muted">goal <b class="mono" style="color:var(--text)">${esc(fmtNum(g.targetWeight))} ${esc(u)}</b></span>
        </div>
        <div class="meter" style="margin-top:8px"><i class="${pct >= 100 ? 'full' : ''}" style="width:${clamp(pct, 0, 100).toFixed(1)}%"></i></div>
        <div class="tiny dim" style="margin-top:6px">
          Started at ${esc(fmtNum(g.startWeight))} ${esc(u)}${
            left !== null ? ` · ${esc(fmtNum(Math.round(left * 10) / 10))} ${esc(u)} to go` : ''}
        </div>
      </div>
      ${pace}
      <button class="row" data-editgoal><span class="grow row-title small">Edit goal</span><span class="chev">${icon('chevron', 18)}</span></button>
    </div>`;
}

function goalSheet(ctx, u) {
  const g = store.goal();
  const latest = store.latestWeight();
  sheet({
    title: g ? 'Edit weight goal' : 'Set a weight goal',
    body: `
      <div class="field"><label>Starting weight (${esc(u)})</label>
        <input type="number" inputmode="decimal" step="0.1" name="start"
          value="${esc(fmtNum(g?.startWeight ?? latest?.weight ?? ''))}"></div>
      <div class="field"><label>Goal weight (${esc(u)})</label>
        <input type="number" inputmode="decimal" step="0.1" name="target"
          value="${esc(fmtNum(g?.targetWeight ?? ''))}"></div>
      <div class="field"><label>Hit it by (optional)</label>
        <input type="date" name="targetDate" value="${esc(g?.targetDate || '')}">
        <div class="tiny dim" style="margin-top:4px">Leave blank to use your next target date.</div></div>
      ${g ? `<div class="card-pad"><button class="btn danger block" data-cleargoal>Remove goal</button></div>` : ''}`,
    confirm: 'Save',
    onMount(b, close) {
      on(b, '[data-cleargoal]', 'click', async () => {
        const ok = await confirmSheet({ title: 'Remove weight goal?', message: 'Milestones and rewards go with it. Weigh-ins are kept.' });
        if (ok) { await store.saveGoal(null); ctx.refresh(); }
      });
    },
    onConfirm(b) {
      const start = num(b.querySelector('[name=start]').value);
      const target = num(b.querySelector('[name=target]').value);
      const targetDate = b.querySelector('[name=targetDate]').value || null;
      if (!start || !target) { toast('Enter both weights'); return false; }
      if (start === target) { toast('Goal matches your starting weight'); return false; }
      const prev = store.goal();
      store.saveGoal({
        startWeight: start,
        targetWeight: target,
        targetDate,
        startDate: prev?.startDate || todayISO(),
        milestones: prev?.milestones || [],
      }).then(() => ctx.refresh());
    },
  });
}

/* ------------------------------------------------------------ milestones */

function milestonesCard(g, u) {
  const list = store.sortedMilestones(g);
  return `
    <div class="section-title">Milestones &amp; rewards</div>
    <div class="card">
      ${list.length ? list.map((m) => `
        <div class="ms-row ${m.hitDate ? 'hit' : ''}">
          <span class="ms-mark">${m.hitDate ? icon('check', 16) : '<i class="dot"></i>'}</span>
          <input type="number" inputmode="decimal" step="0.1" class="ms-weight"
            data-ms="${esc(m.id)}" data-field="weight" value="${esc(fmtNum(m.weight))}">
          <span class="tiny dim" style="flex:none">${esc(u)}</span>
          <input type="text" class="ms-reward" data-ms="${esc(m.id)}" data-field="reward"
            value="${esc(m.reward || '')}" placeholder="Reward…" autocapitalize="sentences">
          <button class="ex-menu" data-msmenu="${esc(m.id)}">${icon('more', 18)}</button>
        </div>
        ${m.hitDate ? `<div class="tiny" style="color:var(--good);padding:0 14px 8px 40px">Reached ${esc(fmtDate(m.hitDate))}</div>` : ''}
      `).join('')
        : '<div class="card-pad muted small">No milestones yet. Generate a set, or add them one at a time.</div>'}
      <div class="set-foot">
        <button class="btn" data-genms>Generate</button>
        <button class="btn" data-addms>+ Milestone</button>
      </div>
    </div>`;
}

function generateSheet(ctx, u) {
  const g = store.goal();
  const span = Math.abs(g.targetWeight - g.startWeight);
  sheet({
    title: 'Generate milestones',
    body: `
      <div class="card-pad small muted">Evenly spaced between ${fmtNum(g.startWeight)} and
        ${fmtNum(g.targetWeight)} ${esc(u)}. This replaces the current list — add your rewards after.</div>
      <div class="field"><label>Every how many ${esc(u)}?</label>
        <input type="number" inputmode="decimal" step="0.5" name="step" value="${span >= 20 ? 5 : span >= 8 ? 2 : 1}"></div>`,
    confirm: 'Generate',
    onConfirm(b) {
      const step = num(b.querySelector('[name=step]').value);
      if (!step) return false;
      const milestones = store.generateMilestones(g, step);
      if (!milestones.length) { toast('That step is bigger than the gap'); return false; }
      store.saveGoal({ ...g, milestones }).then(() => { toast(`${milestones.length} milestones`); ctx.refresh(); });
    },
  });
}

export function celebrate(hit, u) {
  const m = hit[hit.length - 1];
  sheet({
    title: 'Milestone reached',
    body: `<div class="card-pad center">
      <div style="color:var(--accent)">${icon("gift", 46)}</div>
      <div style="font-size:22px;font-weight:700;margin-top:6px" class="mono">${esc(fmtNum(m.weight))} ${esc(u)}</div>
      ${m.reward
        ? `<div class="small muted" style="margin-top:10px">Your reward</div>
           <div style="font-size:17px;font-weight:600;margin-top:2px">${esc(m.reward)}</div>`
        : `<div class="small muted" style="margin-top:10px">No reward set for this one.</div>`}
      ${hit.length > 1 ? `<div class="tiny dim" style="margin-top:10px">+${hit.length - 1} more passed in one go</div>` : ''}
    </div>`,
    confirm: 'Nice',
  });
}

/* ----------------------------------------------------------- weight chart */

function weightChart(weights, target, u) {
  const pts = weights.slice(-60);
  const W = 300, H = 110, PAD = 8;

  const vals = pts.map((p) => p.weight);
  if (target !== undefined && target !== null) vals.push(target);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(hi - lo, 1);

  const x = (i) => PAD + (i / Math.max(1, pts.length - 1)) * (W - PAD * 2);
  const y = (v) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);

  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${H - PAD} ${line} ${x(pts.length - 1).toFixed(1)},${H - PAD}`;
  const last = pts[pts.length - 1];

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="130" preserveAspectRatio="none" role="img"
      aria-label="Body weight trend">
      <defs>
        <linearGradient id="wfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${target !== undefined && target !== null ? `
        <line x1="${PAD}" y1="${y(target).toFixed(1)}" x2="${W - PAD}" y2="${y(target).toFixed(1)}"
          stroke="var(--good)" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>` : ''}
      <polygon points="${area}" fill="url(#wfill)"/>
      <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last.weight).toFixed(1)}" r="3.5" fill="var(--accent)"/>
    </svg>
    <div class="spark-labels" style="padding-bottom:12px">
      <div style="text-align:left">${esc(fmtDate(pts[0].date, { absolute: true, weekday: false }))}</div>
      <div style="text-align:center">${esc(fmtNum(lo))}–${esc(fmtNum(hi))} ${esc(u)}</div>
      <div style="text-align:right">${esc(fmtDate(last.date, { absolute: true, weekday: false }))}</div>
    </div>`;
}
