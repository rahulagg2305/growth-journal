import { state, load, onChange, sync, installAutoSync, canSync } from './state.js';
import { el, clear } from './ui/dom.js';
import { renderToday, setAutofill } from './ui/today.js';
import { renderTargets } from './ui/targets.js';
import { renderInsights } from './ui/insights.js';
import { renderReview } from './ui/review.js';
import { renderSettings } from './ui/settings.js';
import { renderWizard } from './ui/wizard.js';
import { parseAutofill, toKey } from './logic.js';

const main = document.getElementById('main');
const pill = document.getElementById('sync-pill');
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

function updatePill() {
  const m = state.meta;
  pill.className = 'sync-pill';
  if (m.demo) { pill.textContent = 'Demo data'; pill.classList.add('pending'); }
  else if (!canSync()) { pill.textContent = 'This device only'; pill.classList.add('pending'); }
  else if (state.syncing) { pill.textContent = 'Syncing…'; pill.classList.add('pending'); }
  else if (m.lastError) { pill.textContent = m.lastError.status === 0 ? 'Offline · saved locally' : 'Sync issue'; pill.classList.add(m.lastError.status === 0 ? 'pending' : 'err'); }
  else if (m.dirty.length) { pill.textContent = `${m.dirty.length} waiting`; pill.classList.add('pending'); }
  else { pill.textContent = 'Synced'; pill.classList.add('ok'); }
}
pill.addEventListener('click', () => go('#settings'));

function route() {
  const [name, arg] = (location.hash.slice(1) || 'today').split('/');
  if (!state.meta.setupDone && !state.meta.demo && name !== 'wizard') return go('#wizard');
  document.querySelectorAll('nav.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (name === 'review' ? 'insights' : name)));
  window.scrollTo({ top: 0 });
  const ctx = { go };
  if (name === 'targets') renderTargets(main, ctx);
  else if (name === 'insights') renderInsights(main, ctx);
  else if (name === 'review') renderReview(main, ctx);
  else if (name === 'settings') renderSettings(main, ctx);
  else if (name === 'wizard') renderWizard(main, ctx);
  else renderToday(main, { ...ctx, date: arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : toKey() });
}

async function start() {
  try { await load(); }
  catch (e) { clear(main).append(el('div', { class: 'card' }, `Could not open local storage: ${e.message}`)); return; }
  const { values } = parseAutofill(location.search);
  if (Object.keys(values).length) setAutofill(values);
  onChange((what) => { updatePill(); if (what === 'all') route(); });
  window.addEventListener('hashchange', route);
  installAutoSync();
  updatePill();
  route();
  if (canSync()) sync({ full: true }).then(() => { updatePill(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
start();
