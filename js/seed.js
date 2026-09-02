/* Starter content so a fresh install isn't an empty screen.
   Everything here is editable or deletable from inside the app. */

import { uid } from './util.js';

const W = { weight: true, reps: true, duration: false, distance: false };
const R = { weight: false, reps: true, duration: false, distance: false };
const RD = { weight: false, reps: true, duration: false, distance: true };
const T = { weight: false, reps: false, duration: true, distance: false };
const TD = { weight: false, reps: false, duration: true, distance: true };
const RT = { weight: false, reps: true, duration: true, distance: false };

export function SEED() {
  const exercises = [];
  const byName = {};

  const ex = (name, kind, track, extra = {}) => {
    const e = {
      id: uid('ex'), name, kind, track,
      durationUnit: extra.durationUnit || (kind === 'plyo' ? 'sec' : 'min'),
      distanceUnit: extra.distanceUnit || 'm',
      link: extra.link || '', notes: extra.notes || '', archived: false,
    };
    exercises.push(e);
    byName[name] = e.id;
    return e.id;
  };

  /* ---- weights ---- */
  ['Barbell Back Squat', 'Front Squat', 'Deadlift', 'Romanian Deadlift', 'Hip Thrust',
   'Bench Press', 'Incline Dumbbell Press', 'Overhead Press', 'Dumbbell Shoulder Press',
   'Barbell Row', 'Dumbbell Row', 'Lat Pulldown', 'Pull-up', 'Chin-up', 'Dip',
   'Bulgarian Split Squat', 'Walking Lunge', 'Leg Press', 'Leg Curl', 'Leg Extension',
   'Calf Raise', 'Face Pull', 'Lateral Raise', 'Biceps Curl', 'Triceps Pushdown',
   'Hanging Leg Raise', 'Cable Woodchop',
  ].forEach((n) => ex(n, 'lift', W));
  ex('Plank', 'lift', T, { durationUnit: 'sec' });
  ex('Farmer Carry', 'lift', { weight: true, reps: false, duration: false, distance: true });

  /* ---- plyometrics ---- */
  ['Box Jump', 'Depth Jump', 'Tuck Jump', 'Squat Jump', 'Skater Jump',
   'Lateral Bound', 'Pogo Hops', 'Single-leg Hop', 'Med Ball Slam', 'Med Ball Chest Pass',
  ].forEach((n) => ex(n, 'plyo', R));
  ex('Broad Jump', 'plyo', RD);
  ex('Bounding', 'plyo', RD);
  ex('Sprint', 'plyo', RD);
  ex('Jump Rope', 'plyo', RT, { durationUnit: 'sec' });

  /* ---- mobility ---- */
  ['90/90 Hip Switch', 'Couch Stretch', 'Hip Flexor Stretch', 'Thoracic Rotation',
   'Ankle Mobility', 'Cat-Cow', "World's Greatest Stretch", 'Hamstring Sweep',
  ].forEach((n) => ex(n, 'mobility', T, { durationUnit: 'sec' }));

  /* ---- sports & conditioning ---- */
  ex('Run', 'custom', TD, { distanceUnit: 'mi' });
  ex('Bike', 'custom', TD, { distanceUnit: 'mi' });
  ex('Swim', 'custom', TD, { distanceUnit: 'm' });
  ex('Basketball', 'custom', T);
  ex('Soccer', 'custom', T);
  ex('Tennis', 'custom', T);
  ex('Rowing', 'custom', TD, { distanceUnit: 'm' });

  /* ------------------------------------------------------------- plans */

  const plans = [];
  const workouts = [];
  const now = new Date().toISOString();

  const mkPlan = (name, notes) => {
    const p = { id: uid('pl'), name, notes, createdAt: now };
    plans.push(p);
    return p;
  };

  const mkWorkout = (plan, name, kind, days, items, extra = {}) => {
    workouts.push({
      id: uid('wo'), planId: plan.id, name, kind,
      mode: extra.mode || (kind === 'mobility' ? 'simple' : 'exercises'),
      days, link: extra.link || '', notes: extra.notes || '',
      targetDuration: extra.targetDuration ?? null,
      order: workouts.filter((w) => w.planId === plan.id).length,
      items: (items || []).map(([n, sets, reps]) => ({
        exerciseId: byName[n], targetSets: sets, targetReps: reps,
        targetWeight: '', targetDuration: '', targetDistance: '', notes: '',
      })).filter((i) => i.exerciseId),
    });
  };

  /* Plan A — 3 lifting, 2 plyo, mobility daily */
  const A = mkPlan('Plan A', '3 lifting · 2 plyo · mobility daily');
  mkWorkout(A, 'Upper Body', 'lift', [1], [
    ['Bench Press', 4, 6], ['Barbell Row', 4, 8], ['Overhead Press', 3, 8],
    ['Lat Pulldown', 3, 10], ['Lateral Raise', 3, 12], ['Triceps Pushdown', 3, 12],
  ]);
  mkWorkout(A, 'Plyo A', 'plyo', [2], [
    ['Box Jump', 4, 5], ['Broad Jump', 3, 5], ['Lateral Bound', 3, 8], ['Pogo Hops', 3, 15],
  ]);
  mkWorkout(A, 'Lower Body', 'lift', [3], [
    ['Barbell Back Squat', 4, 5], ['Romanian Deadlift', 3, 8],
    ['Bulgarian Split Squat', 3, 10], ['Leg Curl', 3, 12], ['Calf Raise', 3, 15],
  ]);
  mkWorkout(A, 'Plyo B', 'plyo', [4], [
    ['Depth Jump', 4, 5], ['Med Ball Slam', 3, 8], ['Skater Jump', 3, 10], ['Tuck Jump', 3, 8],
  ]);
  mkWorkout(A, 'Full Body', 'lift', [5], [
    ['Deadlift', 3, 5], ['Incline Dumbbell Press', 3, 8], ['Pull-up', 3, 8],
    ['Hip Thrust', 3, 10], ['Plank', 3, 45],
  ]);
  mkWorkout(A, 'Daily Mobility', 'mobility', [0, 1, 2, 3, 4, 5, 6], [], {
    mode: 'simple',
    targetDuration: 10,
    notes: '10 minutes. Paste a YouTube link below to follow along.',
    link: '',
  });

  /* Plan B — lighter week */
  const B = mkPlan('Plan B', '2 lifting · 2 plyo · mobility daily');
  mkWorkout(B, 'Upper Body', 'lift', [1], [
    ['Bench Press', 3, 8], ['Barbell Row', 3, 8], ['Overhead Press', 3, 10], ['Biceps Curl', 3, 12],
  ]);
  mkWorkout(B, 'Plyo A', 'plyo', [2], [
    ['Box Jump', 3, 5], ['Skater Jump', 3, 10], ['Pogo Hops', 3, 20],
  ]);
  mkWorkout(B, 'Lower Body', 'lift', [4], [
    ['Barbell Back Squat', 3, 8], ['Romanian Deadlift', 3, 10], ['Leg Press', 3, 12], ['Calf Raise', 3, 15],
  ]);
  mkWorkout(B, 'Plyo B', 'plyo', [5], [
    ['Broad Jump', 3, 5], ['Med Ball Slam', 3, 10], ['Jump Rope', 3, 60],
  ]);
  mkWorkout(B, 'Daily Mobility', 'mobility', [0, 1, 2, 3, 4, 5, 6], [], {
    mode: 'simple', targetDuration: 10, link: '',
  });

  return { exercises, plans, workouts, activePlanId: A.id };
}
