import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import { seedConfig, seedMilestones } from '../js/model.js';

const cfg = seedConfig('2026-01-01T00:00:00Z');
const mkState = (days = {}, extra = {}) => {
  const years = {};
  for (const [k, e] of Object.entries(days)) { const y = L.yearOf(k); years[y] = years[y] || { days: {} }; years[y].days[k] = e; }
  return { config: cfg, milestones: seedMilestones(), targets: { targets: [] }, years, ...extra };
};
const allScores = (score) => Object.fromEntries(cfg.items.filter((i) => i.type !== 'metric').map((i) => [i.id, { score }]));

test('dates & weeks (Sunday → Saturday)', () => {
  assert.equal(L.dayOfWeek('2026-11-15'), 0); // Sunday
  assert.deepEqual(L.periodRange('weekly', '2026-11-18'), { start: '2026-11-15', end: '2026-11-21' });
  assert.deepEqual(L.periodRange('weekly', '2026-11-21'), { start: '2026-11-15', end: '2026-11-21' });
  assert.deepEqual(L.periodRange('monthly', '2026-02-10'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(L.previousRange('monthly', { start: '2026-03-01', end: '2026-03-31' }), { start: '2026-02-01', end: '2026-02-28' });
  const b1 = L.periodRange('biweekly', '2026-11-18');
  assert.equal(L.diffDays(b1.start, b1.end), 13);
  assert.equal(L.dayOfWeek(b1.start), 0);
  assert.deepEqual(L.periodRange('biweekly', L.addDays(b1.start, 10)), b1);
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.ok(!L.isValidKey('2026-02-30'));
});

test('growth score: weights renormalised over logged categories', () => {
  const e = { items: allScores(5) };
  assert.equal(L.growthScore(cfg, e), 100);
  const onlyLife = { items: { family: { score: 5 }, laughter: { score: 0 }, 'deep-work': { score: 5 } } };
  assert.equal(L.growthScore(cfg, onlyLife), 67);
  assert.equal(L.growthScore(cfg, { restDay: true, items: allScores(5) }), null);
});

test('metric items normalise against goal; HRV excluded', () => {
  const steps = cfg.items.find((i) => i.id === 'steps');
  assert.equal(L.itemValue(steps, { items: { steps: { values: { steps: 5000 } } } }), 50);
  assert.equal(L.itemValue(steps, { items: { steps: { values: { steps: 20000 } } } }), 100);
  const sleep = cfg.items.find((i) => i.id === 'sleep');
  assert.equal(L.itemValue(sleep, { items: { sleep: { score: 5, values: { hours: 4 } } } }), 75);
  const cs = L.categoryScores(cfg, { items: { hrv: { values: { hrv: 10 } }, energy: { score: 5 } } });
  assert.equal(cs.health, 100);
});

test('missed & rest days: consistency, streaks, nudges', () => {
  const s = mkState({ '2026-11-10': { items: allScores(4) }, '2026-11-11': { restDay: true, items: {} }, '2026-11-13': { items: allScores(4) } });
  assert.equal(L.loggingConsistency(s, { start: '2026-11-10', end: '2026-11-14' }, '2026-11-14'), 50); // 2 of 4 non-rest days
  assert.equal(L.showedUpStreak(s, '2026-11-14'), 1);
  assert.deepEqual(L.missNudge(s, '2026-11-14'), null);
  assert.equal(L.missNudge(s, '2026-11-15').level, 'once');
  assert.equal(L.missNudge(s, '2026-11-16').level, 'twice');
  assert.equal(L.isEditedLate('2026-11-01', '2026-11-08'), false);
  assert.equal(L.isEditedLate('2026-11-01', '2026-11-09'), true);
});

test('milestone target pace + catch-up plan', () => {
  const s = mkState();
  const list = s.milestones.lists.rag; // 10 milestones
  list[0].done = true; list[0].doneDate = '2026-01-20';
  list[1].done = true; list[1].doneDate = '2026-02-01';
  const t = { id: 't1', kind: 'milestones', name: 'RAG', itemIds: ['rag'], startDate: '2026-01-01', deadline: '2026-04-11' }; // 100 days
  const r = L.evaluateTarget(s, t, '2026-02-20'); // 50 days → expected 5
  assert.equal(r.expected, 5);
  assert.equal(r.done, 2);
  assert.equal(r.status, 'behind');
  assert.match(r.plan, /behind/);
  list.slice(2, 5).forEach((m) => { m.done = true; m.doneDate = '2026-02-15'; });
  assert.equal(L.evaluateTarget(s, t, '2026-02-20').status, 'on');
  list.forEach((m) => { m.done = true; m.doneDate = '2026-02-15'; });
  assert.equal(L.evaluateTarget(s, t, '2026-02-20').status, 'done');
});

test('status thresholds: 100% / 85%', () => {
  assert.equal(L.statusFor(1), 'on');
  assert.equal(L.statusFor(0.9), 'slight');
  assert.equal(L.statusFor(0.84), 'behind');
});

test('dailyMetric, daysPerWeek, avgScore targets', () => {
  const days = {};
  for (let i = 0; i < 14; i++) {
    const k = L.addDays('2026-11-01', i);
    days[k] = { items: { steps: { values: { steps: i % 2 ? 11000 : 9000 } }, jogging: { score: i % 3 === 0 ? 3 : 0 }, laughter: { score: 4 } } };
  }
  const s = mkState(days);
  const d = L.evaluateTarget(s, { id: 'a', kind: 'dailyMetric', name: 'Steps', itemIds: ['steps'], field: 'steps', targetValue: 10000, successPct: 80, startDate: '2026-11-01' }, '2026-11-14');
  assert.equal(d.pct, 50); assert.equal(d.status, 'behind');
  const j = L.evaluateTarget(s, { id: 'b', kind: 'daysPerWeek', name: 'Jog', itemIds: ['jogging'], targetValue: 3, startDate: '2026-11-01' }, '2026-11-14');
  assert.ok(j.thisCount >= 0 && j.plan.length > 0);
  const a = L.evaluateTarget(s, { id: 'c', kind: 'avgScore', name: 'Laugh', itemIds: ['laughter'], targetValue: 4, startDate: '2026-11-01' }, '2026-11-14');
  assert.equal(a.avg, 4); assert.equal(a.status, 'on');
});

test('metricTrend: baseline then progress', () => {
  const days = {};
  for (let i = 0; i < 10; i++) days[L.addDays('2026-01-01', i)] = { items: { hrv: { values: { hrv: 40 } } } };
  let s = mkState(days);
  const t = { id: 'h', kind: 'metricTrend', name: 'HRV', itemIds: ['hrv'], field: 'hrv', targetPct: 10, startDate: '2026-01-01', deadline: '2026-07-01' };
  assert.equal(L.evaluateTarget(s, t, '2026-01-10').status, 'baseline');
  for (let i = 10; i < 120; i++) days[L.addDays("2026-01-01", i)] = { items: { hrv: { values: { hrv: i < 14 ? 40 : 40 + (i > 90 ? 4 : 1) } } } };
  s = mkState(days);
  const r = L.evaluateTarget(s, t, L.addDays('2026-01-01', 119));
  assert.equal(r.baseline, 40);
  assert.ok(['on', 'slight', 'behind'].includes(r.status));
  assert.ok(r.current > 40);
});

test('progression engine: step-up, hold, accept history', () => {
  const days = {};
  for (let i = 0; i < 14; i++) days[L.addDays('2026-11-01', i)] = { items: { steps: { values: { steps: 10500 } } } };
  const targets = { targets: [{ id: 's', kind: 'dailyMetric', name: 'Steps', itemIds: ['steps'], field: 'steps', targetValue: 10000, startDate: '2026-10-01', status: 'active' },
    { id: 'z', kind: 'dailyMetric', name: 'Sleep', itemIds: ['sleep'], field: 'hours', targetValue: 8, startDate: '2026-10-01', fixed: true }] };
  const s = mkState(days, { targets });
  const sug = L.progressionSuggestions(s, '2026-11-14');
  assert.equal(sug.length, 1);
  assert.equal(sug[0].action, 'stepUp'); assert.equal(sug[0].to, 10500);
  L.applyProgression(targets, sug[0], true, '2026-11-14');
  assert.equal(targets.targets[0].targetValue, 10500);
  assert.equal(targets.targets[0].history.length, 1);
  assert.equal(L.progressionSuggestions(s, '2026-11-20').length, 0); // not yet 14 days since last check
  const low = {}; for (let i = 0; i < 14; i++) low[L.addDays('2026-11-01', i)] = { items: { steps: { values: { steps: 3000 } } } };
  const s2 = mkState(low, { targets: { targets: [{ ...targets.targets[0], lastProgressionCheck: '2026-10-01' }] } });
  assert.equal(L.progressionSuggestions(s2, '2026-11-14')[0].action, 'hold');
});

test('plateau detection', () => {
  const flat = {}; const today = '2026-06-30';
  for (let i = 0; i < 80; i++) flat[L.addDays(today, -i)] = { items: { steps: { values: { steps: 9000 + (i % 3) * 10 } } } };
  assert.ok(L.detectPlateau(mkState(flat), 'steps', 'steps', today));
  const rising = {};
  for (let i = 0; i < 80; i++) rising[L.addDays(today, -i)] = { items: { steps: { values: { steps: 12000 - i * 60 } } } };
  assert.equal(L.detectPlateau(mkState(rising), 'steps', 'steps', today), null);
  assert.equal(L.detectPlateau(mkState({}), 'steps', 'steps', today), null);
});

test('why-low patterns', () => {
  const days = {};
  for (let i = 0; i < 4; i++) days[L.addDays('2026-11-01', i)] = { roughDay: true, whyLow: ['tired'], items: { sleep: { score: 1, values: { hours: 5 } } } };
  const p = L.whyLowPatterns(mkState(days), { start: '2026-11-01', end: '2026-11-07' });
  assert.equal(p.lowDays, 4);
  assert.ok(p.insights.some((x) => /< 6 h sleep/.test(x)));
});

test('merge: newest updatedAt per day wins; nothing lost', () => {
  const local = { days: { a: { v: 1, updatedAt: '2026-01-02' }, b: { v: 1, updatedAt: '2026-01-01' } } };
  const remote = { days: { a: { v: 2, updatedAt: '2026-01-01' }, b: { v: 2, updatedAt: '2026-01-03' }, c: { v: 2, updatedAt: '2026-01-01' } } };
  const m = L.mergeYear(local, remote);
  assert.equal(m.days.a.v, 1); assert.equal(m.days.b.v, 2); assert.equal(m.days.c.v, 2);
  assert.equal(L.mergeFile({ updatedAt: '2' }, { updatedAt: '1' }).updatedAt, '2');
});

test('autofill URL params validated', () => {
  const r = L.parseAutofill('?date=2026-11-15&steps=10234.6&km=7,4&sleep=7.85&hrv=abc');
  assert.deepEqual(r.values, { date: '2026-11-15', steps: 10235, km: 7.4, sleep: 7.9 });
  assert.deepEqual(r.rejected, ['hrv']);
  assert.deepEqual(L.parseAutofill('?steps=-5&date=2026-13-01').rejected, ['date', 'steps']);
});

test('CSV + LLM review pack', () => {
  const s = mkState({ '2026-11-10': { note: 'good, "great" day', items: { ...allScores(3), steps: { values: { steps: 10000, km: 7 } } } } });
  const csv = L.toCSV(s);
  const [head, row] = csv.split('\n');
  assert.ok(head.startsWith('date,growth_score'));
  assert.ok(row.includes('"good, ""great"" day"'));
  assert.equal(head.split(',').length, row.match(/("([^"]|"")*"|[^,]*)(,|$)/g).length - 1 || head.split(',').length);
  const md = L.llmReviewPack(s, { start: '2026-11-01', end: '2026-11-30' }, '2026-11-15');
  assert.match(md, /Prompt for the LLM/);
  assert.match(md, /```csv/);
});

test('quotes rotate daily and include user quotes', () => {
  const b = [['a', 'x'], ['b', 'y'], ['c', 'z']];
  assert.notDeepEqual(L.quoteFor('2026-11-15', b), L.quoteFor('2026-11-16', b));
  const u = [['mine', 'me']];
  const two = [L.quoteFor('2026-11-15', b, u), L.quoteFor('2026-11-16', b, u)];
  assert.ok(two.some((q) => q[0] === 'mine'));
});

test('demo data generator', () => {
  const y = L.demoEntries(cfg, '2026-11-15', 120);
  const n = Object.values(y).reduce((s, x) => s + Object.keys(x.days).length, 0);
  assert.ok(n > 90 && n <= 120);
});
