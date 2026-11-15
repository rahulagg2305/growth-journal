// App state: loads from IndexedDB, saves locally first, then syncs to GitHub automatically.
import * as store from './store.js';
import { makeClient, SyncError } from './sync.js';
import { seedConfig, seedMilestones, seedTargets, emptyYear } from './model.js';
import { mergeYear, mergeFile, sameJson, toKey, yearOf, demoEntries, isEditedLate } from './logic.js';

export const state = {
  config: null, milestones: null, targets: null, years: {}, userQuotes: [],
  meta: { owner: '', repo: 'growth-journal-data', token: '', shas: {}, dirty: [], lastSync: null, lastError: null, setupDone: false, demo: false },
  syncing: false,
};
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = (what) => listeners.forEach((fn) => fn(what));

const fileKey = (path) => `file:${path}`;
function pathsLocal() {
  return ['config.json', 'targets.json', 'milestones.json', ...Object.keys(state.years).map((y) => `entries/${y}.json`)];
}
function getLocal(path) {
  if (path === 'config.json') return state.config;
  if (path === 'targets.json') return state.targets;
  if (path === 'milestones.json') return state.milestones;
  if (path === 'quotes.json') return state.userQuotes.length ? state.userQuotes : null;
  const m = path.match(/^entries\/(\d{4})\.json$/);
  return m ? state.years[m[1]] || null : null;
}
function setLocal(path, val) {
  if (path === 'config.json') state.config = val;
  else if (path === 'targets.json') state.targets = val;
  else if (path === 'milestones.json') state.milestones = val;
  else if (path === 'quotes.json') state.userQuotes = Array.isArray(val) ? val.filter((q) => Array.isArray(q) && q[0]) : [];
  else { const m = path.match(/^entries\/(\d{4})\.json$/); if (m) state.years[m[1]] = val; }
}

export async function load() {
  state.meta = { ...state.meta, ...((await store.get('meta')) || {}) };
  if (state.meta.demo) { loadDemo(); return; }
  state.config = (await store.get(fileKey('config.json'))) || seedConfig();
  state.targets = (await store.get(fileKey('targets.json'))) || seedTargets();
  state.milestones = (await store.get(fileKey('milestones.json'))) || seedMilestones();
  state.userQuotes = (await store.get(fileKey('quotes.json'))) || [];
  state.years = {};
  for (const k of await store.keys()) {
    const m = String(k).match(/^file:entries\/(\d{4})\.json$/);
    if (m) state.years[m[1]] = await store.get(k);
  }
  store.persist();
}

function loadDemo() {
  state.config = seedConfig(); state.milestones = seedMilestones(); state.targets = seedTargets();
  const today = toKey();
  state.years = demoEntries(state.config, today, 120);
  // tick a few milestones so charts have content
  Object.values(state.milestones.lists).forEach((list, i) => list.slice(0, 2 + (i % 3)).forEach((m, j) => { m.done = true; m.doneDate = toKey(new Date(Date.now() - (60 - j * 20) * 864e5)); }));
  const start = toKey(new Date(Date.now() - 100 * 864e5));
  const dl = toKey(new Date(Date.now() + 120 * 864e5));
  state.targets.targets = [
    { id: 'd1', kind: 'milestones', name: 'RAG mastery', itemIds: ['rag'], startDate: start, deadline: dl, status: 'active' },
    { id: 'd2', kind: 'milestones', name: 'XYZ project launch', itemIds: ['xyz-project'], startDate: start, deadline: dl, status: 'active' },
    { id: 'd3', kind: 'dailyMetric', name: 'Daily steps', itemIds: ['steps'], field: 'steps', targetValue: 10000, successPct: 80, startDate: start, status: 'active' },
    { id: 'd4', kind: 'daysPerWeek', name: 'Jogging days', itemIds: ['jogging'], targetValue: 3, startDate: start, status: 'active' },
    { id: 'd5', kind: 'metricTrend', name: 'HRV +10%', itemIds: ['hrv'], field: 'hrv', targetPct: 10, startDate: start, deadline: dl, status: 'active' },
  ];
}

async function saveMeta() { await store.set('meta', state.meta); }
async function saveFile(path) {
  if (state.meta.demo) return;
  await store.set(fileKey(path), getLocal(path));
  if (!state.meta.dirty.includes(path)) state.meta.dirty.push(path);
  await saveMeta();
}

// ---- Mutations (all local-first, then auto-sync) ----
export async function saveEntry(dateKey, entry) {
  const y = String(yearOf(dateKey));
  if (!state.years[y]) state.years[y] = emptyYear(Number(y));
  const prev = state.years[y].days[dateKey];
  const now = new Date().toISOString();
  const today = toKey();
  entry.createdAt = prev?.createdAt || now;
  entry.updatedAt = now;
  entry.editedLate = !!(prev?.editedLate || (isEditedLate(dateKey, today) ));
  state.years[y].days[dateKey] = entry;
  await saveFile(`entries/${y}.json`);
  emit('entries'); scheduleSync();
}
export async function saveConfig() { state.config.updatedAt = new Date().toISOString(); await saveFile('config.json'); emit('config'); scheduleSync(); }
export async function saveTargets() { state.targets.updatedAt = new Date().toISOString(); await saveFile('targets.json'); emit('targets'); scheduleSync(); }
export async function saveMilestones() { state.milestones.updatedAt = new Date().toISOString(); await saveFile('milestones.json'); emit('milestones'); scheduleSync(); }
export async function updateMeta(patch) { Object.assign(state.meta, patch); await saveMeta(); emit('meta'); }

export async function setDemo(on) {
  state.meta.demo = on; await saveMeta();
  await load(); emit('all');
}

export async function importAll(data) {
  if (data.config) state.config = data.config;
  if (data.targets) state.targets = data.targets;
  if (data.milestones) state.milestones = data.milestones;
  for (const [y, file] of Object.entries(data.years || {})) state.years[y] = mergeYear(file, state.years[y]);
  for (const p of pathsLocal()) await saveFile(p);
  emit('all'); scheduleSync();
}
export function exportAll() {
  return { exportedAt: new Date().toISOString(), config: state.config, targets: state.targets, milestones: state.milestones, years: state.years };
}

// ---- Sync ----
let timer = null;
export function scheduleSync(delay = 800) { clearTimeout(timer); timer = setTimeout(() => sync(), delay); }
export const canSync = () => !state.meta.demo && state.meta.token && state.meta.owner && state.meta.repo;

let running = null;
export function sync({ full = false } = {}) {
  if (!canSync()) return Promise.resolve({ skipped: true });
  if (running) return running;
  running = doSync(full).finally(() => { running = null; });
  return running;
}

async function pullOne(client, path) {
  const remote = await client.getFile(path);
  if (!remote) return false;
  const pristine = !state.meta.shas[path] && !state.meta.dirty.includes(path); // untouched seed on a new device
  state.meta.shas[path] = remote.sha;
  const local = getLocal(path);
  if (path === 'quotes.json') { const before = JSON.stringify(state.userQuotes); setLocal(path, remote.json); await store.set(fileKey(path), state.userQuotes); return before !== JSON.stringify(state.userQuotes); }
  const merged = path.startsWith('entries/') ? mergeYear(local, remote.json) : pristine ? remote.json : mergeFile(local, remote.json);
  setLocal(path, merged);
  await store.set(fileKey(path), merged);
  if (!sameJson(merged, remote.json)) { if (!state.meta.dirty.includes(path)) state.meta.dirty.push(path); }
  else state.meta.dirty = state.meta.dirty.filter((p) => p !== path);
  return !sameJson(local, merged);
}

async function doSync(full) {
  state.syncing = true; emit('sync');
  const client = makeClient(state.meta);
  try {
    if (full || !state.meta.lastSync) {
      const remoteYears = (await client.listDir('entries')).map((n) => n.match(/^(\d{4})\.json$/)?.[1]).filter(Boolean);
      const paths = new Set([...pathsLocal(), ...remoteYears.map((y) => `entries/${y}.json`), 'quotes.json']);
      let changed = false;
      for (const p of paths) changed = (await pullOne(client, p)) || changed;
      // first ever sync on a fresh repo: push seed files
      for (const p of ['config.json', 'targets.json', 'milestones.json']) if (!state.meta.shas[p] && !state.meta.dirty.includes(p)) state.meta.dirty.push(p);
      if (changed) emit('all');
    }
    for (const path of [...state.meta.dirty]) {
      if (path === 'quotes.json') continue;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const sha = await client.putFile(path, getLocal(path), state.meta.shas[path], `journal: ${toKey()} update ${path}`);
          state.meta.shas[path] = sha;
          state.meta.dirty = state.meta.dirty.filter((p) => p !== path);
          break;
        } catch (e) {
          if (e.status !== 409 || attempt === 3) throw e;
          await pullOne(client, path); // merge remote changes, then retry
        }
      }
    }
    state.meta.lastSync = new Date().toISOString();
    state.meta.lastError = null;
  } catch (e) {
    state.meta.lastError = e instanceof SyncError ? { message: e.message, status: e.status, at: new Date().toISOString() } : { message: String(e.message || e), at: new Date().toISOString() };
  } finally {
    state.syncing = false;
    await saveMeta();
    emit('sync');
  }
  return { ok: !state.meta.lastError };
}

export async function testConnection(meta) {
  return makeClient(meta).testConnection();
}

// Auto-sync triggers
export function installAutoSync() {
  window.addEventListener('online', () => sync());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync({ full: true }); });
  setInterval(() => { if (state.meta.dirty.length) sync(); }, 60000);
}
