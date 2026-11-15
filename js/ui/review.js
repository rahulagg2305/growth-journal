import { el, clear, toast, confetti, STATUS_LABEL, STATUS_EMOJI } from './dom.js';
import { state, saveTargets, saveConfig } from '../state.js';
import * as L from '../logic.js';
import { WHY_LOW_CHIPS } from '../model.js';

let offset = 0; // weeks back
export function renderReview(root, { go }) {
  clear(root);
  const today = L.toKey();
  const ref = L.addDays(today, -7 * offset);
  const range = L.periodRange('weekly', ref);
  const prev = L.previousRange('weekly', range);
  const cur = L.periodSummary(state, range, today);
  const old = L.periodSummary(state, prev, today);
  const cfg = state.config;
  const catName = (id) => cfg.categories.find((c) => c.id === id)?.name || '—';
  const isCurrent = offset === 0;

  root.append(el('div', { class: 'row spread' }, el('h1', {}, 'Saturday review'),
    el('div', { class: 'row' }, el('button', { class: 'btn sm ghost', onclick: () => { offset++; renderReview(root, { go }); } }, '‹'),
      el('span', { class: 'small' }, `${L.fmtShort(range.start)} – ${L.fmtShort(range.end)}`),
      el('button', { class: 'btn sm ghost', disabled: offset === 0, onclick: () => { offset = Math.max(0, offset - 1); renderReview(root, { go }); } }, '›'))));

  // 1. Consistency first
  const c = cur.consistency;
  root.append(el('div', { class: `banner ${c == null ? 'sky' : c >= 90 ? 'sage' : c >= 70 ? 'honey' : 'coral'}`, style: { marginTop: '12px' } },
    el('b', {}, `1 · Logging consistency: ${c ?? '—'}%`), ' (goal 90%). ',
    c == null ? 'No days yet.' : c >= 90 ? 'You showed up. That’s the foundation of everything else. 🌿' : 'Honest logs — even rough days — make the coaching accurate. Aim for one more logged day next week.'));

  const g = el('div', { class: 'grid two', style: { marginTop: '12px' } });
  root.append(g);
  // 2. Growth
  const d = cur.growth != null && old.growth != null ? cur.growth - old.growth : null;
  g.append(el('div', { class: 'card' }, el('h3', {}, '2 · Growth Score'),
    el('p', { style: { fontSize: '2rem', margin: '6px 0', fontWeight: 800 } }, cur.growth ?? '—',
      d != null ? el('span', { class: `delta ${d >= 0 ? 'up' : 'down'}`, style: { fontSize: '1rem', marginLeft: '8px' } }, `${d >= 0 ? '▲' : '▼'}${Math.abs(d)} vs last week`) : null)));
  // 3. Strongest / weakest
  g.append(el('div', { class: 'card' }, el('h3', {}, '3 · Strongest & weakest'),
    el('p', {}, '💪 ', el('b', {}, catName(cur.strongest)), cur.strongest ? ` (${cur.categories[cur.strongest]})` : ''),
    el('p', {}, '🌱 ', el('b', {}, catName(cur.weakest)), cur.weakest ? ` (${cur.categories[cur.weakest]})` : ''),
    cur.lagging.length ? el('p', { class: 'small muted' }, 'Lowest items: ', cur.lagging.map((x) => x.name).join(', ')) : null));
  // 4. Why-low
  const pat = L.whyLowPatterns(state, range);
  g.append(el('div', { class: 'card' }, el('h3', {}, '4 · Low-day patterns'),
    pat.lowDays ? el('div', {}, el('p', { class: 'small' }, `${pat.lowDays} low day${pat.lowDays > 1 ? 's' : ''} this week.`),
      Object.entries(pat.chips).map(([k, n]) => el('span', { class: 'focus-tag' }, `${WHY_LOW_CHIPS.find((x) => x.id === k)?.label || k} ×${n}`)),
      pat.insights.map((t) => el('p', { class: 'small' }, '• ', t))) : el('p', { class: 'small muted' }, 'No low days — lovely week.')));
  // 5. Targets
  const ts = (state.targets.targets || []).filter((t) => t.status !== 'archived');
  g.append(el('div', { class: 'card' }, el('h3', {}, '5 · Targets'),
    ts.length ? ts.map((t) => { const r = L.evaluateTarget(state, t, today); return el('div', { class: 'stack', style: { padding: '6px 0', borderBottom: '1px dashed var(--line)' } },
      el('div', { class: 'row spread' }, el('span', {}, t.name), el('span', { class: `status ${r.status}` }, `${STATUS_EMOJI[r.status]} ${STATUS_LABEL[r.status]}`)),
      r.status === 'behind' || r.status === 'slight' ? el('div', { class: 'small muted' }, r.plan) : null); })
      : el('p', { class: 'small muted' }, 'No targets yet.'), el('button', { class: 'btn sm ghost', style: { marginTop: '8px' }, onclick: () => go('#targets') }, 'Open targets')));
  // 6. Progression
  const sug = L.progressionSuggestions(state, today);
  const pc = el('div', { class: 'card' }, el('h3', {}, '6 · Progression check'));
  if (!sug.length) pc.append(el('p', { class: 'small muted' }, 'Nothing due — checks run every 2 weeks per target.'));
  for (const s of sug) {
    pc.append(el('div', { class: 'stack', style: { padding: '6px 0' } },
      el('div', {}, el('b', {}, s.name), ` — hit ${s.hitPct}% over the last 2 weeks.`),
      el('div', { class: 'small' }, s.action === 'stepUp' && s.to != null ? `Suggest: ${s.from} → ${s.to} (${s.note}).` : s.note),
      el('div', { class: 'row' },
        s.action === 'stepUp' && s.to != null ? el('button', { class: 'btn sm primary', onclick: async () => { L.applyProgression(state.targets, s, true, today); await saveTargets(); toast('Target raised 📈'); confetti(); renderReview(root, { go }); } }, 'Accept') : null,
        el('button', { class: 'btn sm ghost', onclick: async () => { L.applyProgression(state.targets, s, s.action === 'hold', today); await saveTargets(); toast('Holding steady'); renderReview(root, { go }); } }, s.action === 'hold' ? 'OK, hold' : 'Not yet'))));
  }
  g.append(pc);
  // 7. Plateau
  const plats = [['steps', 'steps', 'Steps'], ['hrv', 'hrv', 'HRV']].map(([i, f, n]) => [n, L.detectPlateau(state, i, f, today)]).filter((x) => x[1]);
  g.append(el('div', { class: 'card' }, el('h3', {}, '7 · Plateau watch'),
    plats.length ? plats.map(([n, p]) => el('p', { class: 'small' }, `⚠️ ${n} has been flat around ${p.avg} for 6 weeks. `,
      n === 'Steps' ? 'Try one longer weekend walk or a 10-min walk after lunch.' : 'Try earlier bedtimes, more easy (conversational-pace) cardio, and 5 min of slow breathing daily.'))
      : el('p', { class: 'small muted' }, 'No plateaus — numbers are still moving. 🌿')));

  // 8. Focus for next week
  const nextWeek = isCurrent ? L.addDays(range.end, 1) : null;
  if (nextWeek) {
    const existing = cfg.settings.focus?.weekStart === nextWeek ? cfg.settings.focus.items : [];
    const picked = new Set(existing.length ? existing : cur.lagging.map((x) => x.id).slice(0, 2));
    const chips = el('div', { class: 'chips' });
    for (const item of L.activeItems(cfg).filter((i) => !i.excludeFromScore)) {
      chips.append(el('button', { class: `chip small ${picked.has(item.id) ? 'sel' : ''}`, onclick: (e) => {
        if (picked.has(item.id)) picked.delete(item.id); else if (picked.size < 3) picked.add(item.id); else return toast('Pick up to 3');
        e.target.classList.toggle('sel');
      } }, item.name));
    }
    root.append(el('div', { class: 'card', style: { marginTop: '12px' } }, el('h3', {}, '8 · Pick 1–3 focus items for next week'),
      el('p', { class: 'small muted' }, 'Pre-selected: your lowest items. They’ll be shown on the Today screen all week.'), chips,
      el('button', { class: 'btn primary', style: { marginTop: '12px' }, onclick: async () => {
        cfg.settings.focus = { weekStart: nextWeek, items: [...picked] };
        cfg.settings.lastReview = today;
        await saveConfig(); confetti(); toast('Review done — have a great week! ✨'); go('#today');
      } }, 'Finish review')));
  }
}
