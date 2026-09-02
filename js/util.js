/* Small helpers: ids, dates, formatting. No DOM in here. */

export const uid = (prefix = 'x') =>
  prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ------------------------------------------------------------------ dates
   Dates are stored as local 'YYYY-MM-DD' strings so a session never drifts
   across a timezone boundary the way an ISO timestamp would. */

export function toISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISO(new Date());

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export const dowOf = (iso) => fromISO(iso).getDay();     // 0 = Sunday

export const DOW_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DOW_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Order the 7 weekday indices starting from `startsOn` (0=Sun, 1=Mon). */
export function dowOrder(startsOn = 1) {
  return Array.from({ length: 7 }, (_, i) => (i + startsOn) % 7);
}

/** First day of the week containing `iso`, as an ISO string. */
export function weekStart(iso, startsOn = 1) {
  const d = fromISO(iso);
  const shift = (d.getDay() - startsOn + 7) % 7;
  d.setDate(d.getDate() - shift);
  return toISO(d);
}

export function weekDates(iso, startsOn = 1) {
  const s = weekStart(iso, startsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function fmtDate(iso, opts = {}) {
  const t = todayISO();
  if (!opts.absolute) {
    if (iso === t) return 'Today';
    if (iso === addDays(t, -1)) return 'Yesterday';
    if (iso === addDays(t, 1)) return 'Tomorrow';
  }
  const d = fromISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: opts.weekday === false ? undefined : 'short',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

/** "3d ago", "2w ago" — used on the last-session line. */
export function fmtAgo(iso) {
  const days = Math.round((fromISO(todayISO()) - fromISO(iso)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 28) return `${Math.floor(days / 7)}w ago`;
  return fmtDate(iso, { absolute: true, weekday: false });
}

/* -------------------------------------------------------------- numbers */

export function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Trim trailing zeros: 102.50 -> "102.5", 100 -> "100" */
export function fmtNum(n) {
  if (n === null || n === undefined || n === '') return '';
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return String(Math.round(v * 100) / 100);
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function pluralize(n, one, many) {
  return `${fmtNum(n)} ${n === 1 ? one : (many || one + 's')}`;
}

/* --------------------------------------------------------------- metrics
   A "set" is one object; which fields matter is decided by the exercise's
   `track` flags, so plyometrics and sports reuse the same shape as lifting. */

export const METRICS = ['weight', 'reps', 'duration', 'distance'];

export const METRIC_LABEL = {
  weight: 'Weight',
  reps: 'Reps',
  duration: 'Time',
  distance: 'Dist',
};

export function metricStep(metric, ex, settings) {
  switch (metric) {
    case 'weight': return settings.units === 'kg' ? 2.5 : 5;
    case 'reps': return 1;
    case 'duration': return ex.durationUnit === 'sec' ? 5 : 1;
    case 'distance': return 5;
    default: return 1;
  }
}

export function metricUnit(metric, ex, settings) {
  switch (metric) {
    case 'weight': return settings.units;
    case 'reps': return '';
    case 'duration': return ex.durationUnit === 'sec' ? 's' : 'min';
    case 'distance': return ex.distanceUnit || 'm';
    default: return '';
  }
}

export function activeMetrics(ex) {
  return METRICS.filter((m) => ex.track && ex.track[m]);
}

/** "100lb x 6" / "3 x 30s" / "20 reps" — one set, compactly. */
export function fmtSet(set, ex, settings) {
  const parts = [];
  if (ex.track?.weight && set.weight) parts.push(`${fmtNum(set.weight)}${settings.units}`);
  if (ex.track?.reps && set.reps) parts.push(`${fmtNum(set.reps)}`);
  if (ex.track?.duration && set.duration) parts.push(`${fmtNum(set.duration)}${metricUnit('duration', ex, settings)}`);
  if (ex.track?.distance && set.distance) parts.push(`${fmtNum(set.distance)}${metricUnit('distance', ex, settings)}`);
  if (!parts.length) return '—';
  if (ex.track?.weight && ex.track?.reps && set.weight && set.reps) {
    const rest = parts.slice(2);
    return [`${fmtNum(set.weight)}${settings.units} × ${fmtNum(set.reps)}`, ...rest].join(' · ');
  }
  return parts.join(' × ');
}

/** Collapse identical consecutive sets: "100lb x 6, 6" instead of repeats. */
export function fmtSetList(sets, ex, settings, max = 4) {
  const done = sets.filter((s) => s.done !== false && hasValue(s));
  const list = (done.length ? done : sets.filter(hasValue)).slice(0, max);
  const out = list.map((s) => fmtSet(s, ex, settings));
  const extra = (done.length ? done : sets.filter(hasValue)).length - list.length;
  return out.join(', ') + (extra > 0 ? ` +${extra}` : '');
}

export function hasValue(set) {
  return METRICS.some((m) => set[m] !== undefined && set[m] !== null && set[m] !== '' && Number(set[m]) !== 0);
}

/** Heaviest set (or most reps when weight isn't tracked) — used for charts. */
export function bestSet(sets, ex) {
  const valid = sets.filter((s) => s.done !== false && hasValue(s));
  if (!valid.length) return null;
  const key = ex.track?.weight ? 'weight'
    : ex.track?.distance ? 'distance'
    : ex.track?.duration ? 'duration' : 'reps';
  return valid.reduce((a, b) => (num(b[key]) > num(a[key]) ? b : a));
}

export function volumeOf(sets, ex) {
  if (!ex.track?.weight || !ex.track?.reps) return 0;
  return sets.reduce((t, s) => t + (s.done !== false ? num(s.weight) * num(s.reps) : 0), 0);
}

export const KIND_LABEL = {
  lift: 'Weights',
  plyo: 'Plyometrics',
  mobility: 'Mobility',
  custom: 'Custom',
};

export const KIND_ORDER = ['lift', 'plyo', 'mobility', 'custom'];
