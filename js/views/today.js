/* Today — the home screen. Date strip, weekly targets, what's scheduled,
   what's already logged, and a fast way to add anything extra. */

import * as store from '../store.js';
import { esc, on, sheet, toast, emptyState, menuSheet } from '../ui.js';
import {
  todayISO, addDays, fmtDate, fmtNum, KIND_LABEL, KIND_ORDER, weekDates, dowOf, DOW_SHORT, pluralize,
} from '../util.js';

export async function render(ctx) {
  const date = ctx.query.get('d') || todayISO();
  const s = store.state.settings;
  const plan = store.activePlan();
  const scheduled = store.scheduledFor(date);
  const sessions = store.sessionsOn(date);
  const progress = store.weeklyProgress(date);

  const scheduledIds = new Set(scheduled.map((w) => w.id));
  const extras = sessions.filter((x) => !x.workoutId || !scheduledIds.has(x.workoutId));

  const html = `
    ${dateStrip(date, s.weekStartsOn)}
    ${weekCard(progress, date)}

    <div class="section-title">${plan ? esc(plan.name) : 'No plan selected'} · ${esc(fmtDate(date))}</div>
    <div class="card">
      ${scheduled.length
        ? scheduled.map((w) => workoutRow(w, sessions)).join('')
        : `<div class="card-pad muted small">Nothing scheduled${plan ? '' : ' — pick a plan in the Plans tab'}. Rest day, or add something below.</div>`}
    </div>

    ${extras.length ? `
      <div class="section-title">Also logged</div>
      <div class="card">${extras.map((x) => sessionRow(x)).join('')}</div>` : ''}

    <div class="btn-row">
      <button class="btn primary" data-add>+ Add workout</button>
    </div>

    ${sessions.length === 0 && scheduled.length === 0
      ? emptyState('&#128170;', 'Nothing here yet', 'Add a workout, or set up a plan in the Plans tab.')
      : ''}
  `;

  function mount(root) {
    on(root, '[data-day]', 'click', (e, t) => ctx.go(`/today?d=${t.dataset.day}`));
    on(root, '[data-jump]', 'click', (e, t) => ctx.go(`/today?d=${t.dataset.jump}`));
    on(root, '[data-add]', 'click', () => addSheet(date, ctx));

    // Whole-row tap: start, resume, or open a logged session.
    on(root, '[data-wo]', 'click', async (e, t) => {
      if (e.target.closest('[data-tick]')) return;
      const w = store.workout(t.dataset.wo);
      const existing = sessions.find((x) => x.workoutId === w.id);
      if (existing) return ctx.go(`/session/${existing.id}`);
      const created = await store.startSession({ workoutTemplate: w, date });
      ctx.go(`/session/${created.id}`);
    });

    on(root, '[data-open]', 'click', (e, t) => ctx.go(`/session/${t.dataset.open}`));

    // One-tap complete for checkbox-style workouts (mobility, walks, …).
    on(root, '[data-tick]', 'click', async (e, t) => {
      e.stopPropagation();
      const w = store.workout(t.dataset.tick);
      const existing = sessions.find((x) => x.workoutId === w.id);
      if (existing) {
        if (existing.status === 'done') {
          await store.deleteSession(existing.id);
          toast('Unmarked');
        } else {
          await store.saveSession({ ...existing, status: 'done', done: true, completedAt: new Date().toISOString() });
          toast('Done');
        }
      } else {
        const created = await store.startSession({ workoutTemplate: w, date });
        await store.saveSession({ ...created, status: 'done', done: true, completedAt: new Date().toISOString() });
        toast('Done');
      }
      ctx.refresh();
    });

    on(root, '[data-sess-menu]', 'click', async (e, t) => {
      e.stopPropagation();
      const id = t.dataset.sessMenu;
      const choice = await menuSheet(store.session(id)?.name || 'Session', [
        { label: 'Open', value: 'open' },
        { label: 'Delete', value: 'del', danger: true },
      ]);
      if (choice === 'open') ctx.go(`/session/${id}`);
      if (choice === 'del') { await store.deleteSession(id); toast('Deleted'); ctx.refresh(); }
    });
  }

  return {
    title: fmtDate(date),
    subtitle: plan ? plan.name : '',
    html,
    mount,
  };
}

/* --------------------------------------------------------------- pieces */

function dateStrip(date, weekStartsOn) {
  const days = weekDates(date, weekStartsOn);
  const t = todayISO();
  return `
    <div class="card" style="padding:8px 6px 10px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 8px 8px">
        <button class="btn ghost" data-jump="${addDays(date, -7)}" style="min-height:32px;padding:0 8px">&#8249; Week</button>
        ${date !== t ? `<button class="btn ghost" data-jump="${t}" style="min-height:32px">Today</button>` : '<span class="tiny dim">This week</span>'}
        <button class="btn ghost" data-jump="${addDays(date, 7)}" style="min-height:32px;padding:0 8px">Week &#8250;</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">
        ${days.map((d) => {
          const done = store.sessionsOn(d).some((x) => x.status === 'done');
          const sel = d === date;
          const isToday = d === t;
          return `<button data-day="${d}" style="
            display:flex;flex-direction:column;align-items:center;gap:3px;
            padding:6px 0;border:0;border-radius:10px;background:${sel ? 'var(--accent)' : 'transparent'};
            color:${sel ? 'var(--accent-ink)' : (isToday ? 'var(--accent)' : 'var(--text-2)')};">
            <span style="font-size:10.5px;font-weight:650;opacity:.75">${DOW_SHORT[dowOf(d)]}</span>
            <span style="font-size:15px;font-weight:650;font-variant-numeric:tabular-nums">${Number(d.slice(-2))}</span>
            <span style="width:5px;height:5px;border-radius:50%;background:${done ? (sel ? 'var(--accent-ink)' : 'var(--good)') : 'transparent'}"></span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

function weekCard(progress, date) {
  const rows = progress
    .filter((p) => p.target > 0 || p.done > 0)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  if (!rows.length) return '';
  const { volume } = store.weekSummary(date);
  return `
    <div class="section-title">This week</div>
    <div class="card card-pad">
      ${rows.map((p) => {
        const pct = p.target ? Math.min(100, (p.done / p.target) * 100) : 100;
        const full = p.target && p.done >= p.target;
        return `<div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:13.5px">
            <span style="font-weight:600">${esc(KIND_LABEL[p.kind] || p.kind)}</span>
            <span class="mono ${full ? '' : 'muted'}" style="${full ? 'color:var(--good);font-weight:650' : ''}">
              ${p.done}${p.target ? ` / ${p.target}` : ''}
            </span>
          </div>
          <div class="meter"><i class="${full ? 'full' : ''}" style="width:${pct}%"></i></div>
        </div>`;
      }).join('')}
      ${volume > 0 ? `<div class="tiny dim" style="margin-top:2px">Volume ${fmtNum(Math.round(volume)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ${store.state.settings.units}</div>` : ''}
    </div>`;
}

function workoutRow(w, sessions) {
  const sess = sessions.find((x) => x.workoutId === w.id);
  const done = sess?.status === 'done';
  const active = sess?.status === 'active';
  const simple = (w.mode || 'exercises') === 'simple';

  return `<div class="row" data-wo="${esc(w.id)}">
    ${simple
      ? `<button class="tick ${done ? 'on' : ''}" data-tick="${esc(w.id)}" aria-label="Mark done">&#10003;</button>`
      : `<span class="chip ${done ? 'done' : 'accent'}" style="width:40px;height:40px;padding:0;justify-content:center;border-radius:50%;font-size:16px">
           ${done ? '&#10003;' : kindGlyph(w.kind)}</span>`}
    <span class="grow">
      <div class="row-title ${done && simple ? 'strike' : ''}">${esc(w.name)}</div>
      <div class="row-sub">${esc(summaryOf(w))}${active ? ' · in progress' : ''}</div>
    </span>
    ${done ? '<span class="chip done">Done</span>' : active ? '<span class="chip accent">Resume</span>' : '<span class="chev">&#8250;</span>'}
  </div>`;
}

function sessionRow(x) {
  const sets = (x.entries || []).reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const sub = x.mode === 'simple'
    ? (x.duration ? `${fmtNum(x.duration)} min` : KIND_LABEL[x.kind] || '')
    : `${pluralize(x.entries?.length || 0, 'exercise')} · ${pluralize(sets, 'set')}`;
  return `<div class="row" data-open="${esc(x.id)}">
    <span class="chip ${x.status === 'done' ? 'done' : 'accent'}" style="width:40px;height:40px;padding:0;justify-content:center;border-radius:50%;font-size:16px">
      ${x.status === 'done' ? '&#10003;' : kindGlyph(x.kind)}</span>
    <span class="grow">
      <div class="row-title">${esc(x.name)}</div>
      <div class="row-sub">${esc(sub)}</div>
    </span>
    <button class="ex-menu" data-sess-menu="${esc(x.id)}">&#8943;</button>
  </div>`;
}

export function kindGlyph(kind) {
  return { lift: '&#127947;', plyo: '&#9889;', mobility: '&#129496;', custom: '&#9917;' }[kind] || '&#9679;';
}

export function summaryOf(w) {
  if ((w.mode || 'exercises') === 'simple') {
    return w.targetDuration ? `${fmtNum(w.targetDuration)} min` : (KIND_LABEL[w.kind] || 'Check off');
  }
  const names = (w.items || []).map((i) => store.exercise(i.exerciseId)?.name).filter(Boolean);
  if (!names.length) return 'No exercises yet';
  const head = names.slice(0, 2).join(', ');
  return names.length > 2 ? `${head} +${names.length - 2}` : head;
}

/* ------------------------------------------------------------ add sheet */

function addSheet(date, ctx) {
  const plans = store.allPlans();
  const activeId = store.state.settings.activePlanId;
  const ordered = [...plans].sort((a, b) => (b.id === activeId) - (a.id === activeId));

  const body = `
    <div class="search"><input type="text" data-q placeholder="Search workouts &amp; exercises" autocapitalize="none" autocorrect="off"></div>
    <div data-results></div>
    <div class="card" style="margin:0 12px 12px">
      <button class="row" data-quick="custom"><span class="grow row-title">Custom workout…</span><span class="chev">&#8250;</span></button>
      <button class="row" data-quick="exercise"><span class="grow row-title">Single exercise…</span><span class="chev">&#8250;</span></button>
    </div>`;

  sheet({
    title: `Add to ${fmtDate(date)}`,
    body,
    onMount(b, close) {
      const results = b.querySelector('[data-results]');
      const input = b.querySelector('[data-q]');

      const draw = () => {
        const q = input.value.trim().toLowerCase();
        const chunks = [];
        for (const p of ordered) {
          const ws = store.planWorkouts(p.id).filter((w) => !q || w.name.toLowerCase().includes(q));
          if (!ws.length) continue;
          chunks.push(`<div class="section-title" style="margin-left:16px">${esc(p.name)}${p.id === activeId ? ' · active' : ''}</div>
            <div class="card" style="margin:0 12px 8px">
              ${ws.map((w) => `<button class="row" data-start="${esc(w.id)}">
                <span class="grow"><div class="row-title">${esc(w.name)}</div>
                <div class="row-sub">${esc(summaryOf(w))}</div></span>
                <span class="chev">&#8250;</span></button>`).join('')}
            </div>`);
        }
        if (q) {
          const exs = store.allExercises().filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8);
          if (exs.length) {
            chunks.push(`<div class="section-title" style="margin-left:16px">Exercises</div>
              <div class="card" style="margin:0 12px 8px">
                ${exs.map((e) => `<button class="row" data-ex="${esc(e.id)}">
                  <span class="grow"><div class="row-title">${esc(e.name)}</div>
                  <div class="row-sub">${esc(KIND_LABEL[e.kind] || '')}</div></span>
                  <span class="chev">&#8250;</span></button>`).join('')}
              </div>`);
          }
        }
        results.innerHTML = chunks.join('') || `<div class="empty small">No matches</div>`;
      };
      draw();
      input.addEventListener('input', draw);

      on(b, '[data-start]', 'click', async (e, t) => {
        const w = store.workout(t.dataset.start);
        const created = await store.startSession({ workoutTemplate: w, date });
        close();
        ctx.go(`/session/${created.id}`);
      });

      on(b, '[data-ex]', 'click', async (e, t) => {
        const ex = store.exercise(t.dataset.ex);
        const created = await store.startSession({ date, name: ex.name, kind: ex.kind, mode: 'exercises' });
        created.entries = [store.buildEntry(ex, {}, date)];
        await store.saveSession(created);
        close();
        ctx.go(`/session/${created.id}`);
      });

      on(b, '[data-quick]', 'click', async (e, t) => {
        close();
        if (t.dataset.quick === 'custom') return customSheet(date, ctx);
        // "Single exercise" with no search term: show the full library.
        pickExerciseSheet(async (ex) => {
          const created = await store.startSession({ date, name: ex.name, kind: ex.kind, mode: 'exercises' });
          created.entries = [store.buildEntry(ex, {}, date)];
          await store.saveSession(created);
          ctx.go(`/session/${created.id}`);
        });
      });
    },
  });
}

function customSheet(date, ctx) {
  sheet({
    title: 'Custom workout',
    body: `
      <div class="field"><label>Name</label>
        <input type="text" name="name" placeholder="e.g. Pickup basketball" autocapitalize="words"></div>
      <div class="field"><label>Type</label>
        <select name="kind">
          ${KIND_ORDER.map((k) => `<option value="${k}" ${k === 'custom' ? 'selected' : ''}>${KIND_LABEL[k]}</option>`).join('')}
        </select></div>
      <div class="field"><label>Log style</label>
        <select name="mode">
          <option value="exercises">Exercises &amp; sets</option>
          <option value="simple">Just check it off</option>
        </select></div>`,
    confirm: 'Start',
    onConfirm(b) {
      const name = b.querySelector('[name=name]').value.trim();
      if (!name) return false;
      const kind = b.querySelector('[name=kind]').value;
      const mode = b.querySelector('[name=mode]').value;
      store.startSession({ date, name, kind, mode }).then((s) => ctx.go(`/session/${s.id}`));
    },
  });
}

/** Reusable exercise picker. Calls back with the chosen exercise. */
export function pickExerciseSheet(onPick, { title = 'Choose an exercise' } = {}) {
  sheet({
    title,
    body: `<div class="search"><input type="text" data-q placeholder="Search or type a new name" autocapitalize="words" autocorrect="off"></div>
           <div data-list></div>`,
    onMount(b, close) {
      const list = b.querySelector('[data-list]');
      const input = b.querySelector('[data-q]');
      const draw = () => {
        const q = input.value.trim().toLowerCase();
        const all = store.allExercises();
        const hits = q ? all.filter((e) => e.name.toLowerCase().includes(q)) : all;
        const exact = q && all.some((e) => e.name.toLowerCase() === q);
        const groups = {};
        for (const e of hits) (groups[e.kind] ||= []).push(e);
        list.innerHTML = `
          ${q && !exact ? `<div class="card" style="margin:0 12px 8px">
            <button class="row" data-new><span class="grow row-title" style="color:var(--accent)">
              + Create “${esc(input.value.trim())}”</span></button></div>` : ''}
          ${KIND_ORDER.filter((k) => groups[k]?.length).map((k) => `
            <div class="section-title" style="margin-left:16px">${KIND_LABEL[k]}</div>
            <div class="card" style="margin:0 12px 8px">
              ${groups[k].map((e) => `<button class="row" data-pick="${esc(e.id)}">
                <span class="grow row-title">${esc(e.name)}</span><span class="chev">&#8250;</span></button>`).join('')}
            </div>`).join('')}
          ${!hits.length && !q ? '<div class="empty small">Your library is empty</div>' : ''}`;
      };
      draw();
      input.addEventListener('input', draw);

      on(b, '[data-pick]', 'click', (e, t) => { close(); onPick(store.exercise(t.dataset.pick)); });
      on(b, '[data-new]', 'click', async () => {
        const name = input.value.trim();
        const kind = await menuSheet(`Type for “${name}”`,
          KIND_ORDER.map((k) => ({ label: KIND_LABEL[k], value: k })));
        if (!kind) return;
        const ex = store.newExercise({ name, kind });
        await store.saveExercise(ex);
        close();
        onPick(ex);
      });
    },
  });
}
