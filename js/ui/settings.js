import { el, clear, toast, download, sheet } from './dom.js';
import { state, updateMeta, testConnection, sync, saveConfig, setDemo, importAll, exportAll } from '../state.js';
import * as L from '../logic.js';
import { uid } from '../model.js';

export function renderSettings(root, { go }) {
  clear(root);
  const m = state.meta;
  root.append(el('h1', {}, 'Settings'));

  // --- GitHub sync ---
  const owner = el('input', { type: 'text', value: m.owner, placeholder: 'GitHub username', autocapitalize: 'off', autocomplete: 'off', spellcheck: false });
  const repo = el('input', { type: 'text', value: m.repo, placeholder: 'growth-journal-data', autocapitalize: 'off', spellcheck: false });
  const token = el('input', { type: 'password', value: m.token, placeholder: 'github_pat_…', autocomplete: 'off' });
  const status = el('p', { class: 'small' });
  const showStatus = () => {
    if (m.demo) status.textContent = '🧪 Demo mode is ON — nothing syncs.';
    else if (!m.token) status.textContent = '⚪ Not connected — data is only on this device.';
    else if (m.lastError) status.textContent = `🌸 ${m.lastError.message} (${new Date(m.lastError.at).toLocaleString()})`;
    else status.textContent = `🌿 Synced ${m.lastSync ? new Date(m.lastSync).toLocaleString() : 'never'}${m.dirty.length ? ` · ${m.dirty.length} change(s) waiting` : ''}`;
  };
  showStatus();
  root.append(el('div', { class: 'card stack', style: { marginTop: '12px' } }, el('h2', {}, '🔄 Sync with your private GitHub repo'),
    el('p', { class: 'small muted' }, 'Your data is saved on this device first, then pushed automatically to your private repo after every save. The token stays on this device.'),
    el('label', { class: 'f' }, 'GitHub username'), owner, el('label', { class: 'f' }, 'Data repository'), repo, el('label', { class: 'f' }, 'Fine-grained token (Contents: Read and write, this repo only)'), token,
    el('div', { class: 'row wrap-row' },
      el('button', { class: 'btn primary', onclick: async () => {
        const meta = { owner: owner.value.trim(), repo: repo.value.trim(), token: token.value.trim() };
        try {
          const r = await testConnection(meta);
          if (!r.private) toast('⚠️ Warning: this repo is PUBLIC. Make it private!', 4000);
          if (!r.canPush) throw new Error('Token cannot write to this repo');
          await updateMeta({ ...meta, lastError: null });
          toast(`Connected to ${r.fullName} ✓`);
          await sync({ full: true }); showStatus();
        } catch (e) { toast(`Connection failed: ${e.message}`, 4000); }
      } }, 'Test & connect'),
      el('button', { class: 'btn ghost', onclick: async () => { await sync({ full: true }); showStatus(); toast(m.lastError ? 'Sync failed' : 'Synced ✓'); } }, 'Sync now')),
    status));

  // --- Weights ---
  const w = state.config.weights;
  const wInputs = {};
  root.append(el('div', { class: 'card stack', style: { marginTop: '12px' } }, el('h2', {}, '⚖️ Growth Score weights'),
    el('div', { class: 'grid three' }, state.config.categories.map((c) => el('div', {}, el('label', { class: 'f' }, c.name), wInputs[c.id] = el('input', { type: 'number', min: 0, max: 100, value: w[c.id] ?? 0 })))),
    el('button', { class: 'btn soft', onclick: async () => {
      const next = {}; let sum = 0;
      for (const [k, i] of Object.entries(wInputs)) { next[k] = Math.max(0, Number(i.value) || 0); sum += next[k]; }
      if (sum !== 100) return toast(`Weights add up to ${sum}. Please make them total 100.`);
      state.config.weights = next; await saveConfig(); toast('Weights saved');
    } }, 'Save weights')));

  // --- Items ---
  const itemsCard = el('div', { class: 'card', style: { marginTop: '12px' } }, el('div', { class: 'row spread' }, el('h2', {}, '📋 Tracked items'), el('button', { class: 'btn sm primary', onclick: () => editItem(null, () => renderSettings(root, { go })) }, '+ Add')));
  for (const cat of state.config.categories) {
    const items = state.config.items.filter((i) => i.category === cat.id).sort((a, b) => a.order - b.order);
    itemsCard.append(el('h3', { style: { marginTop: '12px' } }, `${cat.emoji || ''} ${cat.name}`));
    for (const it of items) {
      itemsCard.append(el('div', { class: 'lag' }, el('span', { class: it.archived ? 'muted' : '' }, it.name, it.archived ? ' (archived)' : ''),
        el('span', { class: 'row' },
          el('button', { class: 'btn sm ghost', 'aria-label': 'Move up', onclick: async () => {
            const idx = items.indexOf(it); if (idx <= 0) return;
            const a = items[idx - 1]; [a.order, it.order] = [it.order, a.order]; if (a.order === it.order) it.order -= 1;
            await saveConfig(); renderSettings(root, { go });
          } }, '↑'),
          el('button', { class: 'btn sm ghost', onclick: () => editItem(it, () => renderSettings(root, { go })) }, 'Edit'))));
    }
  }
  root.append(itemsCard);

  // --- Export / import ---
  const today = L.toKey();
  const rangeSel = el('select', {}, [['90', 'Last 3 months'], ['182', 'Last 6 months'], ['365', 'Last 12 months'], ['all', 'Everything']].map(([v, t]) => el('option', { value: v }, t)));
  const fileIn = el('input', { type: 'file', accept: 'application/json', class: 'hidden', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const data = JSON.parse(await f.text()); await importAll(data); toast('Imported and merged ✓'); } catch (err) { toast(`Import failed: ${err.message}`); }
  } });
  root.append(el('div', { class: 'card stack', style: { marginTop: '12px' } }, el('h2', {}, '📤 Export & review'),
    el('label', { class: 'f' }, 'Range for the LLM review pack'), rangeSel,
    el('div', { class: 'row wrap-row' },
      el('button', { class: 'btn primary', onclick: () => {
        const first = L.allEntries(state)[0]?.[0] || today;
        const start = rangeSel.value === 'all' ? first : L.addDays(today, -Number(rangeSel.value) + 1);
        download(`growth-review-${start}_to_${today}.md`, L.llmReviewPack(state, { start, end: today }, today), 'text/markdown');
      } }, '🤖 LLM review pack'),
      el('button', { class: 'btn soft', onclick: () => download(`growth-journal-${today}.csv`, L.toCSV(state), 'text/csv') }, 'CSV'),
      el('button', { class: 'btn soft', onclick: () => download(`growth-journal-${today}.json`, JSON.stringify(exportAll(), null, 1), 'application/json') }, 'JSON backup'),
      el('button', { class: 'btn ghost', onclick: () => fileIn.click() }, 'Import JSON'), fileIn)));

  // --- Shortcut / misc ---
  root.append(el('div', { class: 'card stack', style: { marginTop: '12px' } }, el('h2', {}, '📱 Apple Shortcut (auto-fill + 9:30 pm reminder)'),
    el('p', { class: 'small' }, 'The Shortcut opens this page with numbers from Apple Health, e.g.:'),
    el('code', { class: 'small', style: { wordBreak: 'break-all' } }, `${location.origin}${location.pathname}?steps=10234&km=7.4&sleep=7.8&hrv=45#today`),
    el('p', { class: 'small muted' }, 'Full step-by-step guide: SHORTCUT.md in the app repository.')));

  root.append(el('div', { class: 'card stack', style: { marginTop: '12px' } }, el('h2', {}, '🧪 Advanced'),
    el('label', { class: 'row' }, el('input', { type: 'checkbox', checked: m.demo, onchange: async (e) => { await setDemo(e.target.checked); toast(e.target.checked ? 'Demo data ON (never synced)' : 'Back to your real data'); go('#insights'); } }), 'Demo data (120 random days to preview charts — never synced)'),
    el('button', { class: 'btn ghost', onclick: async () => { await updateMeta({ setupDone: false }); go('#wizard'); } }, 'Re-run setup guide'),
    el('p', { class: 'tiny muted' }, 'Growth Journal · data lives on this device + your private repo. No third-party services.')));
}

function editItem(it, done) {
  const isNew = !it;
  const d = it ? JSON.parse(JSON.stringify(it)) : { id: uid('item'), name: '', category: 'technical', type: 'score', order: 99, anchors: { 1: '', 3: '', 5: '' } };
  sheet((close) => {
    const body = el('div', { class: 'stack' });
    body.append(el('h2', {}, isNew ? 'New item' : `Edit ${it.name}`),
      el('label', { class: 'f' }, 'Name'), el('input', { type: 'text', value: d.name, oninput: (e) => { d.name = e.target.value; } }),
      el('label', { class: 'f' }, 'Category'), el('select', { onchange: (e) => { d.category = e.target.value; } }, state.config.categories.map((c) => el('option', { value: c.id, selected: d.category === c.id }, c.name))),
      el('label', { class: 'f' }, 'Type'), el('select', { disabled: !isNew, onchange: (e) => { d.type = e.target.value; } },
        [['score', 'Score 0–5'], ['score+minutes', 'Score + minutes'], ['learning', 'Learning (effort + milestones + minutes)'], ['metric', 'Number (e.g. steps)']].map(([v, t]) => el('option', { value: v, selected: d.type === v }, t))),
      el('label', { class: 'f' }, 'What does 1 mean?'), el('input', { type: 'text', value: d.anchors?.[1] || '', oninput: (e) => { d.anchors[1] = e.target.value; } }),
      el('label', { class: 'f' }, 'What does 3 mean?'), el('input', { type: 'text', value: d.anchors?.[3] || '', oninput: (e) => { d.anchors[3] = e.target.value; } }),
      el('label', { class: 'f' }, 'What does 5 mean?'), el('input', { type: 'text', value: d.anchors?.[5] || '', oninput: (e) => { d.anchors[5] = e.target.value; } }),
      el('div', { class: 'row wrap-row', style: { marginTop: '14px' } },
        el('button', { class: 'btn primary', onclick: async () => {
          if (!d.name.trim()) return toast('Name please');
          if (isNew && d.type === 'metric' && !d.fields) d.fields = [{ key: 'value', label: d.name, unit: '', min: 0, max: 100000, step: 1, primary: true }];
          const arr = state.config.items; const i = arr.findIndex((x) => x.id === d.id);
          if (i >= 0) arr[i] = d; else { d.order = arr.filter((x) => x.category === d.category).length; arr.push(d); }
          if (d.type === 'learning' && !state.milestones.lists[d.id]) state.milestones.lists[d.id] = [];
          await saveConfig(); close(); done?.(); toast('Saved');
        } }, 'Save'),
        !isNew ? el('button', { class: 'btn ghost', onclick: async () => { const x = state.config.items.find((y) => y.id === d.id); x.archived = !x.archived; await saveConfig(); close(); done?.(); toast(x.archived ? 'Archived (history kept)' : 'Restored'); } }, it.archived ? 'Restore' : 'Archive') : null,
        el('button', { class: 'btn ghost', onclick: close }, 'Cancel')));
    return body;
  });
}
