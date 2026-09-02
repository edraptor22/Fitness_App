/* Settings — preferences, backup, and the iPhone setup notes. */

import * as store from '../store.js';
import { esc, on, sheet, toast, confirmSheet, switchRow } from '../ui.js';
import { DOW_NAME, todayISO } from '../util.js';

export async function render(ctx) {
  const s = store.state.settings;
  const counts = {
    sessions: store.state.sessions.size,
    exercises: store.state.exercises.size,
    plans: store.state.plans.size,
  };

  const html = `
    <div class="section-title">Preferences</div>
    <div class="card">
      <div class="field"><label>Weight units</label>
        <select data-f="units">
          <option value="lb" ${s.units === 'lb' ? 'selected' : ''}>Pounds (lb)</option>
          <option value="kg" ${s.units === 'kg' ? 'selected' : ''}>Kilograms (kg)</option>
        </select></div>
      <div class="field"><label>Week starts on</label>
        <select data-f="weekStartsOn">
          ${[0, 1, 6].map((d) => `<option value="${d}" ${Number(s.weekStartsOn) === d ? 'selected' : ''}>${DOW_NAME[d]}</option>`).join('')}
        </select></div>
      <div class="field"><label>Appearance</label>
        <select data-f="theme">
          <option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>Match iPhone</option>
          <option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option>
          <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option>
        </select></div>
      ${switchRow('Show last session', 'showLastSession', !!s.showLastSession,
        'The previous performance under each exercise while logging.')}
    </div>

    <div class="section-title">Backup</div>
    <div class="card">
      <div class="card-pad small muted">
        Everything lives on this device only. Export now and then — before a new
        phone, an iOS update, or clearing Safari data.
      </div>
      <button class="row" data-export><span class="grow row-title">Export backup</span><span class="chev">&#8250;</span></button>
      <button class="row" data-import><span class="grow row-title">Restore from backup</span><span class="chev">&#8250;</span></button>
      <div class="card-pad tiny dim">
        ${counts.sessions} sessions · ${counts.exercises} exercises · ${counts.plans} plans
      </div>
    </div>

    <div class="section-title">Put it on your Home Screen</div>
    <div class="card card-pad small muted">
      In <b>Safari</b> (not Chrome), tap the Share button, then
      <b>Add to Home Screen</b>. Open it from that icon and it runs fullscreen
      with no address bar, works offline, and keeps its own data.
    </div>

    <div class="section-title">Workout reminders</div>
    <div class="card">
      <div class="card-pad small muted">
        No server, so no push notifications. The reliable free option is the
        iPhone's own Shortcuts app.
      </div>
      <button class="row" data-reminders><span class="grow row-title">How to set one up</span><span class="chev">&#8250;</span></button>
    </div>

    <div class="section-title">Danger zone</div>
    <div class="card">
      <button class="row" data-reset><span class="grow row-title" style="color:var(--danger)">Erase all data</span></button>
    </div>

    <div class="center tiny dim" style="margin:20px 0 8px">Lift Log · offline-first · v1.0</div>`;

  function mount(root) {
    on(root, '[data-f]', 'change', async (e, t) => {
      const v = t.dataset.f === 'weekStartsOn' ? Number(t.value) : t.value;
      await store.saveSettings({ [t.dataset.f]: v });
      ctx.refresh();
    });

    on(root, 'input[name=showLastSession]', 'change', (e, t) =>
      store.saveSettings({ showLastSession: t.checked }));

    on(root, '[data-export]', 'click', doExport);
    on(root, '[data-import]', 'click', () => doImport(ctx));
    on(root, '[data-reminders]', 'click', remindersSheet);

    on(root, '[data-reset]', 'click', async () => {
      const ok = await confirmSheet({
        title: 'Erase everything?',
        message: 'Plans, exercises and every logged session are deleted from this device. Export a backup first if you might want them back.',
        confirm: 'Erase',
      });
      if (!ok) return;
      await store.wipe();
      toast('Erased');
      ctx.go('/today');
    });
  }

  return { title: 'Settings', html, mount };
}

/* --------------------------------------------------------------- backup */

async function doExport() {
  const data = await store.exportData();
  const json = JSON.stringify(data, null, 2);
  const filename = `liftlog-${todayISO()}.json`;
  const file = new File([json], filename, { type: 'application/json' });

  // The share sheet is the one path that reliably saves to Files from a
  // standalone iOS home-screen app.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  sheet({
    title: 'Backup',
    body: `<div class="card-pad small muted">If nothing downloaded, copy the text below and paste it somewhere safe (Notes, email to yourself, a file in iCloud Drive).</div>
      <div class="field"><textarea data-json style="height:180px;font-size:12px;font-family:ui-monospace,Menlo,monospace">${esc(json)}</textarea></div>`,
    confirm: 'Copy',
    onConfirm(b) {
      const ta = b.querySelector('[data-json]');
      ta.select();
      navigator.clipboard?.writeText(ta.value).then(() => toast('Copied')).catch(() => document.execCommand('copy'));
    },
  });
}

function doImport(ctx) {
  sheet({
    title: 'Restore from backup',
    body: `
      <div class="card-pad small muted">This replaces everything currently on this device.</div>
      <div class="field"><label>Choose a .json file</label>
        <input type="file" accept="application/json,.json" data-file></div>
      <div class="field"><label>…or paste the backup text</label>
        <textarea data-paste placeholder='{"format":"liftlog", …}' style="height:120px;font-size:12px;font-family:ui-monospace,Menlo,monospace"></textarea></div>`,
    confirm: 'Restore',
    onMount(b) {
      b.querySelector('[data-file]').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (f) b.querySelector('[data-paste]').value = await f.text();
      });
    },
    onConfirm(b) {
      const raw = b.querySelector('[data-paste]').value.trim();
      if (!raw) { toast('Nothing to restore'); return false; }
      let data;
      try { data = JSON.parse(raw); } catch { toast('That is not valid JSON'); return false; }
      store.importData(data)
        .then(() => { toast('Restored'); ctx.go('/today'); ctx.refresh(); })
        .catch((err) => toast(err.message));
    },
  });
}

/* ------------------------------------------------------------ reminders */

function remindersSheet() {
  sheet({
    title: 'Workout reminders',
    body: `<div class="card-pad small muted" style="line-height:1.55">
      <p style="margin-top:0"><b>Shortcuts (recommended)</b></p>
      <ol style="padding-left:18px;margin:0 0 14px">
        <li>Open the <b>Shortcuts</b> app → <b>Automation</b> tab → <b>+</b>.</li>
        <li>Choose <b>Time of Day</b>, pick your workout time, and select the days you train.</li>
        <li>Set it to <b>Run Immediately</b> and turn off "Notify When Run" only if you want it silent.</li>
        <li>Add the action <b>Open URLs</b> and paste this app's address, or <b>Open App</b> and pick Lift Log if you added it to the Home Screen.</li>
      </ol>
      <p><b>Simpler: a repeating Calendar event</b><br>
      Create an all-day or timed repeating event called "Workout" with an alert. It nags you at the right time and costs nothing.</p>
      <p class="tiny dim" style="margin-bottom:0">Real push notifications need a server to send them. If you ever want that, a free Cloudflare Worker plus the Web Push API can do it — the app is built so that can be bolted on later.</p>
    </div>`,
  });
}
