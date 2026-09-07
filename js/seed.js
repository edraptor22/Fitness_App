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

/* Daily non-negotiables. Behaviours, not quantities — nothing here is counted.
   Editable and deletable from Goals → Nutrition. */
export function SEED_HABITS() {
  return [
    ['Kitchen closed after 6:30pm', 'Nothing after the cut-off. Decide before you are hungry.'],
    ['Creatine + multivitamin', 'Both, every day.'],
    ['No mindless calories', 'Eat on purpose. Ask what your body actually needs.'],
  ].map(([name, note], i) => ({ id: uid('hb'), name, note, order: i, active: true }));
}

/* The daily quote rotation. Settings → Daily quotes replaces the whole list. */
export function SEED_QUOTES() {
  return [
    /* --- David Goggins --- */
    ['Stay hard.', 'David Goggins'],
    ['You are in danger of living a life so comfortable and soft, that you will die without ever realizing your true potential.', 'David Goggins'],
    ['Motivation is crap.', 'David Goggins'],
    ['Callous your mind.', 'David Goggins'],
    ['Don’t stop when you’re tired. Stop when you’re done.', 'David Goggins'],
    ['The most important conversations you’ll ever have are the ones you’ll have with yourself.', 'David Goggins'],
    ['You have to build calluses on your brain just like you build calluses on your hands.', 'David Goggins'],
    ['Be uncommon amongst uncommon.', 'David Goggins'],
    ['Suffering is a test. That’s all it is.', 'David Goggins'],
    ['When you think you’re done, you’re only at 40 percent.', 'David Goggins'],

    /* --- Mark Divine --- */
    ['Consistency is the omnipotent force behind change.', 'Mark Divine'],
    ['Slow is smooth, smooth is fast.', 'Mark Divine'],
    ['To live an uncommon life, one needs learn uncommon disciplines.', 'Mark Divine'],
    ['Always meet your commitments.', 'Mark Divine'],
    ['Two is one; one is none.', 'Mark Divine'],
    ['Master yourself so you can serve humanity.', 'Mark Divine'],
    ['Discipline is literally to be a “disciple” to something bigger than you.', 'Mark Divine'],

    /* --- Marcus Aurelius --- */
    ['You have power over your mind—not outside events. Realize this, and you will find strength.', 'Marcus Aurelius'],
    ['The impediment to action advances action. What stands in the way becomes the way.', 'Marcus Aurelius'],
    ['The soul becomes dyed with the colour of its thoughts.', 'Marcus Aurelius'],
    ['It is not death that a man should fear, but he should fear never beginning to live.', 'Marcus Aurelius'],
    ['Waste no more time arguing about what a good man should be. Be one.', 'Marcus Aurelius'],
    ['If it is not right, do not do it; if it is not true, do not say it.', 'Marcus Aurelius'],
    ['The happiness of your life depends upon the quality of your thoughts.', 'Marcus Aurelius'],
    ['When you arise in the morning, think of what a privilege it is to be alive.', 'Marcus Aurelius'],
    ['Accept whatever comes woven in the pattern of your destiny.', 'Marcus Aurelius'],
    ['Do every act of your life as though it were the very last act of your life.', 'Marcus Aurelius'],
    ['The best revenge is to be unlike him who performed the injury.', 'Marcus Aurelius'],
    ['Confine yourself to the present.', 'Marcus Aurelius'],
    ['Look well into thyself; there is a source of strength which will always spring up if thou wilt always look.', 'Marcus Aurelius'],
    ['The universe is change: life is opinion.', 'Marcus Aurelius'],
    ['Very little is needed to make a happy life; it is all within yourself.', 'Marcus Aurelius'],
    ['Think of yourself as dead. You have lived your life. Now take what’s left and live it properly.', 'Marcus Aurelius'],
    ['The only wealth you keep forever is the wealth you give away.', 'Marcus Aurelius'],

    /* --- Seneca --- */
    ['We suffer more often in imagination than in reality.', 'Seneca'],
    ['Difficulties strengthen the mind, as labor does the body.', 'Seneca'],
    ['Luck is what happens when preparation meets opportunity.', 'Seneca'],
    ['He who is brave is free.', 'Seneca'],
    ['It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca'],
    ['While we wait for life, life passes.', 'Seneca'],
    ['Begin at once to live, and count each separate day as a separate life.', 'Seneca'],
    ['If one does not know to which port one is sailing, no wind is favorable.', 'Seneca'],
    ['No man was ever wise by chance.', 'Seneca'],
    ['He who has great power should use it lightly.', 'Seneca'],
    ['Sometimes even to live is an act of courage.', 'Seneca'],
    ['As is a tale, so is life: not how long it is, but how good it is, is what matters.', 'Seneca'],
    ['The mind that is anxious about future events is miserable.', 'Seneca'],
    ['Luck never made a man wise.', 'Seneca'],

    /* --- Epictetus --- */
    ['It’s not what happens to you, but how you react to it that matters.', 'Epictetus'],
    ['No man is free who is not master of himself.', 'Epictetus'],
    ['First say to yourself what you would be; and then do what you have to do.', 'Epictetus'],
    ['We have two ears and one mouth so that we can listen twice as much as we speak.', 'Epictetus'],
    ['Don’t explain your philosophy. Embody it.', 'Epictetus'],
    ['If you want to improve, be content to be thought foolish and stupid.', 'Epictetus'],
    ['Freedom is the only worthy goal in life.', 'Epictetus'],
    ['Make the best use of what is in your power, and take the rest as it occurs.', 'Epictetus'],
    ['Circumstances don’t make the man, they only reveal him to himself.', 'Epictetus'],
    ['No great thing is created suddenly.', 'Epictetus'],

    /* --- Jocko Willink --- */
    ['Discipline equals freedom.', 'Jocko Willink'],
    ['Get after it.', 'Jocko Willink'],
    ['Good.', 'Jocko Willink'],
    ['Don’t count on motivation. Count on discipline.', 'Jocko Willink'],
    ['Default aggressive.', 'Jocko Willink'],
    ['Prioritize and execute.', 'Jocko Willink'],
    ['Detach.', 'Jocko Willink'],
    ['The enemy gets a vote.', 'Jocko Willink'],
    ['Extreme ownership.', 'Jocko Willink'],
    ['If you want to be tougher, be tougher.', 'Jocko Willink'],

    /* --- Nietzsche --- */
    ['He who has a why to live can bear almost any how.', 'Friedrich Nietzsche'],
    ['That which does not kill us makes us stronger.', 'Friedrich Nietzsche'],
    ['Become who you are.', 'Friedrich Nietzsche'],
    ['One must still have chaos in oneself to be able to give birth to a dancing star.', 'Friedrich Nietzsche'],
    ['The secret of reaping the greatest fruitfulness and greatest enjoyment from life is to live dangerously.', 'Friedrich Nietzsche'],

    /* --- Same vein, added --- */
    ['Suffer the pain of discipline or suffer the pain of regret.', 'Jim Rohn'],
    ['Hard choices, easy life. Easy choices, hard life.', 'Jerzy Gregorek'],
    ['We are what we repeatedly do. Excellence, then, is not an act but a habit.', 'Will Durant'],
    ['You do not rise to the level of your goals. You fall to the level of your systems.', 'James Clear'],
    ['I fear not the man who has practiced 10,000 kicks once, but I fear the man who has practiced one kick 10,000 times.', 'Bruce Lee'],
    ['The successful warrior is the average man, with laser-like focus.', 'Bruce Lee'],
    ['Everybody has a plan until they get punched in the mouth.', 'Mike Tyson'],
    ['Nothing diminishes anxiety faster than action.', 'Walter Anderson'],
    ['Great moments are born from great opportunity.', 'Herb Brooks'],
    ['You were born to be a player. You were meant to be here. This moment is yours.', 'Herb Brooks'],
    ['You miss 100% of the shots you don’t take.', 'Wayne Gretzky'],
    ['Skate to where the puck is going, not where it has been.', 'Wayne Gretzky'],
  ].map(([text, author], i) => ({ id: uid('q'), order: i, text, author }));
}
