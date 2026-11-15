import { el, clear, toast, confetti, CAT_COLORS } from './dom.js';
import { state, saveEntry, saveMilestones } from '../state.js';
import * as L from '../logic.js';
import { WHY_LOW_CHIPS } from '../model.js';
import { QUOTES } from '../quotes.js';

let draft = null; let draftDate = null; let autofilled = {};
export function setAutofill(values) { autofilled = values || {}; draft = null; }

function blankEntry() { return { items: {}, milestonesCompleted: [], whyLow: [], roughDay: false, restDay: false, note: '' }; }

function loadDraft(date) {
  const existing = L.getEntry(state, date);
  draft = existing ? JSON.parse(JSON.stringify(existing)) : blankEntry();
  draft.items = draft.items || {}; draft.whyLow = draft.whyLow || []; draft.milestonesCompleted = draft.milestonesCompleted || [];
  draft._touched = new Set(Object.keys(draft.items));
  draft.autofilled = [];
  // Apply Apple Shortcut values for that date
  if (autofilled && (!autofilled.date || autofilled.date === date)) {
    const map = { steps: ['steps', 'steps'], km: ['steps', 'km'], sleep: ['sleep', 'hours'], hrv: ['hrv', 'hrv'] };
    for (const [k, [item, field]] of Object.entries(map)) {
      if (autofilled[k] == null) continue;
      draft.items[item] = draft.items[item] || {};
      draft.items[item].values = { ...(draft.items[item].values || {}), [field]: autofilled[k] };
      draft.autofilled.push(k); draft._touched.add(item);
    }
  }
  draftDate = date;
}

export function renderToday(root, { date, go }) {
  const today = L.toKey();
  date = date || today;
  if (!draft || draftDate !== date) loadDraft(date);
  const future = L.diffDays(today, date) > 0;
  clear(root);
  const cfg = state.config;

  // Quote
  const q = L.quoteFor(today, QUOTES, state.userQuotes);
  root.append(el('div', { class: 'card quote' }, el('p', {}, `“${q[0]}”`), el('div', { class: 'by' }, `— ${q[1]}`)));

  // Nudges
  const nudge = L.missNudge(state, today);
  if (nudge && date === today) {
    const msg = nudge.level === 'twice'
      ? 'Two days without a log — never miss twice. A 10-second rough-day log keeps your streak honest.'
      : 'Yesterday isn’t logged yet. Want to add it? Even a rough-day log counts.';
    root.append(el('div', { class: `banner ${nudge.level === 'twice' ? 'coral' : 'honey'}` }, msg, ' ',
      el('button', { class: 'btn sm soft', onclick: () => go(`#today/${nudge.days[nudge.days.length - 1]}`) }, 'Log yesterday')));
  }
  if (draft.autofilled.length) root.append(el('div', { class: 'banner sky' }, `✨ Auto-filled from Apple Health: ${draft.autofilled.join(', ')}. Just add your scores.`));
  const sug = L.progressionSuggestions(state, today);
  if (sug.length && date === today) root.append(el('div', { class: 'banner sage' }, `📈 ${sug.length} progression check${sug.length > 1 ? 's' : ''} ready. `, el('button', { class: 'btn sm soft', onclick: () => go('#review') }, 'Review')));

  // Stats
  const wk = L.periodRange('weekly', today);
  root.append(el('div', { class: 'stats' },
    el('div', { class: 'stat' }, el('b', {}, `🔥 ${L.showedUpStreak(state, today)}`), el('span', {}, 'Showed-up streak')),
    el('div', { class: 'stat' }, el('b', {}, `📈 ${L.performanceStreak(state, today)}`), el('span', {}, 'Strong-day streak')),
    el('div', { class: 'stat' }, el('b', {}, `${L.loggingConsistency(state, wk, today) ?? '—'}%`), el('span', {}, 'Logged this week')),
  ));

  // Focus items
  const focus = cfg.settings?.focus;
  if (focus?.items?.length && L.diffDays(focus.weekStart, today) >= 0 && L.diffDays(focus.weekStart, today) < 7) {
    root.append(el('div', { class: 'card flat' }, el('div', { class: 'small muted' }, '🎯 This week’s focus'),
      el('div', {}, focus.items.map((id) => el('span', { class: 'focus-tag' }, cfg.items.find((i) => i.id === id)?.name || id)))));
  }

  // Date + mode
  const dateInput = el('input', { type: 'date', value: date, onchange: (e) => go(`#today/${e.target.value}`) });
  root.append(el('div', { class: 'card' },
    el('div', { class: 'row spread' }, el('h2', {}, date === today ? 'How was today?' : `Log for ${L.fmtShort(date)}`), el('div', { style: { width: '150px' } }, dateInput)),
    future ? el('p', { class: 'small muted' }, 'Future date: you can plan a rest day in advance.') : null,
    L.getEntry(state, date) && L.isEditedLate(date, today) ? el('p', { class: 'small muted' }, 'This day is more than 7 days ago — saving will mark it “edited later”.') : null,
    el('div', { class: 'row wrap-row', style: { marginTop: '10px' } },
      future ? null : el('button', { class: `chip small ${draft.roughDay ? 'sel' : ''}`, onclick: () => { draft.roughDay = !draft.roughDay; draft.restDay = false; renderToday(root, { date, go }); } }, '🌧️ Rough day'),
      el('button', { class: `chip small ${draft.restDay ? 'sel' : ''}`, onclick: () => { draft.restDay = !draft.restDay; draft.roughDay = false; renderToday(root, { date, go }); } }, '🌙 Rest day'),
    ),
    draft.roughDay ? el('p', { class: 'small muted' }, 'Rough day: tap only what you did. Everything else is saved as “not today” — no guilt, the streak still counts.') : null,
    draft.restDay ? el('p', { class: 'small muted' }, 'Planned rest: this day won’t count as a miss or pull down your averages.') : null,
  ));

  if (!draft.restDay && !future) {
    const cats = [...cfg.categories].sort((a, b) => a.order - b.order);
    for (const cat of cats) {
      const items = L.activeItems(cfg).filter((i) => i.category === cat.id);
      if (!items.length) continue;
      const card = el('div', { class: 'card' }, el('div', { class: 'cat-head' }, el('span', { class: 'cat-dot', style: { background: CAT_COLORS[cat.id] || '#C9B6E4' } }), el('h2', {}, `${cat.emoji || ''} ${cat.name}`)));
      for (const item of items) card.append(renderItem(item, date, () => renderToday(root, { date, go })));
      root.append(card);
    }
    // Why low?
    const anyLow = draft.roughDay || [...draft._touched].some((id) => (draft.items[id]?.score ?? 5) <= 2);
    if (anyLow) {
      root.append(el('div', { class: 'card' }, el('h3', {}, 'Why was it a low day? (optional)'),
        el('div', { class: 'chips' }, WHY_LOW_CHIPS.map((c) => el('button', { class: `chip small ${draft.whyLow.includes(c.id) ? 'sel' : ''}`, onclick: (e) => {
          draft.whyLow = draft.whyLow.includes(c.id) ? draft.whyLow.filter((x) => x !== c.id) : [...draft.whyLow, c.id];
          e.target.classList.toggle('sel');
        } }, c.label)))));
    }
  }

  const note = el('textarea', { placeholder: 'One line about today (optional)', rows: 2, value: draft.note || '', oninput: (e) => { draft.note = e.target.value; } });
  root.append(el('div', { class: 'card' }, note));
  root.append(el('button', { class: 'btn primary block', onclick: () => submit(date, go) }, L.getEntry(state, date) ? 'Update entry' : 'Submit ✓'));
}

function renderItem(item, date, rerender) {
  const v = draft.items[item.id] || {};
  const wrap = el('div', { class: 'item' });
  const anchors = el('div', { class: 'anchors hidden' },
    item.anchors?.[1] && item.anchors[1] !== '—' ? [el('div', {}, el('b', {}, '1 · '), item.anchors[1]), el('div', {}, el('b', {}, '3 · '), item.anchors[3]), el('div', {}, el('b', {}, '5 · '), item.anchors[5])] : 'Measured value — no score needed.');
  const autoBadge = (item.fields || []).some((f) => draft.autofilled.includes(f.autofill)) ? el('span', { class: 'badge' }, 'auto-filled') : null;
  wrap.append(el('div', { class: 'item-name', onclick: () => anchors.classList.toggle('hidden') }, el('span', {}, item.name), el('span', { class: 'row' }, autoBadge, el('span', { class: 'info' }, 'ⓘ'))), anchors);
  const touch = () => { draft.items[item.id] = draft.items[item.id] || {}; draft._touched.add(item.id); return draft.items[item.id]; };

  if (item.type !== 'metric' || item.hasScore) {
    const chips = el('div', { class: 'chips' });
    for (let s = 0; s <= 5; s++) {
      chips.append(el('button', { class: `chip s${s} ${v.score === s ? 'on' : ''}`, 'aria-label': `${item.name} ${s}`, onclick: () => {
        const it = touch(); it.score = it.score === s ? undefined : s;
        if (it.score === undefined) delete it.score;
        rerender();
      } }, String(s)));
    }
    wrap.append(chips);
  }
  if (item.type === 'learning' || item.type === 'score+minutes') {
    const mins = el('div', { class: 'chips' });
    for (const m of [15, 30, 45, 60, 90]) mins.append(el('button', { class: `chip small ${v.minutes === m ? 'sel' : ''}`, onclick: () => { const it = touch(); it.minutes = it.minutes === m ? undefined : m; rerender(); } }, `${m}m`));
    const custom = el('input', { type: 'number', inputmode: 'numeric', min: 0, max: 900, placeholder: 'min', value: v.minutes && ![15, 30, 45, 60, 90].includes(v.minutes) ? v.minutes : '', style: { width: '76px', padding: '6px 10px', borderRadius: '999px' },
      onchange: (e) => { const it = touch(); const n = Number(e.target.value); it.minutes = n > 0 ? Math.min(900, Math.round(n)) : undefined; rerender(); } });
    mins.append(custom);
    wrap.append(mins);
  }
  for (const f of item.fields || []) {
    const val = v.values?.[f.key];
    wrap.append(el('div', { class: 'num' },
      el('span', { class: 'small', style: { minWidth: '86px' } }, f.label),
      el('input', { type: 'number', inputmode: 'decimal', step: f.step || 1, min: f.min ?? 0, max: f.max ?? 99999, value: val ?? '', placeholder: f.goal ? `goal ${f.goal}` : '',
        onchange: (e) => { const it = touch(); it.values = it.values || {}; const n = e.target.value === '' ? null : Number(e.target.value); if (n == null || Number.isNaN(n)) delete it.values[f.key]; else it.values[f.key] = Math.max(f.min ?? 0, Math.min(f.max ?? 99999, n)); } }),
      el('span', { class: 'unit' }, f.unit)));
  }
  if (item.type === 'learning') {
    const list = state.milestones.lists[item.id] || [];
    const pending = list.filter((m) => !m.done);
    const doneHere = list.filter((m) => m.done && m.doneDate === date);
    const show = [...doneHere, ...pending.slice(0, 2)];
    if (show.length) {
      const box = el('div', { style: { marginTop: '6px' } }, el('div', { class: 'tiny muted' }, `Milestones ${list.filter((m) => m.done).length}/${list.length}`));
      for (const m of show) {
        const checked = draft.milestonesCompleted.some((x) => x.item === item.id && x.id === m.id) || (m.done && m.doneDate === date);
        box.append(el('label', { class: `ms ${checked ? 'done' : ''}` },
          el('input', { type: 'checkbox', checked, onchange: (e) => {
            draft.milestonesCompleted = draft.milestonesCompleted.filter((x) => !(x.item === item.id && x.id === m.id));
            if (e.target.checked) draft.milestonesCompleted.push({ item: item.id, id: m.id });
            else draft._unticks = [...(draft._unticks || []), { item: item.id, id: m.id }];
            touch(); e.target.parentElement.classList.toggle('done', e.target.checked);
          } }), el('span', {}, m.title)));
      }
      wrap.append(box);
    }
  }
  return wrap;
}

async function submit(date, go) {
  const cfg = state.config;
  const entry = { items: {}, milestonesCompleted: [], whyLow: draft.whyLow, roughDay: draft.roughDay, restDay: draft.restDay, note: (draft.note || '').trim().slice(0, 500), autofilled: draft.autofilled };
  if (!draft.restDay) {
    for (const item of L.activeItems(cfg)) {
      const v = draft.items[item.id] || {};
      const out = {};
      if (item.type !== 'metric' || item.hasScore) out.score = v.score ?? 0; // 0 = didn't do it / not today
      if ((item.type === 'learning' || item.type === 'score+minutes') && v.minutes) out.minutes = v.minutes;
      if (v.values && Object.keys(v.values).length) out.values = { ...v.values };
      if (item.type === 'metric' && !item.hasScore && !out.values) continue;
      entry.items[item.id] = out;
    }
    entry.milestonesCompleted = draft.milestonesCompleted;
  }
  // milestones
  let msChanged = false;
  for (const { item, id } of entry.milestonesCompleted) {
    const m = state.milestones.lists[item]?.find((x) => x.id === id);
    if (m && !m.done) { m.done = true; m.doneDate = date; msChanged = true; }
  }
  for (const { item, id } of draft._unticks || []) {
    if (entry.milestonesCompleted.some((x) => x.item === item && x.id === id)) continue;
    const m = state.milestones.lists[item]?.find((x) => x.id === id);
    if (m && m.done) { m.done = false; m.doneDate = null; msChanged = true; }
  }
  await saveEntry(date, entry);
  if (msChanged) await saveMilestones();
  const finishedMilestone = entry.milestonesCompleted.length > 0;
  draft = null; autofilled = {};
  if (history.replaceState && location.search) history.replaceState(null, '', location.pathname + location.hash);
  const today = L.toKey();
  if (finishedMilestone) { confetti(); toast('Milestone done! 🎉 Logged & syncing.'); }
  else toast(entry.restDay ? 'Rest day saved 🌙' : entry.roughDay ? 'Logged. Showing up on a rough day counts 💛' : 'Logged ✓ syncing…');
  if (L.dayOfWeek(date) === 6 && date === today && !entry.restDay) setTimeout(() => go('#review'), 600);
  else go(`#today/${date}`);
}
