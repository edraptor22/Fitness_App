/* In-memory application state, persisted to IndexedDB.
   Everything is loaded once at boot; writes go to memory and IDB together. */

import * as db from './db.js';
import { uid, todayISO, weekDates, dowOf, num, bestSet, addDays } from './util.js';
import { SEED } from './seed.js';

export const state = {
  settings: null,
  exercises: new Map(),
  plans: new Map(),
  workouts: new Map(),
  sessions: new Map(),
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
  schemaVersion: 1,
};

/* ------------------------------------------------------------------ boot */

export async function load() {
  const [settings, exercises, plans, workouts, sessions] = await Promise.all(
    ['settings', 'exercises', 'plans', 'workouts', 'sessions'].map(db.getAll));

  state.settings = { ...DEFAULT_SETTINGS, ...(settings[0] || {}) };
  fill(state.exercises, exercises);
  fill(state.plans, plans);
  fill(state.workouts, workouts);
  fill(state.sessions, sessions);

  if (!state.settings.seeded && exercises.length === 0) {
    await seedStarterData();
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

/* ------------------------------------------------------- export / import */

export async function exportData() {
  return {
    format: 'liftlog',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    exercises: [...state.exercises.values()],
    plans: [...state.plans.values()],
    workouts: [...state.workouts.values()],
    sessions: [...state.sessions.values()],
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
  ]);
  await load();
  emit();
}

export async function wipe() {
  await db.clearAll();
  state.settings = { ...DEFAULT_SETTINGS };
  state.exercises.clear(); state.plans.clear();
  state.workouts.clear(); state.sessions.clear();
  emit();
}
