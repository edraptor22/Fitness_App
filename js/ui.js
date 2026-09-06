/* DOM helpers, bottom sheets, toasts. Views build HTML strings and then wire
   behaviour with delegated listeners — no framework, no build step. */

import { icon } from './icons.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Parse an HTML string into a single element. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Delegated listener: on(root, '.btn', 'click', (e, target) => ...) */
export function on(root, selector, event, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* --------------------------------------------------------------- toasts */

export function toast(msg, ms = 1900) {
  const host = document.getElementById('toast-host');
  const node = el(`<div class="toast">${esc(msg)}</div>`);
  host.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, ms);
}

/* --------------------------------------------------------------- sheets */

let openSheet = null;

/**
 * Bottom sheet.
 * @param {object} o  { title, body (html string), confirm, cancel, danger, onMount(bodyEl, close), onConfirm(bodyEl) }
 * onConfirm returning `false` keeps the sheet open.
 */
export function sheet(o) {
  closeSheet();
  const host = document.getElementById('sheet-host');
  const node = el(`
    <div class="sheet-backdrop">
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet-head">
          <h2>${esc(o.title || '')}</h2>
          <button class="btn ghost" data-sheet-x>Close</button>
        </div>
        <div class="sheet-body">${o.body || ''}</div>
        ${o.confirm ? `<div class="sheet-foot">
          <button class="btn" data-sheet-x>${esc(o.cancel || 'Cancel')}</button>
          <button class="btn ${o.danger ? 'danger' : 'primary'}" data-sheet-ok>${esc(o.confirm)}</button>
        </div>` : ''}
      </div>
    </div>`);

  const body = node.querySelector('.sheet-body');
  const close = () => { node.remove(); if (openSheet === node) openSheet = null; };

  node.addEventListener('click', (e) => { if (e.target === node) close(); });
  node.querySelectorAll('[data-sheet-x]').forEach((b) => b.addEventListener('click', close));
  const ok = node.querySelector('[data-sheet-ok]');
  if (ok) ok.addEventListener('click', () => {
    if (o.onConfirm && o.onConfirm(body) === false) return;
    close();
  });

  host.appendChild(node);
  openSheet = node;
  if (o.onMount) o.onMount(body, close);
  return { node, body, close };
}

export function closeSheet() {
  if (openSheet) { openSheet.remove(); openSheet = null; }
}

/** Yes/no confirmation. Resolves true/false. */
export function confirmSheet({ title, message, confirm = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let decided = false;
    const s = sheet({
      title,
      body: `<div class="card-pad muted">${esc(message)}</div>`,
      confirm, danger,
      onConfirm: () => { decided = true; resolve(true); },
    });
    s.node.addEventListener('click', (e) => {
      if (e.target === s.node && !decided) { decided = true; resolve(false); }
    });
    s.node.querySelectorAll('[data-sheet-x]').forEach((b) =>
      b.addEventListener('click', () => { if (!decided) { decided = true; resolve(false); } }));
  });
}

/** Single-line text prompt. Resolves the string, or null if cancelled. */
export function promptSheet({ title, label = '', value = '', placeholder = '', confirm = 'Save' }) {
  return new Promise((resolve) => {
    let decided = false;
    const s = sheet({
      title,
      body: `<div class="field">
               ${label ? `<label>${esc(label)}</label>` : ''}
               <input type="text" data-prompt value="${esc(value)}" placeholder="${esc(placeholder)}" autocapitalize="words">
             </div>`,
      confirm,
      onMount: (b) => setTimeout(() => b.querySelector('[data-prompt]')?.focus(), 60),
      onConfirm: (b) => {
        const v = b.querySelector('[data-prompt]').value.trim();
        if (!v) return false;
        decided = true; resolve(v);
      },
    });
    s.node.querySelectorAll('[data-sheet-x]').forEach((b) =>
      b.addEventListener('click', () => { if (!decided) { decided = true; resolve(null); } }));
  });
}

/** Action list ("…" menus). Options: [{label, value, danger}] */
export function menuSheet(title, options) {
  return new Promise((resolve) => {
    let decided = false;
    const body = `<div class="card" style="margin:0 12px 8px;">
      ${options.map((o) => `<button class="row" data-val="${esc(o.value)}">
        <span class="grow row-title" ${o.danger ? 'style="color:var(--danger)"' : ''}>${esc(o.label)}</span>
      </button>`).join('')}
    </div>`;
    const s = sheet({
      title,
      body,
      onMount: (b, close) => {
        on(b, '[data-val]', 'click', (e, t) => {
          decided = true; resolve(t.dataset.val); close();
        });
      },
    });
    s.node.addEventListener('click', (e) => {
      if (e.target === s.node && !decided) { decided = true; resolve(null); }
    });
    s.node.querySelectorAll('[data-sheet-x]').forEach((b) =>
      b.addEventListener('click', () => { if (!decided) { decided = true; resolve(null); } }));
  });
}

/* ---------------------------------------------------------- form pieces */

export function switchRow(label, name, checked, sub = '') {
  return `<div class="field field-inline">
    <div class="grow">
      <label for="sw_${esc(name)}">${esc(label)}</label>
      ${sub ? `<div class="tiny dim">${esc(sub)}</div>` : ''}
    </div>
    <label class="switch">
      <input type="checkbox" id="sw_${esc(name)}" name="${esc(name)}" ${checked ? 'checked' : ''}><span></span>
    </label>
  </div>`;
}

export function textField(label, name, value, opts = {}) {
  const type = opts.type || 'text';
  return `<div class="field">
    <label>${esc(label)}</label>
    <input type="${type}" name="${esc(name)}" value="${esc(value ?? '')}"
      placeholder="${esc(opts.placeholder || '')}"
      ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ''}
      ${opts.step ? `step="${opts.step}"` : ''}
      autocapitalize="${opts.autocapitalize || 'sentences'}" autocorrect="off">
  </div>`;
}

export function selectField(label, name, value, options) {
  return `<div class="field">
    <label>${esc(label)}</label>
    <select name="${esc(name)}">
      ${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}
    </select>
  </div>`;
}

export function textareaField(label, name, value, placeholder = '') {
  return `<div class="field">
    <label>${esc(label)}</label>
    <textarea name="${esc(name)}" placeholder="${esc(placeholder)}">${esc(value ?? '')}</textarea>
  </div>`;
}

/** Read a form-ish container into a plain object. */
export function readFields(root) {
  const out = {};
  $$('input[name], select[name], textarea[name]', root).forEach((f) => {
    out[f.name] = f.type === 'checkbox' ? f.checked : f.value;
  });
  return out;
}

export function emptyState(iconName, text, hint = '') {
  return `<div class="empty"><span class="big">${icon(iconName, 34)}</span>${esc(text)}
    ${hint ? `<div class="tiny" style="margin-top:6px">${esc(hint)}</div>` : ''}</div>`;
}
