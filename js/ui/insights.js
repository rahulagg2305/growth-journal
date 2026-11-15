import { el, clear, CAT_COLORS } from './dom.js';
import { state } from '../state.js';
import * as L from '../logic.js';

let charts = [];
let view = { kind: 'weekly', ref: null, custom: null };
const PALETTE = ['#A7C7E7', '#C9B6E4', '#A8D5BA', '#FFD6BA', '#F6D186', '#BFE8DC', '#F4A6A0'];

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function chart(canvas, cfg) {
  const Chart = window.Chart; if (!Chart) return;
  Chart.defaults.color = css('--muted'); Chart.defaults.borderColor = css('--line');
  Chart.defaults.font.family = css('--font');
  const c = new Chart(canvas, { ...cfg, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, plugins: { legend: { labels: { boxWidth: 10, usePointStyle: true } } }, ...(cfg.options || {}) } });
  charts.push(c); return c;
}
const box = (title, inner, extra) => el('div', { class: 'card' }, el('div', { class: 'row spread' }, el('h3', {}, title), extra || null), inner);
const canvasBox = (tall) => { const c = el('canvas'); return [el('div', { class: `chart-box ${tall ? 'tall' : ''}` }, c), c]; };

export function renderInsights(root, { go }) {
  charts.forEach((c) => c.destroy()); charts = [];
  clear(root);
  const today = L.toKey();
  view.ref = view.ref || today;
  const range = view.kind === 'custom' && view.custom ? view.custom : L.periodRange(view.kind === 'custom' ? 'monthly' : view.kind, view.ref);
  const prev = view.kind === 'custom' ? { start: L.addDays(range.start, -(L.diffDays(range.start, range.end) + 1)), end: L.addDays(range.start, -1) } : L.previousRange(view.kind, range);
  const cur = L.periodSummary(state, range, today);
  const old = L.periodSummary(state, prev, today);
  const cfg = state.config;

  // Header + controls
  const seg = el('div', { class: 'seg' }, [['weekly', 'Week'], ['biweekly', '2 weeks'], ['monthly', 'Month'], ['custom', 'Custom']].map(([k, label]) =>
    el('button', { class: view.kind === k ? 'on' : '', onclick: () => { view.kind = k; if (k === 'custom' && !view.custom) view.custom = { start: L.addDays(today, -89), end: today }; renderInsights(root, { go }); } }, label)));
  const shift = (dir) => { if (view.kind === 'custom') return; view.ref = dir < 0 ? L.addDays(range.start, -1) : L.addDays(range.end, 1); renderInsights(root, { go }); };
  root.append(el('div', { class: 'row spread wrap-row' }, el('h1', {}, 'Insights'), el('button', { class: 'btn sm soft', onclick: () => go('#review') }, '🗓️ Saturday review')));
  root.append(el('div', { class: 'row wrap-row', style: { margin: '12px 0' } }, seg,
    view.kind !== 'custom' ? el('div', { class: 'row' }, el('button', { class: 'btn sm ghost', onclick: () => shift(-1) }, '‹'), el('span', { class: 'small' }, `${L.fmtShort(range.start)} – ${L.fmtShort(range.end)}`), el('button', { class: 'btn sm ghost', onclick: () => shift(1), disabled: L.diffDays(today, range.end) >= 0 }, '›'))
      : el('div', { class: 'row' }, el('input', { type: 'date', value: view.custom.start, onchange: (e) => { view.custom.start = e.target.value; renderInsights(root, { go }); } }), el('input', { type: 'date', value: view.custom.end, onchange: (e) => { view.custom.end = e.target.value; renderInsights(root, { go }); } }))));

  const delta = (a, b, unit = '') => {
    if (a == null || b == null) return el('span', { class: 'tiny muted' }, ' —');
    const d = a - b; if (!d) return el('span', { class: 'tiny muted' }, ' ±0');
    return el('span', { class: `tiny delta ${d > 0 ? 'up' : 'down'}` }, ` ${d > 0 ? '▲' : '▼'}${Math.abs(d)}${unit}`);
  };
  root.append(el('div', { class: 'stats' },
    el('div', { class: 'stat' }, el('b', {}, cur.growth ?? '—', delta(cur.growth, old.growth)), el('span', {}, 'Growth Score')),
    el('div', { class: 'stat' }, el('b', {}, cur.consistency != null ? `${cur.consistency}%` : '—', delta(cur.consistency, old.consistency, '%')), el('span', {}, 'Logging consistency')),
    el('div', { class: 'stat' }, el('b', {}, cur.milestonesDone, delta(cur.milestonesDone, old.milestonesDone)), el('span', {}, 'Milestones done'))));

  const grid = el('div', { class: 'grid two', style: { marginTop: '14px' } });
  root.append(grid);
  const days = L.daysBetween(range.start, L.diffDays(today, range.end) > 0 ? today : range.end);
  const labels = days.map((k) => L.fmtShort(k));

  // Category averages with deltas
  grid.append(box('By category', el('div', {}, cfg.categories.map((c) => el('div', { class: 'lag' },
    el('span', {}, el('span', { class: 'cat-dot', style: { display: 'inline-block', marginRight: '8px', background: CAT_COLORS[c.id] } }), c.name),
    el('span', {}, cur.categories[c.id] ?? '—', delta(cur.categories[c.id], old.categories[c.id])))))));

  // Lagging + patterns
  const pat = L.whyLowPatterns(state, range);
  grid.append(box('Needs attention', el('div', {},
    cur.lagging.length ? cur.lagging.map((x) => el('div', { class: 'lag' }, el('span', {}, x.name), el('span', {}, `${Math.round((x.avg / 100) * 5 * 10) / 10}/5`))) : el('p', { class: 'muted small' }, 'Not enough data yet.'),
    pat.insights.length ? el('div', { class: 'plan' }, pat.insights.map((t) => el('div', {}, '• ', t))) : null)));

  // Growth trend
  const [g1, c1] = canvasBox();
  grid.append(box('Growth Score', g1));
  chart(c1, { type: 'line', data: { labels, datasets: [{ label: 'Growth', data: days.map((k) => { const e = L.getEntry(state, k); return L.isLogged(e) ? L.growthScore(cfg, e) : null; }), borderColor: '#9C86C9', backgroundColor: 'rgba(201,182,228,.35)', fill: true, tension: .35, spanGaps: true, pointRadius: 2 }] }, options: { scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } });

  // Radar
  const [g2, c2] = canvasBox();
  grid.append(box('Balance', g2));
  chart(c2, { type: 'radar', data: { labels: cfg.categories.map((c) => c.name), datasets: [
    { label: 'This period', data: cfg.categories.map((c) => cur.categories[c.id] ?? 0), borderColor: '#7FB394', backgroundColor: 'rgba(168,213,186,.35)', pointRadius: 2 },
    { label: 'Previous', data: cfg.categories.map((c) => old.categories[c.id] ?? 0), borderColor: '#A7C7E7', backgroundColor: 'rgba(167,199,231,.15)', borderDash: [4, 4], pointRadius: 0 },
  ] }, options: { scales: { r: { min: 0, max: 100, ticks: { display: false } } } } });

  // Category lines
  const [g3, c3] = canvasBox(true);
  grid.append(box('Category trends', g3));
  chart(c3, { type: 'line', data: { labels, datasets: cfg.categories.map((c) => ({ label: c.name, data: days.map((k) => { const e = L.getEntry(state, k); return L.isLogged(e) ? (L.categoryScores(cfg, e)[c.id] ?? null) : null; }), borderColor: CAT_COLORS[c.id], backgroundColor: CAT_COLORS[c.id], tension: .35, spanGaps: true, pointRadius: 0, borderWidth: 2.5 })) }, options: { scales: { y: { min: 0, max: 100 } } } });

  // Heatmap (last 16 weeks ending at range end)
  const hmEnd = L.diffDays(today, range.end) > 0 ? today : range.end;
  const hmStart = L.weekStart(L.addDays(hmEnd, -16 * 7 + 1));
  const heat = el('div', { class: 'heat' });
  for (const k of L.daysBetween(hmStart, hmEnd)) {
    const e = L.getEntry(state, k);
    const g = L.isLogged(e) ? L.growthScore(cfg, e) : null;
    const cls = e?.restDay ? 'rest' : g == null ? '' : `h${Math.max(1, Math.min(5, Math.ceil(g / 20)))}`;
    heat.append(el('div', { class: cls, title: `${k}${g != null ? ` · ${g}` : e?.restDay ? ' · rest' : ' · not logged'}` }));
  }
  grid.append(box('Consistency (16 weeks)', el('div', {}, heat, el('div', { class: 'legend' },
    el('span', {}, el('i', { style: { background: 'var(--line)' } }), 'Not logged'), el('span', {}, el('i', { style: { background: 'var(--lavender)' } }), 'Rest'),
    el('span', {}, el('i', { style: { background: 'var(--coral)' } }), 'Low'), el('span', {}, el('i', { style: { background: 'var(--honey)' } }), ''), el('span', {}, el('i', { style: { background: 'var(--sky)' } }), ''), el('span', {}, el('i', { style: { background: 'var(--sage)' } }), 'Strong')))));

  // Minutes per learning item, stacked by week
  const learn = L.activeItems(cfg).filter((i) => i.type === 'learning');
  const weeks = []; for (let ws = L.weekStart(range.start); L.diffDays(ws, range.end) >= 0; ws = L.addDays(ws, 7)) weeks.push(ws);
  if (weeks.length < 4) { while (weeks.length < 4) weeks.unshift(L.addDays(weeks[0], -7)); }
  const [g4, c4] = canvasBox(true);
  grid.append(box('Learning minutes per week', g4));
  chart(c4, { type: 'bar', data: { labels: weeks.map((w) => L.fmtShort(w)), datasets: learn.map((i, n) => ({ label: i.name, backgroundColor: PALETTE[n % PALETTE.length], borderRadius: 4, data: weeks.map((ws) => L.daysBetween(ws, L.addDays(ws, 6)).reduce((s, k) => s + (L.getEntry(state, k)?.items?.[i.id]?.minutes || 0), 0)) })) }, options: { scales: { x: { stacked: true }, y: { stacked: true } } } });

  // Milestones cumulative
  const allMs = Object.values(state.milestones.lists).flat().filter((m) => m.done && m.doneDate).map((m) => m.doneDate).sort();
  const msDays = L.daysBetween(L.addDays(today, -179), today).filter((_, i) => i % 3 === 0 || i === 179);
  const [g5, c5] = canvasBox();
  grid.append(box('Milestones completed (6 months)', g5));
  chart(c5, { type: 'line', data: { labels: msDays.map(L.fmtShort), datasets: [{ label: 'Total', data: msDays.map((k) => allMs.filter((d) => d <= k).length), borderColor: '#9C86C9', backgroundColor: 'rgba(201,182,228,.3)', fill: true, stepped: true, pointRadius: 0 }] }, options: { plugins: { legend: { display: false } } } });

  // Health metrics with rolling averages (last 90 days)
  const hStart = L.addDays(today, -89);
  for (const [itemId, field, title, color, goalLine] of [['steps', 'steps', 'Steps (90 days)', '#7FB394', 10000], ['sleep', 'hours', 'Sleep hours (90 days)', '#A7C7E7', 8], ['hrv', 'hrv', 'HRV ms (90 days)', '#C9B6E4', null]]) {
    const s = L.metricSeries(state, itemId, field, hStart, today);
    if (!s.some((x) => x[1] != null)) { grid.append(box(title, el('p', { class: 'muted small' }, itemId === 'hrv' ? 'No HRV data yet — it arrives via the Apple Shortcut (needs a watch) or manual entry.' : 'No data yet.'))); continue; }
    const r7 = L.rollingAvg(s, 7); const r28 = L.rollingAvg(s, 28);
    const [gx, cx] = canvasBox();
    const plateau = itemId !== 'sleep' ? L.detectPlateau(state, itemId, field, today) : null;
    grid.append(box(title, gx, plateau ? el('span', { class: 'status slight' }, 'Plateau') : null));
    const ds = [
      { label: 'Daily', data: s.map((x) => x[1]), borderColor: color, backgroundColor: color, pointRadius: 1.5, showLine: false },
      { label: '7-day avg', data: r7.map((x) => x[1]), borderColor: color, tension: .35, pointRadius: 0, borderWidth: 2.5, spanGaps: true },
      { label: '28-day avg', data: r28.map((x) => x[1]), borderColor: '#8A8698', borderDash: [5, 4], tension: .35, pointRadius: 0, borderWidth: 1.5, spanGaps: true },
    ];
    const goalT = (state.targets.targets || []).find((t) => t.kind === 'dailyMetric' && t.itemIds[0] === itemId && t.field === field && t.status !== 'archived');
    const gl = goalT?.targetValue ?? goalLine;
    if (gl) ds.push({ label: 'Goal', data: s.map(() => gl), borderColor: '#F6D186', borderWidth: 1.5, pointRadius: 0 });
    chart(cx, { type: 'line', data: { labels: s.map((x) => L.fmtShort(x[0])), datasets: ds } });
  }
}
