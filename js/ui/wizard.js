import { el, clear, toast, confetti } from './dom.js';
import { state, updateMeta, testConnection, sync, saveTargets, saveConfig } from '../state.js';
import * as L from '../logic.js';
import { uid } from '../model.js';

let step = 0;
const deadlines = {};
const health = { steps: 10000, sleep: 8, jog: 3, hrvPct: 10 };

export function renderWizard(root, { go }) {
  clear(root);
  const STEPS = 5;
  const today = L.toKey();
  root.append(el('div', { class: 'step-dots' }, Array.from({ length: STEPS }, (_, i) => el('i', { class: i === step ? 'on' : '' }))));
  const next = () => { step++; renderWizard(root, { go }); };
  const back = () => { step = Math.max(0, step - 1); renderWizard(root, { go }); };
  const nav = (label = 'Next', fn = next) => el('div', { class: 'row', style: { marginTop: '16px' } }, step > 0 ? el('button', { class: 'btn ghost', onclick: back }, 'Back') : null, el('button', { class: 'btn primary', onclick: fn }, label));

  if (step === 0) {
    const owner = el('input', { type: 'text', value: state.meta.owner, placeholder: 'GitHub username', autocapitalize: 'off', spellcheck: false });
    const repo = el('input', { type: 'text', value: state.meta.repo || 'growth-journal-data', autocapitalize: 'off', spellcheck: false });
    const token = el('input', { type: 'password', value: state.meta.token, placeholder: 'github_pat_…' });
    root.append(el('div', { class: 'card stack' },
      el('h1', {}, 'Welcome to Growth Journal ✨'),
      el('p', {}, 'Connect your private GitHub data repo so every log is backed up and shows on your phone and laptop.'),
      el('label', { class: 'f' }, 'GitHub username'), owner, el('label', { class: 'f' }, 'Data repository (private)'), repo, el('label', { class: 'f' }, 'Fine-grained token'), token,
      el('div', { class: 'row wrap-row', style: { marginTop: '14px' } },
        el('button', { class: 'btn primary', onclick: async () => {
          const meta = { owner: owner.value.trim(), repo: repo.value.trim(), token: token.value.trim() };
          try {
            const r = await testConnection(meta);
            if (!r.canPush) throw new Error('This token cannot write to the repo');
            if (!r.private) toast('⚠️ This repo is public — please make it private.', 4000);
            await updateMeta({ ...meta, lastError: null });
            toast('Connected ✓ — loading any existing data…');
            await sync({ full: true });
            const returning = (state.targets.targets || []).length > 0 || L.allEntries(state).length > 0;
            if (returning) { await updateMeta({ setupDone: true }); toast('Welcome back — your data is restored 🌿'); confetti(); go('#today'); return; }
            next();
          } catch (e) { toast(`Couldn’t connect: ${e.message}`, 4500); }
        } }, 'Connect'),
        el('button', { class: 'btn ghost', onclick: next }, 'Skip for now (this device only)'))));
    return;
  }

  if (step === 1) {
    root.append(el('div', { class: 'card stack' }, el('h2', {}, 'Your tracked items'),
      el('p', { class: 'small muted' }, 'Tap any item on the Today screen to see what 1 / 3 / 5 mean. You can edit, add or archive items any time in Settings.'),
      state.config.categories.map((c) => el('div', {}, el('b', {}, `${c.emoji} ${c.name}: `), L.activeItems(state.config).filter((i) => i.category === c.id).map((i) => i.name).join(', '))),
      nav()));
    return;
  }

  if (step === 2) {
    const learn = L.activeItems(state.config).filter((i) => i.type === 'learning');
    const card = el('div', { class: 'card stack' }, el('h2', {}, 'Learning & project deadlines'),
      el('p', { class: 'small muted' }, 'Each skill comes with a starter milestone list (edit it later under Targets). Pick a realistic finish date for each.'));
    for (const i of learn) {
      deadlines[i.id] = deadlines[i.id] || L.addDays(today, i.category === 'projects' ? 365 : 182);
      const n = state.milestones.lists[i.id]?.length || 0;
      card.append(el('div', { class: 'row spread', style: { gap: '10px' } }, el('div', {}, el('div', {}, i.name), el('div', { class: 'tiny muted' }, `${n} milestones`)),
        el('input', { type: 'date', value: deadlines[i.id], style: { maxWidth: '170px' }, onchange: (e) => { deadlines[i.id] = e.target.value; } })));
    }
    card.append(nav());
    root.append(card);
    return;
  }

  if (step === 3) {
    const num = (key, label, unit, stepv = 1) => el('div', {}, el('label', { class: 'f' }, label), el('div', { class: 'num', style: { marginTop: 0 } },
      el('input', { type: 'number', step: stepv, value: health[key], oninput: (e) => { health[key] = Number(e.target.value); } }), el('span', { class: 'unit' }, unit)));
    root.append(el('div', { class: 'card stack' }, el('h2', {}, 'Health targets'),
      num('steps', 'Daily steps (incl. jogging steps)', 'steps', 500), num('sleep', 'Sleep', 'hours', 0.5), num('jog', 'Jogging', 'days / week'), num('hrvPct', 'HRV improvement in 6 months', '% vs your baseline'),
      el('p', { class: 'small muted' }, 'Every 2 weeks the app suggests a step-up when you hit a goal on 80%+ of days (steps +500, jogging +1 day up to 5). Nothing changes until you tap Accept. HRV builds a 14-day baseline first. Not medical advice.'),
      nav()));
    return;
  }

  if (step === 4) {
    const w = state.config.weights;
    root.append(el('div', { class: 'card stack' }, el('h2', {}, 'Growth Score weights'),
      el('p', { class: 'small muted' }, 'How much each area counts in your daily 0–100 score. Change any time in Settings.'),
      state.config.categories.map((c) => el('div', { class: 'lag' }, el('span', {}, c.name), el('b', {}, `${w[c.id]}%`))),
      nav('Finish 🎉', async () => {
        const ts = state.targets.targets;
        const has = (pred) => ts.some(pred);
        for (const [itemId, dl] of Object.entries(deadlines)) {
          if (has((t) => t.kind === 'milestones' && t.itemIds[0] === itemId && t.status !== 'archived')) continue;
          const name = state.config.items.find((i) => i.id === itemId)?.name;
          ts.push({ id: uid('t'), kind: 'milestones', name: `${name}`, itemIds: [itemId], startDate: today, deadline: dl, status: 'active' });
        }
        if (!has((t) => t.itemIds[0] === 'steps')) ts.push({ id: uid('t'), kind: 'dailyMetric', name: 'Daily steps', itemIds: ['steps'], field: 'steps', targetValue: health.steps, successPct: 80, startDate: today, status: 'active' });
        if (!has((t) => t.itemIds[0] === 'sleep')) ts.push({ id: uid('t'), kind: 'dailyMetric', name: 'Sleep', itemIds: ['sleep'], field: 'hours', targetValue: health.sleep, successPct: 80, fixed: true, startDate: today, status: 'active' });
        if (!has((t) => t.kind === 'daysPerWeek')) ts.push({ id: uid('t'), kind: 'daysPerWeek', name: 'Jogging days', itemIds: ['jogging'], targetValue: health.jog, startDate: today, status: 'active' });
        if (!has((t) => t.itemIds[0] === 'hrv')) ts.push({ id: uid('t'), kind: 'metricTrend', name: `HRV +${health.hrvPct}%`, itemIds: ['hrv'], field: 'hrv', targetPct: health.hrvPct, startDate: today, deadline: L.addDays(today, 182), status: 'active' });
        await saveTargets(); await saveConfig();
        await updateMeta({ setupDone: true });
        step = 0; confetti(); toast('All set! Log your first day 🌿'); go('#today');
      })));
  }
}
