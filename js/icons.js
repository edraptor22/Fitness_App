/* Inline stroke icons — 24×24, currentColor, no dependency, no emoji.
   Keep paths simple: they're rendered small and should stay legible. */

const P = {
  /* navigation */
  today:    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8.5 14.5l2 2 4-4"/>',
  target:   '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>',
  layers:   '<path d="M12 3.5L3.5 8 12 12.5 20.5 8 12 3.5z"/><path d="M4 12.5L12 17l8-4.5"/><path d="M4 16.8L12 21l8-4.2"/>',
  clock:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>',
  book:     '<path d="M4 5.5A2 2 0 016 3.5h13v15H6a2 2 0 00-2 2z"/><path d="M4 18.5A2 2 0 016 20.5h13"/><path d="M8.5 8h7M8.5 11.5h5"/>',
  sliders:  '<path d="M5 7h9M18 7h1M5 12h3M12 12h7M5 17h8M17 17h2"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="15" cy="17" r="2"/>',

  /* workout kinds */
  dumbbell: '<path d="M3 9v6M6 7v10M18 7v10M21 9v6"/><path d="M6 12h12"/>',
  bolt:     '<path d="M13.5 3L5.5 13.5h5L10 21l8.5-10.5h-5L13.5 3z"/>',
  stretch:  '<path d="M3 13.5h3.5l2.2-4.5 2.6 8 2.4-6 1.8 2.5H21"/>',
  trophy:   '<path d="M7 4h10v5a5 5 0 01-10 0V4z"/><path d="M7 6H4.5v1.5A3.5 3.5 0 007.6 11M17 6h2.5v1.5A3.5 3.5 0 0116.4 11"/><path d="M12 14v3.5M8.5 20.5h7l-.7-3h-5.6l-.7 3z"/>',

  /* actions & chrome */
  chevron:  '<path d="M9.5 5.5l6.5 6.5-6.5 6.5"/>',
  back:     '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  check:    '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus:     '<path d="M12 5.5v13M5.5 12h13"/>',
  minus:    '<path d="M5.5 12h13"/>',
  more:     '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  play:     '<path d="M8 5.5l10 6.5-10 6.5v-13z"/>',
  scale:    '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M12 8.5v3M9 8.8a4 4 0 016 0"/><path d="M8 16h8"/>',
  search:   '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  flame:    '<path d="M12 3s5 4.2 5 8.6A5 5 0 017 11.6C7 9 9 7.5 9 7.5S9.2 10 11 10c1.5 0 1.5-2.2 1-4 0-1.5 0-3 0-3z"/>',
  gift:     '<rect x="3.5" y="9" width="17" height="11.5" rx="2"/><path d="M3.5 13.5h17M12 9v11.5"/><path d="M12 9S10.5 4.5 8 4.5a2.2 2.2 0 000 4.5M12 9s1.5-4.5 4-4.5a2.2 2.2 0 010 4.5"/>',
  trend:    '<path d="M3.5 16.5l5.5-5.5 3.5 3.5 7-7.5"/><path d="M15 7h4.5v4.5"/>',
};

export function icon(name, size = 20, cls = '') {
  return `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="${size}" height="${size}"
    fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
}

/** Which icon and colour band a workout type gets. */
export const KIND_ICON = { lift: 'dumbbell', plyo: 'bolt', mobility: 'stretch', custom: 'trophy' };

/** A rounded-square icon badge, tinted per workout type. */
export function kindBadge(kind, { done = false, size = 38 } = {}) {
  return `<span class="badge k-${kind}${done ? ' done' : ''}" style="width:${size}px;height:${size}px">
    ${icon(done ? 'check' : (KIND_ICON[kind] || 'trophy'), Math.round(size * 0.55))}
  </span>`;
}

/**
 * Progress ring, as in the inspiration screens.
 * `pct` 0..1, `tone` picks the stroke colour token.
 */
export function ring(pct, { label = '', value = '', size = 62, tone = 'accent' } = {}) {
  const r = 26, C = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return `<div class="ring-wrap">
    <svg class="ring" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="32" cy="32" r="${r}" class="ring-track"/>
      <circle cx="32" cy="32" r="${r}" class="ring-bar tone-${tone}"
        stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - p)).toFixed(1)}"/>
    </svg>
    <span class="ring-value">${value}</span>
    ${label ? `<span class="ring-label">${label}</span>` : ''}
  </div>`;
}
