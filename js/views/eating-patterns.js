/* What the urge log adds up to: the Day 140 objective, when the urges hit,
   and what's driving them. Read-only — no controls live here. */

import * as store from '../store.js';
import { esc } from '../ui.js';

const hourLabel = (h) => {
  const ampm = h < 12 ? 'am' : 'pm';
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n}${ampm}`;
};

/**
 * "I decide when I eat" — the Day 140 objective, scored over the last two
 * weeks. Riding it out and eating it on purpose both count; only automatic
 * eating doesn't.
 */
export function decisionLine({ compact = false } = {}) {
  const s = store.decisionScore();
  if (s.pct === null) {
    return compact ? '' : `<div class="tiny dim" style="margin-top:10px">
      Log an urge or two and the objective starts scoring.</div>`;
  }
  const pct = Math.round(s.pct * 100);
  if (compact) {
    return `<div class="tiny dim" style="margin-top:8px">
      I decide when I eat · <b style="color:var(--good)">${pct}%</b> of the last ${s.total} urges</div>`;
  }
  return `
    <div class="objective">
      <div class="hero-label">The day 140 objective</div>
      <div class="objective-line">I decide when I eat</div>
      <div class="meter" style="margin-top:8px"><i class="${pct >= 80 ? 'full' : ''}" style="width:${pct}%"></i></div>
      <div class="tiny dim" style="margin-top:6px">
        ${s.decided} of ${s.total} urges in the last ${s.days} days were a decision, not a reflex
      </div>
    </div>`;
}

/** Time-of-day histogram, peak-window callout, and trigger ranking. */
export function urgePanel() {
  const hours = store.urgesByHour();
  const total = hours.reduce((a, b) => a + b, 0);
  const triggers = store.urgeTriggerCounts();
  const peak = store.peakWindow();
  const score = store.decisionScore();

  if (!total) {
    return `
      <div class="section-title">Urges</div>
      <div class="card card-pad small muted">
        Tap <b>I want to eat</b> on Today when you want food outside a meal.
        After a couple of weeks this shows when the urges hit and what's driving
        them — which turns it from a willpower problem into a scheduling one.
      </div>`;
  }

  const max = Math.max(...hours);
  return `
    <div class="section-title">Urges · last 6 weeks</div>
    <div class="card card-pad">
      ${score.pct !== null ? `
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
          <span class="small" style="font-weight:600">Decided, not reflex</span>
          <span class="mono" style="font-weight:700;color:var(--good)">${Math.round(score.pct * 100)}%</span>
        </div>` : ''}

      <div class="hourbars" role="img" aria-label="Urges by hour of day">
        ${hours.map((n, h) => `
          <i class="${peak && (h === peak.hour || h === peak.hour + 1) ? 'hot' : ''}"
             style="height:${max ? Math.max(3, (n / max) * 100) : 3}%" title="${hourLabel(h)}: ${n}"></i>`).join('')}
      </div>
      <div class="hourkey tiny dim">
        <span>12am</span><span>6am</span><span>noon</span><span>6pm</span><span>11pm</span>
      </div>

      ${peak ? `<div class="peak-note">
        <b>Your loop:</b> ${esc(hourLabel(peak.hour))}–${esc(hourLabel((peak.hour + 2) % 24))} —
        ${peak.count} of ${total} urges (${Math.round(peak.share * 100)}%).
        That's the window to build a routine around, not the moment to rely on willpower.
      </div>` : `<div class="tiny dim" style="margin-top:10px">
        A few more logged urges and the busiest window will show up here.</div>`}
    </div>

    ${triggers.length ? `
      <div class="card card-pad">
        <div class="tiny dim" style="margin-bottom:9px">What's driving them</div>
        ${triggers.map((t) => `
          <div style="margin-bottom:9px">
            <div style="display:flex;justify-content:space-between;font-size:13.5px">
              <span style="font-weight:600">${esc(t.label)}</span>
              <span class="mono muted">${t.count}</span>
            </div>
            <div class="meter"><i style="width:${(t.count / triggers[0].count * 100).toFixed(0)}%"></i></div>
          </div>`).join('')}
        <div class="tiny dim">
          ${esc(triggers[0].label.toLowerCase())} is the one to solve upstream —
          ${esc(store.urgeTrigger(triggers[0].id)?.suggest[0] || '')}.
        </div>
      </div>` : ''}`;
}
