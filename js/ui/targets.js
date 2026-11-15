import { el, clear, sheet, toast, STATUS_LABEL, STATUS_EMOJI } from './dom.js';
import { state, saveTargets, saveMilestones } from '../state.js';
import * as L from '../logic.js';
import { uid } from '../model.js';

const KIND_LABEL = { milestones: 'Milestones by a deadline', dailyMetric: 'Daily number (e.g. steps, sleep)', daysPerWeek: 'Days per week (jogging)', avgScore: 'Average score', metricTrend: 'Improve a trend (e.g. HRV)' };

export function renderTargets(root) {
  clear(root);
  const today = L.toKey();
  root.append(el('div', { class: 'row spread' }, el('h1', {}, 'Targets'), el('button', { class: 'btn sm primary', onclick: () => editTarget(null, () => renderTargets(root)) }, '+ Add target')));
  const ts = (state.targets.targets || []).filter((t) => t.status !== 'archived');
  if (!ts.length) root.append(el('div', { class: 'card' }, el('p', {}, 'No targets yet. Add one — e.g. “System design milestones by 31 Mar” or “Steps ≥ 10,000”.')));
  const grid = el('div', { class: 'grid two' });
  for (const t of ts) grid.append(targetCard(t, today, () => renderTargets(root)));
  root.append(grid);

  // Milestone lists editor
  root.append(el('h2', { style: { margin: '22px 0 10px' } }, 'Milestone lists'));
  const g2 = el('div', { class: 'grid two' });
  for (const item of L.activeItems(state.config).filter((i) => i.type === 'learning')) {
    const list = state.milestones.lists[item.id] || [];
    g2.append(el('div', { class: 'card' },
      el('div', { class: 'row spread' }, el('h3', {}, item.name), el('span', { class: 'small muted' }, `${list.filter((m) => m.done).length}/${list.length}`)),
      el('div', { class: 'bar' }, el('div', { class: 'fill on', style: { width: `${list.length ? (list.filter((m) => m.done).length / list.length) * 100 : 0}%` } })),
      el('button', { class: 'btn sm soft', onclick: () => editMilestones(item, () => renderTargets(root)) }, 'Edit milestones')));
  }
  root.append(g2);
}

function targetCard(t, today, rerender) {
  const r = L.evaluateTarget(state, t, today);
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'row spread' }, el('h3', {}, t.name), el('span', { class: `status ${r.status}` }, `${STATUS_EMOJI[r.status]} ${STATUS_LABEL[r.status]}`)));
  let pct = 0; let pace = null;
  if (t.kind === 'milestones') { pct = r.total ? (r.done / r.total) * 100 : 0; pace = r.frac * 100; }
  else if (t.kind === 'dailyMetric') { pct = r.pct ?? 0; pace = t.successPct ?? 80; }
  else if (t.kind === 'daysPerWeek') { pct = Math.min(100, (r.thisCount / t.targetValue) * 100); pace = ((L.dayOfWeek(today) + 1) / 7) * 100; }
  else if (t.kind === 'avgScore') { pct = r.avg != null ? (r.avg / 5) * 100 : 0; pace = (t.targetValue / 5) * 100; }
  else if (t.kind === 'metricTrend') {
    if (r.status === 'baseline') pct = (r.have / 14) * 100;
    else { const span = r.goal - r.baseline; pct = span > 0 ? Math.max(0, Math.min(100, ((r.current - r.baseline) / span) * 100)) : 100; pace = r.frac * 100; }
  }
  card.append(el('div', { class: 'bar' }, el('div', { class: `fill ${r.status}`, style: { width: `${Math.max(2, Math.min(100, pct))}%` } }), pace != null ? el('div', { class: 'pace', style: { left: `calc(${Math.min(100, pace)}% - 1px)` }, title: 'Where you should be by now' }) : null));
  const kv = el('div', { class: 'kv' });
  const add = (k, v) => { if (v != null && v !== '') kv.append(el('div', {}, el('span', {}, `${k}: `), String(v))); };
  if (t.kind === 'milestones') { add('Done', `${r.done}/${r.total}`); add('Expected now', r.expected); add('Needed', r.requiredRate != null ? `${r.requiredRate}/week` : null); add('Recent', `${r.recentRate}/week`); add('Deadline', t.deadline ? `${L.fmtShort(t.deadline)} (${r.daysLeft}d)` : null); add('Projected', r.projected ? L.fmtShort(r.projected) : r.status === 'done' ? 'Done' : '—'); }
  if (t.kind === 'dailyMetric') { add('Goal', `≥ ${t.targetValue}`); add('Hit rate (14d)', r.pct != null ? `${r.pct}%` : '—'); add('Average', r.avg); add('Needed', `${t.successPct ?? 80}% of days`); }
  if (t.kind === 'daysPerWeek') { add('This week', `${r.thisCount}/${t.targetValue}`); add('4-week avg', r.avg); }
  if (t.kind === 'avgScore') { add('Average', r.avg); add('Goal', t.targetValue); }
  if (t.kind === 'metricTrend' && r.status !== 'baseline') { add('Baseline', r.baseline); add('28-day avg', r.current); add('7-day avg', r.avg7); add('Goal', `${r.goal} (+${t.targetPct ?? 10}%)`); add('Change', `${r.pct >= 0 ? '+' : ''}${r.pct}%`); add('Deadline', t.deadline ? L.fmtShort(t.deadline) : null); }
  card.append(kv);
  if (r.plan) card.append(el('div', { class: 'plan' }, r.plan));
  if (t.kind === 'metricTrend') card.append(el('p', { class: 'tiny muted' }, 'HRV is judged by trend, not single days. Not medical advice.'));
  if (t.history?.length) card.append(el('details', { class: 'small', style: { marginTop: '8px' } }, el('summary', {}, 'Change history'), t.history.map((h) => el('div', { class: 'muted' }, `${h.date}: ${h.from} → ${h.to} (${h.reason})`))));
  card.append(el('div', { class: 'row', style: { marginTop: '10px' } }, el('button', { class: 'btn sm ghost', onclick: () => editTarget(t, rerender) }, 'Edit')));
  return card;
}

export function editTarget(t, done) {
  const isNew = !t;
  const today = L.toKey();
  const d = t ? { ...t } : { id: uid('t'), kind: 'milestones', name: '', itemIds: [], startDate: today, deadline: L.addDays(today, 180), status: 'active' };
  sheet((close) => {
    const body = el('div', { class: 'stack' });
    const draw = () => {
      clear(body);
      body.append(el('h2', {}, isNew ? 'New target' : 'Edit target'));
      body.append(el('label', { class: 'f' }, 'Type'), el('select', { onchange: (e) => { d.kind = e.target.value; d.itemIds = []; draw(); } },
        Object.entries(KIND_LABEL).map(([k, v]) => el('option', { value: k, selected: d.kind === k }, v))));
      const items = L.activeItems(state.config).filter((i) => d.kind === 'milestones' ? i.type === 'learning'
        : d.kind === 'dailyMetric' || d.kind === 'metricTrend' ? i.type === 'metric'
          : d.kind === 'daysPerWeek' ? i.id === 'jogging' : i.type !== 'metric' || i.hasScore);
      if (!d.itemIds[0] && items[0]) d.itemIds = [items[0].id];
      body.append(el('label', { class: 'f' }, 'Item'), el('select', { onchange: (e) => { d.itemIds = [e.target.value]; d.field = undefined; draw(); } },
        items.map((i) => el('option', { value: i.id, selected: d.itemIds[0] === i.id }, i.name))));
      const item = state.config.items.find((i) => i.id === d.itemIds[0]);
      if ((d.kind === 'dailyMetric' || d.kind === 'metricTrend') && item?.fields) {
        if (!d.field) d.field = L.primaryField(item).key;
        body.append(el('label', { class: 'f' }, 'Measure'), el('select', { onchange: (e) => { d.field = e.target.value; } }, item.fields.map((f) => el('option', { value: f.key, selected: d.field === f.key }, `${f.label} (${f.unit})`))));
      }
      if (!d.name) d.name = item ? (d.kind === 'milestones' ? `${item.name} milestones` : item.name) : '';
      body.append(el('label', { class: 'f' }, 'Name'), el('input', { type: 'text', value: d.name, oninput: (e) => { d.name = e.target.value; } }));
      if (['dailyMetric', 'daysPerWeek', 'avgScore'].includes(d.kind)) {
        body.append(el('label', { class: 'f' }, d.kind === 'dailyMetric' ? 'At least (per day)' : d.kind === 'daysPerWeek' ? 'Days per week' : 'Average score (0–5)'),
          el('input', { type: 'number', step: 'any', value: d.targetValue ?? '', oninput: (e) => { d.targetValue = Number(e.target.value); } }));
      }
      if (d.kind === 'dailyMetric') {
        body.append(el('label', { class: 'f' }, 'Success = hit it on at least this % of days'), el('input', { type: 'number', value: d.successPct ?? 80, oninput: (e) => { d.successPct = Number(e.target.value); } }));
        body.append(el('label', { class: 'row small', style: { marginTop: '8px' } }, el('input', { type: 'checkbox', checked: !!d.fixed, onchange: (e) => { d.fixed = e.target.checked; } }), 'Keep fixed (no progression suggestions — e.g. sleep 8 h)'));
      }
      if (d.kind === 'metricTrend') body.append(el('label', { class: 'f' }, 'Improve by % vs baseline'), el('input', { type: 'number', value: d.targetPct ?? 10, oninput: (e) => { d.targetPct = Number(e.target.value); } }));
      body.append(el('div', { class: 'grid two' },
        el('div', {}, el('label', { class: 'f' }, 'Start'), el('input', { type: 'date', value: d.startDate, onchange: (e) => { d.startDate = e.target.value; } })),
        ['milestones', 'metricTrend', 'avgScore'].includes(d.kind) ? el('div', {}, el('label', { class: 'f' }, 'Deadline'), el('input', { type: 'date', value: d.deadline || '', onchange: (e) => { d.deadline = e.target.value || null; } })) : null));
      body.append(el('div', { class: 'row', style: { marginTop: '16px' } },
        el('button', { class: 'btn primary', onclick: async () => {
          if (!d.name || !d.itemIds[0] || !L.isValidKey(d.startDate)) return toast('Please fill name, item and start date');
          if (['dailyMetric', 'daysPerWeek', 'avgScore'].includes(d.kind) && !(d.targetValue > 0)) return toast('Please set a target value');
          if (d.kind === 'milestones' && !L.isValidKey(d.deadline || '')) return toast('Milestone targets need a deadline');
          if (!['milestones', 'metricTrend', 'avgScore'].includes(d.kind)) d.deadline = null;
          const arr = state.targets.targets;
          const i = arr.findIndex((x) => x.id === d.id);
          if (i >= 0) {
            if (arr[i].targetValue !== d.targetValue && d.targetValue != null) d.history = [...(d.history || []), { date: today, from: arr[i].targetValue, to: d.targetValue, reason: 'manual edit' }];
            arr[i] = d;
          } else arr.push(d);
          await saveTargets(); close(); done?.(); toast('Target saved');
        } }, 'Save'),
        !isNew ? el('button', { class: 'btn ghost', onclick: async () => { const x = state.targets.targets.find((y) => y.id === d.id); x.status = 'archived'; await saveTargets(); close(); done?.(); } }, 'Archive') : null,
        el('button', { class: 'btn ghost', onclick: close }, 'Cancel')));
    };
    draw();
    return body;
  });
}

export function editMilestones(item, done) {
  const list = JSON.parse(JSON.stringify(state.milestones.lists[item.id] || []));
  sheet((close) => {
    const body = el('div', { class: 'stack' });
    const draw = () => {
      clear(body);
      body.append(el('h2', {}, `${item.name} — milestones`), el('p', { class: 'small muted' }, 'Order matters: pace assumes you work top to bottom. Tick “done” to mark complete.'));
      list.forEach((m, i) => {
        body.append(el('div', { class: 'row' },
          el('input', { type: 'checkbox', checked: m.done, onchange: (e) => { m.done = e.target.checked; m.doneDate = m.done ? (m.doneDate || L.toKey()) : null; } }),
          el('input', { type: 'text', value: m.title, oninput: (e) => { m.title = e.target.value; } }),
          el('button', { class: 'btn sm ghost', 'aria-label': 'Move up', onclick: () => { if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); } } }, '↑'),
          el('button', { class: 'btn sm ghost', 'aria-label': 'Delete', onclick: () => { list.splice(i, 1); draw(); } }, '✕')));
      });
      body.append(el('button', { class: 'btn sm soft', onclick: () => { list.push({ id: uid('m'), title: 'New milestone', done: false, doneDate: null }); draw(); } }, '+ Add milestone'));
      body.append(el('div', { class: 'row', style: { marginTop: '14px' } },
        el('button', { class: 'btn primary', onclick: async () => { state.milestones.lists[item.id] = list.filter((m) => m.title.trim()); await saveMilestones(); close(); done?.(); toast('Milestones saved'); } }, 'Save'),
        el('button', { class: 'btn ghost', onclick: close }, 'Cancel')));
    };
    draw();
    return body;
  });
}
