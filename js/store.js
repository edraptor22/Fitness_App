/* In-memory application state, persisted to IndexedDB.
   Everything is loaded once at boot; writes go to memory and IDB together. */

import * as db from './db.js';
import { uid, todayISO, weekDates, dowOf, num, bestSet, addDays, clamp, fromISO } from './util.js';
import { SEED, SEED_QUOTES } from './seed.js';

export const state = {
  settings: null,
  exercises: new Map(),
  plans: new Map(),
  workouts: new Map(),
  sessions: new Map(),
  weights: new Map(),   // keyed by date, one weigh-in per day
  quotes: new Map(),
};

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

export const DEFAULT_SETTINGS = {
  id: 'app',
  units: 'lb',
  weekStartsOn: 1,
  theme: 'auto',
  activePlanId: null,
  showLastSession: true,
  seeded: false,
  schemaVersion: 2,

  /* Countdown target(s). The soonest upcoming one is the hero on Today. */
  events: [],           // [{ id, name, date, createdAt }]

  /* Body-weight goal with reward milestones. */
  goal: null,           // { startWeight, startDate, targetWeight, milestones: [] }

  showQuotes: true,
};

/* ------------------------------------------------------------------ boot */

export async function load() {
  const [settings, exercises, plans, workouts, sessions, weights, quotes] = await Promise.all(
    ['settings', 'exercises', 'plans', 'workouts', 'sessions', 'weights', 'quotes'].map(db.getAll));

  state.settings = { ...DEFAULT_SETTINGS, ...(settings[0] || {}) };
  fill(state.exercises, exercises);
  fill(state.plans, plans);
  fill(state.workouts, workouts);
  fill(state.sessions, sessions);
  fill(state.weights, weights);
  fill(state.quotes, quotes);

  if (!state.settings.seeded && exercises.length === 0) {
    await seedStarterData();
  }
  if (!state.quotes.size && !state.settings.quotesSeeded) {
    await seedQuotes();
  }
  return state;
}

function fill(map, rows) {
  map.clear();
  for (const r of rows) map.set(r.id, r);
}

async function seedStarterData() {
  const { exercises, plans, workouts, activePlanId } = SEED();
  await Promise.all([
    db.putMany('exercises', exercises),
    db.putMany('plans', plans),
    db.putMany('workouts', workouts),
  ]);
  fill(state.exercises, exercises);
  fill(state.plans, plans);
  fill(state.workouts, workouts);
  await saveSettings({ seeded: true, activePlanId });
}

async function seedQuotes() {
  const rows = SEED_QUOTES();
  await db.putMany('quotes', rows);
  fill(state.quotes, rows);
  await saveSettings({ quotesSeeded: true });
}

/* ------------------------------------------------------------- settings */

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await db.put('settings', state.settings);
  emit();
  return state.settings;
}

/* ------------------------------------------------------------ exercises */

export function exercise(id) { return state.exercises.get(id); }

export function allExercises({ includeArchived = false } = {}) {
  return [...state.exercises.values()]
    .filter((e) => includeArchived || !e.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function newExercise(patch = {}) {
  const kind = patch.kind || 'lift';
  return {
    id: uid('ex'),
    name: '',
    kind,
    track: defaultTrack(kind),
    durationUnit: kind === 'plyo' ? 'sec' : 'min',
    distanceUnit: 'm',
    link: '',
    notes: '',
    archived: false,
    ...patch,
  };
}

export function defaultTrack(kind) {
  switch (kind) {
    case 'lift': return { weight: true, reps: true, duration: false, distance: false };
    case 'plyo': return { weight: false, reps: true, duration: false, distance: false };
    case 'mobility': return { weight: false, reps: false, duration: true, distance: false };
    default: return { weight: false, reps: false, duration: true, distance: false };
  }
}

export async function saveExercise(ex) {
  state.exercises.set(ex.id, ex);
  await db.put('exercises', ex);
  emit();
  return ex;
}

export async function deleteExercise(id) {
  state.exercises.delete(id);
  await db.remove('exercises', id);
  // Detach from templates; logged history keeps its own name copy.
  for (const w of state.workouts.values()) {
    if (w.items?.some((i) => i.exerciseId === id)) {
      w.items = w.items.filter((i) => i.exerciseId !== id);
      await db.put('workouts', w);
    }
  }
  emit();
}

/* ---------------------------------------------------------------- plans */

export function plan(id) { return state.plans.get(id); }

export function allPlans() {
  return [...state.plans.values()].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export function activePlan() {
  return state.plans.get(state.settings.activePlanId) || null;
}

export async function savePlan(p) {
  state.plans.set(p.id, p);
  await db.put('plans', p);
  emit();
  return p;
}

export async function createPlan(name) {
  const p = { id: uid('pl'), name, notes: '', createdAt: new Date().toISOString() };
  await savePlan(p);
  if (!state.settings.activePlanId) await saveSettings({ activePlanId: p.id });
  return p;
}

export async function deletePlan(id) {
  for (const w of planWorkouts(id)) {
    state.workouts.delete(w.id);
    await db.remove('workouts', w.id);
  }
  state.plans.delete(id);
  await db.remove('plans', id);
  if (state.settings.activePlanId === id) {
    await saveSettings({ activePlanId: allPlans()[0]?.id || null });
  }
  emit();
}

/** Deep-copy a plan and all of its workouts. */
export async function duplicatePlan(id, name) {
  const src = plan(id);
  if (!src) return null;
  const copy = { ...src, id: uid('pl'), name, createdAt: new Date().toISOString() };
  await savePlan(copy);
  for (const w of planWorkouts(id)) {
    await saveWorkout({ ...w, id: uid('wo'), planId: copy.id, items: (w.items || []).map((i) => ({ ...i })) });
  }
  return copy;
}

/* ------------------------------------------------------------- workouts */

export function workout(id) { return state.workouts.get(id); }

export function planWorkouts(planId) {
  return [...state.workouts.values()]
    .filter((w) => w.planId === planId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

export function newWorkout(planId, patch = {}) {
  const kind = patch.kind || 'lift';
  return {
    id: uid('wo'),
    planId,
    name: '',
    kind,
    mode: kind === 'mobility' ? 'simple' : 'exercises',
    days: [],
    link: '',
    notes: '',
    targetDuration: kind === 'mobility' ? 10 : null,
    items: [],
    order: planWorkouts(planId).length,
    ...patch,
  };
}

export async function saveWorkout(w) {
  state.workouts.set(w.id, w);
  await db.put('workouts', w);
  emit();
  return w;
}

export async function deleteWorkout(id) {
  state.workouts.delete(id);
  await db.remove('workouts', id);
  emit();
}

/* ------------------------------------------------------------- sessions */

export function session(id) { return state.sessions.get(id); }

export function sessionsOn(date) {
  return [...state.sessions.values()]
    .filter((s) => s.date === date)
    .sort((a, b) => (a.startedAt || '').localeCompare(b.startedAt || ''));
}

export function allSessions() {
  return [...state.sessions.values()].sort((a, b) =>
    b.date.localeCompare(a.date) || (b.startedAt || '').localeCompare(a.startedAt || ''));
}

export async function saveSession(s) {
  state.sessions.set(s.id, s);
  await db.put('sessions', s);
  emit();
  return s;
}

export async function deleteSession(id) {
  state.sessions.delete(id);
  await db.remove('sessions', id);
  emit();
}

/**
 * Start a session. If `w` is a workout template, exercises and sets are
 * pre-filled from the last time each exercise was performed (falling back to
 * the template's targets) so progressive overload is a one-tap edit.
 */
export async function startSession({ workoutTemplate = null, date = todayISO(), name, kind = 'custom', mode = 'exercises', planId = null }) {
  const w = workoutTemplate;
  const s = {
    id: uid('se'),
    date,
    planId: w ? w.planId : planId,
    workoutId: w ? w.id : null,
    name: w ? w.name : (name || 'Workout'),
    kind: w ? w.kind : kind,
    mode: w ? (w.mode || 'exercises') : mode,
    link: w ? w.link : '',
    status: 'active',
    startedAt: new Date().toISOString(),
    completedAt: null,
    notes: '',
    done: false,
    duration: w?.targetDuration ?? null,
    entries: [],
  };

  if (w && s.mode === 'exercises') {
    for (const item of w.items || []) {
      const ex = exercise(item.exerciseId);
      if (!ex) continue;
      s.entries.push(buildEntry(ex, item, date));
    }
  }
  await saveSession(s);
  return s;
}

export function buildEntry(ex, item = {}, date = todayISO()) {
  const last = lastPerformance(ex.id, date);
  const targetSets = item.targetSets || last?.sets.length || 3;
  let sets = [];

  if (last && last.sets.length) {
    sets = last.sets.map((s) => ({
      weight: s.weight ?? '', reps: s.reps ?? '',
      duration: s.duration ?? '', distance: s.distance ?? '',
      done: false,
    }));
    while (sets.length < targetSets) sets.push({ ...sets[sets.length - 1], done: false });
    sets = sets.slice(0, Math.max(targetSets, sets.length));
  } else {
    sets = Array.from({ length: targetSets }, () => ({
      weight: item.targetWeight ?? '',
      reps: item.targetReps ?? '',
      duration: item.targetDuration ?? '',
      distance: item.targetDistance ?? '',
      done: false,
    }));
  }

  return {
    id: uid('en'),
    exerciseId: ex.id,
    name: ex.name,
    notes: item.notes || '',
    sets,
  };
}

/* -------------------------------------------------- progressive overload */

/** Most recent completed performance of an exercise strictly before `date`. */
export function lastPerformance(exerciseId, beforeDate = null, excludeSessionId = null) {
  let best = null;
  for (const s of state.sessions.values()) {
    if (s.status !== 'done') continue;
    if (s.id === excludeSessionId) continue;
    if (beforeDate && s.date > beforeDate) continue;
    const entry = s.entries?.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const sets = entry.sets.filter((x) => x.done);
    if (!sets.length) continue;
    if (!best || s.date > best.date || (s.date === best.date && (s.completedAt || '') > (best.completedAt || ''))) {
      best = { date: s.date, completedAt: s.completedAt, sets, sessionName: s.name, sessionId: s.id };
    }
  }
  return best;
}

/** Full history for one exercise, newest first. */
export function exerciseHistory(exerciseId) {
  const out = [];
  for (const s of state.sessions.values()) {
    if (s.status !== 'done') continue;
    const entry = s.entries?.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const sets = entry.sets.filter((x) => x.done);
    if (!sets.length) continue;
    out.push({ date: s.date, sessionId: s.id, sessionName: s.name, sets });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** All-time best set for an exercise. */
export function personalBest(exerciseId) {
  const ex = exercise(exerciseId);
  if (!ex) return null;
  const all = exerciseHistory(exerciseId).flatMap((h) => h.sets.map((s) => ({ ...s, date: h.date })));
  return all.length ? bestSet(all, ex) : null;
}

/* ----------------------------------------------------- weekly scheduling */

/** Workouts in the active plan scheduled for a given date's weekday. */
export function scheduledFor(date) {
  const p = activePlan();
  if (!p) return [];
  const dow = dowOf(date);
  return planWorkouts(p.id).filter((w) => (w.days || []).includes(dow));
}

/**
 * Completed sessions for one workout template inside the week containing
 * `date`. Lets Today say "already done Tuesday" when you train a day early.
 */
export function workoutDoneInWeek(workoutId, date) {
  const week = new Set(weekDates(date, state.settings.weekStartsOn));
  return [...state.sessions.values()]
    .filter((s) => s.workoutId === workoutId && s.status === 'done' && week.has(s.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Sessions that already satisfy this workout's weekly quota, done on other
 * days of the same week — or [] if it's still due today.
 *
 * The quota is how many days a week the workout is scheduled, so a Friday
 * "Full Body" (1×/week) counts as covered once you've done it Thursday, while
 * a daily mobility habit (7×/week) is still due every day regardless.
 */
export function workoutCoveredBy(w, date) {
  const earlier = workoutDoneInWeek(w.id, date).filter((s) => s.date !== date);
  const quota = w.days?.length || 1;
  return earlier.length >= quota ? earlier : [];
}

/**
 * Weekly counts by kind for the active plan:
 * [{ kind, target, done }]  — target from the plan's schedule, done from
 * completed sessions in the week (ad-hoc sessions count too).
 */
export function weeklyProgress(date) {
  const p = activePlan();
  const dates = weekDates(date, state.settings.weekStartsOn);
  const target = {};
  if (p) {
    for (const w of planWorkouts(p.id)) {
      target[w.kind] = (target[w.kind] || 0) + (w.days?.length || 0);
    }
  }
  const done = {};
  for (const d of dates) {
    for (const s of sessionsOn(d)) {
      if (s.status === 'done') done[s.kind] = (done[s.kind] || 0) + 1;
    }
  }
  const kinds = new Set([...Object.keys(target), ...Object.keys(done)]);
  return [...kinds].map((kind) => ({ kind, target: target[kind] || 0, done: done[kind] || 0 }));
}

export function weekSummary(date) {
  const dates = weekDates(date, state.settings.weekStartsOn);
  let sessions = 0, volume = 0;
  for (const d of dates) {
    for (const s of sessionsOn(d)) {
      if (s.status !== 'done') continue;
      sessions++;
      for (const e of s.entries || []) {
        const ex = exercise(e.exerciseId);
        if (!ex?.track?.weight || !ex?.track?.reps) continue;
        for (const st of e.sets) if (st.done) volume += num(st.weight) * num(st.reps);
      }
    }
  }
  return { sessions, volume, dates };
}

/** Consecutive days (ending today or yesterday) with a completed session. */
export function streak() {
  const has = (d) => sessionsOn(d).some((s) => s.status === 'done');
  let d = todayISO();
  if (!has(d)) {                 // a rest day today shouldn't break the streak
    d = addDays(d, -1);
    if (!has(d)) return 0;
  }
  let n = 0;
  while (has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/* ---------------------------------------------------------- body weight */

export function weightOn(date) { return state.weights.get(date) || null; }

/** Every weigh-in, oldest first. */
export function allWeights() {
  return [...state.weights.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function latestWeight() {
  const all = allWeights();
  return all.length ? all[all.length - 1] : null;
}

/**
 * Record a weigh-in (one per day — logging twice replaces the day's value)
 * and return any milestones it just crossed, so the UI can celebrate them.
 */
export async function logWeight(date, value, note = '') {
  const row = { id: date, date, weight: num(value), note, loggedAt: new Date().toISOString() };
  state.weights.set(date, row);
  await db.put('weights', row);
  const hit = await checkMilestones(row);
  emit();
  return { row, hit };
}

export async function deleteWeight(date) {
  state.weights.delete(date);
  await db.remove('weights', date);
  emit();
}

/** Change per week over the trailing `days`, signed (negative = losing). */
export function weightTrend(days = 28) {
  const cutoff = addDays(todayISO(), -days);
  const window = allWeights().filter((w) => w.date >= cutoff);
  if (window.length < 2) return null;
  const first = window[0];
  const last = window[window.length - 1];
  const span = (fromISODays(last.date) - fromISODays(first.date)) / 7;
  if (span <= 0) return null;
  return (last.weight - first.weight) / span;
}

const fromISODays = (iso) => Math.round(fromISO(iso).getTime() / 86400000);

/* ------------------------------------------------------- weight goal */

export function goal() { return state.settings.goal || null; }

export function goalDirection(g = goal()) {
  if (!g) return null;
  return g.targetWeight < g.startWeight ? 'lose' : 'gain';
}

/** 0..1 progress from the starting weight toward the target. */
export function goalProgress(g = goal()) {
  if (!g) return 0;
  const cur = latestWeight()?.weight;
  if (cur === undefined) return 0;
  const span = g.targetWeight - g.startWeight;
  if (span === 0) return 1;
  return clamp((cur - g.startWeight) / span, 0, 1);
}

export function remainingToGoal(g = goal()) {
  const cur = latestWeight()?.weight;
  if (!g || cur === undefined) return null;
  return Math.abs(cur - g.targetWeight);
}

/** Milestones in the order you'll reach them, unhit ones first. */
export function sortedMilestones(g = goal()) {
  if (!g?.milestones?.length) return [];
  const dir = goalDirection(g);
  return [...g.milestones].sort((a, b) =>
    dir === 'lose' ? b.weight - a.weight : a.weight - b.weight);
}

export function nextMilestone(g = goal()) {
  return sortedMilestones(g).find((m) => !m.hitDate) || null;
}

/** Mark every milestone this weigh-in reached. Returns the newly hit ones. */
async function checkMilestones(row) {
  const g = goal();
  if (!g?.milestones?.length) return [];
  const dir = goalDirection(g);
  const hit = [];
  for (const m of g.milestones) {
    if (m.hitDate) continue;
    const reached = dir === 'lose' ? row.weight <= m.weight : row.weight >= m.weight;
    if (reached) { m.hitDate = row.date; hit.push(m); }
  }
  if (hit.length) await saveSettings({ goal: { ...g } });
  return hit;
}

export async function saveGoal(g) { return saveSettings({ goal: g }); }

/** Build evenly spaced milestones between start and target. */
export function generateMilestones(g, stepSize) {
  const dir = g.targetWeight < g.startWeight ? -1 : 1;
  const step = Math.abs(num(stepSize)) * dir;
  if (!step) return [];
  const out = [];
  let w = g.startWeight + step;
  const past = (v) => (dir < 0 ? v < g.targetWeight : v > g.targetWeight);
  while (!past(w) && out.length < 40) {
    out.push({ id: uid('ms'), weight: Math.round(w * 10) / 10, reward: '', hitDate: null });
    w += step;
  }
  // Always finish on the target itself.
  if (!out.some((m) => m.weight === g.targetWeight)) {
    out.push({ id: uid('ms'), weight: g.targetWeight, reward: '', hitDate: null });
  }
  return out;
}

/* --------------------------------------------------------- target events */

export function events() {
  return [...(state.settings.events || [])].sort((a, b) => a.date.localeCompare(b.date));
}

/** The next event that hasn't happened yet — the one Today counts down to. */
export function nextEvent(from = todayISO()) {
  return events().find((e) => e.date >= from) || null;
}

export function daysUntil(date, from = todayISO()) {
  return fromISODays(date) - fromISODays(from);
}

export async function saveEvent(ev) {
  const list = [...(state.settings.events || [])];
  const i = list.findIndex((e) => e.id === ev.id);
  if (i >= 0) list[i] = ev; else list.push(ev);
  return saveSettings({ events: list });
}

export async function deleteEvent(id) {
  return saveSettings({ events: (state.settings.events || []).filter((e) => e.id !== id) });
}

export function newEvent(patch = {}) {
  return { id: uid('ev'), name: '', date: todayISO(), createdAt: todayISO(), ...patch };
}

/**
 * How the training block is going: sessions done since the event was set,
 * and how many the active plan still has room for before the date.
 */
export function eventProgress(ev) {
  if (!ev) return null;
  const total = daysUntil(ev.date, ev.createdAt || todayISO());
  const gone = daysUntil(todayISO(), ev.createdAt || todayISO());
  const left = daysUntil(ev.date);
  const done = [...state.sessions.values()].filter(
    (s) => s.status === 'done' && s.date >= (ev.createdAt || '0000-00-00') && s.date <= todayISO()).length;

  // Count real training sessions only — daily check-offs would swamp the number.
  const p = activePlan();
  const perWeek = p
    ? planWorkouts(p.id)
        .filter((w) => (w.mode || 'exercises') !== 'simple')
        .reduce((n, w) => n + (w.days?.length || 0), 0)
    : 0;
  const weeksLeft = Math.max(0, left / 7);

  return {
    daysLeft: left,
    weeksLeft: Math.floor(weeksLeft),
    pct: total > 0 ? clamp(gone / total, 0, 1) : (left <= 0 ? 1 : 0),
    sessionsDone: done,
    sessionsLeft: Math.round(perWeek * weeksLeft),
    perWeek,
  };
}

/* ---------------------------------------------------------------- quotes */

export function allQuotes() {
  return [...state.quotes.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/* Small deterministic PRNG so a given day always yields the same quote —
   no stored state, but not the plain source order either. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, seed) {
  const rand = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * One pass through every quote, ordered so authors interleave instead of
 * running in blocks — you get Goggins, then Seneca, then Jocko, not eighteen
 * days of Marcus Aurelius. Reshuffled each time the list is exhausted.
 */
function rotation(cycle, list) {
  const groups = new Map();
  for (const q of list) {
    const key = q.author || ' ';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }

  const keys = seededShuffle([...groups.keys()], cycle * 7919 + 13);
  const buckets = keys.map((k, i) => seededShuffle(groups.get(k), cycle * 104729 + i * 31 + 7));

  const out = [];
  while (buckets.some((b) => b.length)) {
    const live = buckets.filter((b) => b.length).length;
    const prev = out.length ? out[out.length - 1].author : null;
    let pick = -1;
    for (let i = 0; i < buckets.length; i++) {
      if (!buckets[i].length) continue;
      // Never twice from the same author in a row, unless they're all that's left.
      if (live > 1 && (buckets[i][0].author || ' ') === (prev || ' ')) continue;
      // Drain the biggest bucket first so heavy authors stay spread out.
      if (pick < 0 || buckets[i].length > buckets[pick].length) pick = i;
    }
    if (pick < 0) pick = buckets.findIndex((b) => b.length);
    out.push(buckets[pick].shift());
  }
  return out;
}

let _rotCache = { key: null, order: null };

/** Stable for the whole day; every quote appears once before any repeats. */
export function quoteForDate(date = todayISO()) {
  const list = allQuotes();
  if (!list.length) return null;

  const day = Math.abs(fromISODays(date));
  const n = list.length;
  const cycle = Math.floor(day / n);

  const key = `${cycle}:${n}:${list[0].id}`;
  if (_rotCache.key !== key) _rotCache = { key, order: rotation(cycle, list) };

  return _rotCache.order[day % n];
}

export async function replaceQuotes(rows) {
  for (const id of state.quotes.keys()) await db.remove('quotes', id);
  state.quotes.clear();
  const built = rows.map((r, i) => ({ id: uid('q'), order: i, ...r }));
  await db.putMany('quotes', built);
  fill(state.quotes, built);
  _rotCache = { key: null, order: null };
  await saveSettings({ quotesSeeded: true });
  emit();
  return built;
}

/** Parse pasted text: one quote per line, optional "— Author" suffix. */
export function parseQuotes(text) {
  return text.split('\n')
    .map((l) => l.trim())
    // Strip list markers so a numbered or bulleted list pastes straight in.
    .map((l) => l.replace(/^(?:\d+\s*[.)\]]|[-*•·–—])\s+/, '').trim())
    .filter(Boolean)
    .map((line) => {
      // "Quote text — Author", also accepting –, --, or a spaced hyphen.
      const m = line.match(/^(.*\S)\s+(?:—|–|--|-)\s+(.+)$/);
      if (m && m[2].trim().length <= 60) return { text: unquote(m[1]), author: unquote(m[2]) };
      return { text: unquote(line), author: '' };
    });
}

/** Drop wrapping quotation marks — straight or curly — but keep nested ones. */
function unquote(s) {
  return String(s).trim()
    .replace(/^["“”'‘’](.*)["“”'‘’]$/s, '$1')   // a matched pair around the whole thing
    .replace(/^["“”]+|["“”]+$/g, '')            // any stray leftover at either end
    .trim();
}

/* ------------------------------------------------------- export / import */

export async function exportData() {
  return {
    format: 'liftlog',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    exercises: [...state.exercises.values()],
    plans: [...state.plans.values()],
    workouts: [...state.workouts.values()],
    sessions: [...state.sessions.values()],
    weights: [...state.weights.values()],
    quotes: [...state.quotes.values()],
  };
}

export async function importData(data, { replace = true } = {}) {
  if (!data || data.format !== 'liftlog') throw new Error('Not a Lift Log backup file.');
  if (replace) await db.clearAll();

  const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}), id: 'app' };
  await db.put('settings', settings);
  await Promise.all([
    db.putMany('exercises', data.exercises || []),
    db.putMany('plans', data.plans || []),
    db.putMany('workouts', data.workouts || []),
    db.putMany('sessions', data.sessions || []),
    db.putMany('weights', data.weights || []),
    db.putMany('quotes', data.quotes || []),
  ]);
  await load();
  emit();
}

export async function wipe() {
  await db.clearAll();
  state.settings = { ...DEFAULT_SETTINGS };
  state.exercises.clear(); state.plans.clear();
  state.workouts.clear(); state.sessions.clear();
  state.weights.clear(); state.quotes.clear();
  emit();
}
